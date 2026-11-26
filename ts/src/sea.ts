/**
 * SEA - Security, Encryption, and Authorization
 * Cryptographic functions for signing, verification, encryption, and decryption
 */

import {graph, userPublicKey, userSignature} from "./utils.ts"
import * as utils from "./sea-utils.ts"
import SafeBuffer from "./buffer.ts"
import type {
  UserPair,
  EncryptedData,
  SignedData,
  Graph,
  GraphNode,
  GraphValue,
} from "./schemas.ts"

type Callback<T> = (result: T) => void

const curve = {name: "ECDSA", namedCurve: "P-256"}
const ecdsa = {name: "ECDSA", hash: {name: "SHA-256"}}

// Keys are imported once and used for every signature of a node.
const signingKey = (pair: {pub: string; priv: string}): Promise<CryptoKey> =>
  utils.subtle.importKey("jwk", utils.jwk(pair.pub, pair.priv), curve, false, [
    "sign",
  ])
const verifyingKey = (publicKey: string): Promise<CryptoKey> =>
  utils.subtle.importKey("jwk", utils.jwk(publicKey), curve, false, ["verify"])

// Signs text itself as an ECDSA signature, in base64. SEA.sign signs the
// SHA-256 hash of its message instead, so it can't make a signature that
// signText would.
const signText = async (text: string, key: CryptoKey): Promise<string> => {
  const data = new TextEncoder().encode(text)
  const sig = await utils.subtle.sign(ecdsa, key, data)
  return SafeBuffer.from(sig, "binary").toString("base64")
}

// Checks a signature of bytes.
const verifyBytes = async (
  data: BufferSource,
  signature: string,
  key: CryptoKey,
): Promise<boolean> => {
  try {
    const sig = new Uint8Array(SafeBuffer.from(signature, "base64"))
    return await utils.subtle.verify(ecdsa, key, sig, data)
  } catch (err) {
    console.log(`error verifying signature: ${(err as Error).message}`)
    return false
  }
}

// Checks a signature from signText.
const verifyText = (
  text: string,
  signature: string,
  key: CryptoKey,
): Promise<boolean> =>
  verifyBytes(new TextEncoder().encode(text), signature, key)

// Checks a signature of the SHA-256 hash of text, the way timestamps were
// signed before property signatures.
const verifyHash = async (
  text: string,
  signature: string,
  key: CryptoKey,
): Promise<boolean> =>
  verifyBytes(new Uint8Array(await utils.sha256(text)), signature, key)

// What a property's signature covers, so it can't be used for any other soul,
// key, value or state.
const propertyText = (
  soul: string,
  key: string,
  value: unknown,
  state: number,
): string => JSON.stringify([soul, key, value, state])

/**
 * SEA cryptographic operations
 */
const SEA = {
  /**
   * Generate a new ECDSA + ECDH key pair
   */
  pair: async (cb?: Callback<UserPair>): Promise<UserPair> => {
    // ECDSA keys for signing/verifying
    const ecdsa = await utils.subtle
      .generateKey({name: "ECDSA", namedCurve: "P-256"}, true, [
        "sign",
        "verify",
      ])
      .then(async keys => {
        const pub = await utils.subtle.exportKey("jwk", keys.publicKey)
        return {
          priv: (await utils.subtle.exportKey("jwk", keys.privateKey)).d!,
          pub: pub.x! + "." + pub.y!,
        }
      })

    // ECDH keys for encryption/decryption
    const ecdh = await utils.subtle
      .generateKey({name: "ECDH", namedCurve: "P-256"}, true, ["deriveKey"])
      .then(async keys => {
        const pub = await utils.subtle.exportKey("jwk", keys.publicKey)
        return {
          epriv: (await utils.subtle.exportKey("jwk", keys.privateKey)).d!,
          epub: pub.x! + "." + pub.y!,
        }
      })

    const pair: UserPair = {
      pub: ecdsa.pub,
      priv: ecdsa.priv,
      epub: ecdh.epub,
      epriv: ecdh.epriv,
    }
    if (cb) cb(pair)
    return pair
  },

  /**
   * Encrypt data with a key pair
   */
  encrypt: async (
    data: unknown,
    pair: Partial<UserPair> | null,
    cb?: Callback<EncryptedData | null>,
  ): Promise<EncryptedData | null> => {
    if (!pair || !pair.epriv) {
      if (cb) cb(null)
      return null
    }

    const rand = {s: utils.random(9), iv: utils.random(15)}
    const ct = await utils.aeskey(pair.epriv, rand.s).then(aes => {
      return utils.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(rand.iv),
        },
        aes,
        new TextEncoder().encode(utils.stringify(data)),
      )
    })
    const enc: EncryptedData = {
      ct: SafeBuffer.from(ct, "binary").toString("base64"),
      iv: rand.iv.toString("base64"),
      s: rand.s.toString("base64"),
    }
    if (cb) cb(enc)
    return enc
  },

  /**
   * Decrypt data with a key pair
   */
  decrypt: async (
    enc: Partial<EncryptedData> | null,
    pair: Partial<UserPair> | null,
    cb?: Callback<unknown | null>,
  ): Promise<unknown | null> => {
    if (!enc || !enc.ct || !enc.iv || !enc.s || !pair || !pair.epriv) {
      if (cb) cb(null)
      return null
    }

    const data = {
      ct: SafeBuffer.from(enc.ct, "base64"),
      iv: SafeBuffer.from(enc.iv, "base64"),
      s: SafeBuffer.from(enc.s, "base64"),
    }
    try {
      const ct = await utils.aeskey(pair.epriv, data.s).then(aes => {
        return utils.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: new Uint8Array(data.iv),
            tagLength: 128,
          },
          aes,
          new Uint8Array(data.ct),
        )
      })
      const dec = utils.parse(new TextDecoder("utf8").decode(ct))
      if (cb) cb(dec)
      return dec
    } catch (err) {
      // An error will be thrown if the wrong key is used
      if (cb) cb(null)
      return null
    }
  },

  /**
   * Verify a signed message
   */
  verify: async (
    data: string | SignedData,
    pair: Partial<UserPair> | null,
    cb?: Callback<unknown | null>,
  ): Promise<unknown | null> => {
    if (!pair || !pair.pub) {
      if (cb) cb(null)
      return null
    }

    const signed = (
      typeof data === "string" ? utils.parse(data) : data
    ) as SignedData
    let key: CryptoKey
    try {
      key = await verifyingKey(pair.pub)
    } catch (err) {
      console.log(`error importing public key: ${(err as Error).message}`)
      if (cb) cb(null)
      return null
    }

    let msg: string | Record<string, unknown> = {}
    if (typeof signed.m === "string") {
      msg = signed.m
    } else {
      // Allow data to be passed in with graph meta data,
      // (which should not be part of signature, so not verified)
      for (const k of Object.keys(signed.m).sort()) {
        if (k !== "_" && k !== userPublicKey && k !== userSignature) {
          ;(msg as Record<string, unknown>)[k] = signed.m[k]
        }
      }
    }
    if (await verifyHash(utils.stringify(msg), signed.s, key)) {
      const verified = utils.parse(signed.m as string)
      if (cb) cb(verified)
      return verified
    }

    if (cb) cb(null)
    return null
  },

  /**
   * Sign data with a key pair
   */
  sign: async (
    data: string | Record<string, unknown>,
    pair: Partial<UserPair> | null,
    cb?: Callback<SignedData | null>,
  ): Promise<SignedData | null> => {
    if (!pair || !pair.pub || !pair.priv) {
      if (cb) cb(null)
      return null
    }

    let msg: string | Record<string, unknown> = {}
    if (typeof data === "string") {
      msg = data
    } else {
      const check = utils.parse(data as never) as Record<string, unknown>
      for (const k of Object.keys(check).sort()) {
        if (k !== "_" && k !== userPublicKey && k !== userSignature) {
          ;(msg as Record<string, unknown>)[k] = check[k]
        }
      }
    }
    // The hash of msg is signed rather than msg itself, so a signature from
    // sign can't be used as a property signature (see signText).
    const hash = await utils.sha256(msg)
    const key = await signingKey(pair as never)
    const sig = await utils.subtle.sign(ecdsa, key, new Uint8Array(hash))
    const signed: SignedData = {
      m: msg,
      s: SafeBuffer.from(sig, "binary").toString("base64"),
    }

    if (cb) cb(signed)
    return signed
  },

  /**
   * Before property signatures, an update was signed by signing its
   * timestamp, which vouches for anything claiming that timestamp. Data signed
   * then still has to verify until its owner writes it again.
   */
  verifyTimestamp: async (
    timestamp: number,
    signature: string,
    publicKey: string,
    cb?: Callback<boolean>,
  ): Promise<boolean> => {
    if (!publicKey || !timestamp || !signature) {
      if (cb) cb(false)
      return false
    }

    let isValid = false
    try {
      const key = await verifyingKey(publicKey)
      isValid = await verifyHash(timestamp.toString(), signature, key)
    } catch (err) {
      console.log(`error importing public key: ${(err as Error).message}`)
    }
    if (cb) cb(isValid)
    return isValid
  },

  /**
   * Returns a graph for soul with data and the public key property that marks
   * it as user data, each property signed by pair. A signature in _.s only
   * verifies for its soul, key, value and state.
   */
  signProperties: async (
    soul: string,
    data: Record<string, GraphValue>,
    pair: {pub: string; priv: string},
  ): Promise<Graph> => {
    const timestamp = Date.now()
    const g = graph(soul, data, timestamp)
    const node = g[soul]!
    node[userPublicKey] = pair.pub
    node._[">"][userPublicKey] = timestamp
    const sigs: Record<string, string> = {}
    node._.s = sigs
    const key = await signingKey(pair)
    await Promise.all(
      Object.keys(node)
        .filter(k => k !== "_")
        .map(async k => {
          const text = propertyText(soul, k, node[k], timestamp)
          sigs[k] = await signText(text, key)
        }),
    )
    return g
  },

  /**
   * Maps the keys of node whose signatures in _.s verify against publicKey to
   * whether they're from before property signatures, which is only checked
   * when legacy is true (see verifyTimestamp).
   */
  verifyProperties: async (
    soul: string,
    node: GraphNode,
    keys: string[],
    publicKey: string,
    legacy = true,
  ): Promise<Map<string, boolean>> => {
    const verified = new Map<string, boolean>()
    const sigs = node._.s
    if (!publicKey || !sigs || keys.length === 0) return verified

    let key: CryptoKey
    try {
      key = await verifyingKey(publicKey)
    } catch (err) {
      console.log(`error importing public key: ${(err as Error).message}`)
      return verified
    }

    await Promise.all(
      keys.map(async k => {
        const sig = sigs[k]!
        const state = node._[">"][k]!
        const text = propertyText(soul, k, node[k], state)
        if (await verifyText(text, sig, key)) {
          verified.set(k, false)
        } else if (legacy && (await verifyHash(state.toString(), sig, key))) {
          verified.set(k, true)
        }
      }),
    )
    return verified
  },

  /**
   * Key derivation using PBKDF2
   */
  work: async (
    data: unknown,
    salt?: unknown,
    iterations?: number | Callback<{epriv: string}>,
    cb?: Callback<{epriv: string}>,
  ): Promise<{epriv: string}> => {
    let _cb = cb
    let _salt = salt
    let _iterations = iterations

    if (typeof salt === "function") {
      _cb = salt as Callback<{epriv: string}>
      _salt = undefined
    }
    if (typeof iterations === "function") {
      _cb = iterations
      _iterations = undefined
    }
    if (typeof _salt === "undefined") _salt = utils.random(9)
    if (typeof _iterations === "undefined") _iterations = 100000

    const key = await utils.subtle.importKey(
      "raw",
      new TextEncoder().encode(utils.stringify(data)),
      {name: "PBKDF2"},
      false,
      ["deriveBits"],
    )
    const alg = {
      name: "PBKDF2",
      iterations: _iterations,
      salt: new TextEncoder().encode(_salt as string),
      hash: {name: "SHA-256"},
    }
    const work = await utils.subtle.deriveBits(alg, key, 512)
    // Use "pair" format so that work can be used as epriv by decrypt
    const pair = {epriv: SafeBuffer.from(work, "binary").toString("base64")}
    if (_cb) _cb(pair)
    return pair
  },

  /**
   * Derive shared secret using ECDH
   */
  secret: async (
    to: Partial<UserPair> | null,
    from: Partial<UserPair> | null,
    cb?: Callback<{epriv: string} | null>,
  ): Promise<{epriv: string} | null> => {
    if (!to || !to.epub || !from || !from.epub || !from.epriv) {
      if (cb) cb(null)
      return null
    }

    const alg = {name: "ECDH", namedCurve: "P-256"}
    const pub = utils.jwk(to.epub)
    const pubKey = await utils.subtle.importKey("jwk", pub, alg, true, [])
    const priv = utils.jwk(from.epub, from.epriv)
    // utils.jwk provides default key_ops but it shouldn't be used here
    delete (priv as {key_ops?: unknown}).key_ops
    const derived = await utils.subtle
      .importKey("jwk", priv, alg, false, ["deriveBits"])
      .then(async key => {
        const derivedBits = await utils.subtle.deriveBits(
          {public: pubKey, name: "ECDH", namedCurve: "P-256"} as never,
          key,
          256,
        )
        const derivedKey = await utils.subtle.importKey(
          "raw",
          new Uint8Array(derivedBits),
          {name: "AES-GCM", length: 256},
          true,
          ["encrypt", "decrypt"],
        )
        return utils.subtle.exportKey("jwk", derivedKey).then(({k}) => k!)
      })
    // Use "pair" format so that secret can be used as epriv by encrypt
    if (cb) cb({epriv: derived})
    return {epriv: derived}
  },
}

export default SEA

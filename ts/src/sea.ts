/**
 * SEA - Security, Encryption, and Authorization
 * Cryptographic functions for signing, verification, encryption, and decryption
 */

import { userPublicKey, userSignature } from "./utils.ts"
import * as utils from "./sea-utils.ts"
import SafeBuffer from "./buffer.ts"
import type {
  UserPair,
  EncryptedData,
  SignedData,
} from "./schemas.ts"

type Callback<T> = (result: T) => void

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
      .generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
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
      .generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"])
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
    cb?: Callback<EncryptedData | null>
  ): Promise<EncryptedData | null> => {
    if (!pair || !pair.epriv) {
      if (cb) cb(null)
      return null
    }

    const rand = { s: utils.random(9), iv: utils.random(15) }
    const ct = await utils.aeskey(pair.epriv, rand.s).then(aes => {
      return utils.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(rand.iv),
        },
        aes,
        new TextEncoder().encode(utils.stringify(data))
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
    cb?: Callback<unknown | null>
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
          new Uint8Array(data.ct)
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
    cb?: Callback<unknown | null>
  ): Promise<unknown | null> => {
    if (!pair || !pair.pub) {
      if (cb) cb(null)
      return null
    }

    const signed = (
      typeof data === "string" ? utils.parse(data) : data
    ) as SignedData
    const key = await utils.subtle.importKey(
      "jwk",
      utils.jwk(pair.pub),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    )

    let msg: string | Record<string, unknown> = {}
    if (typeof signed.m === "string") {
      msg = signed.m
    } else {
      // Allow data to be passed in with graph meta data,
      // (which should not be part of signature, so not verified)
      for (const k of Object.keys(signed.m).sort()) {
        if (k !== "_" && k !== userPublicKey && k !== userSignature) {
          (msg as Record<string, unknown>)[k] = signed.m[k]
        }
      }
    }
    const hash = await utils.sha256(msg)
    const sig = new Uint8Array(SafeBuffer.from(signed.s, "base64"))
    const alg = { name: "ECDSA", hash: { name: "SHA-256" } }
    if (await utils.subtle.verify(alg, key, sig, new Uint8Array(hash))) {
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
    cb?: Callback<SignedData | null>
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
          (msg as Record<string, unknown>)[k] = check[k]
        }
      }
    }
    const hash = await utils.sha256(msg)
    const jwk = utils.jwk(pair.pub, pair.priv)
    const alg = { name: "ECDSA", namedCurve: "P-256" }
    const sig = await utils.subtle
      .importKey("jwk", jwk, alg, false, ["sign"])
      .then(key =>
        utils.subtle.sign(
          { name: "ECDSA", hash: { name: "SHA-256" } },
          key,
          new Uint8Array(hash)
        )
      )
    const signed: SignedData = {
      m: msg,
      s: SafeBuffer.from(sig, "binary").toString("base64"),
    }

    if (cb) cb(signed)
    return signed
  },

  /**
   * Sign a timestamp to prove ownership of an update
   */
  signTimestamp: async (
    timestamp: number,
    pair: Partial<UserPair> | null,
    cb?: Callback<string | null>
  ): Promise<string | null> => {
    if (!pair || !pair.pub || !pair.priv) {
      if (cb) cb(null)
      return null
    }

    // Convert timestamp to string for consistent hashing
    const timestampStr = timestamp.toString()
    const hash = await utils.sha256(timestampStr)
    const jwk = utils.jwk(pair.pub, pair.priv)
    const alg = { name: "ECDSA", namedCurve: "P-256" }

    const sig = await utils.subtle
      .importKey("jwk", jwk, alg, false, ["sign"])
      .then(key =>
        utils.subtle.sign(
          { name: "ECDSA", hash: { name: "SHA-256" } },
          key,
          new Uint8Array(hash)
        )
      )

    const signature = SafeBuffer.from(sig, "binary").toString("base64")

    if (cb) cb(signature)
    return signature
  },

  /**
   * Verify a timestamp signature to confirm ownership of update
   */
  verifyTimestamp: async (
    timestamp: number,
    signature: string,
    publicKey: string,
    cb?: Callback<boolean>
  ): Promise<boolean> => {
    if (!publicKey || !timestamp || !signature) {
      if (cb) cb(false)
      return false
    }

    try {
      // Convert timestamp to string for consistent hashing
      const timestampStr = timestamp.toString()
      const hash = await utils.sha256(timestampStr)

      const key = await utils.subtle.importKey(
        "jwk",
        utils.jwk(publicKey),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      )

      const sig = new Uint8Array(SafeBuffer.from(signature, "base64"))
      const alg = { name: "ECDSA", hash: { name: "SHA-256" } }

      const isValid = await utils.subtle.verify(
        alg,
        key,
        sig,
        new Uint8Array(hash)
      )

      if (cb) cb(isValid)
      return isValid
    } catch (err) {
      console.log(`error verifying timestamp signature: ${(err as Error).message}`)
      if (cb) cb(false)
      return false
    }
  },

  /**
   * Verify individual property signatures stored in node._["s"]
   * Returns array of valid property names
   */
  verifyProperties: async (
    node: Record<string, unknown>,
    pub: string,
    cb?: Callback<string[]>
  ): Promise<string[]> => {
    if (!pub || !node) {
      if (cb) cb([])
      return []
    }

    const key = await utils.subtle.importKey(
      "jwk",
      utils.jwk(pub),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    )

    const alg = { name: "ECDSA", hash: { name: "SHA-256" } }
    const valid: string[] = []
    const propertySignatures =
      ((node._ as Record<string, unknown> | undefined)?.["s"] as Record<string, string> | undefined) || {}

    // Verify each property individually
    for (const k of Object.keys(node).sort()) {
      if (k === "_" || k === userPublicKey) continue

      const propSig = propertySignatures[k]
      if (!propSig) {
        continue
      }

      try {
        const hash = await utils.sha256(node[k])
        const sig = new Uint8Array(SafeBuffer.from(propSig, "base64"))

        const isValid = await utils.subtle.verify(
          alg,
          key,
          sig,
          new Uint8Array(hash)
        )
        if (isValid) {
          valid.push(k)
        } else {
          console.log(`warning: property '${k}' signature verification failed`)
        }
      } catch (err) {
        console.log(
          `warning: property '${k}' error verifying: ${(err as Error).message}`
        )
      }
    }

    if (cb) cb(valid)
    return valid
  },

  /**
   * Key derivation using PBKDF2
   */
  work: async (
    data: unknown,
    salt?: unknown,
    cb?: Callback<{ epriv: string }>
  ): Promise<{ epriv: string }> => {
    let _cb = cb
    let _salt = salt

    if (typeof salt === "function") {
      _cb = salt as Callback<{ epriv: string }>
      _salt = undefined
    }
    if (typeof _salt === "undefined") _salt = utils.random(9)

    const key = await utils.subtle.importKey(
      "raw",
      new TextEncoder().encode(utils.stringify(data)),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    )
    const alg = {
      name: "PBKDF2",
      iterations: 100000,
      salt: new TextEncoder().encode(_salt as string),
      hash: { name: "SHA-256" },
    }
    const work = await utils.subtle.deriveBits(alg, key, 512)
    // Use "pair" format so that work can be used as epriv by decrypt
    const pair = { epriv: SafeBuffer.from(work, "binary").toString("base64") }
    if (_cb) _cb(pair)
    return pair
  },

  /**
   * Derive shared secret using ECDH
   */
  secret: async (
    to: Partial<UserPair> | null,
    from: Partial<UserPair> | null,
    cb?: Callback<{ epriv: string } | null>
  ): Promise<{ epriv: string } | null> => {
    if (!to || !to.epub || !from || !from.epub || !from.epriv) {
      if (cb) cb(null)
      return null
    }

    const alg = { name: "ECDH", namedCurve: "P-256" }
    const pub = utils.jwk(to.epub)
    const pubKey = await utils.subtle.importKey("jwk", pub, alg, true, [])
    const priv = utils.jwk(from.epub, from.epriv)
    // utils.jwk provides default key_ops but it shouldn't be used here
    delete (priv as { key_ops?: unknown }).key_ops
    const derived = await utils.subtle
      .importKey("jwk", priv, alg, false, ["deriveBits"])
      .then(async key => {
        const derivedBits = await utils.subtle.deriveBits(
          { public: pubKey, name: "ECDH", namedCurve: "P-256" } as never,
          key,
          256
        )
        const derivedKey = await utils.subtle.importKey(
          "raw",
          new Uint8Array(derivedBits),
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt"]
        )
        return utils.subtle.exportKey("jwk", derivedKey).then(({ k }) => k!)
      })
    // Use "pair" format so that secret can be used as epriv by encrypt
    if (cb) cb({ epriv: derived })
    return { epriv: derived }
  },
}

export default SEA


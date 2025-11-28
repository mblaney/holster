/**
 * SEA Utilities - Cryptographic utility functions
 * Provides helpers for encryption, hashing, and key management
 */

import SafeBuffer from "./buffer.ts"
import type { JWK } from "./schemas.ts"

const isNode = typeof document === "undefined"

// Get crypto based on environment - dynamic import for Node.js compatibility
const crypto: Crypto = isNode
  ? ((await import(/*webpackIgnore: true*/ "node:crypto")).webcrypto as Crypto)
  : globalThis.crypto

export const subtle = crypto.subtle

/**
 * Convert data to string format for cryptographic operations
 */
export const stringify = (data: unknown): string => {
  return typeof data === "string" ? data : JSON.stringify(data)
}

/**
 * Parse JSON text safely
 */
export const parse = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Generate cryptographically secure random bytes
 */
export const random = (length: number): SeaArray => {
  const array = new Uint8Array(length)
  const filled = crypto.getRandomValues(array)
  return SafeBuffer.from(filled)
}

/**
 * Create JWK from public and optional private key components
 */
export const jwk = (pub: string, priv?: string): JWK => {
  const [x, y] = pub.split(".")
  const ops = priv ? ["sign"] : ["verify"]
  return {
    kty: "EC",
    crv: "P-256",
    x: x!,
    y: y!,
    d: priv,
    ext: true,
    key_ops: ops,
  }
}

/**
 * SHA-256 hash of data
 */
export const sha256 = async (data: unknown): Promise<SeaArray> => {
  const hash = await subtle.digest(
    { name: "SHA-256" },
    new TextEncoder().encode(stringify(data))
  )
  return SafeBuffer.from(new Uint8Array(hash))
}

/**
 * Derive AES key from password and salt  
 */
export const aeskey = async (
  key: string,
  salt: SeaArray
) => {
  const combined = key + salt.toString("utf8")
  const hashResult = await sha256(combined)
  const jwkKey = keyToJwk(hashResult)
  return await subtle.importKey("jwk", jwkKey, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ])
}

/**
 * Convert key buffer to JWK format for AES
 */
const keyToJwk = (key: SeaArray): JWK => {
  const k = key
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
  return { kty: "oct", k: k, ext: false, alg: "A256GCM" }
}

// Re-export SeaArray type for convenience
import type SeaArray from "./array.ts"


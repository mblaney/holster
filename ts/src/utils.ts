/**
 * Utility functions for Holster
 * Provides helpers for type checking, graph manipulation, and pattern matching
 */

import type { Soul, Relation, Graph, GraphNode, LexFilter, GraphValue } from "./schemas.js"

// ============================================================================
// Number Utilities
// ============================================================================

export const num = {
  /**
   * Check if value is a valid number
   */
  is: (n: unknown): n is number => {
    if (n instanceof Array) return false
    if (typeof n === "number") return !isNaN(n)
    if (typeof n === "string") {
      const parsed = parseFloat(n)
      return !isNaN(parsed) && isFinite(parsed)
    }
    return false
  },
}

// ============================================================================
// Object Utilities
// ============================================================================

type PlainObject = Record<string, unknown>

export const obj = {
  /**
   * Check if value is a plain object
   */
  is: (o: unknown): o is PlainObject => {
    if (!o || typeof o !== "object") return false
    const toString = Object.prototype.toString.call(o)
    const match = toString.match(/^\[object (\w+)\]$/)
    return (
      (o as Record<string, unknown>).constructor === Object ||
      (match !== null && match[1] === "Object")
    )
  },

  /**
   * Map over object keys with early return support
   */
  map: <T, R>(
    list: Record<string, T>,
    cb: (value: T, key: string, o?: Record<string, unknown>) => R | undefined,
    o?: Record<string, unknown>
  ): R | undefined => {
    const keys = Object.keys(list)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!
      const result = cb(list[key]!, key, o)
      if (typeof result !== "undefined") return result
    }
    return undefined
  },

  /**
   * Set a property on an object
   */
  put: <T>(o: Record<string, T> | undefined, key: string, value: T): Record<string, T> => {
    const target = o || {}
    target[key] = value
    return target
  },

  /**
   * Delete a property from an object
   */
  del: <T>(o: Record<string, T> | undefined, key: string): Record<string, T> | undefined => {
    if (!o) return undefined
    o[key] = null as T
    delete o[key]
    return o
  },
}

// ============================================================================
// Relation Utilities
// ============================================================================

const map_soul = (soul: unknown, key: string, o: { id: string | false }): void => {
  // If id is already defined AND we're still looping through the object,
  // then it is considered invalid
  if (o.id) {
    o.id = false
    return
  }

  if (key === "#" && typeof soul === "string") {
    o.id = soul
    return
  }

  // If there exists anything else on the object that isn't the soul,
  // then it is considered invalid
  o.id = false
}

export const rel = {
  /**
   * Check if value is a soul relation and return the soul ID
   */
  is: (value: unknown): string | false => {
    if (
      value &&
      typeof value === "object" &&
      "#" in value &&
      !("_" in value) &&
      obj.is(value)
    ) {
      const o: { id: string | false } = { id: "" }
      obj.map(value as Record<string, unknown>, map_soul as (value: unknown, key: string, o?: Record<string, unknown>) => void, o)
      if (o.id) return o.id
    }
    return false
  },

  /**
   * Convert a soul into a relation and return it
   */
  ify: (soul: Soul): Relation => obj.put<string>({}, "#", soul) as Relation,
}

// ============================================================================
// User Metadata Keys
// ============================================================================

export const userSignature = "_holster_user_signature"
export const userPublicKey = "_holster_user_public_key"

// ============================================================================
// Graph Construction
// ============================================================================

/**
 * Create a graph from soul and data with optional signature metadata
 */
export const graph = (
  soul: Soul,
  data: Record<string, GraphValue>,
  sig?: string,
  pub?: string,
  timestamp?: number
): Graph => {
  const ts = timestamp || Date.now()
  const stateVector: Record<string, number> = {}
  const node: GraphNode = {
    _: { "#": soul, ">": stateVector },
  }

  for (const [key, value] of Object.entries(data)) {
    if (key !== "_" && key !== userPublicKey && key !== userSignature) {
      node[key] = value
      stateVector[key] = ts
    }
  }

  if (sig && pub && timestamp) {
    if (!node._["s"]) {
      node._["s"] = {}
    }
    node._["s"][timestamp.toString()] = sig
    node[userPublicKey] = pub
    stateVector[userPublicKey] = timestamp
  }

  return { [soul]: node }
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Match a lex filter against a key
 */
export const match = (lex: LexFilter, key?: string): boolean => {
  // Null is used to match listeners on souls, which don't provide a key
  if (typeof key === "undefined") return lex === null

  if (typeof lex === "undefined") return true

  if (typeof lex === "string") return lex === key

  // Array support: check if key is in the array
  if (Array.isArray(lex)) return lex.includes(key)

  if (!obj.is(lex) || !key) return false

  // Prefix match
  if ("*" in lex) {
    const prefix = lex["*"] as string
    return key.slice(0, prefix.length) === prefix
  }

  // Range match
  const gt = ">" in lex ? (lex[">"] as string) : undefined
  const lt = "<" in lex ? (lex["<"] as string) : undefined

  if (gt && lt) return key >= gt && key <= lt
  if (gt) return key >= gt
  if (lt) return key <= lt

  return false
}

// ============================================================================
// Text Utilities
// ============================================================================

export const text = {
  /**
   * Generate a random string of specified length
   */
  random: (length?: number): string => {
    let s = ""
    const c = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    const len = length || 24
    for (let i = 0; i < len; i++) {
      s += c.charAt(Math.floor(Math.random() * c.length))
    }
    return s
  },
}


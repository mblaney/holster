/**
 * Radix - Radix tree implementation for efficient key-value storage
 * Supports prefix-based key compression
 */

import * as utils from "./utils.ts"
import type {EncodedValue, RadixFunction} from "./schemas.ts"

// ASCII character for group separator
const group = String.fromCharCode(29)
// ASCII character for record separator
const record = String.fromCharCode(30)

// Local type for internal radix tree structure (different from schemas.RadixValue)
// This represents the internal node structure with dynamic keys
interface RadixValue {
  [key: string]: RadixTree | EncodedValue | undefined
}

// RadixTree is the internal tree structure (also known as RadixNode in schemas)
type RadixTree = Record<string, RadixValue>
// Alias for compatibility with schema types
type RadixNode = RadixTree

// Type guard to check if a value is a RadixTree (object)
const isRadixTree = (value: unknown): value is RadixTree => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Create a new Radix tree
 */
const Radix = (): RadixFunction => {
  const radix = ((
    keys?: string,
    value?: EncodedValue,
    tree?: RadixTree,
  ): RadixNode | EncodedValue | undefined | Record<string, EncodedValue> => {
    if (!tree) {
      if (!(radix as Record<string, unknown>)[group])
        (radix as Record<string, unknown>)[group] = {}
      tree = (radix as Record<string, RadixTree>)[group]!
    }
    if (!keys) return tree

    let i = 0
    let tmp: Record<string, RadixValue> = {}
    let key = keys[i]!
    const max = keys.length - 1
    const noValue = typeof value === "undefined"

    // Find a matching value using the shortest string from keys
    let found: RadixValue | undefined = tree![key]
    while (!found && i < max) {
      key += keys[++i]
      found = tree![key]
    }

    if (!found) {
      if (noValue) {
        // If not found from the provided keys try matching with an
        // existing key.
        const result = utils.obj.map(
          tree!,
          (hasValue: RadixValue, hasKey: string) => {
            let j = 0
            let matchingKey = ""
            while (hasKey[j] === keys[j]) {
              matchingKey += hasKey[j]
              j++
            }
            if (matchingKey) {
              // matchingKey has to be as long as the original keys when
              // reading.
              if (j <= max) return undefined

              tmp[hasKey.slice(j)] = hasValue
              return hasValue
            }
            return undefined
          },
        )
        if (!result) return undefined

        return tmp
      }

      // Writing: find the EXISTING key with the longest shared prefix,
      // not just the first one with any overlap at all (obj.map stops at
      // the first non-undefined result, so a plain find here would settle
      // for whichever candidate happens to come first in Object.keys'
      // own iteration order). A radix tree's own invariant - no two
      // sibling keys share a prefix - only holds if every insertion
      // merges with its one true match; with many keys sharing this tree
      // at once (many concurrent writers batched together), a
      // coincidentally shorter, unrelated key can otherwise "win" over
      // the real, much longer match - silently misplacing the new key
      // under the wrong group, while its actual sibling is never touched
      // at all and stays wherever it already was, invisible to any read
      // that expects it inside this new group.
      let bestKey: string | null = null
      let bestMatch = ""
      for (const hasKey of Object.keys(tree!)) {
        let j = 0
        let matchingKey = ""
        while (hasKey[j] === keys[j]) {
          matchingKey += hasKey[j]
          j++
        }
        if (matchingKey.length > bestMatch.length) {
          bestKey = hasKey
          bestMatch = matchingKey
        }
      }

      if (bestKey) {
        const hasValue = tree![bestKey]!
        const j = bestMatch.length
        const replace: RadixTree = {
          [bestKey.slice(j)]: hasValue,
          [keys.slice(j)]: {[record]: value!},
        }
        tree![bestMatch] = {[group]: replace}
        delete tree![bestKey]
      } else {
        if (!tree![key]) tree![key] = {}
        tree![key]![record] = value!
      }
    } else if (i === max) {
      // If no value use the key provided to return a whole group or record
      if (noValue) {
        // If an individual record isn't found then return the whole group
        return typeof found[record] === "undefined"
          ? found[group]
          : found[record]
      }
      // Otherwise create a new record at the provided key for value
      found[record] = value!
    } else {
      // Found at a shorter key, try again
      if (!found[group] && !noValue) found[group] = {}
      const nextTree = found[group]
      if (isRadixTree(nextTree)) {
        return radix(keys.slice(++i), value, nextTree as RadixTree) as RadixNode
      }
    }

    return undefined
  }) as RadixFunction

  return radix
}

/**
 * Map over all values in a radix tree
 */
Radix.map = function map(
  radix: RadixFunction | RadixNode,
  cb: (
    value: EncodedValue,
    fullKey: string,
    key: string,
    pre: string[],
  ) => unknown,
  opt?: boolean,
  pre: string[] = [],
): unknown {
  const tree = ((radix as Record<string, RadixTree>)[group] ||
    radix) as RadixTree
  const keys = Object.keys(tree).sort()

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    const found = tree[key]
    if (!found) continue

    const recordValue = found[record]

    if (typeof recordValue !== "undefined") {
      const result = cb(
        recordValue as EncodedValue,
        pre.join("") + key,
        key,
        pre,
      )
      if (typeof result !== "undefined") return result
    } else if (opt) {
      cb(undefined as never, pre.join(""), key, pre)
    }

    const groupValue = found[group]
    if (isRadixTree(groupValue)) {
      pre.push(key)
      const result = map(groupValue, cb, opt, pre)
      if (typeof result !== "undefined") return result
      pre.pop()
    }
  }

  return undefined
}

export default Radix

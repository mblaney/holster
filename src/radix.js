import * as utils from "./utils.js"

// ASCII character for group separator.
const group = String.fromCharCode(29)
// ASCII character for record separator.
const record = String.fromCharCode(30)

const Radix = () => {
  const radix = (keys, value, tree) => {
    if (!tree) {
      if (!radix[group]) radix[group] = {}
      tree = radix[group]
    }
    if (!keys) return tree

    let i = 0
    let tmp = {}
    let key = keys[i]
    const max = keys.length - 1
    const noValue = typeof value === "undefined"
    // Find a matching value using the shortest string from keys.
    let found = tree[key]
    while (!found && i < max) {
      key += keys[++i]
      found = tree[key]
    }

    if (!found) {
      if (noValue) {
        // If not found from the provided keys try matching with an existing
        // key.
        const result = utils.obj.map(tree, (hasValue, hasKey) => {
          let j = 0
          let matchingKey = ""
          while (hasKey[j] === keys[j]) {
            matchingKey += hasKey[j++]
          }
          if (matchingKey) {
            // matchingKey has to be as long as the original keys when
            // reading.
            if (j <= max) return

            tmp[hasKey.slice(j)] = hasValue
            return hasValue
          }
        })
        if (!result) return

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
      let bestKey = null
      let bestMatch = ""
      for (const hasKey of Object.keys(tree)) {
        let j = 0
        let matchingKey = ""
        while (hasKey[j] === keys[j]) {
          matchingKey += hasKey[j++]
        }
        if (matchingKey.length > bestMatch.length) {
          bestKey = hasKey
          bestMatch = matchingKey
        }
      }

      if (bestKey) {
        const hasValue = tree[bestKey]
        const j = bestMatch.length
        let replace = {
          [bestKey.slice(j)]: hasValue,
          [keys.slice(j)]: {[record]: value},
        }
        tree[bestMatch] = {[group]: replace}
        delete tree[bestKey]
      } else {
        if (!tree[key]) tree[key] = {}
        tree[key][record] = value
      }
    } else if (i === max) {
      // If no value use the key provided to return a whole group or record.
      if (noValue) {
        // If an individual record isn't found then return the whole group.
        return typeof found[record] === "undefined"
          ? found[group]
          : found[record]
      }
      // Otherwise create a new record at the provided key for value.
      found[record] = value
    } else {
      // Found at a shorter key, try again.
      if (!found[group] && !noValue) found[group] = {}
      return radix(keys.slice(++i), value, found[group])
    }
  }
  return radix
}

Radix.map = function map(radix, cb, opt, pre) {
  if (!pre) pre = []
  var tree = radix[group] || radix
  var keys = Object.keys(tree).sort()
  var u

  for (let i = 0; i < keys.length; i++) {
    let key = keys[i]
    let found = tree[key]
    let tmp = found[record]
    if (typeof tmp !== "undefined") {
      tmp = cb(tmp, pre.join("") + key, key, pre)
      if (typeof tmp !== "undefined") return tmp
    } else if (opt) {
      cb(u, pre.join(""), key, pre)
    }
    if (found[group]) {
      pre.push(key)
      tmp = map(found[group], cb, opt, pre)
      if (typeof tmp !== "undefined") return tmp
      pre.pop()
    }
  }
}

export default Radix

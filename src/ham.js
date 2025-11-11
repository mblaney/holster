import * as utils from "./utils.js"
import SEA from "./sea.js"

const LISTENER_DELAY = 100
// Maximum number of souls to keep in memory
const MAX_GRAPH_SIZE = 10000

// state and value are the incoming changes.
// currentState and currentValue are the current graph data.
const Ham = (state, currentState, value, currentValue, signed = false) => {
  if (state < currentState) return {historical: true}

  if (state > currentState) return {incoming: true}

  // state is equal to currentState
  // If using signed timestamps then reject conflicting values because the
  // owner can only create one value per timestamp.
  if (signed && value !== currentValue) {
    console.log(`Signed timestamp ${state}: reject conflicting value`)
    return {historical: true}
  }

  // Lexically compare to resolve conflict (for unsigned or matching values)
  if (typeof value !== "string") {
    value = JSON.stringify(value) || ""
  }
  if (typeof currentValue !== "string") {
    currentValue = JSON.stringify(currentValue) || ""
  }
  // No update required.
  if (value === currentValue) return {state: true}

  // Keep the current value.
  if (value < currentValue) return {current: true}

  // Otherwise update using the incoming value.
  return {incoming: true}
}

Ham.mix = async (change, graph, secure, listen) => {
  if (!change || typeof change !== "object") {
    throw new TypeError("change must be an object")
  }
  if (!graph || typeof graph !== "object") {
    throw new TypeError("graph must be an object")
  }
  if (!listen || typeof listen !== "object") {
    throw new TypeError("listen must be an object")
  }

  const machine = Date.now()
  const now = {}
  const defer = {}
  const validProperties = new Map() // Track valid properties per soul
  const validTimestamps = new Map() // Track valid timestamps per soul
  let wait = 0

  for (const soul of Object.keys(change)) {
    const node = change[soul]
    let updated = false
    let alias = false
    let nodeWait = 0
    let verify = secure

    if (!node || !node._) continue

    const pub = node[utils.userPublicKey]
    // If timestamp signatures and public key are provided then always verify
    if (node._["s"] && pub) verify = true

    // Special case if soul starts with "~". Node must be system data ie,
    // ~@alias or ~publickey. For aliases, key and value must be a self
    // identifying rel. For public keys, data needs to be signed and verified.
    // (This is also true for any data when the secure flag is used.)
    if (soul.length > 1 && soul[0] === "~") {
      if (soul[1] === "@") {
        alias = true
        verify = false
      } else {
        if (pub && soul != "~" + pub) {
          console.log(`error public key does not match for soul: ${soul}`)
          continue
        }

        verify = true
      }
    }
    if (verify) {
      // Signature verification: check node._["s"] which can contain:
      // 1. Per-property signatures (legacy): keys are property names
      // 2. Timestamp signatures (new): keys are numeric timestamps
      if (!pub || !node._) {
        continue
      }

      const signedTimestamps = new Set()
      const signedProperties = new Set()

      // Verify timestamp signatures (numeric keys in node._["s"])
      for (const [key, sig] of Object.entries(node._["s"] || {})) {
        const asNumber = Number(key)
        if (!isNaN(asNumber) && asNumber > 0) {
          const isValid = await SEA.verifyTimestamp(asNumber, sig, pub)
          if (isValid) {
            signedTimestamps.add(asNumber)
            // Add all properties with this timestamp to signed set
            for (const [prop, ts] of Object.entries(node._[">"] || {})) {
              if (Number(ts) === asNumber) {
                signedProperties.add(prop)
              }
            }
          }
        }
      }

      // Verify per-property signatures (backward compatibility)
      const perPropertySignedProps = await SEA.verifyProperties(node, pub)
      perPropertySignedProps.forEach(prop => signedProperties.add(prop))

      // If no properties verified, skip this update
      if (signedProperties.size === 0) {
        continue
      }

      // Track signed properties and timestamps for this soul
      validProperties.set(soul, signedProperties)
      validTimestamps.set(soul, signedTimestamps)
    }

    for (const key of Object.keys(node)) {
      if (key === "_") continue

      // Skip metadata fields (including userSignature for old data)
      if (key === utils.userSignature || key === utils.userPublicKey) continue

      // Properties without signatures in this update are left unchanged
      if (validProperties.has(soul) && !validProperties.get(soul).has(key)) {
        continue
      }

      const value = node[key]
      const state = node._ && node._[">"] ? node._[">"][key] : 0
      const currentValue = (graph[soul] || {})[key]
      const currentState = (graph[soul] || {_: {">": {}}})._[">"][key] || 0

      if (alias && key !== utils.rel.is(value)) {
        console.log(`error alias ${alias}: ${key} !== ${utils.rel.is(value)}`)
        continue
      }

      // Defer the update if ahead of machine time.
      const skew = state - machine
      if (skew > 0) {
        // Ignore update if ahead by more than 24 hours.
        if (skew > 86400000) continue

        // Wait the shortest difference before trying the updates again.
        if (wait === 0 || skew < wait) wait = nodeWait = skew
        if (!defer[soul]) {
          defer[soul] = {_: {"#": soul, ">": {}, s: {}}}
        }
        defer[soul][key] = value
        defer[soul]._[">"][key] = state
        if (node._["s"]) {
          if (node._["s"][state]) {
            defer[soul]._["s"][state] = node._["s"][state]
          } else if (node._["s"][key]) {
            defer[soul]._["s"][key] = node._["s"][key]
          }
        }
      } else {
        // Check if this property has a signed timestamp
        const isSigned =
          validTimestamps.has(soul) && validTimestamps.get(soul).has(state)
        const result = Ham(state, currentState, value, currentValue, isSigned)
        if (result.incoming) {
          if (!now[soul]) {
            now[soul] = {_: {"#": soul, ">": {}, s: {}}}
          }
          if (!graph[soul]) {
            graph[soul] = {_: {"#": soul, ">": {}, s: {}}}
          }
          graph[soul][key] = now[soul][key] = value
          graph[soul]._[">"][key] = now[soul]._[">"][key] = state
          if (node._["s"]) {
            if (node._["s"][state]) {
              graph[soul]._["s"][state] = now[soul]._["s"][state] =
                node._["s"][state]
            } else if (node._["s"][key]) {
              graph[soul]._["s"][key] = now[soul]._["s"][key] = node._["s"][key]
            }
          }
          // Call event listeners for update on key, mix is called before
          // put has finished so wait for what could be multiple nested
          // updates on a node.
          if (listen[soul]) {
            setTimeout(() => {
              if (listen[soul]) {
                listen[soul]
                  .filter(l => utils.match(l["."], key))
                  .forEach(l => l.cb())
              }
            }, LISTENER_DELAY)
          }
          updated = true
        }
      }
    }

    // Call event listeners for update on soul.
    if (updated && listen[soul]) {
      setTimeout(() => {
        if (listen[soul]) {
          listen[soul].filter(l => utils.match(l["."])).forEach(l => l.cb())
        }
      }, LISTENER_DELAY)
    }
  }

  const souls = Object.keys(graph)
  if (souls.length > MAX_GRAPH_SIZE) {
    // Sort by oldest state timestamp and remove oldest entries
    const soulsByAge = souls
      .map(soul => {
        const states = graph[soul]._ && graph[soul]._[">"]
        const maxState = states ? Math.max(...Object.values(states)) : 0
        return {soul, maxState}
      })
      .sort((a, b) => a.maxState - b.maxState)
    const remove = soulsByAge.slice(0, souls.length - MAX_GRAPH_SIZE)
    remove.forEach(({soul}) => delete graph[soul])
  }

  return {now: now, defer: defer, wait: wait}
}

export default Ham

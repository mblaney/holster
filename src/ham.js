import * as utils from "./utils.js"
import SEA from "./sea.js"

// Maximum number of souls to keep in memory
const MAX_GRAPH_SIZE = 10000

// state and value are the incoming changes.
// currentState and currentValue are the current graph data.
const Ham = (state, currentState, value, currentValue, signed = false) => {
  if (state < currentState) return {historical: true}

  if (state > currentState) return {incoming: true}

  // state is equal to currentState. Old data is expected to propagate through
  // the network, but conflicting values with same signed timestamp are ignored
  // since the owner can only create one value per timestamp.
  if (signed && value !== currentValue) {
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

Ham.mix = async (
  change,
  graph,
  hasNode,
  secure,
  listen,
  maxGraphSize = MAX_GRAPH_SIZE,
  legacy = true,
) => {
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
  // Keyed by soul, so these have no prototype (see utils.obj.own).
  const now = Object.create(null)
  const defer = Object.create(null)
  const listeners = [] // Collect listeners to fire after store.put
  const validProperties = new Map() // Track valid properties per soul
  // Properties in the graph that are only signed the way they were before
  // property signatures, by soul, so their owner can sign them again.
  const legacyKeys = Object.create(null)
  let wait = 0
  let added = 0 // Souls added to the graph by this call

  for (const soul of Object.keys(change)) {
    const node = change[soul]
    let updated = false
    let alias = false
    let nodeWait = 0
    let verify = secure

    // __proto__ can't be stored as a soul or key in a plain object.
    if (soul === "__proto__" || !node || !node._) continue

    const pub = node[utils.userPublicKey]
    // An update that claims a public key is always verified, so one without
    // signatures has nothing verified and is dropped.
    if (pub) verify = true

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
      if (!pub) continue

      // Each property needs its own signature in _.s (see SEA.signProperties).
      // One with a state older than the graph's would be ignored anyway, so it
      // isn't checked.
      const current = utils.obj.own(graph, soul)
      const keys = Object.keys(node).filter(key => {
        if (key === "_") return false

        const sig = utils.obj.own(node._.s, key)
        const state = utils.obj.own(node._[">"], key)
        if (!sig || typeof state !== "number") return false

        const currentState = utils.obj.own(current && current._[">"], key)
        return !(currentState > state)
      })
      const signed = await SEA.verifyProperties(soul, node, keys, pub, legacy)
      if (signed.size === 0) continue

      validProperties.set(soul, signed)
    }

    for (const key of Object.keys(node)) {
      if (key === "_" || key === "__proto__") continue

      // Properties without signatures in this update are left unchanged
      if (validProperties.has(soul) && !validProperties.get(soul).has(key)) {
        continue
      }

      const value = node[key]
      const state = node._ && node._[">"] ? utils.obj.own(node._[">"], key) : 0
      const current = utils.obj.own(graph, soul)
      const currentValue = utils.obj.own(current, key)
      const currentState = utils.obj.own(current && current._[">"], key) || 0

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
        const sig = utils.obj.own(node._.s, key)
        if (!defer[soul]) {
          defer[soul] = {_: {"#": soul, ">": {}, s: {}}}
        }
        defer[soul][key] = value
        defer[soul]._[">"][key] = state
        if (sig) defer[soul]._.s[key] = sig
      } else {
        const isSigned =
          validProperties.has(soul) && validProperties.get(soul).has(key)
        const result = Ham(state, currentState, value, currentValue, isSigned)
        if (
          (result.incoming || result.state) &&
          isSigned &&
          validProperties.get(soul).get(key)
        ) {
          if (!legacyKeys[soul]) legacyKeys[soul] = []
          legacyKeys[soul].push(key)
        }
        if (result.incoming) {
          if (!now[soul]) {
            now[soul] = {_: {"#": soul, ">": {}, s: {}}}
          }
          if (!current) {
            graph[soul] = {_: {"#": soul, ">": {}, s: {}}}
            added++
          }
          graph[soul][key] = now[soul][key] = value
          graph[soul]._[">"][key] = now[soul]._[">"][key] = state
          const sig = utils.obj.own(node._.s, key)
          if (sig) {
            if (!graph[soul]._.s) graph[soul]._.s = {}
            graph[soul]._.s[key] = now[soul]._.s[key] = sig
          }
          // Collect event listeners to fire after store.put completes.
          // This ensures listeners always fire with data that's been stored.
          if (utils.obj.own(listen, soul)) {
            listen[soul]
              .filter(l => utils.match(l["."], key))
              .forEach(l => listeners.push(l.cb))
          }
          updated = true
        }
      }
    }

    // Collect event listeners for update on soul.
    if (updated && utils.obj.own(listen, soul)) {
      listen[soul]
        .filter(l => utils.match(l["."]))
        .forEach(l => listeners.push(l.cb))
    }
  }

  limitGraph(graph, hasNode, maxGraphSize, added)
  return {now, defer, wait, listeners, legacy: legacyKeys}
}

// Counting every soul in the graph on every call was most of the time a
// write took, so each graph's size is remembered from its last count, plus
// the souls Ham.mix has added since.
const graphSizes = new WeakMap()
// wire.js also adds souls it reads from the store, which aren't counted
// above, so the graph is counted again after this many calls regardless.
const RECOUNT_CALLS = 1000

// Removes the graph's oldest souls once it's over maxGraphSize, down to 90%
// of it, so the souls are only sorted every few hundred new ones rather
// than on every write.
function limitGraph(graph, hasNode, maxGraphSize, added) {
  const known = graphSizes.get(graph) ?? {size: 0, added: 0, calls: 0}
  graphSizes.set(graph, known)
  known.added += added
  known.calls++
  if (known.size + known.added <= maxGraphSize && known.calls < RECOUNT_CALLS) {
    return
  }

  const souls = Object.keys(graph)
  known.size = souls.length
  known.added = 0
  known.calls = 0
  if (souls.length <= maxGraphSize) return

  // Sort by oldest state timestamp and remove oldest entries
  const soulsByAge = souls
    .map(soul => {
      const states = graph[soul]._ && graph[soul]._[">"]
      const maxState = states ? Math.max(...Object.values(states)) : 0
      return {soul, maxState}
    })
    .sort((a, b) => a.maxState - b.maxState)
  const keep = Math.floor(maxGraphSize * 0.9)
  const remove = soulsByAge.slice(0, souls.length - keep)
  remove.forEach(({soul}) => {
    delete graph[soul]
    if (hasNode) hasNode.delete(soul)
  })
  known.size = keep
}

export default Ham

/**
 * HAM - Hypothetical Amnesia Machine
 * Conflict resolution algorithm for distributed data synchronization
 */

import * as utils from "./utils.ts"
import SEA from "./sea.ts"
import type {
  Graph,
  GraphNode,
  GraphValue,
  HamResult,
  HamMixResult,
  ListenMap,
  Timestamp,
} from "./schemas.ts"

// Maximum number of souls to keep in memory
const MAX_GRAPH_SIZE = 10000

/**
 * Compare incoming state with current state to determine which value wins
 * @param state - Incoming timestamp
 * @param currentState - Current timestamp
 * @param value - Incoming value
 * @param currentValue - Current value
 * @param signed - Whether the update has a verified signature
 */
const Ham = (
  state: Timestamp,
  currentState: Timestamp,
  value: GraphValue,
  currentValue: GraphValue,
  signed = false,
): HamResult => {
  if (state < currentState) return {historical: true}

  if (state > currentState) return {incoming: true}

  // state is equal to currentState. Old data is expected to propagate through
  // the network, but conflicting values with same signed timestamp are ignored
  // since the owner can only create one value per timestamp.
  if (signed && value !== currentValue) {
    return {historical: true}
  }

  // Lexically compare to resolve conflict (for unsigned or matching values)
  let valueStr = typeof value !== "string" ? JSON.stringify(value) || "" : value
  let currentValueStr =
    typeof currentValue !== "string"
      ? JSON.stringify(currentValue) || ""
      : currentValue

  // No update required
  if (valueStr === currentValueStr) return {state: true}

  // Keep the current value
  if (valueStr < currentValueStr) return {current: true}

  // Otherwise update using the incoming value
  return {incoming: true}
}

/**
 * Mix incoming changes into the graph with conflict resolution
 */
Ham.mix = async (
  change: Graph,
  graph: Graph,
  hasNode: Set<string> | undefined,
  secure: boolean,
  listen: ListenMap,
  maxGraphSize = MAX_GRAPH_SIZE,
  legacy = true,
): Promise<HamMixResult> => {
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
  const now: Graph = Object.create(null)
  const defer: Graph = Object.create(null)
  const listeners: Array<() => void> = []
  const validProperties = new Map<string, Map<string, boolean>>()
  // Properties in the graph that are only signed the way they were before
  // property signatures, by soul, so their owner can sign them again.
  const legacyKeys: Record<string, string[]> = Object.create(null)
  let wait = 0
  let added = 0 // Souls added to the graph by this call

  for (const soul of Object.keys(change)) {
    const node = change[soul]
    // __proto__ can't be stored as a soul or key in a plain object.
    if (soul === "__proto__" || !node || !node._) continue

    let updated = false
    let alias = false
    let verify = secure

    const pub = node[utils.userPublicKey] as string | undefined
    // An update that claims a public key is always verified, so one without
    // signatures has nothing verified and is dropped.
    if (pub) verify = true

    // Special case if soul starts with "~". Node must be system data ie,
    // ~@alias or ~publickey. For aliases, key and value must be a self
    // identifying rel. For public keys, data needs to be signed and verified.
    if (soul.length > 1 && soul[0] === "~") {
      if (soul[1] === "@") {
        alias = true
        verify = false
      } else {
        if (pub && soul !== "~" + pub) {
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
        return !(currentState !== undefined && currentState > state)
      })
      const signed = await SEA.verifyProperties(soul, node, keys, pub, legacy)
      if (signed.size === 0) continue

      validProperties.set(soul, signed)
    }

    for (const key of Object.keys(node)) {
      if (key === "_" || key === "__proto__") continue

      if (validProperties.has(soul) && !validProperties.get(soul)!.has(key)) {
        continue
      }

      const value = node[key]!
      const state =
        (node._ && node._[">"] ? utils.obj.own(node._[">"], key) : 0) || 0
      const current = utils.obj.own(graph, soul)
      const currentValue = utils.obj.own(current, key)
      const currentState = utils.obj.own(current && current._[">"], key) || 0

      if (alias && key !== utils.rel.is(value)) {
        console.log(`error alias ${alias}: ${key} !== ${utils.rel.is(value)}`)
        continue
      }

      const skew = state - machine
      if (skew > 0) {
        if (skew > 86400000) continue

        if (wait === 0 || skew < wait) wait = skew
        const sig = utils.obj.own(node._.s, key)
        if (!defer[soul]) {
          defer[soul] = {_: {"#": soul, ">": {}, s: {}}} as GraphNode
        }
        defer[soul]![key] = value
        defer[soul]!._[">"][key] = state
        if (sig) defer[soul]!._.s![key] = sig
      } else {
        const isSigned =
          validProperties.has(soul) && validProperties.get(soul)!.has(key)
        const result = Ham(
          state,
          currentState,
          value,
          currentValue ?? null,
          isSigned,
        )
        if (
          (result.incoming || result.state) &&
          isSigned &&
          validProperties.get(soul)!.get(key)
        ) {
          if (!legacyKeys[soul]) legacyKeys[soul] = []
          legacyKeys[soul]!.push(key)
        }
        if (result.incoming) {
          if (!now[soul]) {
            now[soul] = {_: {"#": soul, ">": {}, s: {}}} as GraphNode
          }
          if (!current) {
            graph[soul] = {_: {"#": soul, ">": {}, s: {}}} as GraphNode
            added++
          }
          graph[soul]![key] = now[soul]![key] = value
          graph[soul]!._[">"][key] = now[soul]!._[">"][key] = state
          const sig = utils.obj.own(node._.s, key)
          if (sig) {
            if (!graph[soul]!._.s) graph[soul]!._.s = {}
            graph[soul]!._.s![key] = now[soul]!._.s![key] = sig
          }

          if (utils.obj.own(listen, soul)) {
            listen[soul]!.filter(l => utils.match(l["."], key)).forEach(l =>
              listeners.push(l.cb as () => void),
            )
          }
          updated = true
        }
      }
    }

    if (updated && utils.obj.own(listen, soul)) {
      listen[soul]!.filter(l => utils.match(l["."])).forEach(l =>
        listeners.push(l.cb as () => void),
      )
    }
  }

  limitGraph(graph, hasNode, maxGraphSize, added)
  return {now, defer, wait, listeners, legacy: legacyKeys}
}

// Counting every soul in the graph on every call was most of the time a
// write took, so each graph's size is remembered from its last count, plus
// the souls Ham.mix has added since.
const graphSizes = new WeakMap<
  Graph,
  {size: number; added: number; calls: number}
>()
// wire.ts also adds souls it reads from the store, which aren't counted
// above, so the graph is counted again after this many calls regardless.
const RECOUNT_CALLS = 1000

// Removes the graph's oldest souls once it's over maxGraphSize, down to 90%
// of it, so the souls are only sorted every few hundred new ones rather
// than on every write.
function limitGraph(
  graph: Graph,
  hasNode: Set<string> | undefined,
  maxGraphSize: number,
  added: number,
): void {
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

  const soulsByAge = souls
    .map(soul => {
      const states = graph[soul]!._ && graph[soul]!._[">"]
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

/**
 * HAM - Hypothetical Amnesia Machine
 * Conflict resolution algorithm for distributed data synchronization
 */

import * as utils from "./utils.js"
import SEA from "./sea.js"
import type {
  Graph,
  GraphNode,
  GraphValue,
  HamResult,
  HamMixResult,
  ListenMap,
  Timestamp,
} from "./schemas.js"

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
  signed = false
): HamResult => {
  if (state < currentState) return { historical: true }

  if (state > currentState) return { incoming: true }

  // state is equal to currentState. Old data is expected to propagate through
  // the network, but conflicting values with same signed timestamp are ignored
  // since the owner can only create one value per timestamp.
  if (signed && value !== currentValue) {
    return { historical: true }
  }

  // Lexically compare to resolve conflict (for unsigned or matching values)
  let valueStr = typeof value !== "string" ? JSON.stringify(value) || "" : value
  let currentValueStr =
    typeof currentValue !== "string"
      ? JSON.stringify(currentValue) || ""
      : currentValue

  // No update required
  if (valueStr === currentValueStr) return { state: true }

  // Keep the current value
  if (valueStr < currentValueStr) return { current: true }

  // Otherwise update using the incoming value
  return { incoming: true }
}

/**
 * Mix incoming changes into the graph with conflict resolution
 */
Ham.mix = async (
  change: Graph,
  graph: Graph,
  secure: boolean,
  listen: ListenMap
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
  const now: Graph = {}
  const defer: Graph = {}
  const listeners: Array<() => void> = []
  const validProperties = new Map<string, Set<string>>()
  const validTimestamps = new Map<string, Set<number>>()
  let wait = 0

  for (const soul of Object.keys(change)) {
    const node = change[soul]
    if (!node || !node._) continue

    let updated = false
    let alias = false
    let verify = secure

    const pub = node[utils.userPublicKey] as string | undefined
    // If timestamp signatures and public key are provided then always verify
    if (node._["s"] && pub) verify = true

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
      if (!pub || !node._) {
        continue
      }

      const signedTimestamps = new Set<number>()
      const signedProperties = new Set<string>()

      const incomingTimestamps = Object.entries(node._[">"] || {})

      for (const [key, sig] of Object.entries(node._["s"] || {})) {
        const asNumber = Number(key)
        if (!isNaN(asNumber) && asNumber > 0) {
          const hasNewerInGraph = incomingTimestamps.some(([prop, ts]) => {
            if (Number(ts) === asNumber) {
              const graphState =
                graph[soul] && graph[soul]!._[">"] ? graph[soul]!._[">"][prop] : 0
              if (graphState && graphState > asNumber) {
                return true
              }
            }
            return false
          })

          if (hasNewerInGraph) {
            continue
          }

          const isValid = await SEA.verifyTimestamp(asNumber, sig as string, pub)
          if (isValid) {
            signedTimestamps.add(asNumber)
            for (const [prop, ts] of incomingTimestamps) {
              if (Number(ts) === asNumber) {
                signedProperties.add(prop)
              }
            }
          }
        }
      }

      const propertiesWithoutTimestampSigs = Object.keys(node).filter(k => {
        if (k === "_" || k === utils.userPublicKey) return false
        return !incomingTimestamps.some(
          ([prop, ts]) => prop === k && signedTimestamps.has(Number(ts))
        )
      })

      if (propertiesWithoutTimestampSigs.length > 0) {
        const nodeToVerify: Record<string, unknown> = { _: node._ }
        for (const prop of propertiesWithoutTimestampSigs) {
          nodeToVerify[prop] = node[prop]
        }
        const perPropertySignedProps = await SEA.verifyProperties(
          nodeToVerify,
          pub
        )
        perPropertySignedProps.forEach(prop => signedProperties.add(prop))
      }

      if (signedProperties.size === 0) {
        continue
      }

      validProperties.set(soul, signedProperties)
      validTimestamps.set(soul, signedTimestamps)
    }

    for (const key of Object.keys(node)) {
      if (key === "_") continue

      if (validProperties.has(soul) && !validProperties.get(soul)!.has(key)) {
        continue
      }

      const value = node[key]!
      const state = (node._ && node._[">"] ? node._[">"][key] : 0) || 0
      const currentValue = graph[soul] ? graph[soul][key] : undefined
      const currentState = graph[soul] ? (graph[soul]._[">"][key] || 0) : 0

      if (alias && key !== utils.rel.is(value)) {
        console.log(`error alias ${alias}: ${key} !== ${utils.rel.is(value)}`)
        continue
      }

      const skew = state - machine
      if (skew > 0) {
        if (skew > 86400000) continue

        if (wait === 0 || skew < wait) wait = skew
        if (!defer[soul]) {
          const stateVector: Record<string, number> = {}
          const signatures: Record<string, string> | undefined = {}
          defer[soul] = { _: { "#": soul, ">": stateVector, s: signatures } } as GraphNode
        }
        defer[soul]![key] = value
        defer[soul]!._[">"][key] = state
        if (node._["s"]) {
          const sigs = node._["s"]
          if (sigs[state]) {
            defer[soul]!._["s"]![state] = sigs[state]
          } else if (sigs[key]) {
            defer[soul]!._["s"]![key] = sigs[key]
          }
        }
      } else {
        const isSigned =
          validTimestamps.has(soul) && validTimestamps.get(soul)!.has(state)
        const result = Ham(state, currentState, value, currentValue ?? null, isSigned)
        if (result.incoming) {
          if (!now[soul]) {
            const stateVector1: Record<string, number> = {}
            const signatures1: Record<string, string> | undefined = {}
            now[soul] = { _: { "#": soul, ">": stateVector1, s: signatures1 } } as GraphNode
          }
          if (!graph[soul]) {
            const stateVector2: Record<string, number> = {}
            const signatures2: Record<string, string> | undefined = {}
            graph[soul] = { _: { "#": soul, ">": stateVector2, s: signatures2 } } as GraphNode
          }
          graph[soul]![key] = now[soul]![key] = value
          graph[soul]!._[">"][key] = now[soul]!._[">"][key] = state
          if (node._["s"]) {
            const sigs = node._["s"]
            if (sigs[state]) {
              graph[soul]!._["s"]![state] = now[soul]!._["s"]![state] = sigs[state]
            } else if (sigs[key]) {
              graph[soul]!._["s"]![key] = now[soul]!._["s"]![key] = sigs[key]
            }
          }

          if (listen[soul]) {
            listen[soul]!
              .filter(l => utils.match(l["."], key))
              .forEach(l => listeners.push(l.cb as () => void))
          }
          updated = true
        }
      }
    }

    if (updated && listen[soul]) {
      listen[soul]!
        .filter(l => utils.match(l["."]))
        .forEach(l => listeners.push(l.cb as () => void))
    }
  }

  const souls = Object.keys(graph)
  if (souls.length > MAX_GRAPH_SIZE) {
    const soulsByAge = souls
      .map(soul => {
        const states = graph[soul]!._ && graph[soul]!._[">"]
        const maxState = states ? Math.max(...Object.values(states)) : 0
        return { soul, maxState }
      })
      .sort((a, b) => a.maxState - b.maxState)
    const remove = soulsByAge.slice(0, souls.length - MAX_GRAPH_SIZE)
    remove.forEach(({ soul }) => delete graph[soul])
  }

  return { now, defer, wait, listeners }
}

export default Ham


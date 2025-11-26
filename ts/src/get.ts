/**
 * Get - Query data from the graph
 * Extracts nodes and properties based on lex queries
 */

import { match, userPublicKey } from "./utils.js"
import type { Lex, Graph } from "./schemas.js"
import type { GraphNode } from "./schemas.js"

/**
 * Get data from graph based on lex query
 * @param lex - Query specification with soul and optional property filter
 * @param graph - In-memory graph
 * @param fast - If true, return current data; if false, return undefined to trigger store lookup
 */
const Get = (lex: Lex, graph: Graph, fast?: boolean): Graph | undefined => {
  if (!lex || typeof lex !== "object") {
    throw new TypeError("lex must be an object")
  }
  if (!graph || typeof graph !== "object") {
    throw new TypeError("graph must be an object")
  }

  const soul = lex["#"]
  if (!soul || typeof soul !== "string") {
    throw new TypeError("soul must be a string")
  }

  if (!graph[soul]) return undefined

  const stateVector: Record<string, number> = {}
  const node: GraphNode = { _: { "#": soul, ">": stateVector } }
  const signatures: Record<string, string> = {}

  if (typeof lex["."] === "string") {
    const key = lex["."]
    if (typeof graph[soul]![key] === "undefined") return undefined

    node[key] = graph[soul]![key]
    node._[">"][key] = graph[soul]!._[">"][key]!
    const state = graph[soul]!._[">"][key]!
    if (graph[soul]!._["s"]) {
      const sigs = graph[soul]!._["s"]!
      if (sigs[state]) {
        signatures[state.toString()] = sigs[state]!
      } else if (sigs[key]) {
        signatures[key] = sigs[key]!
      }
    }

    // Always include userPublicKey for verification, regardless of filter
    if (userPublicKey && typeof graph[soul]![userPublicKey] !== "undefined") {
      node[userPublicKey] = graph[soul]![userPublicKey]
      node._[">"][userPublicKey] = graph[soul]!._[">"][userPublicKey]!
      const pkState = graph[soul]!._[">"][userPublicKey]!
      if (graph[soul]!._["s"]) {
        const sigs = graph[soul]!._["s"]!
        if (sigs[pkState]) {
          signatures[pkState.toString()] = sigs[pkState]!
        } else if (sigs[userPublicKey]) {
          signatures[userPublicKey] = sigs[userPublicKey]!
        }
      }
    }
  } else {
    // For fast requests, return properties currently in the graph. Otherwise
    // return undefined to ensure we get all matching properties from store.
    if (!fast) return undefined

    for (const key of Object.keys(graph[soul]!)) {
      // Always include userPublicKey for verification, regardless of filter
      if (key === userPublicKey || match(lex["."], key)) {
        node[key] = graph[soul]![key]!
        node._[">"][key] = graph[soul]!._[">"][key]!
        const state = graph[soul]!._[">"][key]!
        if (graph[soul]!._["s"]) {
          const sigs = graph[soul]!._["s"]!
          if (sigs[state]) {
            signatures[state.toString()] = sigs[state]!
          } else if (sigs[key]) {
            signatures[key] = sigs[key]!
          }
        }
      }
    }
  }

  if (Object.keys(signatures).length > 0) {
    node._["s"] = signatures
  }
  return { [soul]: node }
}

export default Get


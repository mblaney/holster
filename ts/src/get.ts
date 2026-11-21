/**
 * Get - Query data from the graph
 * Extracts nodes and properties based on lex queries
 */

import {match, obj, userPublicKey} from "./utils.ts"
import type {Lex, Graph} from "./schemas.ts"
import type {GraphNode} from "./schemas.ts"

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

  if (!obj.own(graph, soul)) return undefined

  const current = graph[soul]!
  const stateVector: Record<string, number> = {}
  const node: GraphNode = {_: {"#": soul, ">": stateVector}}
  const signatures: Record<string, string> = {}
  // Copies a property with its state and signature (see SEA.signProperties).
  const copy = (key: string): void => {
    node[key] = current[key]!
    stateVector[key] = current._[">"][key]!
    const sig = obj.own(current._.s, key)
    if (sig) signatures[key] = sig
  }

  if (typeof lex["."] === "string") {
    const key = lex["."]
    if (typeof obj.own(current, key) === "undefined") return undefined

    copy(key)
    // Always include userPublicKey for verification, regardless of filter
    if (typeof obj.own(current, userPublicKey) !== "undefined") {
      copy(userPublicKey)
    }
  } else {
    // For fast requests, return properties currently in the graph. Otherwise
    // return undefined to ensure we get all matching properties from store.
    if (!fast) return undefined

    let found = false
    for (const key of Object.keys(current)) {
      // Always include userPublicKey for verification, regardless of filter
      if (key !== "_" && (key === userPublicKey || match(lex["."], key))) {
        copy(key)
        found = true
      }
    }
    if (!found) return undefined
  }

  if (Object.keys(signatures).length > 0) node._.s = signatures
  return {[soul]: node}
}

export default Get

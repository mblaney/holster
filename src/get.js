import {match, obj, userPublicKey} from "./utils.js"

const Get = (lex, graph, fast) => {
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

  if (!obj.own(graph, soul)) return

  const node = {_: {"#": soul, ">": {}}}
  const signatures = {}
  // Copies a property with its state and signature (see SEA.signProperties).
  const copy = key => {
    node[key] = graph[soul][key]
    node._[">"][key] = graph[soul]._[">"][key]
    const sig = obj.own(graph[soul]._.s, key)
    if (sig) signatures[key] = sig
  }

  if (typeof lex["."] === "string") {
    const key = lex["."]
    if (typeof obj.own(graph[soul], key) === "undefined") return

    copy(key)
    // Always include userPublicKey for verification, regardless of filter
    if (typeof obj.own(graph[soul], userPublicKey) !== "undefined") {
      copy(userPublicKey)
    }
  } else {
    // For fast requests, return properties currently in the graph. Otherwise
    // return undefined to ensure we get all matching properties from store.
    if (!fast) return

    let found = false
    for (const key of Object.keys(graph[soul])) {
      // Always include userPublicKey for verification, regardless of filter
      if (key !== "_" && (key === userPublicKey || match(lex["."], key))) {
        copy(key)
        found = true
      }
    }
    if (!found) return
  }
  if (Object.keys(signatures).length > 0) node._.s = signatures
  return {[soul]: node}
}

export default Get

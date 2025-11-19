import {match, userPublicKey} from "./utils.js"

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

  if (!graph[soul]) return

  const node = {_: {"#": soul, ">": {}}}
  let signatures = {}

  if (typeof lex["."] === "string") {
    const key = lex["."]
    if (typeof graph[soul][key] === "undefined") return

    node[key] = graph[soul][key]
    node._[">"][key] = graph[soul]._[">"][key]
    const state = graph[soul]._[">"][key]
    if (graph[soul]._["s"]) {
      if (graph[soul]._["s"][state]) {
        signatures[state] = graph[soul]._["s"][state]
      } else if (graph[soul]._["s"][key]) {
        signatures[key] = graph[soul]._["s"][key]
      }
    }

    // Always include userPublicKey for verification, regardless of filter
    if (userPublicKey && typeof graph[soul][userPublicKey] !== "undefined") {
      node[userPublicKey] = graph[soul][userPublicKey]
      node._[">"][userPublicKey] = graph[soul]._[">"][userPublicKey]
      const pkState = graph[soul]._[">"][userPublicKey]
      if (graph[soul]._["s"]) {
        if (graph[soul]._["s"][pkState]) {
          signatures[pkState] = graph[soul]._["s"][pkState]
        } else if (graph[soul]._["s"][userPublicKey]) {
          signatures[userPublicKey] = graph[soul]._["s"][userPublicKey]
        }
      }
    }
  } else {
    // For fast requests, return properties currently in the graph. Otherwise
    // return undefined to ensure we get all matching properties from store.
    if (!fast) return

    for (const key of Object.keys(graph[soul])) {
      // Always include userPublicKey for verification, regardless of filter
      if (key === userPublicKey || match(lex["."], key)) {
        node[key] = graph[soul][key]
        node._[">"][key] = graph[soul]._[">"][key]
        const state = graph[soul]._[">"][key]
        if (graph[soul]._["s"]) {
          if (graph[soul]._["s"][state]) {
            signatures[state] = graph[soul]._["s"][state]
          } else if (graph[soul]._["s"][key]) {
            signatures[key] = graph[soul]._["s"][key]
          }
        }
      }
    }
  }
  if (Object.keys(signatures).length > 0) {
    node._["s"] = signatures
  }
  return {[soul]: node}
}

export default Get

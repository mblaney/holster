import {match} from "./utils.js"

const Get = (lex, graph) => {
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
  } else {
    for (const key of Object.keys(graph[soul])) {
      if (match(lex["."], key)) {
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

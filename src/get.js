import {match} from "./utils.js"

const Get = (lex, graph) => {
  const soul = lex["#"]
  if (!graph[soul]) return

  const node = {_: {"#": soul, ">": {}}}

  if (typeof lex["."] === "string") {
    const key = lex["."]
    if (typeof graph[soul][key] === "undefined") return

    node[key] = graph[soul][key]
    node._[">"][key] = graph[soul]._[">"][key]
  } else {
    for (const key of Object.keys(graph[soul])) {
      if (match(lex["."], key)) {
        node[key] = graph[soul][key]
        node._[">"][key] = graph[soul]._[">"][key]
      }
    }
  }
  return {[soul]: node}
}

export default Get

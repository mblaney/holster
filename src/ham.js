import * as utils from "./utils.js"
import SEA from "./sea.js"

// state and value are the incoming changes.
// currentState and currentValue are the current graph data.
const Ham = (state, currentState, value, currentValue) => {
  if (state < currentState) return {historical: true}

  if (state > currentState) return {incoming: true}

  // state is equal to currentState, lexically compare to resolve conflict.
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
  var machine = Date.now()
  var now = {}
  var defer = {}
  let wait = 0

  for (const soul of Object.keys(change)) {
    const node = change[soul]
    let updated = false
    let alias = false
    let nodeWait = 0
    let pub = ""
    let verify = secure

    if (!node || !node._) continue

    // If a signature and public key are provided then always verify.
    if (node._.s && node._.p) verify = true

    // Special case if soul starts with "~". Node must be system data ie,
    // ~@alias or ~publickey. For aliases, key and value must be a self
    // identifying rel. For public keys, data needs to be signed and verified.
    // (This is also true for any data when the secure flag is used.)
    if (soul.length > 1 && soul[0] === "~") {
      if (soul[1] === "@") {
        alias = true
        verify = false
      } else {
        if (node._.p && soul != "~" + node._.p) {
          console.log(`error public key does not match for soul: ${soul}`)
          continue
        }

        // Need to be able to create public key data before a user is
        // authenticated, in this case the soul is the public key which
        // should've been used to sign the data.
        node._.p = soul.slice(1)
        verify = true
      }
    }
    if (verify) {
      if (!node._.s || !node._.p) {
        console.log("error signature and public key required to verify data")
        continue
      }

      if (!(await SEA.verify({m: node, s: node._.s}, {pub: node._.p}))) {
        console.log(`error could not verify soul: ${soul}`)
        continue
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "_") continue

      const value = node[key]
      const state = node._[">"][key]
      const currentValue = (graph[soul] || {})[key]
      const currentState = (graph[soul] || {_: {">": {}}})._[">"][key] || 0

      if (alias && key !== utils.rel.is(value)) continue

      // Defer the update if ahead of machine time.
      const skew = state - machine
      if (skew > 0) {
        // Ignore update if ahead by more than 24 hours.
        if (skew > 86400000) continue

        // Wait the shortest difference before trying the updates again.
        if (wait === 0 || skew < wait) wait = nodeWait = skew
        if (!defer[soul]) {
          defer[soul] = {_: {"#": soul, ">": {}, s: node._.s, p: node._.p}}
        }
        defer[soul][key] = value
        defer[soul]._[">"][key] = state
      } else {
        const result = Ham(state, currentState, value, currentValue)
        if (result.incoming) {
          if (!now[soul]) {
            now[soul] = {_: {"#": soul, ">": {}, s: node._.s, p: node._.p}}
          }
          // TODO: graph should not just grow indefintitely in memory.
          // Need to have a max size after which start dropping the oldest state
          // Do something similar to Dup which can handle deletes?
          if (!graph[soul]) {
            graph[soul] = {_: {"#": soul, ">": {}, s: node._.s, p: node._.p}}
          }
          graph[soul][key] = now[soul][key] = value
          graph[soul]._[">"][key] = now[soul]._[">"][key] = state
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
            }, 100)
          }
          updated = true
        }
      }
    }

    if (verify && nodeWait !== 0 && now[soul]) {
      // Secure updates can't be split, so move now to deferred as well.
      Object.assign(defer[soul], now[soul])
      delete now[soul]
    }
    // Call event listeners for update on soul.
    if (updated && listen[soul]) {
      setTimeout(() => {
        if (listen[soul]) {
          listen[soul].filter(l => utils.match(l["."])).forEach(l => l.cb())
        }
      }, 100)
    }
  }
  return {now: now, defer: defer, wait: wait}
}

export default Ham

// state and value are the incoming changes.
// currentState and currentValue are the current graph data.
const Ham = (state, currentState, value, currentValue) => {
  if (state < currentState) {
    return {historical: true}
  }

  if (state > currentState) {
    return {incoming: true}
  }

  // state is equal to currentState, lexically compare to resolve conflict.
  value = JSON.stringify(value) || ""
  currentValue = JSON.stringify(currentValue) || ""
  // No update required.
  if (value === currentValue) {
    return {state: true}
  }

  // Keep the current value.
  if (value < currentValue) {
    return {current: true}
  }

  // Otherwise update using the incoming value.
  return {incoming: true}
}

Ham.mix = (change, graph) => {
  var machine = Date.now()
  var update = {}
  var defer = {}
  let wait = 0

  Object.keys(change).forEach(soul => {
    const node = change[soul]
    Object.keys(node).forEach(key => {
      if (key === "_") return

      const value = node[key]
      const state = node._[">"][key]
      const currentValue = (graph[soul] || {})[key]
      const currentState = (graph[soul] || {_: {">": {}}})._[">"][key] || 0

      // Defer the update if ahead of machine time.
      const skew = state - machine
      if (skew > 0) {
        // Ignore update if ahead by more than 24 hours.
        if (skew > 86400000) return

        // Wait the shortest difference before trying the updates again.
        if (wait === 0 || skew < wait) wait = skew
        if (!defer[soul]) defer[soul] = {_: {"#": soul, ">": {}}}
        defer[soul][key] = value
        defer[soul]._[">"][key] = state
      } else {
        const result = Ham(state, currentState, value, currentValue)
        if (result.incoming) {
          if (!update[soul]) update[soul] = {_: {"#": soul, ">": {}}}
          // TODO: graph should not just grow indefintitely in memory.
          // Need to have a max size after which start dropping the oldest state
          // Do something similar to Dup which can handle deletes?
          if (!graph[soul]) graph[soul] = {_: {"#": soul, ">": {}}}
          graph[soul][key] = update[soul][key] = value
          graph[soul]._[">"][key] = update[soul]._[">"][key] = state
        }
      }
    })
  })
  return {now: update, defer: defer, wait: wait}
}

module.exports = Ham

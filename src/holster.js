const utils = require("./utils")
const Wire = require("./wire")

const Holster = opt => {
  const wire = Wire(opt)

  const ok = data => {
    return (
      data === null ||
      data === true ||
      data === false ||
      typeof data === "string" ||
      utils.rel.is(data) ||
      utils.num.is(data)
    )
  }

  // check returns true if data is ok to add to a graph, an error string if
  // the data can't be converted, and the keys on the data object otherwise.
  const check = data => {
    if (ok(data)) return true

    if (utils.obj.is(data)) {
      const keys = []
      for (const [key, value] of Object.entries(data)) {
        if (key === "_") {
          return "error underscore cannot be used as an item name"
        }
        if (utils.obj.is(value) || ok(value)) {
          keys.push(key)
          continue
        }
        return `error {${key}:${value}} cannot be converted to graph`
      }
      if (keys.length !== 0) return keys
    }
    return `error ${data} cannot be converted to a graph`
  }

  // graph converts objects to graph format with updated states.
  const graph = (soul, data, g) => {
    if (!g) g = {[soul]: {_: {"#": soul, ">": {}}}}
    else g[soul] = {_: {"#": soul, ">": {}}}

    for (const [key, value] of Object.entries(data)) {
      g[soul][key] = value
      g[soul]._[">"][key] = Date.now()
    }
    return g
  }

  const api = ctx => {
    api.ctx = ctx

    const resolve = (request, cb) => {
      const get = typeof request.get !== "undefined"
      for (let i = 1; i < api.ctx.length; i++) {
        if (api.ctx[i].soul !== null) continue

        // The current soul in the context chain is null, need the previous
        // context (ie the parent node) to find a soul relation for it.
        const {item, soul} = api.ctx[i - 1]
        wire.get({"#": soul, ".": item}, msg => {
          if (msg.err) {
            console.log(`error getting ${item} on ${soul}: ${msg.err}`)
            cb(null)
            return
          }

          // An earlier callback has already completed the request.
          if (api.ctx.length === 0) return

          const node = msg.put && msg.put[soul]
          if (node && node[item] !== "undefined") {
            let id = utils.rel.is(node[item])
            if (id) {
              api.ctx[i].soul = id
              // Call api again using the updated context.
              if (get) api(api.ctx).get(null, request.get, cb)
              else api(api.ctx).put(request.put, cb)
            } else if (get) {
              // Request was not for a node, return a property on the current
              // soul.
              cb(node[item])
            } else {
              // Request was a chained get before put, so rel don't exist yet.
              id = utils.text.random()
              const rel = {[item]: utils.rel.ify(id)}
              wire.put(graph(soul, rel), err => {
                if (err) {
                  ack(`error putting ${item} on ${soul}: ${err}`)
                  return
                }

                api.ctx[i].soul = id
                api(api.ctx).put(request.put, cb)
              })
            }
          } else {
            console.log(`error ${item} not found on ${soul}`)
            cb(null)
          }
        })
        // Callback has been passed to next soul lookup or called above, so
        // return false as the calling code should not continue.
        return false
      }

      if (get && api.ctx[api.ctx.length - 1].item !== null) {
        // The context has been resolved, but it does not include the node
        // requested in a get request, this requires one more lookup.
        api.ctx.push({item: null, soul: null})
        api(api.ctx).get(null, request.get, cb)
        return false
      }

      // Return the last context, ie the soul required by the calling code.
      return api.ctx[api.ctx.length - 1]
    }

    // done makes sure the given callback is only called once.
    const done = data => {
      // context needs to be cleared in case api is used again.
      if (api.ctx) api.ctx = []
      if (api.cb) {
        // Relase api.cb before calling it so the next chain call can use it.
        const tmp = api.cb
        api.cb = null
        tmp(data)
        return
      }

      // Log errors when api.cb is not set.
      if (data) console.log(data)
    }

    return {
      get: (key, lex, cb) => {
        if (typeof lex === "function") {
          cb = lex
          lex = null
        }
        if (!api.cb) api.cb = cb
        if (key === "" || key === "_") {
          done(null)
          return api(api.ctx)
        }

        if (api.ctx && api.ctx.length !== 0) {
          // Push the key to the context as it needs a soul lookup.
          // (null is used by resolve to call the api with the updated context)
          if (key !== null) api.ctx.push({item: key, soul: null})
        } else {
          if (key === null) {
            done(null)
            return api(api.ctx)
          }

          // Top level keys are added to a root node so their values don't need
          // to be objects.
          api.ctx = [{item: key, soul: "root"}]
        }
        if (!api.cb) return api(api.ctx)

        // When there's a callback need to resolve the context first.
        const {soul} = resolve({get: lex}, done)
        if (!soul) return api(api.ctx)

        wire.get(utils.obj.put(lex, "#", soul), msg => {
          if (msg.err) console.log(msg.err)
          if (msg.put && msg.put[soul]) {
            delete msg.put[soul]._
            done(msg.put[soul])
          } else {
            // No data callback.
            done(null)
          }
        })
        return api(api.ctx)
      },
      put: (data, cb) => {
        if (!api.cb) {
          if (!cb) return

          // This (and ack) allows nested objects to keep their own callbacks.
          api.cb = cb
          cb = null
        }

        const ack = err => {
          cb ? cb(err) : done(err)
        }

        if (!api.ctx || api.ctx.length === 0) {
          ack("please provide a key using get(key) before put")
          return
        }

        const result = check(data)
        if (typeof result === "string") {
          // All strings returned from check are errors, cannot continue.
          ack(result)
          return
        }

        // Resolve the current context before putting data.
        const {item, soul} = resolve({put: data}, ack)
        if (!soul) return

        if (result === true) {
          // When result is true data is a property to put on the current soul.
          // If data is null, need to check if item is a rel and also set the
          // node to null.
          if (data === null) {
            wire.get({"#": soul, ".": item}, async msg => {
              if (msg.err) {
                console.log(`error getting ${soul}: ${msg.err}`)
                return
              }

              const current = msg.put && msg.put[soul] && msg.put[soul][item]
              const id = utils.rel.is(current)
              if (id) {
                wire.get({"#": id}, async msg => {
                  if (msg.err) {
                    console.log(`error getting ${id}: ${msg.err}`)
                    return
                  }

                  if (!msg.put || !msg.put[id]) {
                    console.log(`error ${id} not found`)
                    return
                  }

                  delete msg.put[id]._
                  // null each of the properties on the node.
                  for (const key of Object.keys(msg.put[id])) {
                    api([{item: key, soul: id}]).put(null, err => {
                      if (err !== null) console.log(err)
                    })
                  }
                })
              }
            })
          }

          wire.put(graph(soul, {[item]: data}), ack)
          return
        }

        // Otherwise put the data using the keys returned in result.
        // Need to check if a rel has already been added on the current node.
        wire.get({"#": soul, ".": item}, async msg => {
          if (msg.err) {
            ack(`error getting ${soul}: ${msg.err}`)
            return
          }

          const current = msg.put && msg.put[soul] && msg.put[soul][item]
          const id = utils.rel.is(current)
          if (!id) {
            // The current rel doesn't exist, so add it first.
            const rel = {[item]: utils.rel.ify(utils.text.random())}
            wire.put(graph(soul, rel), err => {
              if (err) {
                ack(`error putting ${item} on ${soul}: ${err}`)
              } else {
                api(api.ctx).put(data, ack)
              }
            })
            return
          }

          let put = false
          const update = {}
          for (let i = 0; i < result.length; i++) {
            const key = result[i]
            const err = await new Promise(resolve => {
              if (utils.obj.is(data[key])) {
                // Use the current rel as the context for nested objects.
                api([{item: key, soul: id}]).put(data[key], resolve)
              } else {
                put = true
                // Group other properties into one update.
                update[key] = data[key]
                resolve(null)
              }
            })
            if (err) {
              ack(err)
              return
            }
          }
          if (put) wire.put(graph(id, update), ack)
          else ack()
        })
      },
      // Allow the wire spec to be used via holster.
      wire: wire,
    }
  }
  return api()
}

module.exports = Holster

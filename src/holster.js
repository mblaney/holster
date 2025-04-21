const utils = require("./utils")
const Wire = require("./wire")

const Holster = opt => {
  const wire = Wire(opt)
  // Map callbacks since the user's callback is not passed to wire.on.
  const map = new Map()
  // Allow concurrent calls to the api by storing each context.
  const allctx = new Map()

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

  const api = ctxid => {
    const get = (lex, soul, ack) => {
      wire.get(utils.obj.put(lex, "#", soul), async msg => {
        if (msg.err) console.log(msg.err)
        if (msg.put && msg.put[soul]) {
          delete msg.put[soul]._
          // Resolve any rels on the node before returning to the user.
          for (const key of Object.keys(msg.put[soul])) {
            const id = utils.rel.is(msg.put[soul][key])
            if (id) {
              const data = await new Promise(res => {
                const _ctxid = utils.text.random()
                allctx.set(_ctxid, {chain: [{item: null, soul: id}]})
                api(_ctxid).then(null, res)
              })
              msg.put[soul][key] = data
            }
          }
          ack(msg.put[soul])
        } else {
          // No data callback.
          ack(null)
        }
      })
    }

    const done = data => {
      const ctx = allctx.get(ctxid)
      if (ctx && typeof ctx.cb !== "undefined") ctx.cb(data)
      else if (data) console.log(data)
      allctx.delete(ctxid)
    }

    const resolve = (request, cb) => {
      const get = request && typeof request.get !== "undefined"
      const put = request && typeof request.put !== "undefined"
      const on = request && typeof request.on !== "undefined"
      const off = request && typeof request.off !== "undefined"

      let found = false
      const ctx = allctx.get(ctxid)
      for (var i = 1; i < ctx.chain.length; i++) {
        if (ctx.chain[i].soul !== null) continue

        found = true
        break
      }

      if (found) {
        // Found a soul that needs resolving, need the previous context
        // (ie the parent node) to find a soul relation for it.
        const {item, soul} = ctx.chain[i - 1]
        wire.get({"#": soul, ".": item}, msg => {
          if (msg.err) {
            console.log(`error getting ${item} on ${soul}: ${msg.err}`)
            if (cb) cb(null)
            return
          }

          const node = msg.put && msg.put[soul]
          if (node && typeof node[item] !== "undefined") {
            let id = utils.rel.is(node[item])
            if (id) {
              ctx.chain[i].soul = id
              // Not sure why the map needs to be set rather than just ctx?
              allctx.set(ctxid, {chain: ctx.chain, cb: ctx.cb})
              // Call api again using the updated context.
              if (get) api(ctxid).then(null, request.get, cb)
              else if (put) api(ctxid).put(request.put, cb)
              else if (on) api(ctxid).on(cb)
              else if (off) api(ctxid).off(cb)
            } else if (get) {
              // Request was not for a node, return a property on the current
              // soul.
              cb(node[item])
            } else if (put) {
              // Request was chained before put, so rel doesn't exist yet.
              id = utils.text.random()
              const rel = {[item]: utils.rel.ify(id)}
              wire.put(graph(soul, rel), err => {
                if (err) {
                  cb(`error putting ${item} on ${soul}: ${err}`)
                  return
                }

                ctx.chain[i].soul = id
                api(ctxid).put(request.put, cb)
              })
            } else if (on) {
              console.log(`error resolving on for ${item} on ${soul}`)
              cb(null)
            } else if (off) {
              console.log(`error resolving off for ${item} on ${soul}`)
              if (cb) cb(null)
            }
          } else if (put) {
            cb(`error ${item} not found on ${soul}`)
          } else {
            console.log(`error ${item} not found on ${soul}`)
            if (cb) cb(null)
          }
        })
        // Callback has been passed to next soul lookup or called above, so
        // return false as the calling code should not continue.
        return false
      }

      if (get && ctx.chain[ctx.chain.length - 1].item !== null) {
        // The context has been resolved but it does not include the requested
        // node, which requires one more lookup.
        ctx.chain.push({item: null, soul: null})
        api(ctxid).then(null, request.get, cb)
        return false
      }

      // Return the last context, ie the soul required by the calling code.
      return ctx.chain[ctx.chain.length - 1]
    }

    return {
      get: (key, lex, cb) => {
        if (typeof lex === "function") {
          cb = lex
          lex = null
        }
        if (key === null || key === "" || key === "_") {
          if (cb) cb(null)
          return
        }

        ctxid = utils.text.random()
        // Top level keys are added to a root node so their values don't need
        // to be objects.
        allctx.set(ctxid, {chain: [{item: key, soul: "root"}], cb: cb})
        if (!cb) return api(ctxid)

        // When there's a callback need to resolve the context first.
        const {soul} = resolve({get: lex}, done)
        if (soul) get(lex, soul, done)
      },
      then: (key, lex, cb) => {
        const ack = data => {
          cb ? cb(data) : done(data)
        }

        if (typeof lex === "function") {
          cb = lex
          lex = null
        }
        if (!ctxid) {
          console.log("please provide a key using get(key)")
          ack(null)
          return
        }

        const ctx = allctx.get(ctxid)
        // ctx already removed by another chained callback is ok?
        if (!ctx) return

        if (cb && typeof ctx.cb === "undefined") {
          // This (and ack) allows nested objects to set their own callbacks.
          ctx.cb = cb
          cb = null
        }

        if (key === "" || key === "_") {
          ack(null)
          return
        }

        // Push the key to the context as it needs a soul lookup.
        // (null is used to call the api with updated context)
        if (key !== null) ctx.chain.push({item: key, soul: null})
        if (!ctx.cb) return api(ctxid)

        // When there's a callback need to resolve the context first.
        const {soul} = resolve({get: lex}, ack)
        if (soul) get(lex, soul, ack)
      },
      put: (data, cb) => {
        const ack = err => {
          cb ? cb(err) : done(err)
        }

        if (!ctxid) {
          ack("please provide a key using get(key)")
          return
        }

        const ctx = allctx.get(ctxid)
        // ctx already removed by another chained callback is ok?
        if (!ctx) return

        if (!ctx.cb) {
          if (!cb) return

          // This (and ack) allows nested objects to set their own callbacks.
          ctx.cb = cb
          cb = null
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
          // Need to check if item is a rel and also set the node to null. (This
          // applies for any update from a rel to a property, not just null.)
          wire.get({"#": soul, ".": item}, async msg => {
            if (msg.err) {
              console.log(`error getting ${soul}: ${msg.err}`)
              return
            }

            const current = msg.put && msg.put[soul] && msg.put[soul][item]
            const id = utils.rel.is(current)
            if (!id) {
              // Not a rel, can just put the data.
              wire.put(graph(soul, {[item]: data}), ack)
              return
            }

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
              // null each of the properties on the node before putting data.
              for (const key of Object.keys(msg.put[id])) {
                const err = await new Promise(res => {
                  const _ctxid = utils.text.random()
                  allctx.set(_ctxid, {chain: [{item: key, soul: id}]})
                  api(_ctxid).put(null, res)
                })
                if (err) {
                  ack(err)
                  return
                }
              }
              wire.put(graph(soul, {[item]: data}), ack)
            })
          })
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
                const _ctxid = utils.text.random()
                const chain = [{item: item, soul: soul}]
                // Pass the previous context's callback on here.
                allctx.set(_ctxid, {chain: chain, cb: ctx.cb})
                api(_ctxid).put(data)
              }
            })
            return
          }

          let put = false
          const update = {}
          for (const key of result) {
            const err = await new Promise(res => {
              if (utils.obj.is(data[key])) {
                // Use the current rel as the context for nested objects.
                const _ctxid = utils.text.random()
                allctx.set(_ctxid, {chain: [{item: key, soul: id}]})
                api(_ctxid).put(data[key], res)
              } else {
                put = true
                // Group other properties into one update.
                update[key] = data[key]
                res(null)
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
      on: cb => {
        if (!cb) return

        if (!ctxid) {
          console.log("please provide a key using get(key)")
          cb(null)
          return
        }

        // Resolve the current context before adding event listener.
        const {item, soul} = resolve({on: true}, cb)
        if (!soul) return

        allctx.set(ctxid, {chain: [{item: item, soul: soul}]})
        // Map the user's callback because it can also be passed to off,
        // so need a reference to it to compare them.
        map.set(cb, () => api(ctxid).then(null, cb))
        // Check if item is a rel and add event listener for the node.
        wire.get({"#": soul, ".": item}, async msg => {
          if (msg.err) {
            console.log(`error getting ${soul}: ${msg.err}`)
            return
          }

          const current = msg.put && msg.put[soul] && msg.put[soul][item]
          const id = utils.rel.is(current)
          if (id) wire.on({"#": id}, map.get(cb))
          else wire.on({"#": soul, ".": item}, map.get(cb))
        })
      },
      off: cb => {
        if (!ctxid) {
          console.log("please provide a key using get(key)")
          if (cb) cb(null)
          return
        }

        // Resolve the current context before removing event listener.
        const {item, soul} = resolve({off: true}, cb)
        if (!soul) return

        // Check if item is a rel and remove event listener for the node.
        wire.get({"#": soul, ".": item}, async msg => {
          if (msg.err) {
            console.log(`error getting ${soul}: ${msg.err}`)
            return
          }

          const current = msg.put && msg.put[soul] && msg.put[soul][item]
          const id = utils.rel.is(current)
          if (id) wire.off({"#": id}, map.get(cb))
          else wire.off({"#": soul, ".": item}, map.get(cb))
          map.delete(cb)
          allctx.delete(ctxid)
        })
      },
      // Allow the wire spec to be used via holster.
      wire: wire,
    }
  }
  return api()
}

module.exports = Holster

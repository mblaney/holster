import * as utils from "./utils.js"
import Wire from "./wire.js"
import User from "./user.js"
import SEA from "./sea.js"
import {attachNested} from "./nested.js"

const Holster = opt => {
  if (typeof opt === "string") opt = {peers: [opt]}
  else if (opt instanceof Array) opt = {peers: opt}
  else if (!utils.obj.is(opt)) opt = {}

  const wire = Wire(opt)
  const user = User(opt, wire)
  // Map callbacks since the user's callback is not passed to wire.on.
  const map = new Map()
  // Allow concurrent calls to the api by storing each context.
  const allctx = new Map()
  // Tracks on(..., {nested: true}) subscriptions, keyed by the caller's
  // own callback (the same reference off() will be called with) - see
  // attachNested in nested.js. The actual top-level/child listeners it
  // creates use their own, separate contexts, so off() just needs to
  // call the detach function this stores to tear the whole thing down.
  const nested = new Map()
  // Serializes concurrent creation of a missing rel for the same
  // soul+item, so only the first caller creates it and the rest reuse
  // its result rather than each minting a competing soul. Map<soul,
  // Map<item, promise resolving to the soul id>>.
  const pendingRel = new Map()

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
          return "error underscore cannot be used as a property name"
        }
        if (utils.obj.is(value) || ok(value)) {
          keys.push(key)
          continue
        }
        if (typeof value === "undefined") {
          return `error undefined ${key} cannot be converted to a graph`
        }
        const error = JSON.stringify({[key]: value})
        return `error ${error} cannot be converted to a graph`
      }
      if (keys.length !== 0) return keys
    }
    const error = JSON.stringify(data)
    return `error ${error} cannot be converted to a graph`
  }

  // Reads the current data at a rel's target soul, retrying briefly since a
  // freshly created rel's target can still be mid-flight when first read.
  // Shared by a one-off get() resolving rels found on the returned node,
  // and by on()'s live retry when a watched property turns out to be a rel.
  const readRelTarget = async (id, ctxUser, _opt, retries = 0) => {
    const data = await new Promise(res => {
      const _ctxid = utils.text.random()
      allctx.set(_ctxid, {chain: [{item: null, soul: id}], user: ctxUser})
      api(_ctxid).next(
        null,
        res,
        retries === 0 ? utils.obj.put(_opt, "fast", true) : _opt,
      )
    })
    if (data !== null || retries >= 5) return data
    await new Promise(resolve => setTimeout(resolve, 50))
    return readRelTarget(id, ctxUser, _opt, retries + 1)
  }

  const api = ctxid => {
    const get = (lex, soul, ack, _opt) => {
      wire.get(
        utils.obj.put(lex, "#", soul),
        async msg => {
          if (msg.err) console.log(msg.err)
          if (msg.put && msg.put[soul]) {
            delete msg.put[soul]._
            delete msg.put[soul][utils.userPublicKey]
            delete msg.put[soul][utils.userSignature]
            // Resolve any rels on the node before returning to the user.
            await Promise.all(
              Object.keys(msg.put[soul]).map(async key => {
                const id = utils.rel.is(msg.put[soul][key])
                if (!id) return

                const ctx = allctx.get(ctxid)
                msg.put[soul][key] = await readRelTarget(
                  id,
                  ctx ? ctx.user : null,
                  _opt,
                )
              }),
            )
            ack(msg.put[soul])
          } else {
            // No data callback.
            ack(null)
          }
        },
        _opt,
      )
    }

    const graph = async (soul, data, userctx, cb) => {
      if (userctx) {
        // Sign the timestamp
        const timestamp = Date.now()
        const sig = await SEA.signTimestamp(timestamp, userctx)
        return utils.graph(soul, data, sig, userctx.pub, timestamp)
      }

      if (opt.secure) {
        if (!cb) cb = console.log
        cb(`error putting data on ${soul}: user required in secure mode`)
        return null
      }

      return utils.graph(soul, data)
    }

    // done takes a context id and returns a new callback function so that the
    // callback is not overwritten by simultaneous requests.
    const done = ctxid => {
      return data => {
        const ctx = allctx.get(ctxid)
        if (ctx && typeof ctx.cb !== "undefined") {
          // Use a timeout so that the context can be removed before data is
          // returned to the callback (allows nested get calls).
          setTimeout(() => ctx.cb(data), 1)
        } else if (data) {
          console.log("error no callback for data", data, "ctx", ctx)
        }
        // A context updated by "on" should only be removed by "off".
        if (ctx && !ctx.on) allctx.delete(ctxid)
      }
    }

    const watchForRel = (soul, item, ctx, i, request, cb, on = true) => {
      let timer = null
      const handler = () => {
        // Bail out if the context was removed by off().
        if (!allctx.has(ctxid)) {
          wire.off({"#": soul, ".": item}, handler)
          if (timer) clearTimeout(timer)
          return
        }
        wire.get(
          {"#": soul, ".": item},
          msg => {
            const node = msg.put && msg.put[soul]
            const id = utils.rel.is(node && node[item])
            if (!id) {
              // If it's a plain value (not a rel) and this is a get, deliver it.
              // node._ guards against timeout null-acks which lack metadata.
              if (!on && node && node._ && typeof node[item] !== "undefined") {
                if (timer) clearTimeout(timer)
                wire.off({"#": soul, ".": item}, handler)
                cb(node[item])
              }
              return
            }
            if (timer) clearTimeout(timer)
            wire.off({"#": soul, ".": item}, handler)
            ctx.chain[i].soul = id
            allctx.set(ctxid, {...ctx})
            if (on) {
              api(ctxid).on(request.on, cb, request._get, request._opt)
            } else {
              api(ctxid).next(null, request.get, cb, request._opt)
            }
          },
          {...request._opt, secure: !!(ctx.user || opt.secure)},
        )
      }
      wire.on({"#": soul, ".": item}, handler, false, request._opt)
      // Time out after the same total duration as the on() retry loop
      // (1+2+4+8+16 = 31s) so callers are not blocked forever if the node
      // genuinely doesn't exist.
      if (!on) {
        timer = setTimeout(() => {
          wire.off({"#": soul, ".": item}, handler)
          if (cb) cb(null)
        }, 31000)
      }
    }

    // Creates a rel for item on soul, or reuses one already being created
    // by a concurrent caller for the same soul+item (see pendingRel above).
    // Calls cb(err, id) with a ready-to-display err, already prefixed where
    // needed - callers should pass it straight through, not wrap it again.
    const createRel = (soul, item, node, user, cb) => {
      let bySoul = pendingRel.get(soul)
      const pending = bySoul && bySoul.get(item)
      if (pending) {
        pending.then(
          id => cb(null, id),
          err => cb(err),
        )
        return
      }

      const id = utils.text.random()
      node[item] = utils.rel.ify(id)
      let settle, fail
      const promise = new Promise((res, rej) => {
        settle = res
        fail = rej
      })
      promise.catch(() => {})
      if (!bySoul) {
        bySoul = new Map()
        pendingRel.set(soul, bySoul)
      }
      bySoul.set(item, promise)
      const clear = () => {
        bySoul.delete(item)
        if (bySoul.size === 0) pendingRel.delete(soul)
      }

      ;(async () => {
        // graph() itself calls cb with an already-formatted message when it
        // fails (secure mode, no user) - pass cb straight through rather
        // than wrapping, so that message isn't prefixed a second time.
        const g = await graph(soul, node, user, cb)
        if (g === null) {
          clear()
          fail(new Error("secure mode"))
          return
        }

        wire.put(g, err => {
          clear()
          if (err) {
            const message = `error putting ${item} on ${soul}: ${err}`
            fail(message)
            cb(message)
            return
          }

          settle(id)
          cb(null, id)
        })
      })()
    }

    const resolve = (request, cb) => {
      if (!request) {
        console.log("error resolve request parameter required")
        return
      }

      const get = typeof request.get !== "undefined"
      const put = typeof request.put !== "undefined"
      const on = typeof request.on !== "undefined"
      const off = typeof request.off !== "undefined"

      let found = false
      const ctx = allctx.get(ctxid)
      if (!ctx) return {item: null, soul: null}
      for (var i = 1; i < ctx.chain.length; i++) {
        if (ctx.chain[i].soul !== null) continue

        found = true
        break
      }

      if (found) {
        // Found a soul that needs resolving, need the previous context
        // (ie the parent node) to find a soul relation for it.
        const {item, soul} = ctx.chain[i - 1]
        wire.get(
          {"#": soul, ".": item},
          async msg => {
            if (msg.err) {
              console.log(`error getting ${item} on ${soul}: ${msg.err}`)
              if (cb) cb(null)
              return
            }

            let node = msg.put && msg.put[soul]
            if (node && typeof node[item] !== "undefined") {
              let id = utils.rel.is(node[item])
              if (id) {
                ctx.chain[i].soul = id
                allctx.set(ctxid, {...ctx})
                // Call api again using the updated context.
                if (get) {
                  api(ctxid).next(null, request.get, cb, request._opt)
                } else if (put) {
                  api(ctxid).put(request.put, cb)
                } else if (on) {
                  api(ctxid).on(request.on, cb, request._get, request._opt)
                } else if (off) {
                  api(ctxid).off(cb)
                }
              } else if (get) {
                // Request was not for a node, return property on current soul.
                cb(node[item])
              } else if (put) {
                // Request was chained before put, so rel doesn't exist yet.
                createRel(soul, item, node, ctx.user, (err, relId) => {
                  if (err) {
                    cb(err)
                    return
                  }

                  ctx.chain[i].soul = relId
                  api(ctxid).put(request.put, cb)
                })
              } else if (on) {
                // Item is not a rel yet — watch the parent soul for when it
                // becomes one, then retry chain resolution.
                watchForRel(soul, item, ctx, i, request, cb)
                if (request._get) cb(null)
              } else if (off) {
                // Allow stop listening to a node that doesn't exist.
                if (cb) cb(null)
              }
            } else if (put) {
              // Request was chained before put, so rel doesn't exist yet.
              createRel(soul, item, node || {}, ctx.user, (err, relId) => {
                if (err) {
                  cb(err)
                  return
                }

                ctx.chain[i].soul = relId
                api(ctxid).put(request.put, cb)
              })
            } else {
              if (on) {
                // Node doesn't exist yet — watch for it to appear.
                watchForRel(soul, item, ctx, i, request, cb)
                if (request._get) cb(null)
              } else if (get && node) {
                const sv = node._ && node._[">"]
                if (
                  sv &&
                  Object.keys(sv).length > 0 &&
                  typeof sv[item] === "undefined"
                ) {
                  // State vector has other properties but not this one — never written.
                  if (cb) cb(null)
                } else {
                  // Empty state vector or item is tracked — may arrive via push.
                  watchForRel(soul, item, ctx, i, request, cb, false)
                }
              } else {
                // Soul doesn't exist or no get — return null.
                if (cb) cb(null)
              }
            }
          },
          {...request._opt, secure: !!(ctx.user || opt.secure)},
        )
        // Callback has been passed to next soul lookup or called above, so
        // return false as the calling code should not continue.
        return false
      }

      if (get && ctx.chain[ctx.chain.length - 1].item !== null) {
        // The context has been resolved but it does not include the requested
        // node, which requires one more lookup.
        ctx.chain.push({item: null, soul: null})
        api(ctxid).next(null, request.get, cb, request._opt)
        return false
      }

      // Return the last context, ie the soul required by the calling code.
      return ctx.chain[ctx.chain.length - 1]
    }

    return {
      get: (key, lex, cb, _opt) => {
        if (typeof lex === "function") {
          _opt = cb
          cb = lex
          lex = null
        }
        if (key === null || key === "" || key === "_") {
          console.log("error please provide a key")
          if (cb) cb(null)
          return
        }

        // lex requires a callback as it's not included in the chain below.
        if (lex && typeof cb !== "function") {
          console.log("error lex requires a callback function")
          return
        }

        // Top level keys are added to a root node so their values don't need
        // to be objects.
        ctxid = utils.text.random()
        allctx.set(ctxid, {chain: [{item: String(key), soul: "root"}], cb: cb})
        if (!cb) return api(ctxid)

        const _done = done(ctxid)
        // When there's a callback need to resolve the context first.
        const {soul} = resolve({get: lex, _opt: _opt}, _done)
        if (soul) get(lex, soul, _done, _opt)
      },
      next: (key, lex, cb, _opt) => {
        // ack needs to work the same as done, pass it the context id and then
        // return a new function for the actual callback.
        const ack = ctxid => {
          return data => {
            if (cb) {
              cb(data)
            } else {
              done(ctxid)(data)
            }
          }
        }
        if (typeof lex === "function") {
          _opt = cb
          cb = lex
          lex = null
        }
        if (!ctxid) {
          console.log("error please provide a key using get(key)")
          if (cb) cb(null)
          return
        }

        const _ack = ack(ctxid)
        if (key === "" || key === "_") {
          _ack(null)
          return
        }

        // lex requires a callback as it's not included in the chain below.
        if (lex && typeof cb !== "function") {
          console.log("error lex requires a callback function")
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

        // Push the key to the context as it needs a soul lookup.
        // (null is used to call the api with updated context)
        if (key !== null) ctx.chain.push({item: String(key), soul: null})
        if (!ctx.cb) return api(ctxid)

        // When there's a callback need to resolve the context first.
        const {soul} = resolve({get: lex, _opt: _opt}, _ack)
        if (soul) get(lex, soul, _ack, _opt)
      },
      put: (data, set, cb) => {
        if (typeof set === "function") {
          cb = set
          set = false
        }
        const ack = ctxid => {
          return data => {
            if (cb) {
              cb(data)
            } else {
              done(ctxid)(data)
            }
          }
        }
        if (!ctxid) {
          if (cb) cb("error please provide a key using get(key)")
          return
        }

        const ctx = allctx.get(ctxid)
        // ctx already removed by another chained callback is ok?
        if (!ctx) return

        if (!ctx.cb && cb) {
          // This (and ack) allows nested objects to set their own callbacks.
          ctx.cb = cb
          cb = null
        }
        if (set) data = {[utils.text.random()]: data}

        const _ack = ack(ctxid)
        const result = check(data)
        if (typeof result === "string") {
          // All strings returned from check are errors, cannot continue.
          _ack(result)
          return
        }

        // Resolve the current context before putting data. (Note that set is
        // not passed to resolve because it's already been applied above.)
        const {item, soul} = resolve({put: data, _opt: {put: true}}, _ack)
        if (!soul) return

        if (result === true) {
          // When result is true data is a property to put on the current soul.
          // Need to check if item is a rel and also set the node to null. (This
          // applies for any update from a rel to a property, not just null.)
          wire.get(
            {"#": soul, ".": item},
            async msg => {
              if (msg.err) {
                _ack(`error getting ${soul}: ${msg.err}`)
                return
              }

              let node = msg.put && msg.put[soul]
              const current = node && node[item]
              const id = utils.rel.is(current)
              if (!id) {
                // Not a rel, can just put the data.
                if (!node) node = {}
                node[item] = data
                const g = await graph(soul, node, ctx.user, _ack)
                if (g === null) return

                wire.put(g, _ack)
                return
              }

              wire.get({"#": id}, async msg => {
                if (msg.err) {
                  _ack(`error getting ${id}: ${msg.err}`)
                  return
                }

                if (!msg.put || !msg.put[id]) {
                  _ack(`error ${id} not found`)
                  return
                }

                // null each of the properties on the node before putting data.
                for (const key of Object.keys(msg.put[id])) {
                  if (
                    key === "_" ||
                    key === utils.userPublicKey ||
                    key === utils.userSignature
                  ) {
                    continue
                  }

                  const err = await new Promise(res => {
                    const _ctxid = utils.text.random()
                    const chain = [{item: key, soul: id}]
                    allctx.set(_ctxid, {chain: chain, user: ctx.user})
                    api(_ctxid).put(null, res)
                  })
                  if (err) {
                    _ack(err)
                    return
                  }
                }
                if (!node) node = {}
                node[item] = data
                const g = await graph(soul, node, ctx.user, _ack)
                if (g === null) return

                wire.put(g, _ack)
              })
            },
            {secure: !!(ctx.user || opt.secure), put: true},
          )
          return
        }

        // Otherwise put the data using the keys returned in result.
        // Need to check if a rel has already been added on the current node.
        // Use attemptRead to retry if data hasn't propagated yet.
        const attemptRead = (retries = 0) => {
          wire.get(
            {"#": soul, ".": item},
            async msg => {
              if (msg.err) {
                _ack(`error getting ${soul}.${item}: ${msg.err}`)
                return
              }

              let node = msg.put && msg.put[soul]
              const current = node && node[item]

              // If we didn't find the item but still have retries, retry
              if (!current && retries < 5) {
                await new Promise(r => setTimeout(r, 50))
                return attemptRead(retries + 1)
              }

              const id = utils.rel.is(current)
              if (!id) {
                // The current rel doesn't exist, so add it first.
                createRel(soul, item, node || {}, ctx.user, err => {
                  if (err) {
                    _ack(err)
                    return
                  }

                  const _ctxid = utils.text.random()
                  const chain = [{item: item, soul: soul}]
                  // Pass on the previous ctx's callback and user flag here.
                  allctx.set(_ctxid, {
                    chain: chain,
                    user: ctx.user,
                    cb: ctx.cb,
                  })
                  api(_ctxid).put(data)
                })
                return
              }

              const update = []
              for (const key of result) {
                const err = await new Promise(res => {
                  if (utils.obj.is(data[key]) && !utils.rel.is(data[key])) {
                    // Use the current rel as the context for nested objects.
                    const _ctxid = utils.text.random()
                    const chain = [{item: key, soul: id}]
                    allctx.set(_ctxid, {chain: chain, user: ctx.user})
                    api(_ctxid).put(data[key], res)
                  } else {
                    // Group the rest of the updates for put below.
                    update.push(key)
                    res(null)
                  }
                })
                if (err) {
                  _ack(err, ctxid)
                  return
                }
              }

              if (update.length === 0) {
                _ack(null)
                return
              }

              // Only write the primitive update keys. Rels created by the
              // recursive puts above are already in the in-memory graph.
              const updateNode = {}
              update.forEach(key => {
                updateNode[key] = data[key]
              })
              const g = await graph(id, updateNode, ctx.user, _ack)
              if (g === null) return

              wire.put(g, _ack)
            },
            {secure: !!(ctx.user || opt.secure), put: true},
          )
        }
        attemptRead()
      },
      on: (lex, cb, _get, _opt) => {
        if (typeof lex === "function") {
          _opt = _get
          _get = cb
          cb = lex
          lex = null
        }
        if (typeof cb !== "function") {
          console.log("error on() requires a callback function")
          return
        }

        if (!ctxid) {
          console.log("error please provide a key using get(key)")
          cb(null)
          return
        }

        // Resolve the current context before adding event listener.
        const {item, soul} = resolve({on: lex, _get: _get, _opt: _opt}, cb)
        if (!soul) return

        // Get the context to check if it has user info
        const ctx = allctx.get(ctxid)

        if (_opt && _opt.nested) {
          // attachNested calls this once for the top level and again for
          // every discovered child, each needing its own independent
          // context - a single shared _ctxid would accumulate .next()
          // calls onto the same path instead of giving sibling paths.
          const factory = () => {
            const _ctxid = utils.text.random()
            allctx.set(_ctxid, {
              chain: [{item: item, soul: soul}],
              user: ctx ? ctx.user : null,
            })
            return api(_ctxid)
          }
          nested.set(cb, attachNested(factory, cb, _get, _opt))
          return
        }

        // Flag that this context is set from on and shouldn't be removed.
        allctx.set(ctxid, {
          chain: [{item: item, soul: soul}],
          on: true,
          user: ctx ? ctx.user : null,
        })
        // Map the user's callback because it can also be passed to off,
        // so need a reference to it to compare them.
        // Shared retry state for this on() subscription.
        const maxRetries = 5
        const retryDelay = 1000 // Start with 1 second
        let retryTimer = null
        // Which soul the persistent wire listener is currently attached to
        // - starts on the parent (soul/item), and moves to a rel's target
        // soul once item turns out to be one, since further updates land
        // on the target's own soul, not the parent's. Tracked (rather than
        // switching unconditionally) so the two places that can discover a
        // rel - the initial check below and a later resolveValue retry -
        // don't both re-register the same listener. Scoped to this one
        // on() call's closure, so concurrent subscriptions (even on the
        // same key) each track their own independently.
        let listenedSoul = soul

        map.set(cb, () => {
          // Bail out if off() has already cleaned up this context — the mapped
          // callback can fire twice (once from wire.on and once from the _get
          // immediate-read path) and the second call after async context
          // cleanup would crash in resolve(). Matches the guard in watchForRel.
          if (!allctx.has(ctxid)) return
          // Cancel any pending retry — the persistent listener firing means we
          // have an update and should not call cb twice.
          clearTimeout(retryTimer)
          retryTimer = null

          // Resolves {soul, item} to a genuine value, following a rel to its
          // target if the property turns out to be one - checked fresh on
          // every attempt, not just the first, since a property can still
          // be a plain undefined/null on an early check and only become a
          // rel once a later retry catches up (e.g. a nested rel-creating
          // put both adds "item" as a rel on this node AND populates its
          // target, and either half can still be mid-flight when the
          // listener first fires). wire.get() can't reliably tell
          // "genuinely null" apart from "hasn't landed yet" either - its
          // own internal timeout fallback explicitly answers null when
          // nothing comes back in time - so a null/missing value is
          // retried a few times before being trusted as final, the same
          // way the rel branch below already retries on a null target
          // read.
          const resolveValue = (retries, node, value) => {
            const id = utils.rel.is(value)
            if (id) {
              if (listenedSoul !== id) {
                wire.off({"#": listenedSoul}, map.get(cb))
                wire.on({"#": id, ".": null}, map.get(cb), false, _opt)
                listenedSoul = id
              }
              readRelTarget(id, ctx ? ctx.user : null, _opt).then(data => {
                retryTimer = null
                cb(data)
              })
              return
            }

            if (value !== undefined && value !== null) {
              retryTimer = null
              cb(value)
              return
            }
            if (retries >= maxRetries) {
              retryTimer = null
              cb(value !== undefined ? value : null)
              return
            }
            // Fast once the parent node already exists (a value is likely
            // imminent); slow/exponential when it doesn't, since there's
            // no signal anything is coming soon and fast polling would
            // just waste requests.
            const delay = node
              ? 50
              : Math.min(retryDelay * Math.pow(2, retries), 30000)
            retryTimer = setTimeout(() => {
              wire.get(
                {"#": soul, ".": item},
                msg => {
                  const retryNode = msg.put && msg.put[soul]
                  resolveValue(
                    retries + 1,
                    retryNode,
                    retryNode && retryNode[item],
                  )
                },
                {..._opt, secure: !!(ctx.user || opt.secure)},
              )
            }, delay)
          }

          // When listener fires, re-check the item's current state.
          wire.get(
            {"#": soul, ".": item},
            msg => {
              const node = msg.put && msg.put[soul]
              resolveValue(0, node, node && node[item])
            },
            {..._opt, secure: !!(ctx.user || opt.secure)},
          )
        })

        // Register listener immediately to avoid missing updates due to
        // queueing. Initially register the soul without _get, then update if
        // it's a rel.
        let initialLex
        if (lex) {
          initialLex = utils.obj.put(lex, "#", soul)
          // Normalize numeric property filters to strings for wire operations
          // Only convert if it's a number, not if it's a complex filter object
          if (initialLex["."] != null && typeof initialLex["."] === "number") {
            initialLex = {...initialLex, ".": String(initialLex["."])}
          }
        } else {
          initialLex = {"#": soul, ".": item}
        }
        wire.on(initialLex, map.get(cb), false, _opt)

        // Check if item is a rel and update listener if needed.
        // This happens async but the listener is already registered above.
        wire.get(
          {"#": soul, ".": item},
          msg => {
            if (msg.err) {
              console.log(`error getting ${soul}.${item}: ${msg.err}`)
              return
            }

            const current = msg.put && msg.put[soul] && msg.put[soul][item]
            const id = utils.rel.is(current)
            if (id) {
              // It's a rel, need to switch listener to the related node -
              // unless resolveValue (triggered by the initial listener
              // firing) already beat this check to it.
              if (listenedSoul !== id) {
                wire.off({"#": listenedSoul}, map.get(cb))
                wire.on({"#": id, ".": null}, map.get(cb), false, _opt)
                listenedSoul = id
              }
              if (_get) map.get(cb)()
            } else if (_get) {
              // Not a rel, but _get was requested, so trigger callback.
              map.get(cb)()
            }
          },
          {..._opt, secure: !!(ctx.user || opt.secure)},
        )
      },
      off: cb => {
        if (!ctxid) {
          console.log("error please provide a key using get(key)")
          if (cb) cb(null)
          return
        }

        if (nested.has(cb)) {
          nested.get(cb)()
          nested.delete(cb)
          return
        }

        // Resolve the current context before removing event listener.
        const {item, soul} = resolve({off: true}, cb)
        if (!soul) return

        // Remove listener immediately from the original soul to avoid a race
        // condition. The listener may be on a related soul if item is a rel,
        // but we remove from the original soul first since that's where it's
        //initially registered.
        wire.off({"#": soul}, map.get(cb))

        // Check if item is a rel and remove from the related node as well.
        wire.get({"#": soul, ".": item}, msg => {
          if (msg.err) {
            // Even if get fails, we've already removed from original soul
            map.delete(cb)
            allctx.delete(ctxid)
            return
          }

          const current = msg.put && msg.put[soul] && msg.put[soul][item]
          const id = utils.rel.is(current)
          if (id) wire.off({"#": id}, map.get(cb))
          map.delete(cb)
          allctx.delete(ctxid)
        })
      },
      user: () => {
        if (!user.get) {
          // Return the combined Holster and User APIs.
          Object.assign(user, api())
          // Need to provide a user specific get() function to know if user
          // context should be checked.
          user.get = (keys, lex, cb, _opt) => {
            if (typeof lex === "function") {
              _opt = cb
              cb = lex
              lex = null
            }

            let pub = null
            let key = null
            if (user.is) pub = user.is.pub
            if (typeof keys === "string") {
              key = keys
            } else if (keys instanceof Array) {
              if (keys.length === 2) {
                pub = keys[0]
                key = keys[1]
              } else if (keys.length === 1) {
                key = keys[0]
              }
            }
            if (!pub) {
              console.log("error please log in or provide a public key")
              if (cb) cb(null)
              return
            }

            if (key === null || key === "" || key === "_") {
              console.log("error please provide a key")
              if (cb) cb(null)
              return
            }

            // lex requires a callback as it's not included in the chain below.
            if (lex && !cb) {
              console.log("error lex requires a callback function")
              return
            }

            ctxid = utils.text.random()
            const chain = [{item: String(key), soul: "~" + pub}]
            allctx.set(ctxid, {chain: chain, user: user.is, cb: cb})
            if (!cb) return api(ctxid)

            // When there's a callback need to resolve the context first.
            const _done = done(ctxid)
            const {soul} = resolve({get: lex, _opt: _opt}, _done)
            if (soul) get(lex, soul, _done, _opt)
          }
        }
        return user
      },
      // Allow the wire spec to be used via holster.
      wire: wire,
      // Allow SEA functions to be used via holster.
      SEA: SEA,
    }
  }
  return api()
}

export default Holster

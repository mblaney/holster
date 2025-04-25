/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./node_modules/browser-or-node/dist/index.js":
/*!****************************************************!*\
  !*** ./node_modules/browser-or-node/dist/index.js ***!
  \****************************************************/
/***/ ((module) => {

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  isBrowser: () => isBrowser,
  isBun: () => isBun,
  isDeno: () => isDeno,
  isJsDom: () => isJsDom,
  isNode: () => isNode,
  isWebWorker: () => isWebWorker
});
module.exports = __toCommonJS(src_exports);
var isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
var isNode = (
  // @ts-expect-error
  typeof process !== "undefined" && // @ts-expect-error
  process.versions != null && // @ts-expect-error
  process.versions.node != null
);
var isWebWorker = typeof self === "object" && self.constructor && self.constructor.name === "DedicatedWorkerGlobalScope";
var isJsDom = typeof window !== "undefined" && window.name === "nodejs" || typeof navigator !== "undefined" && "userAgent" in navigator && typeof navigator.userAgent === "string" && (navigator.userAgent.includes("Node.js") || navigator.userAgent.includes("jsdom"));
var isDeno = (
  // @ts-expect-error
  typeof Deno !== "undefined" && // @ts-expect-error
  typeof Deno.version !== "undefined" && // @ts-expect-error
  typeof Deno.version.deno !== "undefined"
);
var isBun = typeof process !== "undefined" && process.versions != null && process.versions.bun != null;
// Annotate the CommonJS export names for ESM import in node:
0 && (0);


/***/ }),

/***/ "./node_modules/ws/browser.js":
/*!************************************!*\
  !*** ./node_modules/ws/browser.js ***!
  \************************************/
/***/ ((module) => {

"use strict";


module.exports = function () {
  throw new Error(
    'ws does not work in the browser. Browser clients must use the native ' +
      'WebSocket object'
  );
};


/***/ }),

/***/ "./src/dup.js":
/*!********************!*\
  !*** ./src/dup.js ***!
  \********************/
/***/ ((module) => {

const Dup = maxAge => {
  // Allow maxAge to be passed in as tests wait on the setTimeout.
  if (!maxAge) maxAge = 9000
  const dup = {store: {}}
  dup.check = id => (dup.store[id] ? dup.track(id) : false)
  dup.track = id => {
    // Keep the liveliness of the message up while it is being received.
    dup.store[id] = Date.now()
    if (!dup.expiry) {
      dup.expiry = setTimeout(() => {
        const now = Date.now()
        Object.keys(dup.store).forEach(id => {
          if (now - dup.store[id] > maxAge) delete dup.store[id]
        })
        dup.expiry = null
      }, maxAge)
    }
    return id
  }
  return dup
}

module.exports = Dup


/***/ }),

/***/ "./src/get.js":
/*!********************!*\
  !*** ./src/get.js ***!
  \********************/
/***/ ((module) => {

const Get = (lex, graph) => {
  const soul = lex["#"]
  const key = lex["."]
  var node = graph[soul]

  // Can only return a node if a key is provided, because the graph may not
  // have all the keys populated for a given soul. This is because Ham.mix
  // only adds incoming changes to the graph.
  if (!node || !key) return

  let value = node[key]
  if (!value) return

  node = {_: node._, [key]: value}
  node._[">"] = {[key]: node._[">"][key]}
  return {[soul]: node}
}

module.exports = Get


/***/ }),

/***/ "./src/ham.js":
/*!********************!*\
  !*** ./src/ham.js ***!
  \********************/
/***/ ((module) => {

// ASCII character for enquiry.
const enq = String.fromCharCode(5)

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

Ham.mix = (change, graph, listen) => {
  var machine = Date.now()
  var now = {}
  var defer = {}
  let wait = 0

  Object.keys(change).forEach(soul => {
    const node = change[soul]
    let updated = false
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
          if (!now[soul]) now[soul] = {_: {"#": soul, ">": {}}}
          // TODO: graph should not just grow indefintitely in memory.
          // Need to have a max size after which start dropping the oldest state
          // Do something similar to Dup which can handle deletes?
          if (!graph[soul]) graph[soul] = {_: {"#": soul, ">": {}}}
          graph[soul][key] = now[soul][key] = value
          graph[soul]._[">"][key] = now[soul]._[">"][key] = state
          // Call event listeners for update on key, mix is called before
          // put has finished so wait for what could be multiple nested
          // updates on a node.
          setTimeout(() => {
            const id = soul + enq + key
            if (listen[id]) listen[id].forEach(cb => cb())
          }, 100)
          updated = true
        }
      }
    })
    // Call event listeners for update on soul.
    if (updated && listen[soul])
      setTimeout(() => {
        listen[soul].forEach(cb => cb())
      }, 100)
  })
  return {now: now, defer: defer, wait: wait}
}

module.exports = Ham


/***/ }),

/***/ "./src/holster.js":
/*!************************!*\
  !*** ./src/holster.js ***!
  \************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const utils = __webpack_require__(/*! ./utils */ "./src/utils.js")
const Wire = __webpack_require__(/*! ./wire */ "./src/wire.js")

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
                api(_ctxid).next(null, res)
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
      // A context updated by "on" should only be removed by "off".
      if (!ctx.on) allctx.delete(ctxid)
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
              if (get) api(ctxid).next(null, request.get, cb)
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
        api(ctxid).next(null, request.get, cb)
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
      next: (key, lex, cb) => {
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

        // Flag that this context is set from on and shouldn't be removed.
        allctx.set(ctxid, {chain: [{item: item, soul: soul}], on: true})
        // Map the user's callback because it can also be passed to off,
        // so need a reference to it to compare them.
        map.set(cb, () => api(ctxid).next(null, cb))
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


/***/ }),

/***/ "./src/radisk.js":
/*!***********************!*\
  !*** ./src/radisk.js ***!
  \***********************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const Radix = __webpack_require__(/*! ./radix */ "./src/radix.js")
const utils = __webpack_require__(/*! ./utils */ "./src/utils.js")

// ASCII character for end of text.
const etx = String.fromCharCode(3)
// ASCII character for enquiry.
const enq = String.fromCharCode(5)
// ASCII character for unit separator.
const unit = String.fromCharCode(31)

// Radisk provides access to a radix tree that is stored in the provided
// opt.store interface.
const Radisk = opt => {
  var u
  var cache = null

  if (!opt) opt = {}
  if (!opt.log) opt.log = console.log
  if (!opt.batch) opt.batch = 10 * 1000
  if (!opt.write) opt.write = 1 // Wait time before write in milliseconds.
  if (!opt.size) opt.size = 1024 * 1024 // File size on disk, default 1MB.
  if (!opt.store) {
    opt.log(
      "Radisk needs `store` interface with `{get: fn, put: fn, list: fn}`",
    )
    return
  }
  if (!opt.store.get) {
    opt.log("Radisk needs `store.get` interface with `(file, cb)`")
    return
  }
  if (!opt.store.put) {
    opt.log("Radisk needs `store.put` interface with `(file, data, cb)`")
    return
  }
  if (!opt.store.list) {
    opt.log("Radisk needs a streaming `store.list` interface with `(cb)`")
    return
  }

  // Any and all storage adapters should:
  // 1. Because writing to disk takes time, we should batch data to disk.
  //    This improves performance, and reduces potential disk corruption.
  // 2. If a batch exceeds a certain number of writes, we should immediately
  //    write to disk when physically possible. This caps total performance,
  //    but reduces potential loss.
  const radisk = (key, value, cb) => {
    key = "" + key

    // If no value is provided then the second parameter is the callback
    // function. Read value from memory or disk and call callback with it.
    if (typeof value === "function") {
      cb = value
      value = radisk.batch(key)
      if (typeof value !== "undefined") {
        return cb(u, value)
      }

      if (radisk.thrash.at) {
        value = radisk.thrash.at(key)
        if (typeof value !== "undefined") {
          return cb(u, value)
        }
      }

      return radisk.read(key, cb)
    }

    // Otherwise store the value provided.
    radisk.batch(key, value)
    if (cb) {
      radisk.batch.acks.push(cb)
    }
    // Don't wait if we have batched too many.
    if (++radisk.batch.ed >= opt.batch) {
      return radisk.thrash()
    }

    // Otherwise wait for more updates before writing.
    clearTimeout(radisk.batch.timeout)
    radisk.batch.timeout = setTimeout(radisk.thrash, opt.write)
  }

  radisk.batch = Radix()
  radisk.batch.acks = []
  radisk.batch.ed = 0

  radisk.thrash = () => {
    if (radisk.thrash.ing) {
      return (radisk.thrash.more = true)
    }

    clearTimeout(radisk.batch.timeout)
    radisk.thrash.more = false
    radisk.thrash.ing = true
    var batch = (radisk.thrash.at = radisk.batch)
    radisk.batch = null
    radisk.batch = Radix()
    radisk.batch.acks = []
    radisk.batch.ed = 0
    let i = 0
    radisk.save(batch, err => {
      // This is to ignore multiple callbacks from radisk.save calling
      // radisk.write? It looks like multiple callbacks will be made if a
      // file needs to be split.
      if (++i > 1) return

      if (err) opt.log(err)
      batch.acks.forEach(cb => cb(err))
      radisk.thrash.at = null
      radisk.thrash.ing = false
      if (radisk.thrash.more) radisk.thrash()
    })
  }

  // 1. Find the first radix item in memory
  // 2. Use that as the starting index in the directory of files
  // 3. Find the first file that is lexically larger than it
  // 4. Read the previous file into memory
  // 5. Scan through in memory radix for all values lexically less than limit
  // 6. Merge and write all of those to the in-memory file and back to disk
  // 7. If file is to large then split. More details needed here
  radisk.save = (rad, cb) => {
    const save = {
      find: (tree, key) => {
        // This is false for any key until save.start is set to an initial key.
        if (key < save.start) return

        save.start = key
        opt.store.list(save.lex)
        return true
      },
      lex: file => {
        if (!file || file > save.start) {
          save.end = file
          // ! is used as the first file name as it's the first printable
          // character, so always matches as lexically less than any node.
          save.mix(save.file || "!", save.start, save.end)
          return true
        }

        save.file = file
      },
      mix: (file, start, end) => {
        save.start = save.end = save.file = u
        radisk.parse(file, (err, disk) => {
          if (err) return cb(err)

          Radix.map(rad, (value, key) => {
            if (key < start) return

            if (end && end < key) {
              save.start = key
              return save.start
            }

            disk(key, value)
          })
          radisk.write(file, disk, save.next)
        })
      },
      next: err => {
        if (err) return cb(err)

        if (save.start) return Radix.map(rad, save.find)

        cb(err)
      },
    }
    Radix.map(rad, save.find)
  }

  radisk.write = (file, rad, cb) => {
    // Invalidate cache on write.
    cache = null
    const write = {
      text: "",
      count: 0,
      file: file,
      each: (value, key, k, pre) => {
        write.count++
        var enc =
          Radisk.encode(pre.length) +
          "#" +
          Radisk.encode(k) +
          (typeof value === "undefined" ? "" : "=" + Radisk.encode(value)) +
          "\n"
        // Cannot split the file if only have one entry to write.
        if (write.count > 1 && write.text.length + enc.length > opt.size) {
          write.text = ""
          // Otherwise split the entries in half.
          write.limit = Math.ceil(write.count / 2)
          write.count = 0
          write.sub = Radix()
          Radix.map(rad, write.slice)
          return true
        }

        write.text += enc
      },
      put: () => {
        opt.store.put(file, write.text, cb)
      },
      slice: (value, key) => {
        if (key < write.file) return

        if (++write.count > write.limit) {
          var name = write.file
          // Use only the soul of the key as the filename so that all
          // properties of a soul are written to the same file.
          let end = key.indexOf(enq)
          if (end === -1) {
            write.file = key
          } else {
            write.file = key.substring(0, end)
          }
          // write.limit can be reached after already writing properties of
          // the current node, so remove it from write.sub before writing to
          // disk so that it's not duplicated across files.
          write.sub(write.file, null)
          write.count = 0
          radisk.write(name, write.sub, write.next)
          return true
        }

        write.sub(key, value)
      },
      next: err => {
        if (err) return cb(err)

        write.sub = Radix()
        if (!Radix.map(rad, write.slice)) {
          radisk.write(write.file, write.sub, cb)
        }
      },
    }
    // If Radix.map doesn't return true when called with write.each as a
    // callback then didn't need to split the data. The accumulated write.text
    // can then be stored with write.put().
    if (!Radix.map(rad, write.each, true)) write.put()
  }

  radisk.read = (key, cb) => {
    if (cache) {
      let value = cache(key)
      if (typeof value !== "undefined") return cb(u, value)
    }
    // Only the soul of the key is compared to filenames (see radisk.write).
    let soul = key
    let end = key.indexOf(enq)
    if (end !== -1) {
      soul = key.substring(0, end)
    }

    const read = {
      lex: file => {
        // store.list should call lex without a file last, which means all file
        // names were compared to soul, so the current read.file is ok to use.
        if (!file) {
          if (!read.file) {
            cb("no file found", u)
            return
          }

          radisk.parse(read.file, read.it)
          return
        }

        // Want the filename closest to soul.
        if (file > soul || file < read.file) return

        read.file = file
      },
      it: (err, disk) => {
        if (err) opt.log(err)
        if (disk) {
          cache = disk
          read.value = disk(key)
        }
        cb(err, read.value)
      },
    }
    opt.store.list(read.lex)
  }

  // Let us start by assuming we are the only process that is
  // changing the directory or bucket. Not because we do not want
  // to be multi-process/machine, but because we want to experiment
  // with how much performance and scale we can get out of only one.
  // Then we can work on the harder problem of being multi-process.
  radisk.parse = (file, cb) => {
    const parse = {
      disk: Radix(),
      read: (err, data) => {
        if (err) return cb(err)

        if (!data) return cb(u, parse.disk)

        let pre = []
        // Work though data by splitting into 3 values. The first value says
        // if the second value is one of: the radix level for a key, the key
        // iteself, or a value. The third is the rest of the data to work with.
        let tmp = parse.split(data)
        while (tmp) {
          let key
          let value
          let i = tmp[1]
          tmp = parse.split(tmp[2]) || ""
          if (tmp[0] === "#") {
            key = tmp[1]
            pre = pre.slice(0, i)
            if (i <= pre.length) pre.push(key)
          }
          tmp = parse.split(tmp[2]) || ""
          if (tmp[0] === "\n") continue

          if (tmp[0] === "=") value = tmp[1]
          if (typeof key !== "undefined" && typeof value !== "undefined") {
            parse.disk(pre.join(""), value)
          }
          tmp = parse.split(tmp[2])
        }
        cb(u, parse.disk)
      },
      split: data => {
        if (!data) return

        let i = -1
        let a = ""
        let c = null
        while ((c = data[++i])) {
          if (c === unit) break

          a += c
        }
        let o = {}
        if (c) {
          return [a, Radisk.decode(data.slice(i), o), data.slice(i + o.i)]
        }
      },
    }
    opt.store.get(file, parse.read)
  }

  return radisk
}

Radisk.encode = data => {
  // A key should be passed in as a string to encode, a value can optionally be
  // an array of 2 items to include the value's state, as is done by store.js.
  let state = ""
  if (data instanceof Array && data.length === 2) {
    state = etx + data[1]
    data = data[0]
  }

  if (typeof data === "string") {
    let i = 0
    let current = null
    let text = unit
    while ((current = data[i++])) {
      if (current === unit) text += unit
    }
    return text + '"' + data + state + unit
  }

  const rel = utils.rel.is(data)
  if (rel) return unit + "#" + rel + state + unit

  if (utils.num.is(data)) return unit + "+" + (data || 0) + state + unit

  if (data === true) return unit + "+" + state + unit

  if (data === false) return unit + "-" + state + unit

  if (data === null) return unit + " " + state + unit
}

Radisk.decode = (data, obj) => {
  var text = ""
  var i = -1
  var n = 0
  var current = null
  var previous = null
  if (data[0] !== unit) return

  // Find a control character previous to the text we want, skipping
  // consecutive unit separator characters at the beginning of the data.
  while ((current = data[++i])) {
    if (previous) {
      if (current === unit) {
        if (--n <= 0) break
      }
      text += current
    } else if (current === unit) {
      n++
    } else {
      previous = current || true
    }
  }

  if (obj) obj.i = i + 1

  let [value, state] = text.split(etx)
  if (!state) {
    if (previous === '"') return text

    if (previous === "#") return utils.rel.ify(text)

    if (previous === "+") {
      if (text.length === 0) return true

      return parseFloat(text)
    }

    if (previous === "-") return false

    if (previous === " ") return null
  } else {
    state = parseFloat(state)
    // If state was found then return an array.
    if (previous === '"') return [value, state]

    if (previous === "#") return [utils.rel.ify(value), state]

    if (previous === "+") {
      if (value.length === 0) return [true, state]

      return [parseFloat(value), state]
    }

    if (previous === "-") return [false, state]

    if (previous === " ") return [null, state]
  }
}

module.exports = Radisk


/***/ }),

/***/ "./src/radix.js":
/*!**********************!*\
  !*** ./src/radix.js ***!
  \**********************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const utils = __webpack_require__(/*! ./utils */ "./src/utils.js")

// ASCII character for group separator.
const group = String.fromCharCode(29)
// ASCII character for record separator.
const record = String.fromCharCode(30)

const Radix = () => {
  const radix = (keys, value, tree) => {
    if (!tree) {
      if (!radix[group]) radix[group] = {}
      tree = radix[group]
    }
    if (!keys) return tree

    let i = 0
    let tmp = {}
    let key = keys[i]
    const max = keys.length - 1
    const noValue = typeof value === "undefined"
    // Find a matching value using the shortest string from keys.
    let found = tree[key]
    while (!found && i < max) {
      key += keys[++i]
      found = tree[key]
    }

    if (!found) {
      // If not found from the provided keys try matching with an existing key.
      const result = utils.obj.map(tree, (hasValue, hasKey) => {
        let j = 0
        let matchingKey = ""
        while (hasKey[j] === keys[j]) {
          matchingKey += hasKey[j++]
        }
        if (matchingKey) {
          if (noValue) {
            // matchingKey has to be as long as the original keys when reading.
            if (j <= max) return

            tmp[hasKey.slice(j)] = hasValue
            return hasValue
          }

          let replace = {
            [hasKey.slice(j)]: hasValue,
            [keys.slice(j)]: {[record]: value},
          }
          tree[matchingKey] = {[group]: replace}
          delete tree[hasKey]
          return true
        }
      })
      if (!result) {
        if (noValue) return

        if (!tree[key]) tree[key] = {}
        tree[key][record] = value
      } else if (noValue) {
        return tmp
      }
    } else if (i === max) {
      // If no value use the key provided to return a whole group or record.
      if (noValue) {
        // If an individual record isn't found then return the whole group.
        return typeof found[record] === "undefined"
          ? found[group]
          : found[record]
      }
      // Otherwise create a new record at the provided key for value.
      found[record] = value
    } else {
      // Found at a shorter key, try again.
      if (!found[group] && !noValue) found[group] = {}
      return radix(keys.slice(++i), value, found[group])
    }
  }
  return radix
}

Radix.map = function map(radix, cb, opt, pre) {
  if (!pre) pre = []
  var tree = radix[group] || radix
  var keys = Object.keys(tree).sort()
  var u

  for (let i = 0; i < keys.length; i++) {
    let key = keys[i]
    let found = tree[key]
    let tmp = found[record]
    if (typeof tmp !== "undefined") {
      tmp = cb(tmp, pre.join("") + key, key, pre)
      if (typeof tmp !== "undefined") return tmp
    } else if (opt) {
      cb(u, pre.join(""), key, pre)
    }
    if (found[group]) {
      pre.push(key)
      tmp = map(found[group], cb, opt, pre)
      if (typeof tmp !== "undefined") return tmp
      pre.pop()
    }
  }
}

module.exports = Radix


/***/ }),

/***/ "./src/store.js":
/*!**********************!*\
  !*** ./src/store.js ***!
  \**********************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const jsEnv = __webpack_require__(/*! browser-or-node */ "./node_modules/browser-or-node/dist/index.js")
const Radisk = __webpack_require__(/*! ./radisk */ "./src/radisk.js")
const Radix = __webpack_require__(/*! ./radix */ "./src/radix.js")
const utils = __webpack_require__(/*! ./utils */ "./src/utils.js")

// ASCII character for enquiry.
const enq = String.fromCharCode(5)
// ASCII character for unit separator.
const unit = String.fromCharCode(31)
// On-disk root node format.
const root = unit + "+0" + unit + "#" + unit + '"root' + unit

const fileSystem = opt => {
  const dir = opt.file

  if (jsEnv.isNode) {
    const fs = __webpack_require__(/*! fs */ "?569f")
    if (!fs.existsSync(dir)) fs.mkdirSync(dir)
    if (!fs.existsSync(dir + "/!")) fs.writeFileSync(dir + "/!", root)

    return {
      get: (file, cb) => {
        fs.readFile(dir + "/" + file, (err, data) => {
          if (err) {
            if (err.code === "ENOENT") {
              cb()
              return
            }

            console.log("fs.readFile error:", err)
          }
          if (data) data = data.toString()
          cb(err, data)
        })
      },
      put: (file, data, cb) => {
        var random = Math.random().toString(36).slice(-9)
        // Don't put tmp files under dir so that they're not listed.
        var tmp = file + "." + random + ".tmp"
        fs.writeFile(tmp, data, err => {
          if (err) {
            cb(err)
            return
          }

          fs.rename(tmp, dir + "/" + file, cb)
        })
      },
      list: cb => {
        fs.readdir(dir, (err, files) => {
          files.forEach(cb)
          cb()
        })
      },
    }
  }

  if (opt.indexedDB) {
    let db
    const o = indexedDB.open(dir, 1)
    o.onupgradeneeded = event => {
      event.target.result.createObjectStore(dir)
    }
    o.onerror = event => {
      console.log(event)
    }
    o.onsuccess = () => {
      db = o.result
      // Create the root node if it doesn't exist.
      if (db) {
        const tx = db.transaction([dir], "readonly")
        const req = tx.objectStore(dir).getKey("!")
        req.onerror = () => {
          console.log(`error getting key ${dir}/!`)
        }
        req.onsuccess = () => {
          if (!req.result) {
            const tx = db.transaction([dir], "readwrite")
            const req = tx.objectStore(dir).put(root, "!")
            req.onerror = () => {
              console.log(`error putting root on ${dir}/!`)
            }
          }
        }
      } else {
        console.log("error indexedDB not available")
      }
    }

    return {
      get: (file, cb) => {
        if (db) {
          const tx = db.transaction([dir], "readonly")
          const req = tx.objectStore(dir).get(file)
          req.onerror = () => {
            console.log(`error getting ${dir}/${file}`)
          }
          req.onsuccess = () => {
            cb(null, req.result)
          }
        } else {
          cb("error indexedDB not available")
        }
      },
      put: (file, data, cb) => {
        if (db) {
          const tx = db.transaction([dir], "readwrite")
          const req = tx.objectStore(dir).put(data, file)
          req.onerror = () => {
            console.log(`error putting data on ${dir}/${file}`)
          }
          req.onsuccess = () => {
            cb(null)
          }
        } else {
          cb("error indexedDB not available")
        }
      },
      list: cb => {
        if (db) {
          const tx = db.transaction([dir], "readonly")
          const req = tx.objectStore(dir).getAllKeys()
          req.onerror = () => console.log("error getting keys for", dir)
          req.onsuccess = () => {
            req.result.forEach(cb)
            cb()
          }
        } else {
          console.log("error indexedDB not available")
          cb()
        }
      },
    }
  }

  // No browser storage.
  return {
    get: (file, cb) => {
      cb(null, root)
    },
    put: (file, data, cb) => {
      cb(null)
    },
    list: cb => {
      cb("!")
      cb()
    },
  }
}

// Store provides get and put methods that can access radisk.
const Store = opt => {
  if (!utils.obj.is(opt)) opt = {}
  opt.file = String(opt.file || "radata")
  if (!opt.store) opt.store = fileSystem(opt)
  const radisk = Radisk(opt)

  return {
    get: (lex, cb) => {
      if (!lex) {
        cb("lex required")
        return
      }

      var soul = lex["#"]
      var key = lex["."] || ""
      var node
      const each = (value, key) => {
        if (!node) node = {_: {"#": soul, ">": {}}}
        node[key] = value[0]
        node._[">"][key] = value[1]
      }

      radisk(soul + enq + key, (err, value) => {
        let graph
        if (utils.obj.is(value)) {
          Radix.map(value, each)
          if (!node) each(value, key)
          graph = {[soul]: node}
        } else if (value) {
          each(value, key)
          graph = {[soul]: node}
        }
        cb(err, graph)
      })
    },
    put: (graph, cb) => {
      if (!graph) {
        cb("graph required")
        return
      }

      var count = 0
      const ack = err => {
        count--
        if (ack.err) return

        ack.err = err
        if (ack.err) {
          cb(ack.err)
          return
        }

        if (count === 0) cb(null)
      }

      Object.keys(graph).forEach(soul => {
        var node = graph[soul]
        Object.keys(node).forEach(key => {
          if (key === "_") return

          count++
          let value = node[key]
          let state = node._[">"][key]
          radisk(soul + enq + key, [value, state], ack)
        })
      })
    },
  }
}

module.exports = Store


/***/ }),

/***/ "./src/utils.js":
/*!**********************!*\
  !*** ./src/utils.js ***!
  \**********************/
/***/ ((module) => {

const num = {
  is: n =>
    !(n instanceof Array) &&
    (n - parseFloat(n) + 1 >= 0 || Infinity === n || -Infinity === n),
}

const obj = {
  is: o => {
    if (!o) return false

    return (
      (o instanceof Object && o.constructor === Object) ||
      Object.prototype.toString.call(o).match(/^\[object (\w+)\]$/)[1] ===
        "Object"
    )
  },
  map: (list, cb, o) => {
    var keys = Object.keys(list)
    for (let i = 0; i < keys.length; i++) {
      let result = cb(list[keys[i]], keys[i], o)
      if (typeof result !== "undefined") return result
    }
  },
  put: (o, key, value) => {
    if (!o) o = {}
    o[key] = value
    return o
  },
  del: (o, key) => {
    if (!o) return

    o[key] = null
    delete o[key]
    return o
  },
}

const map_soul = (soul, key, o) => {
  // If id is already defined AND we're still looping through the object,
  // then it is considered invalid.
  if (o.id) {
    o.id = false
    return
  }

  if (key === "#" && typeof soul === "string") {
    o.id = soul
    return
  }

  // If there exists anything else on the object that isn't the soul,
  // then it is considered invalid.
  o.id = false
}

// Check if an object is a soul relation, ie {'#': 'UUID'}
const rel = {
  is: value => {
    if (value && value["#"] && !value._ && obj.is(value)) {
      let o = {}
      obj.map(value, map_soul, o)
      if (o.id) return o.id
    }

    return false
  },
  // Convert a soul into a relation and return it.
  ify: soul => obj.put({}, "#", soul),
}

const text = {
  random: length => {
    var s = ""
    const c = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXZabcdefghijklmnopqrstuvwxyz"
    if (!length) length = 24
    for (let i = 0; i < length; i++) {
      s += c.charAt(Math.floor(Math.random() * c.length))
    }
    return s
  },
}

module.exports = {num, obj, rel, text}


/***/ }),

/***/ "./src/wire.js":
/*!*********************!*\
  !*** ./src/wire.js ***!
  \*********************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const jsEnv = __webpack_require__(/*! browser-or-node */ "./node_modules/browser-or-node/dist/index.js")
const Dup = __webpack_require__(/*! ./dup */ "./src/dup.js")
const Get = __webpack_require__(/*! ./get */ "./src/get.js")
const Ham = __webpack_require__(/*! ./ham */ "./src/ham.js")
const Store = __webpack_require__(/*! ./store */ "./src/store.js")
const utils = __webpack_require__(/*! ./utils */ "./src/utils.js")

// ASCII character for enquiry.
const enq = String.fromCharCode(5)

// Wire starts a websocket client or server and returns get and put methods
// for access to the wire spec and storage.
const Wire = opt => {
  if (!utils.obj.is(opt)) opt = {}

  const dup = Dup(opt.maxAge)
  const store = Store(opt)
  const graph = {}
  const queue = {}
  const listen = {}

  const get = (msg, send) => {
    const ack = Get(msg.get, graph)
    if (ack) {
      send(
        JSON.stringify({
          "#": dup.track(utils.text.random(9)),
          "@": msg["#"],
          put: ack,
        }),
      )
    } else {
      store.get(msg.get, (err, ack) => {
        send(
          JSON.stringify({
            "#": dup.track(utils.text.random(9)),
            "@": msg["#"],
            put: ack,
            err: err,
          }),
        )
      })
    }
  }

  const put = (msg, send) => {
    // Store updates returned from Ham.mix and defer updates if required.
    const update = Ham.mix(msg.put, graph, listen)
    store.put(update.now, err => {
      send(
        JSON.stringify({
          "#": dup.track(utils.text.random(9)),
          "@": msg["#"],
          err: err,
        }),
      )
    })
    if (update.wait !== 0) {
      setTimeout(() => put({put: update.defer}, send), update.wait)
    }
  }

  const api = send => {
    return {
      get: (lex, cb, opt) => {
        if (!cb) return

        if (!utils.obj.is(opt)) opt = {}
        const ack = Get(lex, graph)
        if (ack) {
          cb({put: ack})
          return
        }

        store.get(lex, (err, ack) => {
          if (ack) {
            cb({put: ack, err: err})
            return
          }

          if (err) console.log(err)

          const track = utils.text.random(9)
          queue[track] = cb
          send(
            JSON.stringify({
              "#": dup.track(track),
              get: lex,
            }),
          )
          // Respond to callback with null if no response.
          setTimeout(() => {
            const cb = queue[track]
            if (cb) {
              const id = lex["#"]
              const ack = {[id]: null}
              if (lex["."]) ack[id] = {[lex["."]]: null}
              cb({put: ack})
              delete queue[track]
            }
          }, opt.wait || 100)
        })
      },
      put: (data, cb) => {
        // Deferred updates are only stored using wire spec, they're ignored
        // here using the api. This is ok because correct timestamps should be
        // used whereas wire spec needs to handle clock skew.
        const update = Ham.mix(data, graph, listen)
        store.put(update.now, cb)
        // Also put data on the wire spec.
        // TODO: Note that this means all clients now receive all updates, so
        // need to filter what should be stored, both in graph and on disk.
        send(
          JSON.stringify({
            "#": dup.track(utils.text.random(9)),
            put: data,
          }),
        )
      },
      on: (lex, cb) => {
        if (!cb) return

        let id = lex["#"]
        if (!id) return

        if (lex["."]) id += enq + lex["."]
        if (listen[id]) {
          if (!listen[id].includes(cb)) listen[id].push(cb)
        } else {
          listen[id] = [cb]
        }
      },
      off: (lex, cb) => {
        let id = lex["#"]
        if (!id) return

        if (lex["."]) id += enq + lex["."]
        if (!listen[id]) return

        if (cb) {
          if (listen[id].includes(cb)) {
            listen[id].splice(listen[id].indexOf(cb), 1)
          }
        } else {
          // Remove all callbacks when none provided.
          delete listen[id]
        }
      },
    }
  }

  if (jsEnv.isNode) {
    const WebSocket = __webpack_require__(/*! ws */ "./node_modules/ws/browser.js")
    let wss = opt.wss
    // Node's websocket server provides clients as an array, whereas
    // mock-sockets provides clients as a function that returns an array.
    let clients = () => wss.clients()
    if (!wss) {
      wss = new WebSocket.Server({port: 8080})
      clients = () => wss.clients
    }

    const send = (data, isBinary) => {
      clients().forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data, {binary: isBinary})
        }
      })
    }
    wss.on("connection", ws => {
      ws.on("error", console.error)

      ws.on("message", (data, isBinary) => {
        const msg = JSON.parse(data)
        if (dup.check(msg["#"])) return

        dup.track(msg["#"])
        if (msg.get) get(msg, send)
        if (msg.put) put(msg, send)
        send(data, isBinary)

        const id = msg["@"]
        const cb = queue[id]
        if (cb) {
          delete msg["#"]
          delete msg["@"]
          cb(msg)

          delete queue[id]
        }
      })
    })
    return api(send)
  }

  let ws = new WebSocket("ws://localhost:8080")
  const send = data => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log("websocket not available")
      return
    }

    ws.send(data)
  }
  const start = () => {
    if (!ws) ws = new WebSocket("ws://localhost:8080")
    ws.onclose = c => {
      ws = null
      setTimeout(start, Math.floor(Math.random() * 5000))
    }
    ws.onerror = e => {
      console.error(e)
    }
    ws.onmessage = m => {
      const msg = JSON.parse(m.data)
      if (dup.check(msg["#"])) return

      dup.track(msg["#"])
      if (msg.get) get(msg, send)
      if (msg.put) put(msg, send)
      send(m.data)

      const id = msg["@"]
      const cb = queue[id]
      if (cb) {
        delete msg["#"]
        delete msg["@"]
        cb(msg)

        delete queue[id]
      }
    }
  }

  start()
  return api(send)
}

module.exports = Wire


/***/ }),

/***/ "?569f":
/*!********************!*\
  !*** fs (ignored) ***!
  \********************/
/***/ (() => {

/* (ignored) */

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./src/holster.js");
/******/ 	Holster = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLFdBQVc7QUFDWDtBQUNBLFNBQVM7QUFDVCxPQUFPO0FBQ1A7QUFDQTs7QUFFQTs7QUFFQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsWUFBWTtBQUNaO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTs7QUFFQTs7QUFFQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNO0FBQ047QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQSxJQUFJO0FB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NkJBQTZCLGlCQUFpQjtBQUM5QztBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0EsT0FBTztBQUNQLEtBQUs7QUFDTDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7Ozs7Ozs7Ozs7O0FDOU9BOzs7Ozs7VUNBQTtVQUNBOztVQUVBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBOztVQUVBO1VBQ0E7O1VBRUE7VUFDQTtVQUNBOzs7O1VFdEJBO1VBQ0E7VUFDQTtVQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vSG9sc3Rlci8uL25vZGVfbW9kdWxlcy9icm93c2VyLW9yLW5vZGUvZGlzdC9pbmRleC5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vbm9kZV9tb2R1bGVzL3dzL2Jyb3dzZXIuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9kdXAuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9nZXQuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9oYW0uanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9ob2xzdGVyLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvcmFkaXNrLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvcmFkaXguanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9zdG9yZS5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL3V0aWxzLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvd2lyZS5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyL2lnbm9yZWR8L2hvbWUvbWFsL3dvcmsvaG9sc3Rlci9zcmN8ZnMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly9Ib2xzdGVyL3dlYnBhY2svYmVmb3JlLXN0YXJ0dXAiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL3N0YXJ0dXAiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL2FmdGVyLXN0YXJ0dXAiXSwic291cmNlc0NvbnRlbnQiOlsidmFyIF9fZGVmUHJvcCA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbnZhciBfX2dldE93blByb3BEZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcjtcbnZhciBfX2dldE93blByb3BOYW1lcyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzO1xudmFyIF9faGFzT3duUHJvcCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG52YXIgX19leHBvcnQgPSAodGFyZ2V0LCBhbGwpID0+IHtcbiAgZm9yICh2YXIgbmFtZSBpbiBhbGwpXG4gICAgX19kZWZQcm9wKHRhcmdldCwgbmFtZSwgeyBnZXQ6IGFsbFtuYW1lXSwgZW51bWVyYWJsZTogdHJ1ZSB9KTtcbn07XG52YXIgX19jb3B5UHJvcHMgPSAodG8sIGZyb20sIGV4Y2VwdCwgZGVzYykgPT4ge1xuICBpZiAoZnJvbSAmJiB0eXBlb2YgZnJvbSA9PT0gXCJvYmplY3RcIiB8fCB0eXBlb2YgZnJvbSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgZm9yIChsZXQga2V5IG9mIF9fZ2V0T3duUHJvcE5hbWVzKGZyb20pKVxuICAgICAgaWYgKCFfX2hhc093blByb3AuY2FsbCh0bywga2V5KSAmJiBrZXkgIT09IGV4Y2VwdClcbiAgICAgICAgX19kZWZQcm9wKHRvLCBrZXksIHsgZ2V0OiAoKSA9PiBmcm9tW2tleV0sIGVudW1lcmFibGU6ICEoZGVzYyA9IF9fZ2V0T3duUHJvcERlc2MoZnJvbSwga2V5KSkgfHwgZGVzYy5lbnVtZXJhYmxlIH0pO1xuICB9XG4gIHJldHVybiB0bztcbn07XG52YXIgX190b0NvbW1vbkpTID0gKG1vZCkgPT4gX19jb3B5UHJvcHMoX19kZWZQcm9wKHt9LCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KSwgbW9kKTtcblxuLy8gc3JjL2luZGV4LnRzXG52YXIgc3JjX2V4cG9ydHMgPSB7fTtcbl9fZXhwb3J0KHNyY19leHBvcnRzLCB7XG4gIGlzQnJvd3NlcjogKCkgPT4gaXNCcm93c2VyLFxuICBpc0J1bjogKCkgPT4gaXNCdW4sXG4gIGlzRGVubzogKCkgPT4gaXNEZW5vLFxuICBpc0pzRG9tOiAoKSA9PiBpc0pzRG9tLFxuICBpc05vZGU6ICgpID0+IGlzTm9kZSxcbiAgaXNXZWJXb3JrZXI6ICgpID0+IGlzV2ViV29ya2VyXG59KTtcbm1vZHVsZS5leHBvcnRzID0gX190b0NvbW1vbkpTKHNyY19leHBvcnRzKTtcbnZhciBpc0Jyb3dzZXIgPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiB3aW5kb3cuZG9jdW1lbnQgIT09IFwidW5kZWZpbmVkXCI7XG52YXIgaXNOb2RlID0gKFxuICAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgcHJvY2Vzcy52ZXJzaW9ucyAhPSBudWxsICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgcHJvY2Vzcy52ZXJzaW9ucy5ub2RlICE9IG51bGxcbik7XG52YXIgaXNXZWJXb3JrZXIgPSB0eXBlb2Ygc2VsZiA9PT0gXCJvYmplY3RcIiAmJiBzZWxmLmNvbnN0cnVjdG9yICYmIHNlbGYuY29uc3RydWN0b3IubmFtZSA9PT0gXCJEZWRpY2F0ZWRXb3JrZXJHbG9iYWxTY29wZVwiO1xudmFyIGlzSnNEb20gPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIHdpbmRvdy5uYW1lID09PSBcIm5vZGVqc1wiIHx8IHR5cGVvZiBuYXZpZ2F0b3IgIT09IFwidW5kZWZpbmVkXCIgJiYgXCJ1c2VyQWdlbnRcIiBpbiBuYXZpZ2F0b3IgJiYgdHlwZW9mIG5hdmlnYXRvci51c2VyQWdlbnQgPT09IFwic3RyaW5nXCIgJiYgKG5hdmlnYXRvci51c2VyQWdlbnQuaW5jbHVkZXMoXCJOb2RlLmpzXCIpIHx8IG5hdmlnYXRvci51c2VyQWdlbnQuaW5jbHVkZXMoXCJqc2RvbVwiKSk7XG52YXIgaXNEZW5vID0gKFxuICAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBEZW5vICE9PSBcInVuZGVmaW5lZFwiICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgdHlwZW9mIERlbm8udmVyc2lvbiAhPT0gXCJ1bmRlZmluZWRcIiAmJiAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBEZW5vLnZlcnNpb24uZGVubyAhPT0gXCJ1bmRlZmluZWRcIlxuKTtcbnZhciBpc0J1biA9IHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIHByb2Nlc3MudmVyc2lvbnMgIT0gbnVsbCAmJiBwcm9jZXNzLnZlcnNpb25zLmJ1biAhPSBudWxsO1xuLy8gQW5ub3RhdGUgdGhlIENvbW1vbkpTIGV4cG9ydCBuYW1lcyBmb3IgRVNNIGltcG9ydCBpbiBub2RlOlxuMCAmJiAobW9kdWxlLmV4cG9ydHMgPSB7XG4gIGlzQnJvd3NlcixcbiAgaXNCdW4sXG4gIGlzRGVubyxcbiAgaXNKc0RvbSxcbiAgaXNOb2RlLFxuICBpc1dlYldvcmtlclxufSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ3dzIGRvZXMgbm90IHdvcmsgaW4gdGhlIGJyb3dzZXIuIEJyb3dzZXIgY2xpZW50cyBtdXN0IHVzZSB0aGUgbmF0aXZlICcgK1xuICAgICAgJ1dlYlNvY2tldCBvYmplY3QnXG4gICk7XG59O1xuIiwiY29uc3QgRHVwID0gbWF4QWdlID0+IHtcbiAgLy8gQWxsb3cgbWF4QWdlIHRvIGJlIHBhc3NlZCBpbiBhcyB0ZXN0cyB3YWl0IG9uIHRoZSBzZXRUaW1lb3V0LlxuICBpZiAoIW1heEFnZSkgbWF4QWdlID0gOTAwMFxuICBjb25zdCBkdXAgPSB7c3RvcmU6IHt9fVxuICBkdXAuY2hlY2sgPSBpZCA9PiAoZHVwLnN0b3JlW2lkXSA/IGR1cC50cmFjayhpZCkgOiBmYWxzZSlcbiAgZHVwLnRyYWNrID0gaWQgPT4ge1xuICAgIC8vIEtlZXAgdGhlIGxpdmVsaW5lc3Mgb2YgdGhlIG1lc3NhZ2UgdXAgd2hpbGUgaXQgaXMgYmVpbmcgcmVjZWl2ZWQuXG4gICAgZHVwLnN0b3JlW2lkXSA9IERhdGUubm93KClcbiAgICBpZiAoIWR1cC5leHBpcnkpIHtcbiAgICAgIGR1cC5leHBpcnkgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKVxuICAgICAgICBPYmplY3Qua2V5cyhkdXAuc3RvcmUpLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgIGlmIChub3cgLSBkdXAuc3RvcmVbaWRdID4gbWF4QWdlKSBkZWxldGUgZHVwLnN0b3JlW2lkXVxuICAgICAgICB9KVxuICAgICAgICBkdXAuZXhwaXJ5ID0gbnVsbFxuICAgICAgfSwgbWF4QWdlKVxuICAgIH1cbiAgICByZXR1cm4gaWRcbiAgfVxuICByZXR1cm4gZHVwXG59XG5cbm1vZHVsZS5leHBvcnRzID0gRHVwXG4iLCJjb25zdCBHZXQgPSAobGV4LCBncmFwaCkgPT4ge1xuICBjb25zdCBzb3VsID0gbGV4W1wiI1wiXVxuICBjb25zdCBrZXkgPSBsZXhbXCIuXCJdXG4gIHZhciBub2RlID0gZ3JhcGhbc291bF1cblxuICAvLyBDYW4gb25seSByZXR1cm4gYSBub2RlIGlmIGEga2V5IGlzIHByb3ZpZGVkLCBiZWNhdXNlIHRoZSBncmFwaCBtYXkgbm90XG4gIC8vIGhhdmUgYWxsIHRoZSBrZXlzIHBvcHVsYXRlZCBmb3IgYSBnaXZlbiBzb3VsLiBUaGlzIGlzIGJlY2F1c2UgSGFtLm1peFxuICAvLyBvbmx5IGFkZHMgaW5jb21pbmcgY2hhbmdlcyB0byB0aGUgZ3JhcGguXG4gIGlmICghbm9kZSB8fCAha2V5KSByZXR1cm5cblxuICBsZXQgdmFsdWUgPSBub2RlW2tleV1cbiAgaWYgKCF2YWx1ZSkgcmV0dXJuXG5cbiAgbm9kZSA9IHtfOiBub2RlLl8sIFtrZXldOiB2YWx1ZX1cbiAgbm9kZS5fW1wiPlwiXSA9IHtba2V5XTogbm9kZS5fW1wiPlwiXVtrZXldfVxuICByZXR1cm4ge1tzb3VsXTogbm9kZX1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBHZXRcbiIsIi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgZW5xdWlyeS5cbmNvbnN0IGVucSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoNSlcblxuLy8gc3RhdGUgYW5kIHZhbHVlIGFyZSB0aGUgaW5jb21pbmcgY2hhbmdlcy5cbi8vIGN1cnJlbnRTdGF0ZSBhbmQgY3VycmVudFZhbHVlIGFyZSB0aGUgY3VycmVudCBncmFwaCBkYXRhLlxuY29uc3QgSGFtID0gKHN0YXRlLCBjdXJyZW50U3RhdGUsIHZhbHVlLCBjdXJyZW50VmFsdWUpID0+IHtcbiAgaWYgKHN0YXRlIDwgY3VycmVudFN0YXRlKSByZXR1cm4ge2hpc3RvcmljYWw6IHRydWV9XG5cbiAgaWYgKHN0YXRlID4gY3VycmVudFN0YXRlKSByZXR1cm4ge2luY29taW5nOiB0cnVlfVxuXG4gIC8vIHN0YXRlIGlzIGVxdWFsIHRvIGN1cnJlbnRTdGF0ZSwgbGV4aWNhbGx5IGNvbXBhcmUgdG8gcmVzb2x2ZSBjb25mbGljdC5cbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpIHx8IFwiXCJcbiAgfVxuICBpZiAodHlwZW9mIGN1cnJlbnRWYWx1ZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIGN1cnJlbnRWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KGN1cnJlbnRWYWx1ZSkgfHwgXCJcIlxuICB9XG4gIC8vIE5vIHVwZGF0ZSByZXF1aXJlZC5cbiAgaWYgKHZhbHVlID09PSBjdXJyZW50VmFsdWUpIHJldHVybiB7c3RhdGU6IHRydWV9XG5cbiAgLy8gS2VlcCB0aGUgY3VycmVudCB2YWx1ZS5cbiAgaWYgKHZhbHVlIDwgY3VycmVudFZhbHVlKSByZXR1cm4ge2N1cnJlbnQ6IHRydWV9XG5cbiAgLy8gT3RoZXJ3aXNlIHVwZGF0ZSB1c2luZyB0aGUgaW5jb21pbmcgdmFsdWUuXG4gIHJldHVybiB7aW5jb21pbmc6IHRydWV9XG59XG5cbkhhbS5taXggPSAoY2hhbmdlLCBncmFwaCwgbGlzdGVuKSA9PiB7XG4gIHZhciBtYWNoaW5lID0gRGF0ZS5ub3coKVxuICB2YXIgbm93ID0ge31cbiAgdmFyIGRlZmVyID0ge31cbiAgbGV0IHdhaXQgPSAwXG5cbiAgT2JqZWN0LmtleXMoY2hhbmdlKS5mb3JFYWNoKHNvdWwgPT4ge1xuICAgIGNvbnN0IG5vZGUgPSBjaGFuZ2Vbc291bF1cbiAgICBsZXQgdXBkYXRlZCA9IGZhbHNlXG4gICAgT2JqZWN0LmtleXMobm9kZSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PT0gXCJfXCIpIHJldHVyblxuXG4gICAgICBjb25zdCB2YWx1ZSA9IG5vZGVba2V5XVxuICAgICAgY29uc3Qgc3RhdGUgPSBub2RlLl9bXCI+XCJdW2tleV1cbiAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IChncmFwaFtzb3VsXSB8fCB7fSlba2V5XVxuICAgICAgY29uc3QgY3VycmVudFN0YXRlID0gKGdyYXBoW3NvdWxdIHx8IHtfOiB7XCI+XCI6IHt9fX0pLl9bXCI+XCJdW2tleV0gfHwgMFxuXG4gICAgICAvLyBEZWZlciB0aGUgdXBkYXRlIGlmIGFoZWFkIG9mIG1hY2hpbmUgdGltZS5cbiAgICAgIGNvbnN0IHNrZXcgPSBzdGF0ZSAtIG1hY2hpbmVcbiAgICAgIGlmIChza2V3ID4gMCkge1xuICAgICAgICAvLyBJZ25vcmUgdXBkYXRlIGlmIGFoZWFkIGJ5IG1vcmUgdGhhbiAyNCBob3Vycy5cbiAgICAgICAgaWYgKHNrZXcgPiA4NjQwMDAwMCkgcmV0dXJuXG5cbiAgICAgICAgLy8gV2FpdCB0aGUgc2hvcnRlc3QgZGlmZmVyZW5jZSBiZWZvcmUgdHJ5aW5nIHRoZSB1cGRhdGVzIGFnYWluLlxuICAgICAgICBpZiAod2FpdCA9PT0gMCB8fCBza2V3IDwgd2FpdCkgd2FpdCA9IHNrZXdcbiAgICAgICAgaWYgKCFkZWZlcltzb3VsXSkgZGVmZXJbc291bF0gPSB7Xzoge1wiI1wiOiBzb3VsLCBcIj5cIjoge319fVxuICAgICAgICBkZWZlcltzb3VsXVtrZXldID0gdmFsdWVcbiAgICAgICAgZGVmZXJbc291bF0uX1tcIj5cIl1ba2V5XSA9IHN0YXRlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBIYW0oc3RhdGUsIGN1cnJlbnRTdGF0ZSwgdmFsdWUsIGN1cnJlbnRWYWx1ZSlcbiAgICAgICAgaWYgKHJlc3VsdC5pbmNvbWluZykge1xuICAgICAgICAgIGlmICghbm93W3NvdWxdKSBub3dbc291bF0gPSB7Xzoge1wiI1wiOiBzb3VsLCBcIj5cIjoge319fVxuICAgICAgICAgIC8vIFRPRE86IGdyYXBoIHNob3VsZCBub3QganVzdCBncm93IGluZGVmaW50aXRlbHkgaW4gbWVtb3J5LlxuICAgICAgICAgIC8vIE5lZWQgdG8gaGF2ZSBhIG1heCBzaXplIGFmdGVyIHdoaWNoIHN0YXJ0IGRyb3BwaW5nIHRoZSBvbGRlc3Qgc3RhdGVcbiAgICAgICAgICAvLyBEbyBzb21ldGhpbmcgc2ltaWxhciB0byBEdXAgd2hpY2ggY2FuIGhhbmRsZSBkZWxldGVzP1xuICAgICAgICAgIGlmICghZ3JhcGhbc291bF0pIGdyYXBoW3NvdWxdID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgICBncmFwaFtzb3VsXVtrZXldID0gbm93W3NvdWxdW2tleV0gPSB2YWx1ZVxuICAgICAgICAgIGdyYXBoW3NvdWxdLl9bXCI+XCJdW2tleV0gPSBub3dbc291bF0uX1tcIj5cIl1ba2V5XSA9IHN0YXRlXG4gICAgICAgICAgLy8gQ2FsbCBldmVudCBsaXN0ZW5lcnMgZm9yIHVwZGF0ZSBvbiBrZXksIG1peCBpcyBjYWxsZWQgYmVmb3JlXG4gICAgICAgICAgLy8gcHV0IGhhcyBmaW5pc2hlZCBzbyB3YWl0IGZvciB3aGF0IGNvdWxkIGJlIG11bHRpcGxlIG5lc3RlZFxuICAgICAgICAgIC8vIHVwZGF0ZXMgb24gYSBub2RlLlxuICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaWQgPSBzb3VsICsgZW5xICsga2V5XG4gICAgICAgICAgICBpZiAobGlzdGVuW2lkXSkgbGlzdGVuW2lkXS5mb3JFYWNoKGNiID0+IGNiKCkpXG4gICAgICAgICAgfSwgMTAwKVxuICAgICAgICAgIHVwZGF0ZWQgPSB0cnVlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIC8vIENhbGwgZXZlbnQgbGlzdGVuZXJzIGZvciB1cGRhdGUgb24gc291bC5cbiAgICBpZiAodXBkYXRlZCAmJiBsaXN0ZW5bc291bF0pXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgbGlzdGVuW3NvdWxdLmZvckVhY2goY2IgPT4gY2IoKSlcbiAgICAgIH0sIDEwMClcbiAgfSlcbiAgcmV0dXJuIHtub3c6IG5vdywgZGVmZXI6IGRlZmVyLCB3YWl0OiB3YWl0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEhhbVxuIiwiY29uc3QgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKVxuY29uc3QgV2lyZSA9IHJlcXVpcmUoXCIuL3dpcmVcIilcblxuY29uc3QgSG9sc3RlciA9IG9wdCA9PiB7XG4gIGNvbnN0IHdpcmUgPSBXaXJlKG9wdClcbiAgLy8gTWFwIGNhbGxiYWNrcyBzaW5jZSB0aGUgdXNlcidzIGNhbGxiYWNrIGlzIG5vdCBwYXNzZWQgdG8gd2lyZS5vbi5cbiAgY29uc3QgbWFwID0gbmV3IE1hcCgpXG4gIC8vIEFsbG93IGNvbmN1cnJlbnQgY2FsbHMgdG8gdGhlIGFwaSBieSBzdG9yaW5nIGVhY2ggY29udGV4dC5cbiAgY29uc3QgYWxsY3R4ID0gbmV3IE1hcCgpXG5cbiAgY29uc3Qgb2sgPSBkYXRhID0+IHtcbiAgICByZXR1cm4gKFxuICAgICAgZGF0YSA9PT0gbnVsbCB8fFxuICAgICAgZGF0YSA9PT0gdHJ1ZSB8fFxuICAgICAgZGF0YSA9PT0gZmFsc2UgfHxcbiAgICAgIHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiIHx8XG4gICAgICB1dGlscy5yZWwuaXMoZGF0YSkgfHxcbiAgICAgIHV0aWxzLm51bS5pcyhkYXRhKVxuICAgIClcbiAgfVxuXG4gIC8vIGNoZWNrIHJldHVybnMgdHJ1ZSBpZiBkYXRhIGlzIG9rIHRvIGFkZCB0byBhIGdyYXBoLCBhbiBlcnJvciBzdHJpbmcgaWZcbiAgLy8gdGhlIGRhdGEgY2FuJ3QgYmUgY29udmVydGVkLCBhbmQgdGhlIGtleXMgb24gdGhlIGRhdGEgb2JqZWN0IG90aGVyd2lzZS5cbiAgY29uc3QgY2hlY2sgPSBkYXRhID0+IHtcbiAgICBpZiAob2soZGF0YSkpIHJldHVybiB0cnVlXG5cbiAgICBpZiAodXRpbHMub2JqLmlzKGRhdGEpKSB7XG4gICAgICBjb25zdCBrZXlzID0gW11cbiAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGRhdGEpKSB7XG4gICAgICAgIGlmIChrZXkgPT09IFwiX1wiKSB7XG4gICAgICAgICAgcmV0dXJuIFwiZXJyb3IgdW5kZXJzY29yZSBjYW5ub3QgYmUgdXNlZCBhcyBhbiBpdGVtIG5hbWVcIlxuICAgICAgICB9XG4gICAgICAgIGlmICh1dGlscy5vYmouaXModmFsdWUpIHx8IG9rKHZhbHVlKSkge1xuICAgICAgICAgIGtleXMucHVzaChrZXkpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYGVycm9yIHske2tleX06JHt2YWx1ZX19IGNhbm5vdCBiZSBjb252ZXJ0ZWQgdG8gZ3JhcGhgXG4gICAgICB9XG4gICAgICBpZiAoa2V5cy5sZW5ndGggIT09IDApIHJldHVybiBrZXlzXG4gICAgfVxuICAgIHJldHVybiBgZXJyb3IgJHtkYXRhfSBjYW5ub3QgYmUgY29udmVydGVkIHRvIGEgZ3JhcGhgXG4gIH1cblxuICAvLyBncmFwaCBjb252ZXJ0cyBvYmplY3RzIHRvIGdyYXBoIGZvcm1hdCB3aXRoIHVwZGF0ZWQgc3RhdGVzLlxuICBjb25zdCBncmFwaCA9IChzb3VsLCBkYXRhLCBnKSA9PiB7XG4gICAgaWYgKCFnKSBnID0ge1tzb3VsXToge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX19XG4gICAgZWxzZSBnW3NvdWxdID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cblxuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGRhdGEpKSB7XG4gICAgICBnW3NvdWxdW2tleV0gPSB2YWx1ZVxuICAgICAgZ1tzb3VsXS5fW1wiPlwiXVtrZXldID0gRGF0ZS5ub3coKVxuICAgIH1cbiAgICByZXR1cm4gZ1xuICB9XG5cbiAgY29uc3QgYXBpID0gY3R4aWQgPT4ge1xuICAgIGNvbnN0IGdldCA9IChsZXgsIHNvdWwsIGFjaykgPT4ge1xuICAgICAgd2lyZS5nZXQodXRpbHMub2JqLnB1dChsZXgsIFwiI1wiLCBzb3VsKSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgaWYgKG1zZy5lcnIpIGNvbnNvbGUubG9nKG1zZy5lcnIpXG4gICAgICAgIGlmIChtc2cucHV0ICYmIG1zZy5wdXRbc291bF0pIHtcbiAgICAgICAgICBkZWxldGUgbXNnLnB1dFtzb3VsXS5fXG4gICAgICAgICAgLy8gUmVzb2x2ZSBhbnkgcmVscyBvbiB0aGUgbm9kZSBiZWZvcmUgcmV0dXJuaW5nIHRvIHRoZSB1c2VyLlxuICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKG1zZy5wdXRbc291bF0pKSB7XG4gICAgICAgICAgICBjb25zdCBpZCA9IHV0aWxzLnJlbC5pcyhtc2cucHV0W3NvdWxdW2tleV0pXG4gICAgICAgICAgICBpZiAoaWQpIHtcbiAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IG5ldyBQcm9taXNlKHJlcyA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgX2N0eGlkID0gdXRpbHMudGV4dC5yYW5kb20oKVxuICAgICAgICAgICAgICAgIGFsbGN0eC5zZXQoX2N0eGlkLCB7Y2hhaW46IFt7aXRlbTogbnVsbCwgc291bDogaWR9XX0pXG4gICAgICAgICAgICAgICAgYXBpKF9jdHhpZCkubmV4dChudWxsLCByZXMpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIG1zZy5wdXRbc291bF1ba2V5XSA9IGRhdGFcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgYWNrKG1zZy5wdXRbc291bF0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTm8gZGF0YSBjYWxsYmFjay5cbiAgICAgICAgICBhY2sobnVsbClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG5cbiAgICBjb25zdCBkb25lID0gZGF0YSA9PiB7XG4gICAgICBjb25zdCBjdHggPSBhbGxjdHguZ2V0KGN0eGlkKVxuICAgICAgaWYgKGN0eCAmJiB0eXBlb2YgY3R4LmNiICE9PSBcInVuZGVmaW5lZFwiKSBjdHguY2IoZGF0YSlcbiAgICAgIGVsc2UgaWYgKGRhdGEpIGNvbnNvbGUubG9nKGRhdGEpXG4gICAgICAvLyBBIGNvbnRleHQgdXBkYXRlZCBieSBcIm9uXCIgc2hvdWxkIG9ubHkgYmUgcmVtb3ZlZCBieSBcIm9mZlwiLlxuICAgICAgaWYgKCFjdHgub24pIGFsbGN0eC5kZWxldGUoY3R4aWQpXG4gICAgfVxuXG4gICAgY29uc3QgcmVzb2x2ZSA9IChyZXF1ZXN0LCBjYikgPT4ge1xuICAgICAgY29uc3QgZ2V0ID0gcmVxdWVzdCAmJiB0eXBlb2YgcmVxdWVzdC5nZXQgIT09IFwidW5kZWZpbmVkXCJcbiAgICAgIGNvbnN0IHB1dCA9IHJlcXVlc3QgJiYgdHlwZW9mIHJlcXVlc3QucHV0ICE9PSBcInVuZGVmaW5lZFwiXG4gICAgICBjb25zdCBvbiA9IHJlcXVlc3QgJiYgdHlwZW9mIHJlcXVlc3Qub24gIT09IFwidW5kZWZpbmVkXCJcbiAgICAgIGNvbnN0IG9mZiA9IHJlcXVlc3QgJiYgdHlwZW9mIHJlcXVlc3Qub2ZmICE9PSBcInVuZGVmaW5lZFwiXG5cbiAgICAgIGxldCBmb3VuZCA9IGZhbHNlXG4gICAgICBjb25zdCBjdHggPSBhbGxjdHguZ2V0KGN0eGlkKVxuICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBjdHguY2hhaW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGN0eC5jaGFpbltpXS5zb3VsICE9PSBudWxsKSBjb250aW51ZVxuXG4gICAgICAgIGZvdW5kID0gdHJ1ZVxuICAgICAgICBicmVha1xuICAgICAgfVxuXG4gICAgICBpZiAoZm91bmQpIHtcbiAgICAgICAgLy8gRm91bmQgYSBzb3VsIHRoYXQgbmVlZHMgcmVzb2x2aW5nLCBuZWVkIHRoZSBwcmV2aW91cyBjb250ZXh0XG4gICAgICAgIC8vIChpZSB0aGUgcGFyZW50IG5vZGUpIHRvIGZpbmQgYSBzb3VsIHJlbGF0aW9uIGZvciBpdC5cbiAgICAgICAgY29uc3Qge2l0ZW0sIHNvdWx9ID0gY3R4LmNoYWluW2kgLSAxXVxuICAgICAgICB3aXJlLmdldCh7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgbXNnID0+IHtcbiAgICAgICAgICBpZiAobXNnLmVycikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIGdldHRpbmcgJHtpdGVtfSBvbiAke3NvdWx9OiAke21zZy5lcnJ9YClcbiAgICAgICAgICAgIGlmIChjYikgY2IobnVsbClcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IG5vZGUgPSBtc2cucHV0ICYmIG1zZy5wdXRbc291bF1cbiAgICAgICAgICBpZiAobm9kZSAmJiB0eXBlb2Ygbm9kZVtpdGVtXSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgbGV0IGlkID0gdXRpbHMucmVsLmlzKG5vZGVbaXRlbV0pXG4gICAgICAgICAgICBpZiAoaWQpIHtcbiAgICAgICAgICAgICAgY3R4LmNoYWluW2ldLnNvdWwgPSBpZFxuICAgICAgICAgICAgICAvLyBOb3Qgc3VyZSB3aHkgdGhlIG1hcCBuZWVkcyB0byBiZSBzZXQgcmF0aGVyIHRoYW4ganVzdCBjdHg/XG4gICAgICAgICAgICAgIGFsbGN0eC5zZXQoY3R4aWQsIHtjaGFpbjogY3R4LmNoYWluLCBjYjogY3R4LmNifSlcbiAgICAgICAgICAgICAgLy8gQ2FsbCBhcGkgYWdhaW4gdXNpbmcgdGhlIHVwZGF0ZWQgY29udGV4dC5cbiAgICAgICAgICAgICAgaWYgKGdldCkgYXBpKGN0eGlkKS5uZXh0KG51bGwsIHJlcXVlc3QuZ2V0LCBjYilcbiAgICAgICAgICAgICAgZWxzZSBpZiAocHV0KSBhcGkoY3R4aWQpLnB1dChyZXF1ZXN0LnB1dCwgY2IpXG4gICAgICAgICAgICAgIGVsc2UgaWYgKG9uKSBhcGkoY3R4aWQpLm9uKGNiKVxuICAgICAgICAgICAgICBlbHNlIGlmIChvZmYpIGFwaShjdHhpZCkub2ZmKGNiKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChnZXQpIHtcbiAgICAgICAgICAgICAgLy8gUmVxdWVzdCB3YXMgbm90IGZvciBhIG5vZGUsIHJldHVybiBhIHByb3BlcnR5IG9uIHRoZSBjdXJyZW50XG4gICAgICAgICAgICAgIC8vIHNvdWwuXG4gICAgICAgICAgICAgIGNiKG5vZGVbaXRlbV0pXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHB1dCkge1xuICAgICAgICAgICAgICAvLyBSZXF1ZXN0IHdhcyBjaGFpbmVkIGJlZm9yZSBwdXQsIHNvIHJlbCBkb2Vzbid0IGV4aXN0IHlldC5cbiAgICAgICAgICAgICAgaWQgPSB1dGlscy50ZXh0LnJhbmRvbSgpXG4gICAgICAgICAgICAgIGNvbnN0IHJlbCA9IHtbaXRlbV06IHV0aWxzLnJlbC5pZnkoaWQpfVxuICAgICAgICAgICAgICB3aXJlLnB1dChncmFwaChzb3VsLCByZWwpLCBlcnIgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgIGNiKGBlcnJvciBwdXR0aW5nICR7aXRlbX0gb24gJHtzb3VsfTogJHtlcnJ9YClcbiAgICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGN0eC5jaGFpbltpXS5zb3VsID0gaWRcbiAgICAgICAgICAgICAgICBhcGkoY3R4aWQpLnB1dChyZXF1ZXN0LnB1dCwgY2IpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9IGVsc2UgaWYgKG9uKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBlcnJvciByZXNvbHZpbmcgb24gZm9yICR7aXRlbX0gb24gJHtzb3VsfWApXG4gICAgICAgICAgICAgIGNiKG51bGwpXG4gICAgICAgICAgICB9IGVsc2UgaWYgKG9mZikge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgcmVzb2x2aW5nIG9mZiBmb3IgJHtpdGVtfSBvbiAke3NvdWx9YClcbiAgICAgICAgICAgICAgaWYgKGNiKSBjYihudWxsKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAocHV0KSB7XG4gICAgICAgICAgICBjYihgZXJyb3IgJHtpdGVtfSBub3QgZm91bmQgb24gJHtzb3VsfWApXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBlcnJvciAke2l0ZW19IG5vdCBmb3VuZCBvbiAke3NvdWx9YClcbiAgICAgICAgICAgIGlmIChjYikgY2IobnVsbClcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIC8vIENhbGxiYWNrIGhhcyBiZWVuIHBhc3NlZCB0byBuZXh0IHNvdWwgbG9va3VwIG9yIGNhbGxlZCBhYm92ZSwgc29cbiAgICAgICAgLy8gcmV0dXJuIGZhbHNlIGFzIHRoZSBjYWxsaW5nIGNvZGUgc2hvdWxkIG5vdCBjb250aW51ZS5cbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICB9XG5cbiAgICAgIGlmIChnZXQgJiYgY3R4LmNoYWluW2N0eC5jaGFpbi5sZW5ndGggLSAxXS5pdGVtICE9PSBudWxsKSB7XG4gICAgICAgIC8vIFRoZSBjb250ZXh0IGhhcyBiZWVuIHJlc29sdmVkIGJ1dCBpdCBkb2VzIG5vdCBpbmNsdWRlIHRoZSByZXF1ZXN0ZWRcbiAgICAgICAgLy8gbm9kZSwgd2hpY2ggcmVxdWlyZXMgb25lIG1vcmUgbG9va3VwLlxuICAgICAgICBjdHguY2hhaW4ucHVzaCh7aXRlbTogbnVsbCwgc291bDogbnVsbH0pXG4gICAgICAgIGFwaShjdHhpZCkubmV4dChudWxsLCByZXF1ZXN0LmdldCwgY2IpXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuXG4gICAgICAvLyBSZXR1cm4gdGhlIGxhc3QgY29udGV4dCwgaWUgdGhlIHNvdWwgcmVxdWlyZWQgYnkgdGhlIGNhbGxpbmcgY29kZS5cbiAgICAgIHJldHVybiBjdHguY2hhaW5bY3R4LmNoYWluLmxlbmd0aCAtIDFdXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldDogKGtleSwgbGV4LCBjYikgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGxleCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgY2IgPSBsZXhcbiAgICAgICAgICBsZXggPSBudWxsXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGtleSA9PT0gbnVsbCB8fCBrZXkgPT09IFwiXCIgfHwga2V5ID09PSBcIl9cIikge1xuICAgICAgICAgIGlmIChjYikgY2IobnVsbClcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGN0eGlkID0gdXRpbHMudGV4dC5yYW5kb20oKVxuICAgICAgICAvLyBUb3AgbGV2ZWwga2V5cyBhcmUgYWRkZWQgdG8gYSByb290IG5vZGUgc28gdGhlaXIgdmFsdWVzIGRvbid0IG5lZWRcbiAgICAgICAgLy8gdG8gYmUgb2JqZWN0cy5cbiAgICAgICAgYWxsY3R4LnNldChjdHhpZCwge2NoYWluOiBbe2l0ZW06IGtleSwgc291bDogXCJyb290XCJ9XSwgY2I6IGNifSlcbiAgICAgICAgaWYgKCFjYikgcmV0dXJuIGFwaShjdHhpZClcblxuICAgICAgICAvLyBXaGVuIHRoZXJlJ3MgYSBjYWxsYmFjayBuZWVkIHRvIHJlc29sdmUgdGhlIGNvbnRleHQgZmlyc3QuXG4gICAgICAgIGNvbnN0IHtzb3VsfSA9IHJlc29sdmUoe2dldDogbGV4fSwgZG9uZSlcbiAgICAgICAgaWYgKHNvdWwpIGdldChsZXgsIHNvdWwsIGRvbmUpXG4gICAgICB9LFxuICAgICAgbmV4dDogKGtleSwgbGV4LCBjYikgPT4ge1xuICAgICAgICBjb25zdCBhY2sgPSBkYXRhID0+IHtcbiAgICAgICAgICBjYiA/IGNiKGRhdGEpIDogZG9uZShkYXRhKVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBsZXggPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgIGNiID0gbGV4XG4gICAgICAgICAgbGV4ID0gbnVsbFxuICAgICAgICB9XG4gICAgICAgIGlmICghY3R4aWQpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcInBsZWFzZSBwcm92aWRlIGEga2V5IHVzaW5nIGdldChrZXkpXCIpXG4gICAgICAgICAgYWNrKG51bGwpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjdHggPSBhbGxjdHguZ2V0KGN0eGlkKVxuICAgICAgICAvLyBjdHggYWxyZWFkeSByZW1vdmVkIGJ5IGFub3RoZXIgY2hhaW5lZCBjYWxsYmFjayBpcyBvaz9cbiAgICAgICAgaWYgKCFjdHgpIHJldHVyblxuXG4gICAgICAgIGlmIChjYiAmJiB0eXBlb2YgY3R4LmNiID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgLy8gVGhpcyAoYW5kIGFjaykgYWxsb3dzIG5lc3RlZCBvYmplY3RzIHRvIHNldCB0aGVpciBvd24gY2FsbGJhY2tzLlxuICAgICAgICAgIGN0eC5jYiA9IGNiXG4gICAgICAgICAgY2IgPSBudWxsXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoa2V5ID09PSBcIlwiIHx8IGtleSA9PT0gXCJfXCIpIHtcbiAgICAgICAgICBhY2sobnVsbClcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFB1c2ggdGhlIGtleSB0byB0aGUgY29udGV4dCBhcyBpdCBuZWVkcyBhIHNvdWwgbG9va3VwLlxuICAgICAgICAvLyAobnVsbCBpcyB1c2VkIHRvIGNhbGwgdGhlIGFwaSB3aXRoIHVwZGF0ZWQgY29udGV4dClcbiAgICAgICAgaWYgKGtleSAhPT0gbnVsbCkgY3R4LmNoYWluLnB1c2goe2l0ZW06IGtleSwgc291bDogbnVsbH0pXG4gICAgICAgIGlmICghY3R4LmNiKSByZXR1cm4gYXBpKGN0eGlkKVxuXG4gICAgICAgIC8vIFdoZW4gdGhlcmUncyBhIGNhbGxiYWNrIG5lZWQgdG8gcmVzb2x2ZSB0aGUgY29udGV4dCBmaXJzdC5cbiAgICAgICAgY29uc3Qge3NvdWx9ID0gcmVzb2x2ZSh7Z2V0OiBsZXh9LCBhY2spXG4gICAgICAgIGlmIChzb3VsKSBnZXQobGV4LCBzb3VsLCBhY2spXG4gICAgICB9LFxuICAgICAgcHV0OiAoZGF0YSwgY2IpID0+IHtcbiAgICAgICAgY29uc3QgYWNrID0gZXJyID0+IHtcbiAgICAgICAgICBjYiA/IGNiKGVycikgOiBkb25lKGVycilcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY3R4aWQpIHtcbiAgICAgICAgICBhY2soXCJwbGVhc2UgcHJvdmlkZSBhIGtleSB1c2luZyBnZXQoa2V5KVwiKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY3R4ID0gYWxsY3R4LmdldChjdHhpZClcbiAgICAgICAgLy8gY3R4IGFscmVhZHkgcmVtb3ZlZCBieSBhbm90aGVyIGNoYWluZWQgY2FsbGJhY2sgaXMgb2s/XG4gICAgICAgIGlmICghY3R4KSByZXR1cm5cblxuICAgICAgICBpZiAoIWN0eC5jYikge1xuICAgICAgICAgIGlmICghY2IpIHJldHVyblxuXG4gICAgICAgICAgLy8gVGhpcyAoYW5kIGFjaykgYWxsb3dzIG5lc3RlZCBvYmplY3RzIHRvIHNldCB0aGVpciBvd24gY2FsbGJhY2tzLlxuICAgICAgICAgIGN0eC5jYiA9IGNiXG4gICAgICAgICAgY2IgPSBudWxsXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZXN1bHQgPSBjaGVjayhkYXRhKVxuICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgIC8vIEFsbCBzdHJpbmdzIHJldHVybmVkIGZyb20gY2hlY2sgYXJlIGVycm9ycywgY2Fubm90IGNvbnRpbnVlLlxuICAgICAgICAgIGFjayhyZXN1bHQpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXNvbHZlIHRoZSBjdXJyZW50IGNvbnRleHQgYmVmb3JlIHB1dHRpbmcgZGF0YS5cbiAgICAgICAgY29uc3Qge2l0ZW0sIHNvdWx9ID0gcmVzb2x2ZSh7cHV0OiBkYXRhfSwgYWNrKVxuICAgICAgICBpZiAoIXNvdWwpIHJldHVyblxuXG4gICAgICAgIGlmIChyZXN1bHQgPT09IHRydWUpIHtcbiAgICAgICAgICAvLyBXaGVuIHJlc3VsdCBpcyB0cnVlIGRhdGEgaXMgYSBwcm9wZXJ0eSB0byBwdXQgb24gdGhlIGN1cnJlbnQgc291bC5cbiAgICAgICAgICAvLyBOZWVkIHRvIGNoZWNrIGlmIGl0ZW0gaXMgYSByZWwgYW5kIGFsc28gc2V0IHRoZSBub2RlIHRvIG51bGwuIChUaGlzXG4gICAgICAgICAgLy8gYXBwbGllcyBmb3IgYW55IHVwZGF0ZSBmcm9tIGEgcmVsIHRvIGEgcHJvcGVydHksIG5vdCBqdXN0IG51bGwuKVxuICAgICAgICAgIHdpcmUuZ2V0KHtcIiNcIjogc291bCwgXCIuXCI6IGl0ZW19LCBhc3luYyBtc2cgPT4ge1xuICAgICAgICAgICAgaWYgKG1zZy5lcnIpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIGdldHRpbmcgJHtzb3VsfTogJHttc2cuZXJyfWApXG4gICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gbXNnLnB1dCAmJiBtc2cucHV0W3NvdWxdICYmIG1zZy5wdXRbc291bF1baXRlbV1cbiAgICAgICAgICAgIGNvbnN0IGlkID0gdXRpbHMucmVsLmlzKGN1cnJlbnQpXG4gICAgICAgICAgICBpZiAoIWlkKSB7XG4gICAgICAgICAgICAgIC8vIE5vdCBhIHJlbCwgY2FuIGp1c3QgcHV0IHRoZSBkYXRhLlxuICAgICAgICAgICAgICB3aXJlLnB1dChncmFwaChzb3VsLCB7W2l0ZW1dOiBkYXRhfSksIGFjaylcbiAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdpcmUuZ2V0KHtcIiNcIjogaWR9LCBhc3luYyBtc2cgPT4ge1xuICAgICAgICAgICAgICBpZiAobXNnLmVycikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBlcnJvciBnZXR0aW5nICR7aWR9OiAke21zZy5lcnJ9YClcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGlmICghbXNnLnB1dCB8fCAhbXNnLnB1dFtpZF0pIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgJHtpZH0gbm90IGZvdW5kYClcbiAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGRlbGV0ZSBtc2cucHV0W2lkXS5fXG4gICAgICAgICAgICAgIC8vIG51bGwgZWFjaCBvZiB0aGUgcHJvcGVydGllcyBvbiB0aGUgbm9kZSBiZWZvcmUgcHV0dGluZyBkYXRhLlxuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhtc2cucHV0W2lkXSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBlcnIgPSBhd2FpdCBuZXcgUHJvbWlzZShyZXMgPT4ge1xuICAgICAgICAgICAgICAgICAgY29uc3QgX2N0eGlkID0gdXRpbHMudGV4dC5yYW5kb20oKVxuICAgICAgICAgICAgICAgICAgYWxsY3R4LnNldChfY3R4aWQsIHtjaGFpbjogW3tpdGVtOiBrZXksIHNvdWw6IGlkfV19KVxuICAgICAgICAgICAgICAgICAgYXBpKF9jdHhpZCkucHV0KG51bGwsIHJlcylcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgIGFjayhlcnIpXG4gICAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgd2lyZS5wdXQoZ3JhcGgoc291bCwge1tpdGVtXTogZGF0YX0pLCBhY2spXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0pXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBPdGhlcndpc2UgcHV0IHRoZSBkYXRhIHVzaW5nIHRoZSBrZXlzIHJldHVybmVkIGluIHJlc3VsdC5cbiAgICAgICAgLy8gTmVlZCB0byBjaGVjayBpZiBhIHJlbCBoYXMgYWxyZWFkeSBiZWVuIGFkZGVkIG9uIHRoZSBjdXJyZW50IG5vZGUuXG4gICAgICAgIHdpcmUuZ2V0KHtcIiNcIjogc291bCwgXCIuXCI6IGl0ZW19LCBhc3luYyBtc2cgPT4ge1xuICAgICAgICAgIGlmIChtc2cuZXJyKSB7XG4gICAgICAgICAgICBhY2soYGVycm9yIGdldHRpbmcgJHtzb3VsfTogJHttc2cuZXJyfWApXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBjdXJyZW50ID0gbXNnLnB1dCAmJiBtc2cucHV0W3NvdWxdICYmIG1zZy5wdXRbc291bF1baXRlbV1cbiAgICAgICAgICBjb25zdCBpZCA9IHV0aWxzLnJlbC5pcyhjdXJyZW50KVxuICAgICAgICAgIGlmICghaWQpIHtcbiAgICAgICAgICAgIC8vIFRoZSBjdXJyZW50IHJlbCBkb2Vzbid0IGV4aXN0LCBzbyBhZGQgaXQgZmlyc3QuXG4gICAgICAgICAgICBjb25zdCByZWwgPSB7W2l0ZW1dOiB1dGlscy5yZWwuaWZ5KHV0aWxzLnRleHQucmFuZG9tKCkpfVxuICAgICAgICAgICAgd2lyZS5wdXQoZ3JhcGgoc291bCwgcmVsKSwgZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIGFjayhgZXJyb3IgcHV0dGluZyAke2l0ZW19IG9uICR7c291bH06ICR7ZXJyfWApXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgX2N0eGlkID0gdXRpbHMudGV4dC5yYW5kb20oKVxuICAgICAgICAgICAgICAgIGNvbnN0IGNoYWluID0gW3tpdGVtOiBpdGVtLCBzb3VsOiBzb3VsfV1cbiAgICAgICAgICAgICAgICAvLyBQYXNzIHRoZSBwcmV2aW91cyBjb250ZXh0J3MgY2FsbGJhY2sgb24gaGVyZS5cbiAgICAgICAgICAgICAgICBhbGxjdHguc2V0KF9jdHhpZCwge2NoYWluOiBjaGFpbiwgY2I6IGN0eC5jYn0pXG4gICAgICAgICAgICAgICAgYXBpKF9jdHhpZCkucHV0KGRhdGEpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsZXQgcHV0ID0gZmFsc2VcbiAgICAgICAgICBjb25zdCB1cGRhdGUgPSB7fVxuICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIHJlc3VsdCkge1xuICAgICAgICAgICAgY29uc3QgZXJyID0gYXdhaXQgbmV3IFByb21pc2UocmVzID0+IHtcbiAgICAgICAgICAgICAgaWYgKHV0aWxzLm9iai5pcyhkYXRhW2tleV0pKSB7XG4gICAgICAgICAgICAgICAgLy8gVXNlIHRoZSBjdXJyZW50IHJlbCBhcyB0aGUgY29udGV4dCBmb3IgbmVzdGVkIG9iamVjdHMuXG4gICAgICAgICAgICAgICAgY29uc3QgX2N0eGlkID0gdXRpbHMudGV4dC5yYW5kb20oKVxuICAgICAgICAgICAgICAgIGFsbGN0eC5zZXQoX2N0eGlkLCB7Y2hhaW46IFt7aXRlbToga2V5LCBzb3VsOiBpZH1dfSlcbiAgICAgICAgICAgICAgICBhcGkoX2N0eGlkKS5wdXQoZGF0YVtrZXldLCByZXMpXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcHV0ID0gdHJ1ZVxuICAgICAgICAgICAgICAgIC8vIEdyb3VwIG90aGVyIHByb3BlcnRpZXMgaW50byBvbmUgdXBkYXRlLlxuICAgICAgICAgICAgICAgIHVwZGF0ZVtrZXldID0gZGF0YVtrZXldXG4gICAgICAgICAgICAgICAgcmVzKG51bGwpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgIGFjayhlcnIpXG4gICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocHV0KSB3aXJlLnB1dChncmFwaChpZCwgdXBkYXRlKSwgYWNrKVxuICAgICAgICAgIGVsc2UgYWNrKClcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBvbjogY2IgPT4ge1xuICAgICAgICBpZiAoIWNiKSByZXR1cm5cblxuICAgICAgICBpZiAoIWN0eGlkKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coXCJwbGVhc2UgcHJvdmlkZSBhIGtleSB1c2luZyBnZXQoa2V5KVwiKVxuICAgICAgICAgIGNiKG51bGwpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXNvbHZlIHRoZSBjdXJyZW50IGNvbnRleHQgYmVmb3JlIGFkZGluZyBldmVudCBsaXN0ZW5lci5cbiAgICAgICAgY29uc3Qge2l0ZW0sIHNvdWx9ID0gcmVzb2x2ZSh7b246IHRydWV9LCBjYilcbiAgICAgICAgaWYgKCFzb3VsKSByZXR1cm5cblxuICAgICAgICAvLyBGbGFnIHRoYXQgdGhpcyBjb250ZXh0IGlzIHNldCBmcm9tIG9uIGFuZCBzaG91bGRuJ3QgYmUgcmVtb3ZlZC5cbiAgICAgICAgYWxsY3R4LnNldChjdHhpZCwge2NoYWluOiBbe2l0ZW06IGl0ZW0sIHNvdWw6IHNvdWx9XSwgb246IHRydWV9KVxuICAgICAgICAvLyBNYXAgdGhlIHVzZXIncyBjYWxsYmFjayBiZWNhdXNlIGl0IGNhbiBhbHNvIGJlIHBhc3NlZCB0byBvZmYsXG4gICAgICAgIC8vIHNvIG5lZWQgYSByZWZlcmVuY2UgdG8gaXQgdG8gY29tcGFyZSB0aGVtLlxuICAgICAgICBtYXAuc2V0KGNiLCAoKSA9PiBhcGkoY3R4aWQpLm5leHQobnVsbCwgY2IpKVxuICAgICAgICAvLyBDaGVjayBpZiBpdGVtIGlzIGEgcmVsIGFuZCBhZGQgZXZlbnQgbGlzdGVuZXIgZm9yIHRoZSBub2RlLlxuICAgICAgICB3aXJlLmdldCh7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgICBpZiAobXNnLmVycikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIGdldHRpbmcgJHtzb3VsfTogJHttc2cuZXJyfWApXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBjdXJyZW50ID0gbXNnLnB1dCAmJiBtc2cucHV0W3NvdWxdICYmIG1zZy5wdXRbc291bF1baXRlbV1cbiAgICAgICAgICBjb25zdCBpZCA9IHV0aWxzLnJlbC5pcyhjdXJyZW50KVxuICAgICAgICAgIGlmIChpZCkgd2lyZS5vbih7XCIjXCI6IGlkfSwgbWFwLmdldChjYikpXG4gICAgICAgICAgZWxzZSB3aXJlLm9uKHtcIiNcIjogc291bCwgXCIuXCI6IGl0ZW19LCBtYXAuZ2V0KGNiKSlcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBvZmY6IGNiID0+IHtcbiAgICAgICAgaWYgKCFjdHhpZCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFwicGxlYXNlIHByb3ZpZGUgYSBrZXkgdXNpbmcgZ2V0KGtleSlcIilcbiAgICAgICAgICBpZiAoY2IpIGNiKG51bGwpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXNvbHZlIHRoZSBjdXJyZW50IGNvbnRleHQgYmVmb3JlIHJlbW92aW5nIGV2ZW50IGxpc3RlbmVyLlxuICAgICAgICBjb25zdCB7aXRlbSwgc291bH0gPSByZXNvbHZlKHtvZmY6IHRydWV9LCBjYilcbiAgICAgICAgaWYgKCFzb3VsKSByZXR1cm5cblxuICAgICAgICAvLyBDaGVjayBpZiBpdGVtIGlzIGEgcmVsIGFuZCByZW1vdmUgZXZlbnQgbGlzdGVuZXIgZm9yIHRoZSBub2RlLlxuICAgICAgICB3aXJlLmdldCh7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgICBpZiAobXNnLmVycikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIGdldHRpbmcgJHtzb3VsfTogJHttc2cuZXJyfWApXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBjdXJyZW50ID0gbXNnLnB1dCAmJiBtc2cucHV0W3NvdWxdICYmIG1zZy5wdXRbc291bF1baXRlbV1cbiAgICAgICAgICBjb25zdCBpZCA9IHV0aWxzLnJlbC5pcyhjdXJyZW50KVxuICAgICAgICAgIGlmIChpZCkgd2lyZS5vZmYoe1wiI1wiOiBpZH0sIG1hcC5nZXQoY2IpKVxuICAgICAgICAgIGVsc2Ugd2lyZS5vZmYoe1wiI1wiOiBzb3VsLCBcIi5cIjogaXRlbX0sIG1hcC5nZXQoY2IpKVxuICAgICAgICAgIG1hcC5kZWxldGUoY2IpXG4gICAgICAgICAgYWxsY3R4LmRlbGV0ZShjdHhpZClcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICAvLyBBbGxvdyB0aGUgd2lyZSBzcGVjIHRvIGJlIHVzZWQgdmlhIGhvbHN0ZXIuXG4gICAgICB3aXJlOiB3aXJlLFxuICAgIH1cbiAgfVxuICByZXR1cm4gYXBpKClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBIb2xzdGVyXG4iLCJjb25zdCBSYWRpeCA9IHJlcXVpcmUoXCIuL3JhZGl4XCIpXG5jb25zdCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpXG5cbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgZW5kIG9mIHRleHQuXG5jb25zdCBldHggPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDMpXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIGVucXVpcnkuXG5jb25zdCBlbnEgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDUpXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIHVuaXQgc2VwYXJhdG9yLlxuY29uc3QgdW5pdCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMzEpXG5cbi8vIFJhZGlzayBwcm92aWRlcyBhY2Nlc3MgdG8gYSByYWRpeCB0cmVlIHRoYXQgaXMgc3RvcmVkIGluIHRoZSBwcm92aWRlZFxuLy8gb3B0LnN0b3JlIGludGVyZmFjZS5cbmNvbnN0IFJhZGlzayA9IG9wdCA9PiB7XG4gIHZhciB1XG4gIHZhciBjYWNoZSA9IG51bGxcblxuICBpZiAoIW9wdCkgb3B0ID0ge31cbiAgaWYgKCFvcHQubG9nKSBvcHQubG9nID0gY29uc29sZS5sb2dcbiAgaWYgKCFvcHQuYmF0Y2gpIG9wdC5iYXRjaCA9IDEwICogMTAwMFxuICBpZiAoIW9wdC53cml0ZSkgb3B0LndyaXRlID0gMSAvLyBXYWl0IHRpbWUgYmVmb3JlIHdyaXRlIGluIG1pbGxpc2Vjb25kcy5cbiAgaWYgKCFvcHQuc2l6ZSkgb3B0LnNpemUgPSAxMDI0ICogMTAyNCAvLyBGaWxlIHNpemUgb24gZGlzaywgZGVmYXVsdCAxTUIuXG4gIGlmICghb3B0LnN0b3JlKSB7XG4gICAgb3B0LmxvZyhcbiAgICAgIFwiUmFkaXNrIG5lZWRzIGBzdG9yZWAgaW50ZXJmYWNlIHdpdGggYHtnZXQ6IGZuLCBwdXQ6IGZuLCBsaXN0OiBmbn1gXCIsXG4gICAgKVxuICAgIHJldHVyblxuICB9XG4gIGlmICghb3B0LnN0b3JlLmdldCkge1xuICAgIG9wdC5sb2coXCJSYWRpc2sgbmVlZHMgYHN0b3JlLmdldGAgaW50ZXJmYWNlIHdpdGggYChmaWxlLCBjYilgXCIpXG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKCFvcHQuc3RvcmUucHV0KSB7XG4gICAgb3B0LmxvZyhcIlJhZGlzayBuZWVkcyBgc3RvcmUucHV0YCBpbnRlcmZhY2Ugd2l0aCBgKGZpbGUsIGRhdGEsIGNiKWBcIilcbiAgICByZXR1cm5cbiAgfVxuICBpZiAoIW9wdC5zdG9yZS5saXN0KSB7XG4gICAgb3B0LmxvZyhcIlJhZGlzayBuZWVkcyBhIHN0cmVhbWluZyBgc3RvcmUubGlzdGAgaW50ZXJmYWNlIHdpdGggYChjYilgXCIpXG4gICAgcmV0dXJuXG4gIH1cblxuICAvLyBBbnkgYW5kIGFsbCBzdG9yYWdlIGFkYXB0ZXJzIHNob3VsZDpcbiAgLy8gMS4gQmVjYXVzZSB3cml0aW5nIHRvIGRpc2sgdGFrZXMgdGltZSwgd2Ugc2hvdWxkIGJhdGNoIGRhdGEgdG8gZGlzay5cbiAgLy8gICAgVGhpcyBpbXByb3ZlcyBwZXJmb3JtYW5jZSwgYW5kIHJlZHVjZXMgcG90ZW50aWFsIGRpc2sgY29ycnVwdGlvbi5cbiAgLy8gMi4gSWYgYSBiYXRjaCBleGNlZWRzIGEgY2VydGFpbiBudW1iZXIgb2Ygd3JpdGVzLCB3ZSBzaG91bGQgaW1tZWRpYXRlbHlcbiAgLy8gICAgd3JpdGUgdG8gZGlzayB3aGVuIHBoeXNpY2FsbHkgcG9zc2libGUuIFRoaXMgY2FwcyB0b3RhbCBwZXJmb3JtYW5jZSxcbiAgLy8gICAgYnV0IHJlZHVjZXMgcG90ZW50aWFsIGxvc3MuXG4gIGNvbnN0IHJhZGlzayA9IChrZXksIHZhbHVlLCBjYikgPT4ge1xuICAgIGtleSA9IFwiXCIgKyBrZXlcblxuICAgIC8vIElmIG5vIHZhbHVlIGlzIHByb3ZpZGVkIHRoZW4gdGhlIHNlY29uZCBwYXJhbWV0ZXIgaXMgdGhlIGNhbGxiYWNrXG4gICAgLy8gZnVuY3Rpb24uIFJlYWQgdmFsdWUgZnJvbSBtZW1vcnkgb3IgZGlzayBhbmQgY2FsbCBjYWxsYmFjayB3aXRoIGl0LlxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgY2IgPSB2YWx1ZVxuICAgICAgdmFsdWUgPSByYWRpc2suYmF0Y2goa2V5KVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICByZXR1cm4gY2IodSwgdmFsdWUpXG4gICAgICB9XG5cbiAgICAgIGlmIChyYWRpc2sudGhyYXNoLmF0KSB7XG4gICAgICAgIHZhbHVlID0gcmFkaXNrLnRocmFzaC5hdChrZXkpXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICByZXR1cm4gY2IodSwgdmFsdWUpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJhZGlzay5yZWFkKGtleSwgY2IpXG4gICAgfVxuXG4gICAgLy8gT3RoZXJ3aXNlIHN0b3JlIHRoZSB2YWx1ZSBwcm92aWRlZC5cbiAgICByYWRpc2suYmF0Y2goa2V5LCB2YWx1ZSlcbiAgICBpZiAoY2IpIHtcbiAgICAgIHJhZGlzay5iYXRjaC5hY2tzLnB1c2goY2IpXG4gICAgfVxuICAgIC8vIERvbid0IHdhaXQgaWYgd2UgaGF2ZSBiYXRjaGVkIHRvbyBtYW55LlxuICAgIGlmICgrK3JhZGlzay5iYXRjaC5lZCA+PSBvcHQuYmF0Y2gpIHtcbiAgICAgIHJldHVybiByYWRpc2sudGhyYXNoKClcbiAgICB9XG5cbiAgICAvLyBPdGhlcndpc2Ugd2FpdCBmb3IgbW9yZSB1cGRhdGVzIGJlZm9yZSB3cml0aW5nLlxuICAgIGNsZWFyVGltZW91dChyYWRpc2suYmF0Y2gudGltZW91dClcbiAgICByYWRpc2suYmF0Y2gudGltZW91dCA9IHNldFRpbWVvdXQocmFkaXNrLnRocmFzaCwgb3B0LndyaXRlKVxuICB9XG5cbiAgcmFkaXNrLmJhdGNoID0gUmFkaXgoKVxuICByYWRpc2suYmF0Y2guYWNrcyA9IFtdXG4gIHJhZGlzay5iYXRjaC5lZCA9IDBcblxuICByYWRpc2sudGhyYXNoID0gKCkgPT4ge1xuICAgIGlmIChyYWRpc2sudGhyYXNoLmluZykge1xuICAgICAgcmV0dXJuIChyYWRpc2sudGhyYXNoLm1vcmUgPSB0cnVlKVxuICAgIH1cblxuICAgIGNsZWFyVGltZW91dChyYWRpc2suYmF0Y2gudGltZW91dClcbiAgICByYWRpc2sudGhyYXNoLm1vcmUgPSBmYWxzZVxuICAgIHJhZGlzay50aHJhc2guaW5nID0gdHJ1ZVxuICAgIHZhciBiYXRjaCA9IChyYWRpc2sudGhyYXNoLmF0ID0gcmFkaXNrLmJhdGNoKVxuICAgIHJhZGlzay5iYXRjaCA9IG51bGxcbiAgICByYWRpc2suYmF0Y2ggPSBSYWRpeCgpXG4gICAgcmFkaXNrLmJhdGNoLmFja3MgPSBbXVxuICAgIHJhZGlzay5iYXRjaC5lZCA9IDBcbiAgICBsZXQgaSA9IDBcbiAgICByYWRpc2suc2F2ZShiYXRjaCwgZXJyID0+IHtcbiAgICAgIC8vIFRoaXMgaXMgdG8gaWdub3JlIG11bHRpcGxlIGNhbGxiYWNrcyBmcm9tIHJhZGlzay5zYXZlIGNhbGxpbmdcbiAgICAgIC8vIHJhZGlzay53cml0ZT8gSXQgbG9va3MgbGlrZSBtdWx0aXBsZSBjYWxsYmFja3Mgd2lsbCBiZSBtYWRlIGlmIGFcbiAgICAgIC8vIGZpbGUgbmVlZHMgdG8gYmUgc3BsaXQuXG4gICAgICBpZiAoKytpID4gMSkgcmV0dXJuXG5cbiAgICAgIGlmIChlcnIpIG9wdC5sb2coZXJyKVxuICAgICAgYmF0Y2guYWNrcy5mb3JFYWNoKGNiID0+IGNiKGVycikpXG4gICAgICByYWRpc2sudGhyYXNoLmF0ID0gbnVsbFxuICAgICAgcmFkaXNrLnRocmFzaC5pbmcgPSBmYWxzZVxuICAgICAgaWYgKHJhZGlzay50aHJhc2gubW9yZSkgcmFkaXNrLnRocmFzaCgpXG4gICAgfSlcbiAgfVxuXG4gIC8vIDEuIEZpbmQgdGhlIGZpcnN0IHJhZGl4IGl0ZW0gaW4gbWVtb3J5XG4gIC8vIDIuIFVzZSB0aGF0IGFzIHRoZSBzdGFydGluZyBpbmRleCBpbiB0aGUgZGlyZWN0b3J5IG9mIGZpbGVzXG4gIC8vIDMuIEZpbmQgdGhlIGZpcnN0IGZpbGUgdGhhdCBpcyBsZXhpY2FsbHkgbGFyZ2VyIHRoYW4gaXRcbiAgLy8gNC4gUmVhZCB0aGUgcHJldmlvdXMgZmlsZSBpbnRvIG1lbW9yeVxuICAvLyA1LiBTY2FuIHRocm91Z2ggaW4gbWVtb3J5IHJhZGl4IGZvciBhbGwgdmFsdWVzIGxleGljYWxseSBsZXNzIHRoYW4gbGltaXRcbiAgLy8gNi4gTWVyZ2UgYW5kIHdyaXRlIGFsbCBvZiB0aG9zZSB0byB0aGUgaW4tbWVtb3J5IGZpbGUgYW5kIGJhY2sgdG8gZGlza1xuICAvLyA3LiBJZiBmaWxlIGlzIHRvIGxhcmdlIHRoZW4gc3BsaXQuIE1vcmUgZGV0YWlscyBuZWVkZWQgaGVyZVxuICByYWRpc2suc2F2ZSA9IChyYWQsIGNiKSA9PiB7XG4gICAgY29uc3Qgc2F2ZSA9IHtcbiAgICAgIGZpbmQ6ICh0cmVlLCBrZXkpID0+IHtcbiAgICAgICAgLy8gVGhpcyBpcyBmYWxzZSBmb3IgYW55IGtleSB1bnRpbCBzYXZlLnN0YXJ0IGlzIHNldCB0byBhbiBpbml0aWFsIGtleS5cbiAgICAgICAgaWYgKGtleSA8IHNhdmUuc3RhcnQpIHJldHVyblxuXG4gICAgICAgIHNhdmUuc3RhcnQgPSBrZXlcbiAgICAgICAgb3B0LnN0b3JlLmxpc3Qoc2F2ZS5sZXgpXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9LFxuICAgICAgbGV4OiBmaWxlID0+IHtcbiAgICAgICAgaWYgKCFmaWxlIHx8IGZpbGUgPiBzYXZlLnN0YXJ0KSB7XG4gICAgICAgICAgc2F2ZS5lbmQgPSBmaWxlXG4gICAgICAgICAgLy8gISBpcyB1c2VkIGFzIHRoZSBmaXJzdCBmaWxlIG5hbWUgYXMgaXQncyB0aGUgZmlyc3QgcHJpbnRhYmxlXG4gICAgICAgICAgLy8gY2hhcmFjdGVyLCBzbyBhbHdheXMgbWF0Y2hlcyBhcyBsZXhpY2FsbHkgbGVzcyB0aGFuIGFueSBub2RlLlxuICAgICAgICAgIHNhdmUubWl4KHNhdmUuZmlsZSB8fCBcIiFcIiwgc2F2ZS5zdGFydCwgc2F2ZS5lbmQpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHNhdmUuZmlsZSA9IGZpbGVcbiAgICAgIH0sXG4gICAgICBtaXg6IChmaWxlLCBzdGFydCwgZW5kKSA9PiB7XG4gICAgICAgIHNhdmUuc3RhcnQgPSBzYXZlLmVuZCA9IHNhdmUuZmlsZSA9IHVcbiAgICAgICAgcmFkaXNrLnBhcnNlKGZpbGUsIChlcnIsIGRpc2spID0+IHtcbiAgICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuXG4gICAgICAgICAgUmFkaXgubWFwKHJhZCwgKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgIGlmIChrZXkgPCBzdGFydCkgcmV0dXJuXG5cbiAgICAgICAgICAgIGlmIChlbmQgJiYgZW5kIDwga2V5KSB7XG4gICAgICAgICAgICAgIHNhdmUuc3RhcnQgPSBrZXlcbiAgICAgICAgICAgICAgcmV0dXJuIHNhdmUuc3RhcnRcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZGlzayhrZXksIHZhbHVlKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgcmFkaXNrLndyaXRlKGZpbGUsIGRpc2ssIHNhdmUubmV4dClcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBuZXh0OiBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuXG4gICAgICAgIGlmIChzYXZlLnN0YXJ0KSByZXR1cm4gUmFkaXgubWFwKHJhZCwgc2F2ZS5maW5kKVxuXG4gICAgICAgIGNiKGVycilcbiAgICAgIH0sXG4gICAgfVxuICAgIFJhZGl4Lm1hcChyYWQsIHNhdmUuZmluZClcbiAgfVxuXG4gIHJhZGlzay53cml0ZSA9IChmaWxlLCByYWQsIGNiKSA9PiB7XG4gICAgLy8gSW52YWxpZGF0ZSBjYWNoZSBvbiB3cml0ZS5cbiAgICBjYWNoZSA9IG51bGxcbiAgICBjb25zdCB3cml0ZSA9IHtcbiAgICAgIHRleHQ6IFwiXCIsXG4gICAgICBjb3VudDogMCxcbiAgICAgIGZpbGU6IGZpbGUsXG4gICAgICBlYWNoOiAodmFsdWUsIGtleSwgaywgcHJlKSA9PiB7XG4gICAgICAgIHdyaXRlLmNvdW50KytcbiAgICAgICAgdmFyIGVuYyA9XG4gICAgICAgICAgUmFkaXNrLmVuY29kZShwcmUubGVuZ3RoKSArXG4gICAgICAgICAgXCIjXCIgK1xuICAgICAgICAgIFJhZGlzay5lbmNvZGUoaykgK1xuICAgICAgICAgICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIgPyBcIlwiIDogXCI9XCIgKyBSYWRpc2suZW5jb2RlKHZhbHVlKSkgK1xuICAgICAgICAgIFwiXFxuXCJcbiAgICAgICAgLy8gQ2Fubm90IHNwbGl0IHRoZSBmaWxlIGlmIG9ubHkgaGF2ZSBvbmUgZW50cnkgdG8gd3JpdGUuXG4gICAgICAgIGlmICh3cml0ZS5jb3VudCA+IDEgJiYgd3JpdGUudGV4dC5sZW5ndGggKyBlbmMubGVuZ3RoID4gb3B0LnNpemUpIHtcbiAgICAgICAgICB3cml0ZS50ZXh0ID0gXCJcIlxuICAgICAgICAgIC8vIE90aGVyd2lzZSBzcGxpdCB0aGUgZW50cmllcyBpbiBoYWxmLlxuICAgICAgICAgIHdyaXRlLmxpbWl0ID0gTWF0aC5jZWlsKHdyaXRlLmNvdW50IC8gMilcbiAgICAgICAgICB3cml0ZS5jb3VudCA9IDBcbiAgICAgICAgICB3cml0ZS5zdWIgPSBSYWRpeCgpXG4gICAgICAgICAgUmFkaXgubWFwKHJhZCwgd3JpdGUuc2xpY2UpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHdyaXRlLnRleHQgKz0gZW5jXG4gICAgICB9LFxuICAgICAgcHV0OiAoKSA9PiB7XG4gICAgICAgIG9wdC5zdG9yZS5wdXQoZmlsZSwgd3JpdGUudGV4dCwgY2IpXG4gICAgICB9LFxuICAgICAgc2xpY2U6ICh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPCB3cml0ZS5maWxlKSByZXR1cm5cblxuICAgICAgICBpZiAoKyt3cml0ZS5jb3VudCA+IHdyaXRlLmxpbWl0KSB7XG4gICAgICAgICAgdmFyIG5hbWUgPSB3cml0ZS5maWxlXG4gICAgICAgICAgLy8gVXNlIG9ubHkgdGhlIHNvdWwgb2YgdGhlIGtleSBhcyB0aGUgZmlsZW5hbWUgc28gdGhhdCBhbGxcbiAgICAgICAgICAvLyBwcm9wZXJ0aWVzIG9mIGEgc291bCBhcmUgd3JpdHRlbiB0byB0aGUgc2FtZSBmaWxlLlxuICAgICAgICAgIGxldCBlbmQgPSBrZXkuaW5kZXhPZihlbnEpXG4gICAgICAgICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgICAgICAgIHdyaXRlLmZpbGUgPSBrZXlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgd3JpdGUuZmlsZSA9IGtleS5zdWJzdHJpbmcoMCwgZW5kKVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyB3cml0ZS5saW1pdCBjYW4gYmUgcmVhY2hlZCBhZnRlciBhbHJlYWR5IHdyaXRpbmcgcHJvcGVydGllcyBvZlxuICAgICAgICAgIC8vIHRoZSBjdXJyZW50IG5vZGUsIHNvIHJlbW92ZSBpdCBmcm9tIHdyaXRlLnN1YiBiZWZvcmUgd3JpdGluZyB0b1xuICAgICAgICAgIC8vIGRpc2sgc28gdGhhdCBpdCdzIG5vdCBkdXBsaWNhdGVkIGFjcm9zcyBmaWxlcy5cbiAgICAgICAgICB3cml0ZS5zdWIod3JpdGUuZmlsZSwgbnVsbClcbiAgICAgICAgICB3cml0ZS5jb3VudCA9IDBcbiAgICAgICAgICByYWRpc2sud3JpdGUobmFtZSwgd3JpdGUuc3ViLCB3cml0ZS5uZXh0KVxuICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH1cblxuICAgICAgICB3cml0ZS5zdWIoa2V5LCB2YWx1ZSlcbiAgICAgIH0sXG4gICAgICBuZXh0OiBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuXG4gICAgICAgIHdyaXRlLnN1YiA9IFJhZGl4KClcbiAgICAgICAgaWYgKCFSYWRpeC5tYXAocmFkLCB3cml0ZS5zbGljZSkpIHtcbiAgICAgICAgICByYWRpc2sud3JpdGUod3JpdGUuZmlsZSwgd3JpdGUuc3ViLCBjYilcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9XG4gICAgLy8gSWYgUmFkaXgubWFwIGRvZXNuJ3QgcmV0dXJuIHRydWUgd2hlbiBjYWxsZWQgd2l0aCB3cml0ZS5lYWNoIGFzIGFcbiAgICAvLyBjYWxsYmFjayB0aGVuIGRpZG4ndCBuZWVkIHRvIHNwbGl0IHRoZSBkYXRhLiBUaGUgYWNjdW11bGF0ZWQgd3JpdGUudGV4dFxuICAgIC8vIGNhbiB0aGVuIGJlIHN0b3JlZCB3aXRoIHdyaXRlLnB1dCgpLlxuICAgIGlmICghUmFkaXgubWFwKHJhZCwgd3JpdGUuZWFjaCwgdHJ1ZSkpIHdyaXRlLnB1dCgpXG4gIH1cblxuICByYWRpc2sucmVhZCA9IChrZXksIGNiKSA9PiB7XG4gICAgaWYgKGNhY2hlKSB7XG4gICAgICBsZXQgdmFsdWUgPSBjYWNoZShrZXkpXG4gICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gY2IodSwgdmFsdWUpXG4gICAgfVxuICAgIC8vIE9ubHkgdGhlIHNvdWwgb2YgdGhlIGtleSBpcyBjb21wYXJlZCB0byBmaWxlbmFtZXMgKHNlZSByYWRpc2sud3JpdGUpLlxuICAgIGxldCBzb3VsID0ga2V5XG4gICAgbGV0IGVuZCA9IGtleS5pbmRleE9mKGVucSlcbiAgICBpZiAoZW5kICE9PSAtMSkge1xuICAgICAgc291bCA9IGtleS5zdWJzdHJpbmcoMCwgZW5kKVxuICAgIH1cblxuICAgIGNvbnN0IHJlYWQgPSB7XG4gICAgICBsZXg6IGZpbGUgPT4ge1xuICAgICAgICAvLyBzdG9yZS5saXN0IHNob3VsZCBjYWxsIGxleCB3aXRob3V0IGEgZmlsZSBsYXN0LCB3aGljaCBtZWFucyBhbGwgZmlsZVxuICAgICAgICAvLyBuYW1lcyB3ZXJlIGNvbXBhcmVkIHRvIHNvdWwsIHNvIHRoZSBjdXJyZW50IHJlYWQuZmlsZSBpcyBvayB0byB1c2UuXG4gICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgIGlmICghcmVhZC5maWxlKSB7XG4gICAgICAgICAgICBjYihcIm5vIGZpbGUgZm91bmRcIiwgdSlcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIHJhZGlzay5wYXJzZShyZWFkLmZpbGUsIHJlYWQuaXQpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBXYW50IHRoZSBmaWxlbmFtZSBjbG9zZXN0IHRvIHNvdWwuXG4gICAgICAgIGlmIChmaWxlID4gc291bCB8fCBmaWxlIDwgcmVhZC5maWxlKSByZXR1cm5cblxuICAgICAgICByZWFkLmZpbGUgPSBmaWxlXG4gICAgICB9LFxuICAgICAgaXQ6IChlcnIsIGRpc2spID0+IHtcbiAgICAgICAgaWYgKGVycikgb3B0LmxvZyhlcnIpXG4gICAgICAgIGlmIChkaXNrKSB7XG4gICAgICAgICAgY2FjaGUgPSBkaXNrXG4gICAgICAgICAgcmVhZC52YWx1ZSA9IGRpc2soa2V5KVxuICAgICAgICB9XG4gICAgICAgIGNiKGVyciwgcmVhZC52YWx1ZSlcbiAgICAgIH0sXG4gICAgfVxuICAgIG9wdC5zdG9yZS5saXN0KHJlYWQubGV4KVxuICB9XG5cbiAgLy8gTGV0IHVzIHN0YXJ0IGJ5IGFzc3VtaW5nIHdlIGFyZSB0aGUgb25seSBwcm9jZXNzIHRoYXQgaXNcbiAgLy8gY2hhbmdpbmcgdGhlIGRpcmVjdG9yeSBvciBidWNrZXQuIE5vdCBiZWNhdXNlIHdlIGRvIG5vdCB3YW50XG4gIC8vIHRvIGJlIG11bHRpLXByb2Nlc3MvbWFjaGluZSwgYnV0IGJlY2F1c2Ugd2Ugd2FudCB0byBleHBlcmltZW50XG4gIC8vIHdpdGggaG93IG11Y2ggcGVyZm9ybWFuY2UgYW5kIHNjYWxlIHdlIGNhbiBnZXQgb3V0IG9mIG9ubHkgb25lLlxuICAvLyBUaGVuIHdlIGNhbiB3b3JrIG9uIHRoZSBoYXJkZXIgcHJvYmxlbSBvZiBiZWluZyBtdWx0aS1wcm9jZXNzLlxuICByYWRpc2sucGFyc2UgPSAoZmlsZSwgY2IpID0+IHtcbiAgICBjb25zdCBwYXJzZSA9IHtcbiAgICAgIGRpc2s6IFJhZGl4KCksXG4gICAgICByZWFkOiAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgICAgaWYgKCFkYXRhKSByZXR1cm4gY2IodSwgcGFyc2UuZGlzaylcblxuICAgICAgICBsZXQgcHJlID0gW11cbiAgICAgICAgLy8gV29yayB0aG91Z2ggZGF0YSBieSBzcGxpdHRpbmcgaW50byAzIHZhbHVlcy4gVGhlIGZpcnN0IHZhbHVlIHNheXNcbiAgICAgICAgLy8gaWYgdGhlIHNlY29uZCB2YWx1ZSBpcyBvbmUgb2Y6IHRoZSByYWRpeCBsZXZlbCBmb3IgYSBrZXksIHRoZSBrZXlcbiAgICAgICAgLy8gaXRlc2VsZiwgb3IgYSB2YWx1ZS4gVGhlIHRoaXJkIGlzIHRoZSByZXN0IG9mIHRoZSBkYXRhIHRvIHdvcmsgd2l0aC5cbiAgICAgICAgbGV0IHRtcCA9IHBhcnNlLnNwbGl0KGRhdGEpXG4gICAgICAgIHdoaWxlICh0bXApIHtcbiAgICAgICAgICBsZXQga2V5XG4gICAgICAgICAgbGV0IHZhbHVlXG4gICAgICAgICAgbGV0IGkgPSB0bXBbMV1cbiAgICAgICAgICB0bXAgPSBwYXJzZS5zcGxpdCh0bXBbMl0pIHx8IFwiXCJcbiAgICAgICAgICBpZiAodG1wWzBdID09PSBcIiNcIikge1xuICAgICAgICAgICAga2V5ID0gdG1wWzFdXG4gICAgICAgICAgICBwcmUgPSBwcmUuc2xpY2UoMCwgaSlcbiAgICAgICAgICAgIGlmIChpIDw9IHByZS5sZW5ndGgpIHByZS5wdXNoKGtleSlcbiAgICAgICAgICB9XG4gICAgICAgICAgdG1wID0gcGFyc2Uuc3BsaXQodG1wWzJdKSB8fCBcIlwiXG4gICAgICAgICAgaWYgKHRtcFswXSA9PT0gXCJcXG5cIikgY29udGludWVcblxuICAgICAgICAgIGlmICh0bXBbMF0gPT09IFwiPVwiKSB2YWx1ZSA9IHRtcFsxXVxuICAgICAgICAgIGlmICh0eXBlb2Yga2V5ICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiB2YWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgcGFyc2UuZGlzayhwcmUuam9pbihcIlwiKSwgdmFsdWUpXG4gICAgICAgICAgfVxuICAgICAgICAgIHRtcCA9IHBhcnNlLnNwbGl0KHRtcFsyXSlcbiAgICAgICAgfVxuICAgICAgICBjYih1LCBwYXJzZS5kaXNrKVxuICAgICAgfSxcbiAgICAgIHNwbGl0OiBkYXRhID0+IHtcbiAgICAgICAgaWYgKCFkYXRhKSByZXR1cm5cblxuICAgICAgICBsZXQgaSA9IC0xXG4gICAgICAgIGxldCBhID0gXCJcIlxuICAgICAgICBsZXQgYyA9IG51bGxcbiAgICAgICAgd2hpbGUgKChjID0gZGF0YVsrK2ldKSkge1xuICAgICAgICAgIGlmIChjID09PSB1bml0KSBicmVha1xuXG4gICAgICAgICAgYSArPSBjXG4gICAgICAgIH1cbiAgICAgICAgbGV0IG8gPSB7fVxuICAgICAgICBpZiAoYykge1xuICAgICAgICAgIHJldHVybiBbYSwgUmFkaXNrLmRlY29kZShkYXRhLnNsaWNlKGkpLCBvKSwgZGF0YS5zbGljZShpICsgby5pKV1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9XG4gICAgb3B0LnN0b3JlLmdldChmaWxlLCBwYXJzZS5yZWFkKVxuICB9XG5cbiAgcmV0dXJuIHJhZGlza1xufVxuXG5SYWRpc2suZW5jb2RlID0gZGF0YSA9PiB7XG4gIC8vIEEga2V5IHNob3VsZCBiZSBwYXNzZWQgaW4gYXMgYSBzdHJpbmcgdG8gZW5jb2RlLCBhIHZhbHVlIGNhbiBvcHRpb25hbGx5IGJlXG4gIC8vIGFuIGFycmF5IG9mIDIgaXRlbXMgdG8gaW5jbHVkZSB0aGUgdmFsdWUncyBzdGF0ZSwgYXMgaXMgZG9uZSBieSBzdG9yZS5qcy5cbiAgbGV0IHN0YXRlID0gXCJcIlxuICBpZiAoZGF0YSBpbnN0YW5jZW9mIEFycmF5ICYmIGRhdGEubGVuZ3RoID09PSAyKSB7XG4gICAgc3RhdGUgPSBldHggKyBkYXRhWzFdXG4gICAgZGF0YSA9IGRhdGFbMF1cbiAgfVxuXG4gIGlmICh0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIikge1xuICAgIGxldCBpID0gMFxuICAgIGxldCBjdXJyZW50ID0gbnVsbFxuICAgIGxldCB0ZXh0ID0gdW5pdFxuICAgIHdoaWxlICgoY3VycmVudCA9IGRhdGFbaSsrXSkpIHtcbiAgICAgIGlmIChjdXJyZW50ID09PSB1bml0KSB0ZXh0ICs9IHVuaXRcbiAgICB9XG4gICAgcmV0dXJuIHRleHQgKyAnXCInICsgZGF0YSArIHN0YXRlICsgdW5pdFxuICB9XG5cbiAgY29uc3QgcmVsID0gdXRpbHMucmVsLmlzKGRhdGEpXG4gIGlmIChyZWwpIHJldHVybiB1bml0ICsgXCIjXCIgKyByZWwgKyBzdGF0ZSArIHVuaXRcblxuICBpZiAodXRpbHMubnVtLmlzKGRhdGEpKSByZXR1cm4gdW5pdCArIFwiK1wiICsgKGRhdGEgfHwgMCkgKyBzdGF0ZSArIHVuaXRcblxuICBpZiAoZGF0YSA9PT0gdHJ1ZSkgcmV0dXJuIHVuaXQgKyBcIitcIiArIHN0YXRlICsgdW5pdFxuXG4gIGlmIChkYXRhID09PSBmYWxzZSkgcmV0dXJuIHVuaXQgKyBcIi1cIiArIHN0YXRlICsgdW5pdFxuXG4gIGlmIChkYXRhID09PSBudWxsKSByZXR1cm4gdW5pdCArIFwiIFwiICsgc3RhdGUgKyB1bml0XG59XG5cblJhZGlzay5kZWNvZGUgPSAoZGF0YSwgb2JqKSA9PiB7XG4gIHZhciB0ZXh0ID0gXCJcIlxuICB2YXIgaSA9IC0xXG4gIHZhciBuID0gMFxuICB2YXIgY3VycmVudCA9IG51bGxcbiAgdmFyIHByZXZpb3VzID0gbnVsbFxuICBpZiAoZGF0YVswXSAhPT0gdW5pdCkgcmV0dXJuXG5cbiAgLy8gRmluZCBhIGNvbnRyb2wgY2hhcmFjdGVyIHByZXZpb3VzIHRvIHRoZSB0ZXh0IHdlIHdhbnQsIHNraXBwaW5nXG4gIC8vIGNvbnNlY3V0aXZlIHVuaXQgc2VwYXJhdG9yIGNoYXJhY3RlcnMgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgZGF0YS5cbiAgd2hpbGUgKChjdXJyZW50ID0gZGF0YVsrK2ldKSkge1xuICAgIGlmIChwcmV2aW91cykge1xuICAgICAgaWYgKGN1cnJlbnQgPT09IHVuaXQpIHtcbiAgICAgICAgaWYgKC0tbiA8PSAwKSBicmVha1xuICAgICAgfVxuICAgICAgdGV4dCArPSBjdXJyZW50XG4gICAgfSBlbHNlIGlmIChjdXJyZW50ID09PSB1bml0KSB7XG4gICAgICBuKytcbiAgICB9IGVsc2Uge1xuICAgICAgcHJldmlvdXMgPSBjdXJyZW50IHx8IHRydWVcbiAgICB9XG4gIH1cblxuICBpZiAob2JqKSBvYmouaSA9IGkgKyAxXG5cbiAgbGV0IFt2YWx1ZSwgc3RhdGVdID0gdGV4dC5zcGxpdChldHgpXG4gIGlmICghc3RhdGUpIHtcbiAgICBpZiAocHJldmlvdXMgPT09ICdcIicpIHJldHVybiB0ZXh0XG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiI1wiKSByZXR1cm4gdXRpbHMucmVsLmlmeSh0ZXh0KVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIitcIikge1xuICAgICAgaWYgKHRleHQubGVuZ3RoID09PSAwKSByZXR1cm4gdHJ1ZVxuXG4gICAgICByZXR1cm4gcGFyc2VGbG9hdCh0ZXh0KVxuICAgIH1cblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCItXCIpIHJldHVybiBmYWxzZVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIiBcIikgcmV0dXJuIG51bGxcbiAgfSBlbHNlIHtcbiAgICBzdGF0ZSA9IHBhcnNlRmxvYXQoc3RhdGUpXG4gICAgLy8gSWYgc3RhdGUgd2FzIGZvdW5kIHRoZW4gcmV0dXJuIGFuIGFycmF5LlxuICAgIGlmIChwcmV2aW91cyA9PT0gJ1wiJykgcmV0dXJuIFt2YWx1ZSwgc3RhdGVdXG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiI1wiKSByZXR1cm4gW3V0aWxzLnJlbC5pZnkodmFsdWUpLCBzdGF0ZV1cblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCIrXCIpIHtcbiAgICAgIGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHJldHVybiBbdHJ1ZSwgc3RhdGVdXG5cbiAgICAgIHJldHVybiBbcGFyc2VGbG9hdCh2YWx1ZSksIHN0YXRlXVxuICAgIH1cblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCItXCIpIHJldHVybiBbZmFsc2UsIHN0YXRlXVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIiBcIikgcmV0dXJuIFtudWxsLCBzdGF0ZV1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFJhZGlza1xuIiwiY29uc3QgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKVxuXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIGdyb3VwIHNlcGFyYXRvci5cbmNvbnN0IGdyb3VwID0gU3RyaW5nLmZyb21DaGFyQ29kZSgyOSlcbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgcmVjb3JkIHNlcGFyYXRvci5cbmNvbnN0IHJlY29yZCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMzApXG5cbmNvbnN0IFJhZGl4ID0gKCkgPT4ge1xuICBjb25zdCByYWRpeCA9IChrZXlzLCB2YWx1ZSwgdHJlZSkgPT4ge1xuICAgIGlmICghdHJlZSkge1xuICAgICAgaWYgKCFyYWRpeFtncm91cF0pIHJhZGl4W2dyb3VwXSA9IHt9XG4gICAgICB0cmVlID0gcmFkaXhbZ3JvdXBdXG4gICAgfVxuICAgIGlmICgha2V5cykgcmV0dXJuIHRyZWVcblxuICAgIGxldCBpID0gMFxuICAgIGxldCB0bXAgPSB7fVxuICAgIGxldCBrZXkgPSBrZXlzW2ldXG4gICAgY29uc3QgbWF4ID0ga2V5cy5sZW5ndGggLSAxXG4gICAgY29uc3Qgbm9WYWx1ZSA9IHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIlxuICAgIC8vIEZpbmQgYSBtYXRjaGluZyB2YWx1ZSB1c2luZyB0aGUgc2hvcnRlc3Qgc3RyaW5nIGZyb20ga2V5cy5cbiAgICBsZXQgZm91bmQgPSB0cmVlW2tleV1cbiAgICB3aGlsZSAoIWZvdW5kICYmIGkgPCBtYXgpIHtcbiAgICAgIGtleSArPSBrZXlzWysraV1cbiAgICAgIGZvdW5kID0gdHJlZVtrZXldXG4gICAgfVxuXG4gICAgaWYgKCFmb3VuZCkge1xuICAgICAgLy8gSWYgbm90IGZvdW5kIGZyb20gdGhlIHByb3ZpZGVkIGtleXMgdHJ5IG1hdGNoaW5nIHdpdGggYW4gZXhpc3Rpbmcga2V5LlxuICAgICAgY29uc3QgcmVzdWx0ID0gdXRpbHMub2JqLm1hcCh0cmVlLCAoaGFzVmFsdWUsIGhhc0tleSkgPT4ge1xuICAgICAgICBsZXQgaiA9IDBcbiAgICAgICAgbGV0IG1hdGNoaW5nS2V5ID0gXCJcIlxuICAgICAgICB3aGlsZSAoaGFzS2V5W2pdID09PSBrZXlzW2pdKSB7XG4gICAgICAgICAgbWF0Y2hpbmdLZXkgKz0gaGFzS2V5W2orK11cbiAgICAgICAgfVxuICAgICAgICBpZiAobWF0Y2hpbmdLZXkpIHtcbiAgICAgICAgICBpZiAobm9WYWx1ZSkge1xuICAgICAgICAgICAgLy8gbWF0Y2hpbmdLZXkgaGFzIHRvIGJlIGFzIGxvbmcgYXMgdGhlIG9yaWdpbmFsIGtleXMgd2hlbiByZWFkaW5nLlxuICAgICAgICAgICAgaWYgKGogPD0gbWF4KSByZXR1cm5cblxuICAgICAgICAgICAgdG1wW2hhc0tleS5zbGljZShqKV0gPSBoYXNWYWx1ZVxuICAgICAgICAgICAgcmV0dXJuIGhhc1ZhbHVlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IHJlcGxhY2UgPSB7XG4gICAgICAgICAgICBbaGFzS2V5LnNsaWNlKGopXTogaGFzVmFsdWUsXG4gICAgICAgICAgICBba2V5cy5zbGljZShqKV06IHtbcmVjb3JkXTogdmFsdWV9LFxuICAgICAgICAgIH1cbiAgICAgICAgICB0cmVlW21hdGNoaW5nS2V5XSA9IHtbZ3JvdXBdOiByZXBsYWNlfVxuICAgICAgICAgIGRlbGV0ZSB0cmVlW2hhc0tleV1cbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgaWYgKG5vVmFsdWUpIHJldHVyblxuXG4gICAgICAgIGlmICghdHJlZVtrZXldKSB0cmVlW2tleV0gPSB7fVxuICAgICAgICB0cmVlW2tleV1bcmVjb3JkXSA9IHZhbHVlXG4gICAgICB9IGVsc2UgaWYgKG5vVmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHRtcFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaSA9PT0gbWF4KSB7XG4gICAgICAvLyBJZiBubyB2YWx1ZSB1c2UgdGhlIGtleSBwcm92aWRlZCB0byByZXR1cm4gYSB3aG9sZSBncm91cCBvciByZWNvcmQuXG4gICAgICBpZiAobm9WYWx1ZSkge1xuICAgICAgICAvLyBJZiBhbiBpbmRpdmlkdWFsIHJlY29yZCBpc24ndCBmb3VuZCB0aGVuIHJldHVybiB0aGUgd2hvbGUgZ3JvdXAuXG4gICAgICAgIHJldHVybiB0eXBlb2YgZm91bmRbcmVjb3JkXSA9PT0gXCJ1bmRlZmluZWRcIlxuICAgICAgICAgID8gZm91bmRbZ3JvdXBdXG4gICAgICAgICAgOiBmb3VuZFtyZWNvcmRdXG4gICAgICB9XG4gICAgICAvLyBPdGhlcndpc2UgY3JlYXRlIGEgbmV3IHJlY29yZCBhdCB0aGUgcHJvdmlkZWQga2V5IGZvciB2YWx1ZS5cbiAgICAgIGZvdW5kW3JlY29yZF0gPSB2YWx1ZVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGb3VuZCBhdCBhIHNob3J0ZXIga2V5LCB0cnkgYWdhaW4uXG4gICAgICBpZiAoIWZvdW5kW2dyb3VwXSAmJiAhbm9WYWx1ZSkgZm91bmRbZ3JvdXBdID0ge31cbiAgICAgIHJldHVybiByYWRpeChrZXlzLnNsaWNlKCsraSksIHZhbHVlLCBmb3VuZFtncm91cF0pXG4gICAgfVxuICB9XG4gIHJldHVybiByYWRpeFxufVxuXG5SYWRpeC5tYXAgPSBmdW5jdGlvbiBtYXAocmFkaXgsIGNiLCBvcHQsIHByZSkge1xuICBpZiAoIXByZSkgcHJlID0gW11cbiAgdmFyIHRyZWUgPSByYWRpeFtncm91cF0gfHwgcmFkaXhcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh0cmVlKS5zb3J0KClcbiAgdmFyIHVcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICBsZXQga2V5ID0ga2V5c1tpXVxuICAgIGxldCBmb3VuZCA9IHRyZWVba2V5XVxuICAgIGxldCB0bXAgPSBmb3VuZFtyZWNvcmRdXG4gICAgaWYgKHR5cGVvZiB0bXAgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHRtcCA9IGNiKHRtcCwgcHJlLmpvaW4oXCJcIikgKyBrZXksIGtleSwgcHJlKVxuICAgICAgaWYgKHR5cGVvZiB0bXAgIT09IFwidW5kZWZpbmVkXCIpIHJldHVybiB0bXBcbiAgICB9IGVsc2UgaWYgKG9wdCkge1xuICAgICAgY2IodSwgcHJlLmpvaW4oXCJcIiksIGtleSwgcHJlKVxuICAgIH1cbiAgICBpZiAoZm91bmRbZ3JvdXBdKSB7XG4gICAgICBwcmUucHVzaChrZXkpXG4gICAgICB0bXAgPSBtYXAoZm91bmRbZ3JvdXBdLCBjYiwgb3B0LCBwcmUpXG4gICAgICBpZiAodHlwZW9mIHRtcCAhPT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIHRtcFxuICAgICAgcHJlLnBvcCgpXG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmFkaXhcbiIsImNvbnN0IGpzRW52ID0gcmVxdWlyZShcImJyb3dzZXItb3Itbm9kZVwiKVxuY29uc3QgUmFkaXNrID0gcmVxdWlyZShcIi4vcmFkaXNrXCIpXG5jb25zdCBSYWRpeCA9IHJlcXVpcmUoXCIuL3JhZGl4XCIpXG5jb25zdCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpXG5cbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgZW5xdWlyeS5cbmNvbnN0IGVucSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoNSlcbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgdW5pdCBzZXBhcmF0b3IuXG5jb25zdCB1bml0ID0gU3RyaW5nLmZyb21DaGFyQ29kZSgzMSlcbi8vIE9uLWRpc2sgcm9vdCBub2RlIGZvcm1hdC5cbmNvbnN0IHJvb3QgPSB1bml0ICsgXCIrMFwiICsgdW5pdCArIFwiI1wiICsgdW5pdCArICdcInJvb3QnICsgdW5pdFxuXG5jb25zdCBmaWxlU3lzdGVtID0gb3B0ID0+IHtcbiAgY29uc3QgZGlyID0gb3B0LmZpbGVcblxuICBpZiAoanNFbnYuaXNOb2RlKSB7XG4gICAgY29uc3QgZnMgPSByZXF1aXJlKFwiZnNcIilcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZGlyKSkgZnMubWtkaXJTeW5jKGRpcilcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZGlyICsgXCIvIVwiKSkgZnMud3JpdGVGaWxlU3luYyhkaXIgKyBcIi8hXCIsIHJvb3QpXG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0OiAoZmlsZSwgY2IpID0+IHtcbiAgICAgICAgZnMucmVhZEZpbGUoZGlyICsgXCIvXCIgKyBmaWxlLCAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgaWYgKGVyci5jb2RlID09PSBcIkVOT0VOVFwiKSB7XG4gICAgICAgICAgICAgIGNiKClcbiAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiZnMucmVhZEZpbGUgZXJyb3I6XCIsIGVycilcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGRhdGEpIGRhdGEgPSBkYXRhLnRvU3RyaW5nKClcbiAgICAgICAgICBjYihlcnIsIGRhdGEpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcHV0OiAoZmlsZSwgZGF0YSwgY2IpID0+IHtcbiAgICAgICAgdmFyIHJhbmRvbSA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKC05KVxuICAgICAgICAvLyBEb24ndCBwdXQgdG1wIGZpbGVzIHVuZGVyIGRpciBzbyB0aGF0IHRoZXkncmUgbm90IGxpc3RlZC5cbiAgICAgICAgdmFyIHRtcCA9IGZpbGUgKyBcIi5cIiArIHJhbmRvbSArIFwiLnRtcFwiXG4gICAgICAgIGZzLndyaXRlRmlsZSh0bXAsIGRhdGEsIGVyciA9PiB7XG4gICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgY2IoZXJyKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnMucmVuYW1lKHRtcCwgZGlyICsgXCIvXCIgKyBmaWxlLCBjYilcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBsaXN0OiBjYiA9PiB7XG4gICAgICAgIGZzLnJlYWRkaXIoZGlyLCAoZXJyLCBmaWxlcykgPT4ge1xuICAgICAgICAgIGZpbGVzLmZvckVhY2goY2IpXG4gICAgICAgICAgY2IoKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICB9XG4gIH1cblxuICBpZiAob3B0LmluZGV4ZWREQikge1xuICAgIGxldCBkYlxuICAgIGNvbnN0IG8gPSBpbmRleGVkREIub3BlbihkaXIsIDEpXG4gICAgby5vbnVwZ3JhZGVuZWVkZWQgPSBldmVudCA9PiB7XG4gICAgICBldmVudC50YXJnZXQucmVzdWx0LmNyZWF0ZU9iamVjdFN0b3JlKGRpcilcbiAgICB9XG4gICAgby5vbmVycm9yID0gZXZlbnQgPT4ge1xuICAgICAgY29uc29sZS5sb2coZXZlbnQpXG4gICAgfVxuICAgIG8ub25zdWNjZXNzID0gKCkgPT4ge1xuICAgICAgZGIgPSBvLnJlc3VsdFxuICAgICAgLy8gQ3JlYXRlIHRoZSByb290IG5vZGUgaWYgaXQgZG9lc24ndCBleGlzdC5cbiAgICAgIGlmIChkYikge1xuICAgICAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKFtkaXJdLCBcInJlYWRvbmx5XCIpXG4gICAgICAgIGNvbnN0IHJlcSA9IHR4Lm9iamVjdFN0b3JlKGRpcikuZ2V0S2V5KFwiIVwiKVxuICAgICAgICByZXEub25lcnJvciA9ICgpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgZ2V0dGluZyBrZXkgJHtkaXJ9LyFgKVxuICAgICAgICB9XG4gICAgICAgIHJlcS5vbnN1Y2Nlc3MgPSAoKSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXEucmVzdWx0KSB7XG4gICAgICAgICAgICBjb25zdCB0eCA9IGRiLnRyYW5zYWN0aW9uKFtkaXJdLCBcInJlYWR3cml0ZVwiKVxuICAgICAgICAgICAgY29uc3QgcmVxID0gdHgub2JqZWN0U3RvcmUoZGlyKS5wdXQocm9vdCwgXCIhXCIpXG4gICAgICAgICAgICByZXEub25lcnJvciA9ICgpID0+IHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIHB1dHRpbmcgcm9vdCBvbiAke2Rpcn0vIWApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZyhcImVycm9yIGluZGV4ZWREQiBub3QgYXZhaWxhYmxlXCIpXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldDogKGZpbGUsIGNiKSA9PiB7XG4gICAgICAgIGlmIChkYikge1xuICAgICAgICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oW2Rpcl0sIFwicmVhZG9ubHlcIilcbiAgICAgICAgICBjb25zdCByZXEgPSB0eC5vYmplY3RTdG9yZShkaXIpLmdldChmaWxlKVxuICAgICAgICAgIHJlcS5vbmVycm9yID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIGdldHRpbmcgJHtkaXJ9LyR7ZmlsZX1gKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXEub25zdWNjZXNzID0gKCkgPT4ge1xuICAgICAgICAgICAgY2IobnVsbCwgcmVxLnJlc3VsdClcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY2IoXCJlcnJvciBpbmRleGVkREIgbm90IGF2YWlsYWJsZVwiKVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgcHV0OiAoZmlsZSwgZGF0YSwgY2IpID0+IHtcbiAgICAgICAgaWYgKGRiKSB7XG4gICAgICAgICAgY29uc3QgdHggPSBkYi50cmFuc2FjdGlvbihbZGlyXSwgXCJyZWFkd3JpdGVcIilcbiAgICAgICAgICBjb25zdCByZXEgPSB0eC5vYmplY3RTdG9yZShkaXIpLnB1dChkYXRhLCBmaWxlKVxuICAgICAgICAgIHJlcS5vbmVycm9yID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIHB1dHRpbmcgZGF0YSBvbiAke2Rpcn0vJHtmaWxlfWApXG4gICAgICAgICAgfVxuICAgICAgICAgIHJlcS5vbnN1Y2Nlc3MgPSAoKSA9PiB7XG4gICAgICAgICAgICBjYihudWxsKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjYihcImVycm9yIGluZGV4ZWREQiBub3QgYXZhaWxhYmxlXCIpXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBsaXN0OiBjYiA9PiB7XG4gICAgICAgIGlmIChkYikge1xuICAgICAgICAgIGNvbnN0IHR4ID0gZGIudHJhbnNhY3Rpb24oW2Rpcl0sIFwicmVhZG9ubHlcIilcbiAgICAgICAgICBjb25zdCByZXEgPSB0eC5vYmplY3RTdG9yZShkaXIpLmdldEFsbEtleXMoKVxuICAgICAgICAgIHJlcS5vbmVycm9yID0gKCkgPT4gY29uc29sZS5sb2coXCJlcnJvciBnZXR0aW5nIGtleXMgZm9yXCIsIGRpcilcbiAgICAgICAgICByZXEub25zdWNjZXNzID0gKCkgPT4ge1xuICAgICAgICAgICAgcmVxLnJlc3VsdC5mb3JFYWNoKGNiKVxuICAgICAgICAgICAgY2IoKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcImVycm9yIGluZGV4ZWREQiBub3QgYXZhaWxhYmxlXCIpXG4gICAgICAgICAgY2IoKVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIC8vIE5vIGJyb3dzZXIgc3RvcmFnZS5cbiAgcmV0dXJuIHtcbiAgICBnZXQ6IChmaWxlLCBjYikgPT4ge1xuICAgICAgY2IobnVsbCwgcm9vdClcbiAgICB9LFxuICAgIHB1dDogKGZpbGUsIGRhdGEsIGNiKSA9PiB7XG4gICAgICBjYihudWxsKVxuICAgIH0sXG4gICAgbGlzdDogY2IgPT4ge1xuICAgICAgY2IoXCIhXCIpXG4gICAgICBjYigpXG4gICAgfSxcbiAgfVxufVxuXG4vLyBTdG9yZSBwcm92aWRlcyBnZXQgYW5kIHB1dCBtZXRob2RzIHRoYXQgY2FuIGFjY2VzcyByYWRpc2suXG5jb25zdCBTdG9yZSA9IG9wdCA9PiB7XG4gIGlmICghdXRpbHMub2JqLmlzKG9wdCkpIG9wdCA9IHt9XG4gIG9wdC5maWxlID0gU3RyaW5nKG9wdC5maWxlIHx8IFwicmFkYXRhXCIpXG4gIGlmICghb3B0LnN0b3JlKSBvcHQuc3RvcmUgPSBmaWxlU3lzdGVtKG9wdClcbiAgY29uc3QgcmFkaXNrID0gUmFkaXNrKG9wdClcblxuICByZXR1cm4ge1xuICAgIGdldDogKGxleCwgY2IpID0+IHtcbiAgICAgIGlmICghbGV4KSB7XG4gICAgICAgIGNiKFwibGV4IHJlcXVpcmVkXCIpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB2YXIgc291bCA9IGxleFtcIiNcIl1cbiAgICAgIHZhciBrZXkgPSBsZXhbXCIuXCJdIHx8IFwiXCJcbiAgICAgIHZhciBub2RlXG4gICAgICBjb25zdCBlYWNoID0gKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKCFub2RlKSBub2RlID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgbm9kZVtrZXldID0gdmFsdWVbMF1cbiAgICAgICAgbm9kZS5fW1wiPlwiXVtrZXldID0gdmFsdWVbMV1cbiAgICAgIH1cblxuICAgICAgcmFkaXNrKHNvdWwgKyBlbnEgKyBrZXksIChlcnIsIHZhbHVlKSA9PiB7XG4gICAgICAgIGxldCBncmFwaFxuICAgICAgICBpZiAodXRpbHMub2JqLmlzKHZhbHVlKSkge1xuICAgICAgICAgIFJhZGl4Lm1hcCh2YWx1ZSwgZWFjaClcbiAgICAgICAgICBpZiAoIW5vZGUpIGVhY2godmFsdWUsIGtleSlcbiAgICAgICAgICBncmFwaCA9IHtbc291bF06IG5vZGV9XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWUpIHtcbiAgICAgICAgICBlYWNoKHZhbHVlLCBrZXkpXG4gICAgICAgICAgZ3JhcGggPSB7W3NvdWxdOiBub2RlfVxuICAgICAgICB9XG4gICAgICAgIGNiKGVyciwgZ3JhcGgpXG4gICAgICB9KVxuICAgIH0sXG4gICAgcHV0OiAoZ3JhcGgsIGNiKSA9PiB7XG4gICAgICBpZiAoIWdyYXBoKSB7XG4gICAgICAgIGNiKFwiZ3JhcGggcmVxdWlyZWRcIilcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZhciBjb3VudCA9IDBcbiAgICAgIGNvbnN0IGFjayA9IGVyciA9PiB7XG4gICAgICAgIGNvdW50LS1cbiAgICAgICAgaWYgKGFjay5lcnIpIHJldHVyblxuXG4gICAgICAgIGFjay5lcnIgPSBlcnJcbiAgICAgICAgaWYgKGFjay5lcnIpIHtcbiAgICAgICAgICBjYihhY2suZXJyKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNvdW50ID09PSAwKSBjYihudWxsKVxuICAgICAgfVxuXG4gICAgICBPYmplY3Qua2V5cyhncmFwaCkuZm9yRWFjaChzb3VsID0+IHtcbiAgICAgICAgdmFyIG5vZGUgPSBncmFwaFtzb3VsXVxuICAgICAgICBPYmplY3Qua2V5cyhub2RlKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgaWYgKGtleSA9PT0gXCJfXCIpIHJldHVyblxuXG4gICAgICAgICAgY291bnQrK1xuICAgICAgICAgIGxldCB2YWx1ZSA9IG5vZGVba2V5XVxuICAgICAgICAgIGxldCBzdGF0ZSA9IG5vZGUuX1tcIj5cIl1ba2V5XVxuICAgICAgICAgIHJhZGlzayhzb3VsICsgZW5xICsga2V5LCBbdmFsdWUsIHN0YXRlXSwgYWNrKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9LFxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gU3RvcmVcbiIsImNvbnN0IG51bSA9IHtcbiAgaXM6IG4gPT5cbiAgICAhKG4gaW5zdGFuY2VvZiBBcnJheSkgJiZcbiAgICAobiAtIHBhcnNlRmxvYXQobikgKyAxID49IDAgfHwgSW5maW5pdHkgPT09IG4gfHwgLUluZmluaXR5ID09PSBuKSxcbn1cblxuY29uc3Qgb2JqID0ge1xuICBpczogbyA9PiB7XG4gICAgaWYgKCFvKSByZXR1cm4gZmFsc2VcblxuICAgIHJldHVybiAoXG4gICAgICAobyBpbnN0YW5jZW9mIE9iamVjdCAmJiBvLmNvbnN0cnVjdG9yID09PSBPYmplY3QpIHx8XG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobykubWF0Y2goL15cXFtvYmplY3QgKFxcdyspXFxdJC8pWzFdID09PVxuICAgICAgICBcIk9iamVjdFwiXG4gICAgKVxuICB9LFxuICBtYXA6IChsaXN0LCBjYiwgbykgPT4ge1xuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMobGlzdClcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGxldCByZXN1bHQgPSBjYihsaXN0W2tleXNbaV1dLCBrZXlzW2ldLCBvKVxuICAgICAgaWYgKHR5cGVvZiByZXN1bHQgIT09IFwidW5kZWZpbmVkXCIpIHJldHVybiByZXN1bHRcbiAgICB9XG4gIH0sXG4gIHB1dDogKG8sIGtleSwgdmFsdWUpID0+IHtcbiAgICBpZiAoIW8pIG8gPSB7fVxuICAgIG9ba2V5XSA9IHZhbHVlXG4gICAgcmV0dXJuIG9cbiAgfSxcbiAgZGVsOiAobywga2V5KSA9PiB7XG4gICAgaWYgKCFvKSByZXR1cm5cblxuICAgIG9ba2V5XSA9IG51bGxcbiAgICBkZWxldGUgb1trZXldXG4gICAgcmV0dXJuIG9cbiAgfSxcbn1cblxuY29uc3QgbWFwX3NvdWwgPSAoc291bCwga2V5LCBvKSA9PiB7XG4gIC8vIElmIGlkIGlzIGFscmVhZHkgZGVmaW5lZCBBTkQgd2UncmUgc3RpbGwgbG9vcGluZyB0aHJvdWdoIHRoZSBvYmplY3QsXG4gIC8vIHRoZW4gaXQgaXMgY29uc2lkZXJlZCBpbnZhbGlkLlxuICBpZiAoby5pZCkge1xuICAgIG8uaWQgPSBmYWxzZVxuICAgIHJldHVyblxuICB9XG5cbiAgaWYgKGtleSA9PT0gXCIjXCIgJiYgdHlwZW9mIHNvdWwgPT09IFwic3RyaW5nXCIpIHtcbiAgICBvLmlkID0gc291bFxuICAgIHJldHVyblxuICB9XG5cbiAgLy8gSWYgdGhlcmUgZXhpc3RzIGFueXRoaW5nIGVsc2Ugb24gdGhlIG9iamVjdCB0aGF0IGlzbid0IHRoZSBzb3VsLFxuICAvLyB0aGVuIGl0IGlzIGNvbnNpZGVyZWQgaW52YWxpZC5cbiAgby5pZCA9IGZhbHNlXG59XG5cbi8vIENoZWNrIGlmIGFuIG9iamVjdCBpcyBhIHNvdWwgcmVsYXRpb24sIGllIHsnIyc6ICdVVUlEJ31cbmNvbnN0IHJlbCA9IHtcbiAgaXM6IHZhbHVlID0+IHtcbiAgICBpZiAodmFsdWUgJiYgdmFsdWVbXCIjXCJdICYmICF2YWx1ZS5fICYmIG9iai5pcyh2YWx1ZSkpIHtcbiAgICAgIGxldCBvID0ge31cbiAgICAgIG9iai5tYXAodmFsdWUsIG1hcF9zb3VsLCBvKVxuICAgICAgaWYgKG8uaWQpIHJldHVybiBvLmlkXG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlXG4gIH0sXG4gIC8vIENvbnZlcnQgYSBzb3VsIGludG8gYSByZWxhdGlvbiBhbmQgcmV0dXJuIGl0LlxuICBpZnk6IHNvdWwgPT4gb2JqLnB1dCh7fSwgXCIjXCIsIHNvdWwpLFxufVxuXG5jb25zdCB0ZXh0ID0ge1xuICByYW5kb206IGxlbmd0aCA9PiB7XG4gICAgdmFyIHMgPSBcIlwiXG4gICAgY29uc3QgYyA9IFwiMDEyMzQ1Njc4OUFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5elwiXG4gICAgaWYgKCFsZW5ndGgpIGxlbmd0aCA9IDI0XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgcyArPSBjLmNoYXJBdChNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBjLmxlbmd0aCkpXG4gICAgfVxuICAgIHJldHVybiBzXG4gIH0sXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge251bSwgb2JqLCByZWwsIHRleHR9XG4iLCJjb25zdCBqc0VudiA9IHJlcXVpcmUoXCJicm93c2VyLW9yLW5vZGVcIilcbmNvbnN0IER1cCA9IHJlcXVpcmUoXCIuL2R1cFwiKVxuY29uc3QgR2V0ID0gcmVxdWlyZShcIi4vZ2V0XCIpXG5jb25zdCBIYW0gPSByZXF1aXJlKFwiLi9oYW1cIilcbmNvbnN0IFN0b3JlID0gcmVxdWlyZShcIi4vc3RvcmVcIilcbmNvbnN0IHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIilcblxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciBlbnF1aXJ5LlxuY29uc3QgZW5xID0gU3RyaW5nLmZyb21DaGFyQ29kZSg1KVxuXG4vLyBXaXJlIHN0YXJ0cyBhIHdlYnNvY2tldCBjbGllbnQgb3Igc2VydmVyIGFuZCByZXR1cm5zIGdldCBhbmQgcHV0IG1ldGhvZHNcbi8vIGZvciBhY2Nlc3MgdG8gdGhlIHdpcmUgc3BlYyBhbmQgc3RvcmFnZS5cbmNvbnN0IFdpcmUgPSBvcHQgPT4ge1xuICBpZiAoIXV0aWxzLm9iai5pcyhvcHQpKSBvcHQgPSB7fVxuXG4gIGNvbnN0IGR1cCA9IER1cChvcHQubWF4QWdlKVxuICBjb25zdCBzdG9yZSA9IFN0b3JlKG9wdClcbiAgY29uc3QgZ3JhcGggPSB7fVxuICBjb25zdCBxdWV1ZSA9IHt9XG4gIGNvbnN0IGxpc3RlbiA9IHt9XG5cbiAgY29uc3QgZ2V0ID0gKG1zZywgc2VuZCkgPT4ge1xuICAgIGNvbnN0IGFjayA9IEdldChtc2cuZ2V0LCBncmFwaClcbiAgICBpZiAoYWNrKSB7XG4gICAgICBzZW5kKFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgXCIjXCI6IGR1cC50cmFjayh1dGlscy50ZXh0LnJhbmRvbSg5KSksXG4gICAgICAgICAgXCJAXCI6IG1zZ1tcIiNcIl0sXG4gICAgICAgICAgcHV0OiBhY2ssXG4gICAgICAgIH0pLFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICBzdG9yZS5nZXQobXNnLmdldCwgKGVyciwgYWNrKSA9PiB7XG4gICAgICAgIHNlbmQoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgXCIjXCI6IGR1cC50cmFjayh1dGlscy50ZXh0LnJhbmRvbSg5KSksXG4gICAgICAgICAgICBcIkBcIjogbXNnW1wiI1wiXSxcbiAgICAgICAgICAgIHB1dDogYWNrLFxuICAgICAgICAgICAgZXJyOiBlcnIsXG4gICAgICAgICAgfSksXG4gICAgICAgIClcbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgY29uc3QgcHV0ID0gKG1zZywgc2VuZCkgPT4ge1xuICAgIC8vIFN0b3JlIHVwZGF0ZXMgcmV0dXJuZWQgZnJvbSBIYW0ubWl4IGFuZCBkZWZlciB1cGRhdGVzIGlmIHJlcXVpcmVkLlxuICAgIGNvbnN0IHVwZGF0ZSA9IEhhbS5taXgobXNnLnB1dCwgZ3JhcGgsIGxpc3RlbilcbiAgICBzdG9yZS5wdXQodXBkYXRlLm5vdywgZXJyID0+IHtcbiAgICAgIHNlbmQoXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKHV0aWxzLnRleHQucmFuZG9tKDkpKSxcbiAgICAgICAgICBcIkBcIjogbXNnW1wiI1wiXSxcbiAgICAgICAgICBlcnI6IGVycixcbiAgICAgICAgfSksXG4gICAgICApXG4gICAgfSlcbiAgICBpZiAodXBkYXRlLndhaXQgIT09IDApIHtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gcHV0KHtwdXQ6IHVwZGF0ZS5kZWZlcn0sIHNlbmQpLCB1cGRhdGUud2FpdClcbiAgICB9XG4gIH1cblxuICBjb25zdCBhcGkgPSBzZW5kID0+IHtcbiAgICByZXR1cm4ge1xuICAgICAgZ2V0OiAobGV4LCBjYiwgb3B0KSA9PiB7XG4gICAgICAgIGlmICghY2IpIHJldHVyblxuXG4gICAgICAgIGlmICghdXRpbHMub2JqLmlzKG9wdCkpIG9wdCA9IHt9XG4gICAgICAgIGNvbnN0IGFjayA9IEdldChsZXgsIGdyYXBoKVxuICAgICAgICBpZiAoYWNrKSB7XG4gICAgICAgICAgY2Ioe3B1dDogYWNrfSlcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIHN0b3JlLmdldChsZXgsIChlcnIsIGFjaykgPT4ge1xuICAgICAgICAgIGlmIChhY2spIHtcbiAgICAgICAgICAgIGNiKHtwdXQ6IGFjaywgZXJyOiBlcnJ9KVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGVycikgY29uc29sZS5sb2coZXJyKVxuXG4gICAgICAgICAgY29uc3QgdHJhY2sgPSB1dGlscy50ZXh0LnJhbmRvbSg5KVxuICAgICAgICAgIHF1ZXVlW3RyYWNrXSA9IGNiXG4gICAgICAgICAgc2VuZChcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgXCIjXCI6IGR1cC50cmFjayh0cmFjayksXG4gICAgICAgICAgICAgIGdldDogbGV4LFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgKVxuICAgICAgICAgIC8vIFJlc3BvbmQgdG8gY2FsbGJhY2sgd2l0aCBudWxsIGlmIG5vIHJlc3BvbnNlLlxuICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2IgPSBxdWV1ZVt0cmFja11cbiAgICAgICAgICAgIGlmIChjYikge1xuICAgICAgICAgICAgICBjb25zdCBpZCA9IGxleFtcIiNcIl1cbiAgICAgICAgICAgICAgY29uc3QgYWNrID0ge1tpZF06IG51bGx9XG4gICAgICAgICAgICAgIGlmIChsZXhbXCIuXCJdKSBhY2tbaWRdID0ge1tsZXhbXCIuXCJdXTogbnVsbH1cbiAgICAgICAgICAgICAgY2Ioe3B1dDogYWNrfSlcbiAgICAgICAgICAgICAgZGVsZXRlIHF1ZXVlW3RyYWNrXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sIG9wdC53YWl0IHx8IDEwMClcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBwdXQ6IChkYXRhLCBjYikgPT4ge1xuICAgICAgICAvLyBEZWZlcnJlZCB1cGRhdGVzIGFyZSBvbmx5IHN0b3JlZCB1c2luZyB3aXJlIHNwZWMsIHRoZXkncmUgaWdub3JlZFxuICAgICAgICAvLyBoZXJlIHVzaW5nIHRoZSBhcGkuIFRoaXMgaXMgb2sgYmVjYXVzZSBjb3JyZWN0IHRpbWVzdGFtcHMgc2hvdWxkIGJlXG4gICAgICAgIC8vIHVzZWQgd2hlcmVhcyB3aXJlIHNwZWMgbmVlZHMgdG8gaGFuZGxlIGNsb2NrIHNrZXcuXG4gICAgICAgIGNvbnN0IHVwZGF0ZSA9IEhhbS5taXgoZGF0YSwgZ3JhcGgsIGxpc3RlbilcbiAgICAgICAgc3RvcmUucHV0KHVwZGF0ZS5ub3csIGNiKVxuICAgICAgICAvLyBBbHNvIHB1dCBkYXRhIG9uIHRoZSB3aXJlIHNwZWMuXG4gICAgICAgIC8vIFRPRE86IE5vdGUgdGhhdCB0aGlzIG1lYW5zIGFsbCBjbGllbnRzIG5vdyByZWNlaXZlIGFsbCB1cGRhdGVzLCBzb1xuICAgICAgICAvLyBuZWVkIHRvIGZpbHRlciB3aGF0IHNob3VsZCBiZSBzdG9yZWQsIGJvdGggaW4gZ3JhcGggYW5kIG9uIGRpc2suXG4gICAgICAgIHNlbmQoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgXCIjXCI6IGR1cC50cmFjayh1dGlscy50ZXh0LnJhbmRvbSg5KSksXG4gICAgICAgICAgICBwdXQ6IGRhdGEsXG4gICAgICAgICAgfSksXG4gICAgICAgIClcbiAgICAgIH0sXG4gICAgICBvbjogKGxleCwgY2IpID0+IHtcbiAgICAgICAgaWYgKCFjYikgcmV0dXJuXG5cbiAgICAgICAgbGV0IGlkID0gbGV4W1wiI1wiXVxuICAgICAgICBpZiAoIWlkKSByZXR1cm5cblxuICAgICAgICBpZiAobGV4W1wiLlwiXSkgaWQgKz0gZW5xICsgbGV4W1wiLlwiXVxuICAgICAgICBpZiAobGlzdGVuW2lkXSkge1xuICAgICAgICAgIGlmICghbGlzdGVuW2lkXS5pbmNsdWRlcyhjYikpIGxpc3RlbltpZF0ucHVzaChjYilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsaXN0ZW5baWRdID0gW2NiXVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgb2ZmOiAobGV4LCBjYikgPT4ge1xuICAgICAgICBsZXQgaWQgPSBsZXhbXCIjXCJdXG4gICAgICAgIGlmICghaWQpIHJldHVyblxuXG4gICAgICAgIGlmIChsZXhbXCIuXCJdKSBpZCArPSBlbnEgKyBsZXhbXCIuXCJdXG4gICAgICAgIGlmICghbGlzdGVuW2lkXSkgcmV0dXJuXG5cbiAgICAgICAgaWYgKGNiKSB7XG4gICAgICAgICAgaWYgKGxpc3RlbltpZF0uaW5jbHVkZXMoY2IpKSB7XG4gICAgICAgICAgICBsaXN0ZW5baWRdLnNwbGljZShsaXN0ZW5baWRdLmluZGV4T2YoY2IpLCAxKVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBSZW1vdmUgYWxsIGNhbGxiYWNrcyB3aGVuIG5vbmUgcHJvdmlkZWQuXG4gICAgICAgICAgZGVsZXRlIGxpc3RlbltpZF1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9XG4gIH1cblxuICBpZiAoanNFbnYuaXNOb2RlKSB7XG4gICAgY29uc3QgV2ViU29ja2V0ID0gcmVxdWlyZShcIndzXCIpXG4gICAgbGV0IHdzcyA9IG9wdC53c3NcbiAgICAvLyBOb2RlJ3Mgd2Vic29ja2V0IHNlcnZlciBwcm92aWRlcyBjbGllbnRzIGFzIGFuIGFycmF5LCB3aGVyZWFzXG4gICAgLy8gbW9jay1zb2NrZXRzIHByb3ZpZGVzIGNsaWVudHMgYXMgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gYXJyYXkuXG4gICAgbGV0IGNsaWVudHMgPSAoKSA9PiB3c3MuY2xpZW50cygpXG4gICAgaWYgKCF3c3MpIHtcbiAgICAgIHdzcyA9IG5ldyBXZWJTb2NrZXQuU2VydmVyKHtwb3J0OiA4MDgwfSlcbiAgICAgIGNsaWVudHMgPSAoKSA9PiB3c3MuY2xpZW50c1xuICAgIH1cblxuICAgIGNvbnN0IHNlbmQgPSAoZGF0YSwgaXNCaW5hcnkpID0+IHtcbiAgICAgIGNsaWVudHMoKS5mb3JFYWNoKGNsaWVudCA9PiB7XG4gICAgICAgIGlmIChjbGllbnQucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4pIHtcbiAgICAgICAgICBjbGllbnQuc2VuZChkYXRhLCB7YmluYXJ5OiBpc0JpbmFyeX0pXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICAgIHdzcy5vbihcImNvbm5lY3Rpb25cIiwgd3MgPT4ge1xuICAgICAgd3Mub24oXCJlcnJvclwiLCBjb25zb2xlLmVycm9yKVxuXG4gICAgICB3cy5vbihcIm1lc3NhZ2VcIiwgKGRhdGEsIGlzQmluYXJ5KSA9PiB7XG4gICAgICAgIGNvbnN0IG1zZyA9IEpTT04ucGFyc2UoZGF0YSlcbiAgICAgICAgaWYgKGR1cC5jaGVjayhtc2dbXCIjXCJdKSkgcmV0dXJuXG5cbiAgICAgICAgZHVwLnRyYWNrKG1zZ1tcIiNcIl0pXG4gICAgICAgIGlmIChtc2cuZ2V0KSBnZXQobXNnLCBzZW5kKVxuICAgICAgICBpZiAobXNnLnB1dCkgcHV0KG1zZywgc2VuZClcbiAgICAgICAgc2VuZChkYXRhLCBpc0JpbmFyeSlcblxuICAgICAgICBjb25zdCBpZCA9IG1zZ1tcIkBcIl1cbiAgICAgICAgY29uc3QgY2IgPSBxdWV1ZVtpZF1cbiAgICAgICAgaWYgKGNiKSB7XG4gICAgICAgICAgZGVsZXRlIG1zZ1tcIiNcIl1cbiAgICAgICAgICBkZWxldGUgbXNnW1wiQFwiXVxuICAgICAgICAgIGNiKG1zZylcblxuICAgICAgICAgIGRlbGV0ZSBxdWV1ZVtpZF1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KVxuICAgIHJldHVybiBhcGkoc2VuZClcbiAgfVxuXG4gIGxldCB3cyA9IG5ldyBXZWJTb2NrZXQoXCJ3czovL2xvY2FsaG9zdDo4MDgwXCIpXG4gIGNvbnN0IHNlbmQgPSBkYXRhID0+IHtcbiAgICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSB7XG4gICAgICBjb25zb2xlLmxvZyhcIndlYnNvY2tldCBub3QgYXZhaWxhYmxlXCIpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB3cy5zZW5kKGRhdGEpXG4gIH1cbiAgY29uc3Qgc3RhcnQgPSAoKSA9PiB7XG4gICAgaWYgKCF3cykgd3MgPSBuZXcgV2ViU29ja2V0KFwid3M6Ly9sb2NhbGhvc3Q6ODA4MFwiKVxuICAgIHdzLm9uY2xvc2UgPSBjID0+IHtcbiAgICAgIHdzID0gbnVsbFxuICAgICAgc2V0VGltZW91dChzdGFydCwgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogNTAwMCkpXG4gICAgfVxuICAgIHdzLm9uZXJyb3IgPSBlID0+IHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSlcbiAgICB9XG4gICAgd3Mub25tZXNzYWdlID0gbSA9PiB7XG4gICAgICBjb25zdCBtc2cgPSBKU09OLnBhcnNlKG0uZGF0YSlcbiAgICAgIGlmIChkdXAuY2hlY2sobXNnW1wiI1wiXSkpIHJldHVyblxuXG4gICAgICBkdXAudHJhY2sobXNnW1wiI1wiXSlcbiAgICAgIGlmIChtc2cuZ2V0KSBnZXQobXNnLCBzZW5kKVxuICAgICAgaWYgKG1zZy5wdXQpIHB1dChtc2csIHNlbmQpXG4gICAgICBzZW5kKG0uZGF0YSlcblxuICAgICAgY29uc3QgaWQgPSBtc2dbXCJAXCJdXG4gICAgICBjb25zdCBjYiA9IHF1ZXVlW2lkXVxuICAgICAgaWYgKGNiKSB7XG4gICAgICAgIGRlbGV0ZSBtc2dbXCIjXCJdXG4gICAgICAgIGRlbGV0ZSBtc2dbXCJAXCJdXG4gICAgICAgIGNiKG1zZylcblxuICAgICAgICBkZWxldGUgcXVldWVbaWRdXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhcnQoKVxuICByZXR1cm4gYXBpKHNlbmQpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gV2lyZVxuIiwiLyogKGlnbm9yZWQpICovIiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXShtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIiIsIi8vIHN0YXJ0dXBcbi8vIExvYWQgZW50cnkgbW9kdWxlIGFuZCByZXR1cm4gZXhwb3J0c1xuLy8gVGhpcyBlbnRyeSBtb2R1bGUgaXMgcmVmZXJlbmNlZCBieSBvdGhlciBtb2R1bGVzIHNvIGl0IGNhbid0IGJlIGlubGluZWRcbnZhciBfX3dlYnBhY2tfZXhwb3J0c19fID0gX193ZWJwYWNrX3JlcXVpcmVfXyhcIi4vc3JjL2hvbHN0ZXIuanNcIik7XG4iLCIiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=
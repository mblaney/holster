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

        // Flag that this context is set from on and shouldn't be removed.
        allctx.set(ctxid, {chain: [{item: item, soul: soul}], on: true})
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

const fileSystem = dir => {
  if (jsEnv.isNode) {
    const fs = __webpack_require__(/*! fs */ "?569f")
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
    if (!fs.existsSync(dir + "/!")) {
      fs.writeFileSync(
        dir + "/!",
        unit + "+0" + unit + "#" + unit + '"root' + unit,
      )
    }

    return {
      get: (file, cb) => {
        fs.readFile(dir + "/" + file, (err, data) => {
          if (err) {
            if (err.code === "ENOENT") {
              cb()
              return
            }

            console.log("filesystem error:", err)
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

  // TODO: Add indexedDB
  return {
    get: (file, cb) => {
      cb(null, unit + "+0" + unit + "#" + unit + '"root' + unit)
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
  if (!opt.store) opt.store = fileSystem(opt.file)
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLFdBQVc7QUFDWDtBQUNBLFNBQVM7QUFDVCxPQUFPO0FBQ1A7QUFDQTs7QUFFQTs7QUFFQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsWUFBWTtBQUNaO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTs7QUFFQTs7QUFFQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNO0FBQ047QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQSxJQUFJO0FB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VUFDQTs7OztVRXRCQTtVQUNBO1VBQ0E7VUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL0hvbHN0ZXIvLi9ub2RlX21vZHVsZXMvYnJvd3Nlci1vci1ub2RlL2Rpc3QvaW5kZXguanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL25vZGVfbW9kdWxlcy93cy9icm93c2VyLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvZHVwLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvZ2V0LmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvaGFtLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvaG9sc3Rlci5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL3JhZGlzay5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL3JhZGl4LmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvc3RvcmUuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy91dGlscy5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL3dpcmUuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci9pZ25vcmVkfC9ob21lL21hbC93b3JrL2hvbHN0ZXIvc3JjfGZzIiwid2VicGFjazovL0hvbHN0ZXIvd2VicGFjay9ib290c3RyYXAiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL2JlZm9yZS1zdGFydHVwIiwid2VicGFjazovL0hvbHN0ZXIvd2VicGFjay9zdGFydHVwIiwid2VicGFjazovL0hvbHN0ZXIvd2VicGFjay9hZnRlci1zdGFydHVwIl0sInNvdXJjZXNDb250ZW50IjpbInZhciBfX2RlZlByb3AgPSBPYmplY3QuZGVmaW5lUHJvcGVydHk7XG52YXIgX19nZXRPd25Qcm9wRGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3I7XG52YXIgX19nZXRPd25Qcm9wTmFtZXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcztcbnZhciBfX2hhc093blByb3AgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xudmFyIF9fZXhwb3J0ID0gKHRhcmdldCwgYWxsKSA9PiB7XG4gIGZvciAodmFyIG5hbWUgaW4gYWxsKVxuICAgIF9fZGVmUHJvcCh0YXJnZXQsIG5hbWUsIHsgZ2V0OiBhbGxbbmFtZV0sIGVudW1lcmFibGU6IHRydWUgfSk7XG59O1xudmFyIF9fY29weVByb3BzID0gKHRvLCBmcm9tLCBleGNlcHQsIGRlc2MpID0+IHtcbiAgaWYgKGZyb20gJiYgdHlwZW9mIGZyb20gPT09IFwib2JqZWN0XCIgfHwgdHlwZW9mIGZyb20gPT09IFwiZnVuY3Rpb25cIikge1xuICAgIGZvciAobGV0IGtleSBvZiBfX2dldE93blByb3BOYW1lcyhmcm9tKSlcbiAgICAgIGlmICghX19oYXNPd25Qcm9wLmNhbGwodG8sIGtleSkgJiYga2V5ICE9PSBleGNlcHQpXG4gICAgICAgIF9fZGVmUHJvcCh0bywga2V5LCB7IGdldDogKCkgPT4gZnJvbVtrZXldLCBlbnVtZXJhYmxlOiAhKGRlc2MgPSBfX2dldE93blByb3BEZXNjKGZyb20sIGtleSkpIHx8IGRlc2MuZW51bWVyYWJsZSB9KTtcbiAgfVxuICByZXR1cm4gdG87XG59O1xudmFyIF9fdG9Db21tb25KUyA9IChtb2QpID0+IF9fY29weVByb3BzKF9fZGVmUHJvcCh7fSwgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSksIG1vZCk7XG5cbi8vIHNyYy9pbmRleC50c1xudmFyIHNyY19leHBvcnRzID0ge307XG5fX2V4cG9ydChzcmNfZXhwb3J0cywge1xuICBpc0Jyb3dzZXI6ICgpID0+IGlzQnJvd3NlcixcbiAgaXNCdW46ICgpID0+IGlzQnVuLFxuICBpc0Rlbm86ICgpID0+IGlzRGVubyxcbiAgaXNKc0RvbTogKCkgPT4gaXNKc0RvbSxcbiAgaXNOb2RlOiAoKSA9PiBpc05vZGUsXG4gIGlzV2ViV29ya2VyOiAoKSA9PiBpc1dlYldvcmtlclxufSk7XG5tb2R1bGUuZXhwb3J0cyA9IF9fdG9Db21tb25KUyhzcmNfZXhwb3J0cyk7XG52YXIgaXNCcm93c2VyID0gdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2Ygd2luZG93LmRvY3VtZW50ICE9PSBcInVuZGVmaW5lZFwiO1xudmFyIGlzTm9kZSA9IChcbiAgLy8gQHRzLWV4cGVjdC1lcnJvclxuICB0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHByb2Nlc3MudmVyc2lvbnMgIT0gbnVsbCAmJiAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHByb2Nlc3MudmVyc2lvbnMubm9kZSAhPSBudWxsXG4pO1xudmFyIGlzV2ViV29ya2VyID0gdHlwZW9mIHNlbGYgPT09IFwib2JqZWN0XCIgJiYgc2VsZi5jb25zdHJ1Y3RvciAmJiBzZWxmLmNvbnN0cnVjdG9yLm5hbWUgPT09IFwiRGVkaWNhdGVkV29ya2VyR2xvYmFsU2NvcGVcIjtcbnZhciBpc0pzRG9tID0gdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiAmJiB3aW5kb3cubmFtZSA9PT0gXCJub2RlanNcIiB8fCB0eXBlb2YgbmF2aWdhdG9yICE9PSBcInVuZGVmaW5lZFwiICYmIFwidXNlckFnZW50XCIgaW4gbmF2aWdhdG9yICYmIHR5cGVvZiBuYXZpZ2F0b3IudXNlckFnZW50ID09PSBcInN0cmluZ1wiICYmIChuYXZpZ2F0b3IudXNlckFnZW50LmluY2x1ZGVzKFwiTm9kZS5qc1wiKSB8fCBuYXZpZ2F0b3IudXNlckFnZW50LmluY2x1ZGVzKFwianNkb21cIikpO1xudmFyIGlzRGVubyA9IChcbiAgLy8gQHRzLWV4cGVjdC1lcnJvclxuICB0eXBlb2YgRGVubyAhPT0gXCJ1bmRlZmluZWRcIiAmJiAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBEZW5vLnZlcnNpb24gIT09IFwidW5kZWZpbmVkXCIgJiYgLy8gQHRzLWV4cGVjdC1lcnJvclxuICB0eXBlb2YgRGVuby52ZXJzaW9uLmRlbm8gIT09IFwidW5kZWZpbmVkXCJcbik7XG52YXIgaXNCdW4gPSB0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzLnZlcnNpb25zICE9IG51bGwgJiYgcHJvY2Vzcy52ZXJzaW9ucy5idW4gIT0gbnVsbDtcbi8vIEFubm90YXRlIHRoZSBDb21tb25KUyBleHBvcnQgbmFtZXMgZm9yIEVTTSBpbXBvcnQgaW4gbm9kZTpcbjAgJiYgKG1vZHVsZS5leHBvcnRzID0ge1xuICBpc0Jyb3dzZXIsXG4gIGlzQnVuLFxuICBpc0Rlbm8sXG4gIGlzSnNEb20sXG4gIGlzTm9kZSxcbiAgaXNXZWJXb3JrZXJcbn0pO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcbiAgdGhyb3cgbmV3IEVycm9yKFxuICAgICd3cyBkb2VzIG5vdCB3b3JrIGluIHRoZSBicm93c2VyLiBCcm93c2VyIGNsaWVudHMgbXVzdCB1c2UgdGhlIG5hdGl2ZSAnICtcbiAgICAgICdXZWJTb2NrZXQgb2JqZWN0J1xuICApO1xufTtcbiIsImNvbnN0IER1cCA9IG1heEFnZSA9PiB7XG4gIC8vIEFsbG93IG1heEFnZSB0byBiZSBwYXNzZWQgaW4gYXMgdGVzdHMgd2FpdCBvbiB0aGUgc2V0VGltZW91dC5cbiAgaWYgKCFtYXhBZ2UpIG1heEFnZSA9IDkwMDBcbiAgY29uc3QgZHVwID0ge3N0b3JlOiB7fX1cbiAgZHVwLmNoZWNrID0gaWQgPT4gKGR1cC5zdG9yZVtpZF0gPyBkdXAudHJhY2soaWQpIDogZmFsc2UpXG4gIGR1cC50cmFjayA9IGlkID0+IHtcbiAgICAvLyBLZWVwIHRoZSBsaXZlbGluZXNzIG9mIHRoZSBtZXNzYWdlIHVwIHdoaWxlIGl0IGlzIGJlaW5nIHJlY2VpdmVkLlxuICAgIGR1cC5zdG9yZVtpZF0gPSBEYXRlLm5vdygpXG4gICAgaWYgKCFkdXAuZXhwaXJ5KSB7XG4gICAgICBkdXAuZXhwaXJ5ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGNvbnN0IG5vdyA9IERhdGUubm93KClcbiAgICAgICAgT2JqZWN0LmtleXMoZHVwLnN0b3JlKS5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgICBpZiAobm93IC0gZHVwLnN0b3JlW2lkXSA+IG1heEFnZSkgZGVsZXRlIGR1cC5zdG9yZVtpZF1cbiAgICAgICAgfSlcbiAgICAgICAgZHVwLmV4cGlyeSA9IG51bGxcbiAgICAgIH0sIG1heEFnZSlcbiAgICB9XG4gICAgcmV0dXJuIGlkXG4gIH1cbiAgcmV0dXJuIGR1cFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IER1cFxuIiwiY29uc3QgR2V0ID0gKGxleCwgZ3JhcGgpID0+IHtcbiAgY29uc3Qgc291bCA9IGxleFtcIiNcIl1cbiAgY29uc3Qga2V5ID0gbGV4W1wiLlwiXVxuICB2YXIgbm9kZSA9IGdyYXBoW3NvdWxdXG5cbiAgLy8gQ2FuIG9ubHkgcmV0dXJuIGEgbm9kZSBpZiBhIGtleSBpcyBwcm92aWRlZCwgYmVjYXVzZSB0aGUgZ3JhcGggbWF5IG5vdFxuICAvLyBoYXZlIGFsbCB0aGUga2V5cyBwb3B1bGF0ZWQgZm9yIGEgZ2l2ZW4gc291bC4gVGhpcyBpcyBiZWNhdXNlIEhhbS5taXhcbiAgLy8gb25seSBhZGRzIGluY29taW5nIGNoYW5nZXMgdG8gdGhlIGdyYXBoLlxuICBpZiAoIW5vZGUgfHwgIWtleSkgcmV0dXJuXG5cbiAgbGV0IHZhbHVlID0gbm9kZVtrZXldXG4gIGlmICghdmFsdWUpIHJldHVyblxuXG4gIG5vZGUgPSB7Xzogbm9kZS5fLCBba2V5XTogdmFsdWV9XG4gIG5vZGUuX1tcIj5cIl0gPSB7W2tleV06IG5vZGUuX1tcIj5cIl1ba2V5XX1cbiAgcmV0dXJuIHtbc291bF06IG5vZGV9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gR2V0XG4iLCIvLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIGVucXVpcnkuXG5jb25zdCBlbnEgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDUpXG5cbi8vIHN0YXRlIGFuZCB2YWx1ZSBhcmUgdGhlIGluY29taW5nIGNoYW5nZXMuXG4vLyBjdXJyZW50U3RhdGUgYW5kIGN1cnJlbnRWYWx1ZSBhcmUgdGhlIGN1cnJlbnQgZ3JhcGggZGF0YS5cbmNvbnN0IEhhbSA9IChzdGF0ZSwgY3VycmVudFN0YXRlLCB2YWx1ZSwgY3VycmVudFZhbHVlKSA9PiB7XG4gIGlmIChzdGF0ZSA8IGN1cnJlbnRTdGF0ZSkgcmV0dXJuIHtoaXN0b3JpY2FsOiB0cnVlfVxuXG4gIGlmIChzdGF0ZSA+IGN1cnJlbnRTdGF0ZSkgcmV0dXJuIHtpbmNvbWluZzogdHJ1ZX1cblxuICAvLyBzdGF0ZSBpcyBlcXVhbCB0byBjdXJyZW50U3RhdGUsIGxleGljYWxseSBjb21wYXJlIHRvIHJlc29sdmUgY29uZmxpY3QuXG4gIGlmICh0eXBlb2YgdmFsdWUgIT09IFwic3RyaW5nXCIpIHtcbiAgICB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKSB8fCBcIlwiXG4gIH1cbiAgaWYgKHR5cGVvZiBjdXJyZW50VmFsdWUgIT09IFwic3RyaW5nXCIpIHtcbiAgICBjdXJyZW50VmFsdWUgPSBKU09OLnN0cmluZ2lmeShjdXJyZW50VmFsdWUpIHx8IFwiXCJcbiAgfVxuICAvLyBObyB1cGRhdGUgcmVxdWlyZWQuXG4gIGlmICh2YWx1ZSA9PT0gY3VycmVudFZhbHVlKSByZXR1cm4ge3N0YXRlOiB0cnVlfVxuXG4gIC8vIEtlZXAgdGhlIGN1cnJlbnQgdmFsdWUuXG4gIGlmICh2YWx1ZSA8IGN1cnJlbnRWYWx1ZSkgcmV0dXJuIHtjdXJyZW50OiB0cnVlfVxuXG4gIC8vIE90aGVyd2lzZSB1cGRhdGUgdXNpbmcgdGhlIGluY29taW5nIHZhbHVlLlxuICByZXR1cm4ge2luY29taW5nOiB0cnVlfVxufVxuXG5IYW0ubWl4ID0gKGNoYW5nZSwgZ3JhcGgsIGxpc3RlbikgPT4ge1xuICB2YXIgbWFjaGluZSA9IERhdGUubm93KClcbiAgdmFyIG5vdyA9IHt9XG4gIHZhciBkZWZlciA9IHt9XG4gIGxldCB3YWl0ID0gMFxuXG4gIE9iamVjdC5rZXlzKGNoYW5nZSkuZm9yRWFjaChzb3VsID0+IHtcbiAgICBjb25zdCBub2RlID0gY2hhbmdlW3NvdWxdXG4gICAgbGV0IHVwZGF0ZWQgPSBmYWxzZVxuICAgIE9iamVjdC5rZXlzKG5vZGUpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT09IFwiX1wiKSByZXR1cm5cblxuICAgICAgY29uc3QgdmFsdWUgPSBub2RlW2tleV1cbiAgICAgIGNvbnN0IHN0YXRlID0gbm9kZS5fW1wiPlwiXVtrZXldXG4gICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSAoZ3JhcGhbc291bF0gfHwge30pW2tleV1cbiAgICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IChncmFwaFtzb3VsXSB8fCB7Xzoge1wiPlwiOiB7fX19KS5fW1wiPlwiXVtrZXldIHx8IDBcblxuICAgICAgLy8gRGVmZXIgdGhlIHVwZGF0ZSBpZiBhaGVhZCBvZiBtYWNoaW5lIHRpbWUuXG4gICAgICBjb25zdCBza2V3ID0gc3RhdGUgLSBtYWNoaW5lXG4gICAgICBpZiAoc2tldyA+IDApIHtcbiAgICAgICAgLy8gSWdub3JlIHVwZGF0ZSBpZiBhaGVhZCBieSBtb3JlIHRoYW4gMjQgaG91cnMuXG4gICAgICAgIGlmIChza2V3ID4gODY0MDAwMDApIHJldHVyblxuXG4gICAgICAgIC8vIFdhaXQgdGhlIHNob3J0ZXN0IGRpZmZlcmVuY2UgYmVmb3JlIHRyeWluZyB0aGUgdXBkYXRlcyBhZ2Fpbi5cbiAgICAgICAgaWYgKHdhaXQgPT09IDAgfHwgc2tldyA8IHdhaXQpIHdhaXQgPSBza2V3XG4gICAgICAgIGlmICghZGVmZXJbc291bF0pIGRlZmVyW3NvdWxdID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgZGVmZXJbc291bF1ba2V5XSA9IHZhbHVlXG4gICAgICAgIGRlZmVyW3NvdWxdLl9bXCI+XCJdW2tleV0gPSBzdGF0ZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gSGFtKHN0YXRlLCBjdXJyZW50U3RhdGUsIHZhbHVlLCBjdXJyZW50VmFsdWUpXG4gICAgICAgIGlmIChyZXN1bHQuaW5jb21pbmcpIHtcbiAgICAgICAgICBpZiAoIW5vd1tzb3VsXSkgbm93W3NvdWxdID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgICAvLyBUT0RPOiBncmFwaCBzaG91bGQgbm90IGp1c3QgZ3JvdyBpbmRlZmludGl0ZWx5IGluIG1lbW9yeS5cbiAgICAgICAgICAvLyBOZWVkIHRvIGhhdmUgYSBtYXggc2l6ZSBhZnRlciB3aGljaCBzdGFydCBkcm9wcGluZyB0aGUgb2xkZXN0IHN0YXRlXG4gICAgICAgICAgLy8gRG8gc29tZXRoaW5nIHNpbWlsYXIgdG8gRHVwIHdoaWNoIGNhbiBoYW5kbGUgZGVsZXRlcz9cbiAgICAgICAgICBpZiAoIWdyYXBoW3NvdWxdKSBncmFwaFtzb3VsXSA9IHtfOiB7XCIjXCI6IHNvdWwsIFwiPlwiOiB7fX19XG4gICAgICAgICAgZ3JhcGhbc291bF1ba2V5XSA9IG5vd1tzb3VsXVtrZXldID0gdmFsdWVcbiAgICAgICAgICBncmFwaFtzb3VsXS5fW1wiPlwiXVtrZXldID0gbm93W3NvdWxdLl9bXCI+XCJdW2tleV0gPSBzdGF0ZVxuICAgICAgICAgIC8vIENhbGwgZXZlbnQgbGlzdGVuZXJzIGZvciB1cGRhdGUgb24ga2V5LCBtaXggaXMgY2FsbGVkIGJlZm9yZVxuICAgICAgICAgIC8vIHB1dCBoYXMgZmluaXNoZWQgc28gd2FpdCBmb3Igd2hhdCBjb3VsZCBiZSBtdWx0aXBsZSBuZXN0ZWRcbiAgICAgICAgICAvLyB1cGRhdGVzIG9uIGEgbm9kZS5cbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGlkID0gc291bCArIGVucSArIGtleVxuICAgICAgICAgICAgaWYgKGxpc3RlbltpZF0pIGxpc3RlbltpZF0uZm9yRWFjaChjYiA9PiBjYigpKVxuICAgICAgICAgIH0sIDEwMClcbiAgICAgICAgICB1cGRhdGVkID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICAvLyBDYWxsIGV2ZW50IGxpc3RlbmVycyBmb3IgdXBkYXRlIG9uIHNvdWwuXG4gICAgaWYgKHVwZGF0ZWQgJiYgbGlzdGVuW3NvdWxdKVxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGxpc3Rlbltzb3VsXS5mb3JFYWNoKGNiID0+IGNiKCkpXG4gICAgICB9LCAxMDApXG4gIH0pXG4gIHJldHVybiB7bm93OiBub3csIGRlZmVyOiBkZWZlciwgd2FpdDogd2FpdH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBIYW1cbiIsImNvbnN0IHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIilcbmNvbnN0IFdpcmUgPSByZXF1aXJlKFwiLi93aXJlXCIpXG5cbmNvbnN0IEhvbHN0ZXIgPSBvcHQgPT4ge1xuICBjb25zdCB3aXJlID0gV2lyZShvcHQpXG4gIC8vIE1hcCBjYWxsYmFja3Mgc2luY2UgdGhlIHVzZXIncyBjYWxsYmFjayBpcyBub3QgcGFzc2VkIHRvIHdpcmUub24uXG4gIGNvbnN0IG1hcCA9IG5ldyBNYXAoKVxuICAvLyBBbGxvdyBjb25jdXJyZW50IGNhbGxzIHRvIHRoZSBhcGkgYnkgc3RvcmluZyBlYWNoIGNvbnRleHQuXG4gIGNvbnN0IGFsbGN0eCA9IG5ldyBNYXAoKVxuXG4gIGNvbnN0IG9rID0gZGF0YSA9PiB7XG4gICAgcmV0dXJuIChcbiAgICAgIGRhdGEgPT09IG51bGwgfHxcbiAgICAgIGRhdGEgPT09IHRydWUgfHxcbiAgICAgIGRhdGEgPT09IGZhbHNlIHx8XG4gICAgICB0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIiB8fFxuICAgICAgdXRpbHMucmVsLmlzKGRhdGEpIHx8XG4gICAgICB1dGlscy5udW0uaXMoZGF0YSlcbiAgICApXG4gIH1cblxuICAvLyBjaGVjayByZXR1cm5zIHRydWUgaWYgZGF0YSBpcyBvayB0byBhZGQgdG8gYSBncmFwaCwgYW4gZXJyb3Igc3RyaW5nIGlmXG4gIC8vIHRoZSBkYXRhIGNhbid0IGJlIGNvbnZlcnRlZCwgYW5kIHRoZSBrZXlzIG9uIHRoZSBkYXRhIG9iamVjdCBvdGhlcndpc2UuXG4gIGNvbnN0IGNoZWNrID0gZGF0YSA9PiB7XG4gICAgaWYgKG9rKGRhdGEpKSByZXR1cm4gdHJ1ZVxuXG4gICAgaWYgKHV0aWxzLm9iai5pcyhkYXRhKSkge1xuICAgICAgY29uc3Qga2V5cyA9IFtdXG4gICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhkYXRhKSkge1xuICAgICAgICBpZiAoa2V5ID09PSBcIl9cIikge1xuICAgICAgICAgIHJldHVybiBcImVycm9yIHVuZGVyc2NvcmUgY2Fubm90IGJlIHVzZWQgYXMgYW4gaXRlbSBuYW1lXCJcbiAgICAgICAgfVxuICAgICAgICBpZiAodXRpbHMub2JqLmlzKHZhbHVlKSB8fCBvayh2YWx1ZSkpIHtcbiAgICAgICAgICBrZXlzLnB1c2goa2V5KVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBlcnJvciB7JHtrZXl9OiR7dmFsdWV9fSBjYW5ub3QgYmUgY29udmVydGVkIHRvIGdyYXBoYFxuICAgICAgfVxuICAgICAgaWYgKGtleXMubGVuZ3RoICE9PSAwKSByZXR1cm4ga2V5c1xuICAgIH1cbiAgICByZXR1cm4gYGVycm9yICR7ZGF0YX0gY2Fubm90IGJlIGNvbnZlcnRlZCB0byBhIGdyYXBoYFxuICB9XG5cbiAgLy8gZ3JhcGggY29udmVydHMgb2JqZWN0cyB0byBncmFwaCBmb3JtYXQgd2l0aCB1cGRhdGVkIHN0YXRlcy5cbiAgY29uc3QgZ3JhcGggPSAoc291bCwgZGF0YSwgZykgPT4ge1xuICAgIGlmICghZykgZyA9IHtbc291bF06IHtfOiB7XCIjXCI6IHNvdWwsIFwiPlwiOiB7fX19fVxuICAgIGVsc2UgZ1tzb3VsXSA9IHtfOiB7XCIjXCI6IHNvdWwsIFwiPlwiOiB7fX19XG5cbiAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhkYXRhKSkge1xuICAgICAgZ1tzb3VsXVtrZXldID0gdmFsdWVcbiAgICAgIGdbc291bF0uX1tcIj5cIl1ba2V5XSA9IERhdGUubm93KClcbiAgICB9XG4gICAgcmV0dXJuIGdcbiAgfVxuXG4gIGNvbnN0IGFwaSA9IGN0eGlkID0+IHtcbiAgICBjb25zdCBnZXQgPSAobGV4LCBzb3VsLCBhY2spID0+IHtcbiAgICAgIHdpcmUuZ2V0KHV0aWxzLm9iai5wdXQobGV4LCBcIiNcIiwgc291bCksIGFzeW5jIG1zZyA9PiB7XG4gICAgICAgIGlmIChtc2cuZXJyKSBjb25zb2xlLmxvZyhtc2cuZXJyKVxuICAgICAgICBpZiAobXNnLnB1dCAmJiBtc2cucHV0W3NvdWxdKSB7XG4gICAgICAgICAgZGVsZXRlIG1zZy5wdXRbc291bF0uX1xuICAgICAgICAgIC8vIFJlc29sdmUgYW55IHJlbHMgb24gdGhlIG5vZGUgYmVmb3JlIHJldHVybmluZyB0byB0aGUgdXNlci5cbiAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhtc2cucHV0W3NvdWxdKSkge1xuICAgICAgICAgICAgY29uc3QgaWQgPSB1dGlscy5yZWwuaXMobXNnLnB1dFtzb3VsXVtrZXldKVxuICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBuZXcgUHJvbWlzZShyZXMgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IF9jdHhpZCA9IHV0aWxzLnRleHQucmFuZG9tKClcbiAgICAgICAgICAgICAgICBhbGxjdHguc2V0KF9jdHhpZCwge2NoYWluOiBbe2l0ZW06IG51bGwsIHNvdWw6IGlkfV19KVxuICAgICAgICAgICAgICAgIGFwaShfY3R4aWQpLnRoZW4obnVsbCwgcmVzKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICBtc2cucHV0W3NvdWxdW2tleV0gPSBkYXRhXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGFjayhtc2cucHV0W3NvdWxdKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE5vIGRhdGEgY2FsbGJhY2suXG4gICAgICAgICAgYWNrKG51bGwpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuXG4gICAgY29uc3QgZG9uZSA9IGRhdGEgPT4ge1xuICAgICAgY29uc3QgY3R4ID0gYWxsY3R4LmdldChjdHhpZClcbiAgICAgIGlmIChjdHggJiYgdHlwZW9mIGN0eC5jYiAhPT0gXCJ1bmRlZmluZWRcIikgY3R4LmNiKGRhdGEpXG4gICAgICBlbHNlIGlmIChkYXRhKSBjb25zb2xlLmxvZyhkYXRhKVxuICAgICAgLy8gQSBjb250ZXh0IHVwZGF0ZWQgYnkgXCJvblwiIHNob3VsZCBvbmx5IGJlIHJlbW92ZWQgYnkgXCJvZmZcIi5cbiAgICAgIGlmICghY3R4Lm9uKSBhbGxjdHguZGVsZXRlKGN0eGlkKVxuICAgIH1cblxuICAgIGNvbnN0IHJlc29sdmUgPSAocmVxdWVzdCwgY2IpID0+IHtcbiAgICAgIGNvbnN0IGdldCA9IHJlcXVlc3QgJiYgdHlwZW9mIHJlcXVlc3QuZ2V0ICE9PSBcInVuZGVmaW5lZFwiXG4gICAgICBjb25zdCBwdXQgPSByZXF1ZXN0ICYmIHR5cGVvZiByZXF1ZXN0LnB1dCAhPT0gXCJ1bmRlZmluZWRcIlxuICAgICAgY29uc3Qgb24gPSByZXF1ZXN0ICYmIHR5cGVvZiByZXF1ZXN0Lm9uICE9PSBcInVuZGVmaW5lZFwiXG4gICAgICBjb25zdCBvZmYgPSByZXF1ZXN0ICYmIHR5cGVvZiByZXF1ZXN0Lm9mZiAhPT0gXCJ1bmRlZmluZWRcIlxuXG4gICAgICBsZXQgZm91bmQgPSBmYWxzZVxuICAgICAgY29uc3QgY3R4ID0gYWxsY3R4LmdldChjdHhpZClcbiAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgY3R4LmNoYWluLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChjdHguY2hhaW5baV0uc291bCAhPT0gbnVsbCkgY29udGludWVcblxuICAgICAgICBmb3VuZCA9IHRydWVcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cblxuICAgICAgaWYgKGZvdW5kKSB7XG4gICAgICAgIC8vIEZvdW5kIGEgc291bCB0aGF0IG5lZWRzIHJlc29sdmluZywgbmVlZCB0aGUgcHJldmlvdXMgY29udGV4dFxuICAgICAgICAvLyAoaWUgdGhlIHBhcmVudCBub2RlKSB0byBmaW5kIGEgc291bCByZWxhdGlvbiBmb3IgaXQuXG4gICAgICAgIGNvbnN0IHtpdGVtLCBzb3VsfSA9IGN0eC5jaGFpbltpIC0gMV1cbiAgICAgICAgd2lyZS5nZXQoe1wiI1wiOiBzb3VsLCBcIi5cIjogaXRlbX0sIG1zZyA9PiB7XG4gICAgICAgICAgaWYgKG1zZy5lcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBlcnJvciBnZXR0aW5nICR7aXRlbX0gb24gJHtzb3VsfTogJHttc2cuZXJyfWApXG4gICAgICAgICAgICBpZiAoY2IpIGNiKG51bGwpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBub2RlID0gbXNnLnB1dCAmJiBtc2cucHV0W3NvdWxdXG4gICAgICAgICAgaWYgKG5vZGUgJiYgdHlwZW9mIG5vZGVbaXRlbV0gIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIGxldCBpZCA9IHV0aWxzLnJlbC5pcyhub2RlW2l0ZW1dKVxuICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgIGN0eC5jaGFpbltpXS5zb3VsID0gaWRcbiAgICAgICAgICAgICAgLy8gTm90IHN1cmUgd2h5IHRoZSBtYXAgbmVlZHMgdG8gYmUgc2V0IHJhdGhlciB0aGFuIGp1c3QgY3R4P1xuICAgICAgICAgICAgICBhbGxjdHguc2V0KGN0eGlkLCB7Y2hhaW46IGN0eC5jaGFpbiwgY2I6IGN0eC5jYn0pXG4gICAgICAgICAgICAgIC8vIENhbGwgYXBpIGFnYWluIHVzaW5nIHRoZSB1cGRhdGVkIGNvbnRleHQuXG4gICAgICAgICAgICAgIGlmIChnZXQpIGFwaShjdHhpZCkudGhlbihudWxsLCByZXF1ZXN0LmdldCwgY2IpXG4gICAgICAgICAgICAgIGVsc2UgaWYgKHB1dCkgYXBpKGN0eGlkKS5wdXQocmVxdWVzdC5wdXQsIGNiKVxuICAgICAgICAgICAgICBlbHNlIGlmIChvbikgYXBpKGN0eGlkKS5vbihjYilcbiAgICAgICAgICAgICAgZWxzZSBpZiAob2ZmKSBhcGkoY3R4aWQpLm9mZihjYilcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZ2V0KSB7XG4gICAgICAgICAgICAgIC8vIFJlcXVlc3Qgd2FzIG5vdCBmb3IgYSBub2RlLCByZXR1cm4gYSBwcm9wZXJ0eSBvbiB0aGUgY3VycmVudFxuICAgICAgICAgICAgICAvLyBzb3VsLlxuICAgICAgICAgICAgICBjYihub2RlW2l0ZW1dKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChwdXQpIHtcbiAgICAgICAgICAgICAgLy8gUmVxdWVzdCB3YXMgY2hhaW5lZCBiZWZvcmUgcHV0LCBzbyByZWwgZG9lc24ndCBleGlzdCB5ZXQuXG4gICAgICAgICAgICAgIGlkID0gdXRpbHMudGV4dC5yYW5kb20oKVxuICAgICAgICAgICAgICBjb25zdCByZWwgPSB7W2l0ZW1dOiB1dGlscy5yZWwuaWZ5KGlkKX1cbiAgICAgICAgICAgICAgd2lyZS5wdXQoZ3JhcGgoc291bCwgcmVsKSwgZXJyID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICBjYihgZXJyb3IgcHV0dGluZyAke2l0ZW19IG9uICR7c291bH06ICR7ZXJyfWApXG4gICAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjdHguY2hhaW5baV0uc291bCA9IGlkXG4gICAgICAgICAgICAgICAgYXBpKGN0eGlkKS5wdXQocmVxdWVzdC5wdXQsIGNiKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSBlbHNlIGlmIChvbikge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgcmVzb2x2aW5nIG9uIGZvciAke2l0ZW19IG9uICR7c291bH1gKVxuICAgICAgICAgICAgICBjYihudWxsKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChvZmYpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIHJlc29sdmluZyBvZmYgZm9yICR7aXRlbX0gb24gJHtzb3VsfWApXG4gICAgICAgICAgICAgIGlmIChjYikgY2IobnVsbClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKHB1dCkge1xuICAgICAgICAgICAgY2IoYGVycm9yICR7aXRlbX0gbm90IGZvdW5kIG9uICR7c291bH1gKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgJHtpdGVtfSBub3QgZm91bmQgb24gJHtzb3VsfWApXG4gICAgICAgICAgICBpZiAoY2IpIGNiKG51bGwpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAvLyBDYWxsYmFjayBoYXMgYmVlbiBwYXNzZWQgdG8gbmV4dCBzb3VsIGxvb2t1cCBvciBjYWxsZWQgYWJvdmUsIHNvXG4gICAgICAgIC8vIHJldHVybiBmYWxzZSBhcyB0aGUgY2FsbGluZyBjb2RlIHNob3VsZCBub3QgY29udGludWUuXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuXG4gICAgICBpZiAoZ2V0ICYmIGN0eC5jaGFpbltjdHguY2hhaW4ubGVuZ3RoIC0gMV0uaXRlbSAhPT0gbnVsbCkge1xuICAgICAgICAvLyBUaGUgY29udGV4dCBoYXMgYmVlbiByZXNvbHZlZCBidXQgaXQgZG9lcyBub3QgaW5jbHVkZSB0aGUgcmVxdWVzdGVkXG4gICAgICAgIC8vIG5vZGUsIHdoaWNoIHJlcXVpcmVzIG9uZSBtb3JlIGxvb2t1cC5cbiAgICAgICAgY3R4LmNoYWluLnB1c2goe2l0ZW06IG51bGwsIHNvdWw6IG51bGx9KVxuICAgICAgICBhcGkoY3R4aWQpLnRoZW4obnVsbCwgcmVxdWVzdC5nZXQsIGNiKVxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIH1cblxuICAgICAgLy8gUmV0dXJuIHRoZSBsYXN0IGNvbnRleHQsIGllIHRoZSBzb3VsIHJlcXVpcmVkIGJ5IHRoZSBjYWxsaW5nIGNvZGUuXG4gICAgICByZXR1cm4gY3R4LmNoYWluW2N0eC5jaGFpbi5sZW5ndGggLSAxXVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBnZXQ6IChrZXksIGxleCwgY2IpID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBsZXggPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgIGNiID0gbGV4XG4gICAgICAgICAgbGV4ID0gbnVsbFxuICAgICAgICB9XG4gICAgICAgIGlmIChrZXkgPT09IG51bGwgfHwga2V5ID09PSBcIlwiIHx8IGtleSA9PT0gXCJfXCIpIHtcbiAgICAgICAgICBpZiAoY2IpIGNiKG51bGwpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBjdHhpZCA9IHV0aWxzLnRleHQucmFuZG9tKClcbiAgICAgICAgLy8gVG9wIGxldmVsIGtleXMgYXJlIGFkZGVkIHRvIGEgcm9vdCBub2RlIHNvIHRoZWlyIHZhbHVlcyBkb24ndCBuZWVkXG4gICAgICAgIC8vIHRvIGJlIG9iamVjdHMuXG4gICAgICAgIGFsbGN0eC5zZXQoY3R4aWQsIHtjaGFpbjogW3tpdGVtOiBrZXksIHNvdWw6IFwicm9vdFwifV0sIGNiOiBjYn0pXG4gICAgICAgIGlmICghY2IpIHJldHVybiBhcGkoY3R4aWQpXG5cbiAgICAgICAgLy8gV2hlbiB0aGVyZSdzIGEgY2FsbGJhY2sgbmVlZCB0byByZXNvbHZlIHRoZSBjb250ZXh0IGZpcnN0LlxuICAgICAgICBjb25zdCB7c291bH0gPSByZXNvbHZlKHtnZXQ6IGxleH0sIGRvbmUpXG4gICAgICAgIGlmIChzb3VsKSBnZXQobGV4LCBzb3VsLCBkb25lKVxuICAgICAgfSxcbiAgICAgIHRoZW46IChrZXksIGxleCwgY2IpID0+IHtcbiAgICAgICAgY29uc3QgYWNrID0gZGF0YSA9PiB7XG4gICAgICAgICAgY2IgPyBjYihkYXRhKSA6IGRvbmUoZGF0YSlcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgbGV4ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICBjYiA9IGxleFxuICAgICAgICAgIGxleCA9IG51bGxcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWN0eGlkKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coXCJwbGVhc2UgcHJvdmlkZSBhIGtleSB1c2luZyBnZXQoa2V5KVwiKVxuICAgICAgICAgIGFjayhudWxsKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY3R4ID0gYWxsY3R4LmdldChjdHhpZClcbiAgICAgICAgLy8gY3R4IGFscmVhZHkgcmVtb3ZlZCBieSBhbm90aGVyIGNoYWluZWQgY2FsbGJhY2sgaXMgb2s/XG4gICAgICAgIGlmICghY3R4KSByZXR1cm5cblxuICAgICAgICBpZiAoY2IgJiYgdHlwZW9mIGN0eC5jYiA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgIC8vIFRoaXMgKGFuZCBhY2spIGFsbG93cyBuZXN0ZWQgb2JqZWN0cyB0byBzZXQgdGhlaXIgb3duIGNhbGxiYWNrcy5cbiAgICAgICAgICBjdHguY2IgPSBjYlxuICAgICAgICAgIGNiID0gbnVsbFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGtleSA9PT0gXCJcIiB8fCBrZXkgPT09IFwiX1wiKSB7XG4gICAgICAgICAgYWNrKG51bGwpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBQdXNoIHRoZSBrZXkgdG8gdGhlIGNvbnRleHQgYXMgaXQgbmVlZHMgYSBzb3VsIGxvb2t1cC5cbiAgICAgICAgLy8gKG51bGwgaXMgdXNlZCB0byBjYWxsIHRoZSBhcGkgd2l0aCB1cGRhdGVkIGNvbnRleHQpXG4gICAgICAgIGlmIChrZXkgIT09IG51bGwpIGN0eC5jaGFpbi5wdXNoKHtpdGVtOiBrZXksIHNvdWw6IG51bGx9KVxuICAgICAgICBpZiAoIWN0eC5jYikgcmV0dXJuIGFwaShjdHhpZClcblxuICAgICAgICAvLyBXaGVuIHRoZXJlJ3MgYSBjYWxsYmFjayBuZWVkIHRvIHJlc29sdmUgdGhlIGNvbnRleHQgZmlyc3QuXG4gICAgICAgIGNvbnN0IHtzb3VsfSA9IHJlc29sdmUoe2dldDogbGV4fSwgYWNrKVxuICAgICAgICBpZiAoc291bCkgZ2V0KGxleCwgc291bCwgYWNrKVxuICAgICAgfSxcbiAgICAgIHB1dDogKGRhdGEsIGNiKSA9PiB7XG4gICAgICAgIGNvbnN0IGFjayA9IGVyciA9PiB7XG4gICAgICAgICAgY2IgPyBjYihlcnIpIDogZG9uZShlcnIpXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWN0eGlkKSB7XG4gICAgICAgICAgYWNrKFwicGxlYXNlIHByb3ZpZGUgYSBrZXkgdXNpbmcgZ2V0KGtleSlcIilcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGN0eCA9IGFsbGN0eC5nZXQoY3R4aWQpXG4gICAgICAgIC8vIGN0eCBhbHJlYWR5IHJlbW92ZWQgYnkgYW5vdGhlciBjaGFpbmVkIGNhbGxiYWNrIGlzIG9rP1xuICAgICAgICBpZiAoIWN0eCkgcmV0dXJuXG5cbiAgICAgICAgaWYgKCFjdHguY2IpIHtcbiAgICAgICAgICBpZiAoIWNiKSByZXR1cm5cblxuICAgICAgICAgIC8vIFRoaXMgKGFuZCBhY2spIGFsbG93cyBuZXN0ZWQgb2JqZWN0cyB0byBzZXQgdGhlaXIgb3duIGNhbGxiYWNrcy5cbiAgICAgICAgICBjdHguY2IgPSBjYlxuICAgICAgICAgIGNiID0gbnVsbFxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gY2hlY2soZGF0YSlcbiAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAvLyBBbGwgc3RyaW5ncyByZXR1cm5lZCBmcm9tIGNoZWNrIGFyZSBlcnJvcnMsIGNhbm5vdCBjb250aW51ZS5cbiAgICAgICAgICBhY2socmVzdWx0KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVzb2x2ZSB0aGUgY3VycmVudCBjb250ZXh0IGJlZm9yZSBwdXR0aW5nIGRhdGEuXG4gICAgICAgIGNvbnN0IHtpdGVtLCBzb3VsfSA9IHJlc29sdmUoe3B1dDogZGF0YX0sIGFjaylcbiAgICAgICAgaWYgKCFzb3VsKSByZXR1cm5cblxuICAgICAgICBpZiAocmVzdWx0ID09PSB0cnVlKSB7XG4gICAgICAgICAgLy8gV2hlbiByZXN1bHQgaXMgdHJ1ZSBkYXRhIGlzIGEgcHJvcGVydHkgdG8gcHV0IG9uIHRoZSBjdXJyZW50IHNvdWwuXG4gICAgICAgICAgLy8gTmVlZCB0byBjaGVjayBpZiBpdGVtIGlzIGEgcmVsIGFuZCBhbHNvIHNldCB0aGUgbm9kZSB0byBudWxsLiAoVGhpc1xuICAgICAgICAgIC8vIGFwcGxpZXMgZm9yIGFueSB1cGRhdGUgZnJvbSBhIHJlbCB0byBhIHByb3BlcnR5LCBub3QganVzdCBudWxsLilcbiAgICAgICAgICB3aXJlLmdldCh7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgICAgIGlmIChtc2cuZXJyKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBlcnJvciBnZXR0aW5nICR7c291bH06ICR7bXNnLmVycn1gKVxuICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IG1zZy5wdXQgJiYgbXNnLnB1dFtzb3VsXSAmJiBtc2cucHV0W3NvdWxdW2l0ZW1dXG4gICAgICAgICAgICBjb25zdCBpZCA9IHV0aWxzLnJlbC5pcyhjdXJyZW50KVxuICAgICAgICAgICAgaWYgKCFpZCkge1xuICAgICAgICAgICAgICAvLyBOb3QgYSByZWwsIGNhbiBqdXN0IHB1dCB0aGUgZGF0YS5cbiAgICAgICAgICAgICAgd2lyZS5wdXQoZ3JhcGgoc291bCwge1tpdGVtXTogZGF0YX0pLCBhY2spXG4gICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aXJlLmdldCh7XCIjXCI6IGlkfSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgICAgICAgaWYgKG1zZy5lcnIpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgZ2V0dGluZyAke2lkfTogJHttc2cuZXJyfWApXG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAoIW1zZy5wdXQgfHwgIW1zZy5wdXRbaWRdKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yICR7aWR9IG5vdCBmb3VuZGApXG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBkZWxldGUgbXNnLnB1dFtpZF0uX1xuICAgICAgICAgICAgICAvLyBudWxsIGVhY2ggb2YgdGhlIHByb3BlcnRpZXMgb24gdGhlIG5vZGUgYmVmb3JlIHB1dHRpbmcgZGF0YS5cbiAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMobXNnLnB1dFtpZF0pKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXJyID0gYXdhaXQgbmV3IFByb21pc2UocmVzID0+IHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IF9jdHhpZCA9IHV0aWxzLnRleHQucmFuZG9tKClcbiAgICAgICAgICAgICAgICAgIGFsbGN0eC5zZXQoX2N0eGlkLCB7Y2hhaW46IFt7aXRlbToga2V5LCBzb3VsOiBpZH1dfSlcbiAgICAgICAgICAgICAgICAgIGFwaShfY3R4aWQpLnB1dChudWxsLCByZXMpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICBhY2soZXJyKVxuICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHdpcmUucHV0KGdyYXBoKHNvdWwsIHtbaXRlbV06IGRhdGF9KSwgYWNrKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3RoZXJ3aXNlIHB1dCB0aGUgZGF0YSB1c2luZyB0aGUga2V5cyByZXR1cm5lZCBpbiByZXN1bHQuXG4gICAgICAgIC8vIE5lZWQgdG8gY2hlY2sgaWYgYSByZWwgaGFzIGFscmVhZHkgYmVlbiBhZGRlZCBvbiB0aGUgY3VycmVudCBub2RlLlxuICAgICAgICB3aXJlLmdldCh7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgICBpZiAobXNnLmVycikge1xuICAgICAgICAgICAgYWNrKGBlcnJvciBnZXR0aW5nICR7c291bH06ICR7bXNnLmVycn1gKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgY3VycmVudCA9IG1zZy5wdXQgJiYgbXNnLnB1dFtzb3VsXSAmJiBtc2cucHV0W3NvdWxdW2l0ZW1dXG4gICAgICAgICAgY29uc3QgaWQgPSB1dGlscy5yZWwuaXMoY3VycmVudClcbiAgICAgICAgICBpZiAoIWlkKSB7XG4gICAgICAgICAgICAvLyBUaGUgY3VycmVudCByZWwgZG9lc24ndCBleGlzdCwgc28gYWRkIGl0IGZpcnN0LlxuICAgICAgICAgICAgY29uc3QgcmVsID0ge1tpdGVtXTogdXRpbHMucmVsLmlmeSh1dGlscy50ZXh0LnJhbmRvbSgpKX1cbiAgICAgICAgICAgIHdpcmUucHV0KGdyYXBoKHNvdWwsIHJlbCksIGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBhY2soYGVycm9yIHB1dHRpbmcgJHtpdGVtfSBvbiAke3NvdWx9OiAke2Vycn1gKVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IF9jdHhpZCA9IHV0aWxzLnRleHQucmFuZG9tKClcbiAgICAgICAgICAgICAgICBjb25zdCBjaGFpbiA9IFt7aXRlbTogaXRlbSwgc291bDogc291bH1dXG4gICAgICAgICAgICAgICAgLy8gUGFzcyB0aGUgcHJldmlvdXMgY29udGV4dCdzIGNhbGxiYWNrIG9uIGhlcmUuXG4gICAgICAgICAgICAgICAgYWxsY3R4LnNldChfY3R4aWQsIHtjaGFpbjogY2hhaW4sIGNiOiBjdHguY2J9KVxuICAgICAgICAgICAgICAgIGFwaShfY3R4aWQpLnB1dChkYXRhKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IHB1dCA9IGZhbHNlXG4gICAgICAgICAgY29uc3QgdXBkYXRlID0ge31cbiAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiByZXN1bHQpIHtcbiAgICAgICAgICAgIGNvbnN0IGVyciA9IGF3YWl0IG5ldyBQcm9taXNlKHJlcyA9PiB7XG4gICAgICAgICAgICAgIGlmICh1dGlscy5vYmouaXMoZGF0YVtrZXldKSkge1xuICAgICAgICAgICAgICAgIC8vIFVzZSB0aGUgY3VycmVudCByZWwgYXMgdGhlIGNvbnRleHQgZm9yIG5lc3RlZCBvYmplY3RzLlxuICAgICAgICAgICAgICAgIGNvbnN0IF9jdHhpZCA9IHV0aWxzLnRleHQucmFuZG9tKClcbiAgICAgICAgICAgICAgICBhbGxjdHguc2V0KF9jdHhpZCwge2NoYWluOiBbe2l0ZW06IGtleSwgc291bDogaWR9XX0pXG4gICAgICAgICAgICAgICAgYXBpKF9jdHhpZCkucHV0KGRhdGFba2V5XSwgcmVzKVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHB1dCA9IHRydWVcbiAgICAgICAgICAgICAgICAvLyBHcm91cCBvdGhlciBwcm9wZXJ0aWVzIGludG8gb25lIHVwZGF0ZS5cbiAgICAgICAgICAgICAgICB1cGRhdGVba2V5XSA9IGRhdGFba2V5XVxuICAgICAgICAgICAgICAgIHJlcyhudWxsKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICBhY2soZXJyKVxuICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHB1dCkgd2lyZS5wdXQoZ3JhcGgoaWQsIHVwZGF0ZSksIGFjaylcbiAgICAgICAgICBlbHNlIGFjaygpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgb246IGNiID0+IHtcbiAgICAgICAgaWYgKCFjYikgcmV0dXJuXG5cbiAgICAgICAgaWYgKCFjdHhpZCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFwicGxlYXNlIHByb3ZpZGUgYSBrZXkgdXNpbmcgZ2V0KGtleSlcIilcbiAgICAgICAgICBjYihudWxsKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVzb2x2ZSB0aGUgY3VycmVudCBjb250ZXh0IGJlZm9yZSBhZGRpbmcgZXZlbnQgbGlzdGVuZXIuXG4gICAgICAgIGNvbnN0IHtpdGVtLCBzb3VsfSA9IHJlc29sdmUoe29uOiB0cnVlfSwgY2IpXG4gICAgICAgIGlmICghc291bCkgcmV0dXJuXG5cbiAgICAgICAgLy8gRmxhZyB0aGF0IHRoaXMgY29udGV4dCBpcyBzZXQgZnJvbSBvbiBhbmQgc2hvdWxkbid0IGJlIHJlbW92ZWQuXG4gICAgICAgIGFsbGN0eC5zZXQoY3R4aWQsIHtjaGFpbjogW3tpdGVtOiBpdGVtLCBzb3VsOiBzb3VsfV0sIG9uOiB0cnVlfSlcbiAgICAgICAgLy8gTWFwIHRoZSB1c2VyJ3MgY2FsbGJhY2sgYmVjYXVzZSBpdCBjYW4gYWxzbyBiZSBwYXNzZWQgdG8gb2ZmLFxuICAgICAgICAvLyBzbyBuZWVkIGEgcmVmZXJlbmNlIHRvIGl0IHRvIGNvbXBhcmUgdGhlbS5cbiAgICAgICAgbWFwLnNldChjYiwgKCkgPT4gYXBpKGN0eGlkKS50aGVuKG51bGwsIGNiKSlcbiAgICAgICAgLy8gQ2hlY2sgaWYgaXRlbSBpcyBhIHJlbCBhbmQgYWRkIGV2ZW50IGxpc3RlbmVyIGZvciB0aGUgbm9kZS5cbiAgICAgICAgd2lyZS5nZXQoe1wiI1wiOiBzb3VsLCBcIi5cIjogaXRlbX0sIGFzeW5jIG1zZyA9PiB7XG4gICAgICAgICAgaWYgKG1zZy5lcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBlcnJvciBnZXR0aW5nICR7c291bH06ICR7bXNnLmVycn1gKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgY3VycmVudCA9IG1zZy5wdXQgJiYgbXNnLnB1dFtzb3VsXSAmJiBtc2cucHV0W3NvdWxdW2l0ZW1dXG4gICAgICAgICAgY29uc3QgaWQgPSB1dGlscy5yZWwuaXMoY3VycmVudClcbiAgICAgICAgICBpZiAoaWQpIHdpcmUub24oe1wiI1wiOiBpZH0sIG1hcC5nZXQoY2IpKVxuICAgICAgICAgIGVsc2Ugd2lyZS5vbih7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgbWFwLmdldChjYikpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgb2ZmOiBjYiA9PiB7XG4gICAgICAgIGlmICghY3R4aWQpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcInBsZWFzZSBwcm92aWRlIGEga2V5IHVzaW5nIGdldChrZXkpXCIpXG4gICAgICAgICAgaWYgKGNiKSBjYihudWxsKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVzb2x2ZSB0aGUgY3VycmVudCBjb250ZXh0IGJlZm9yZSByZW1vdmluZyBldmVudCBsaXN0ZW5lci5cbiAgICAgICAgY29uc3Qge2l0ZW0sIHNvdWx9ID0gcmVzb2x2ZSh7b2ZmOiB0cnVlfSwgY2IpXG4gICAgICAgIGlmICghc291bCkgcmV0dXJuXG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgaXRlbSBpcyBhIHJlbCBhbmQgcmVtb3ZlIGV2ZW50IGxpc3RlbmVyIGZvciB0aGUgbm9kZS5cbiAgICAgICAgd2lyZS5nZXQoe1wiI1wiOiBzb3VsLCBcIi5cIjogaXRlbX0sIGFzeW5jIG1zZyA9PiB7XG4gICAgICAgICAgaWYgKG1zZy5lcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBlcnJvciBnZXR0aW5nICR7c291bH06ICR7bXNnLmVycn1gKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgY3VycmVudCA9IG1zZy5wdXQgJiYgbXNnLnB1dFtzb3VsXSAmJiBtc2cucHV0W3NvdWxdW2l0ZW1dXG4gICAgICAgICAgY29uc3QgaWQgPSB1dGlscy5yZWwuaXMoY3VycmVudClcbiAgICAgICAgICBpZiAoaWQpIHdpcmUub2ZmKHtcIiNcIjogaWR9LCBtYXAuZ2V0KGNiKSlcbiAgICAgICAgICBlbHNlIHdpcmUub2ZmKHtcIiNcIjogc291bCwgXCIuXCI6IGl0ZW19LCBtYXAuZ2V0KGNiKSlcbiAgICAgICAgICBtYXAuZGVsZXRlKGNiKVxuICAgICAgICAgIGFsbGN0eC5kZWxldGUoY3R4aWQpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgLy8gQWxsb3cgdGhlIHdpcmUgc3BlYyB0byBiZSB1c2VkIHZpYSBob2xzdGVyLlxuICAgICAgd2lyZTogd2lyZSxcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFwaSgpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gSG9sc3RlclxuIiwiY29uc3QgUmFkaXggPSByZXF1aXJlKFwiLi9yYWRpeFwiKVxuY29uc3QgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKVxuXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIGVuZCBvZiB0ZXh0LlxuY29uc3QgZXR4ID0gU3RyaW5nLmZyb21DaGFyQ29kZSgzKVxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciBlbnF1aXJ5LlxuY29uc3QgZW5xID0gU3RyaW5nLmZyb21DaGFyQ29kZSg1KVxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciB1bml0IHNlcGFyYXRvci5cbmNvbnN0IHVuaXQgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDMxKVxuXG4vLyBSYWRpc2sgcHJvdmlkZXMgYWNjZXNzIHRvIGEgcmFkaXggdHJlZSB0aGF0IGlzIHN0b3JlZCBpbiB0aGUgcHJvdmlkZWRcbi8vIG9wdC5zdG9yZSBpbnRlcmZhY2UuXG5jb25zdCBSYWRpc2sgPSBvcHQgPT4ge1xuICB2YXIgdVxuICB2YXIgY2FjaGUgPSBudWxsXG5cbiAgaWYgKCFvcHQpIG9wdCA9IHt9XG4gIGlmICghb3B0LmxvZykgb3B0LmxvZyA9IGNvbnNvbGUubG9nXG4gIGlmICghb3B0LmJhdGNoKSBvcHQuYmF0Y2ggPSAxMCAqIDEwMDBcbiAgaWYgKCFvcHQud3JpdGUpIG9wdC53cml0ZSA9IDEgLy8gV2FpdCB0aW1lIGJlZm9yZSB3cml0ZSBpbiBtaWxsaXNlY29uZHMuXG4gIGlmICghb3B0LnNpemUpIG9wdC5zaXplID0gMTAyNCAqIDEwMjQgLy8gRmlsZSBzaXplIG9uIGRpc2ssIGRlZmF1bHQgMU1CLlxuICBpZiAoIW9wdC5zdG9yZSkge1xuICAgIG9wdC5sb2coXG4gICAgICBcIlJhZGlzayBuZWVkcyBgc3RvcmVgIGludGVyZmFjZSB3aXRoIGB7Z2V0OiBmbiwgcHV0OiBmbiwgbGlzdDogZm59YFwiLFxuICAgIClcbiAgICByZXR1cm5cbiAgfVxuICBpZiAoIW9wdC5zdG9yZS5nZXQpIHtcbiAgICBvcHQubG9nKFwiUmFkaXNrIG5lZWRzIGBzdG9yZS5nZXRgIGludGVyZmFjZSB3aXRoIGAoZmlsZSwgY2IpYFwiKVxuICAgIHJldHVyblxuICB9XG4gIGlmICghb3B0LnN0b3JlLnB1dCkge1xuICAgIG9wdC5sb2coXCJSYWRpc2sgbmVlZHMgYHN0b3JlLnB1dGAgaW50ZXJmYWNlIHdpdGggYChmaWxlLCBkYXRhLCBjYilgXCIpXG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKCFvcHQuc3RvcmUubGlzdCkge1xuICAgIG9wdC5sb2coXCJSYWRpc2sgbmVlZHMgYSBzdHJlYW1pbmcgYHN0b3JlLmxpc3RgIGludGVyZmFjZSB3aXRoIGAoY2IpYFwiKVxuICAgIHJldHVyblxuICB9XG5cbiAgLy8gQW55IGFuZCBhbGwgc3RvcmFnZSBhZGFwdGVycyBzaG91bGQ6XG4gIC8vIDEuIEJlY2F1c2Ugd3JpdGluZyB0byBkaXNrIHRha2VzIHRpbWUsIHdlIHNob3VsZCBiYXRjaCBkYXRhIHRvIGRpc2suXG4gIC8vICAgIFRoaXMgaW1wcm92ZXMgcGVyZm9ybWFuY2UsIGFuZCByZWR1Y2VzIHBvdGVudGlhbCBkaXNrIGNvcnJ1cHRpb24uXG4gIC8vIDIuIElmIGEgYmF0Y2ggZXhjZWVkcyBhIGNlcnRhaW4gbnVtYmVyIG9mIHdyaXRlcywgd2Ugc2hvdWxkIGltbWVkaWF0ZWx5XG4gIC8vICAgIHdyaXRlIHRvIGRpc2sgd2hlbiBwaHlzaWNhbGx5IHBvc3NpYmxlLiBUaGlzIGNhcHMgdG90YWwgcGVyZm9ybWFuY2UsXG4gIC8vICAgIGJ1dCByZWR1Y2VzIHBvdGVudGlhbCBsb3NzLlxuICBjb25zdCByYWRpc2sgPSAoa2V5LCB2YWx1ZSwgY2IpID0+IHtcbiAgICBrZXkgPSBcIlwiICsga2V5XG5cbiAgICAvLyBJZiBubyB2YWx1ZSBpcyBwcm92aWRlZCB0aGVuIHRoZSBzZWNvbmQgcGFyYW1ldGVyIGlzIHRoZSBjYWxsYmFja1xuICAgIC8vIGZ1bmN0aW9uLiBSZWFkIHZhbHVlIGZyb20gbWVtb3J5IG9yIGRpc2sgYW5kIGNhbGwgY2FsbGJhY2sgd2l0aCBpdC5cbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIGNiID0gdmFsdWVcbiAgICAgIHZhbHVlID0gcmFkaXNrLmJhdGNoKGtleSlcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgcmV0dXJuIGNiKHUsIHZhbHVlKVxuICAgICAgfVxuXG4gICAgICBpZiAocmFkaXNrLnRocmFzaC5hdCkge1xuICAgICAgICB2YWx1ZSA9IHJhZGlzay50aHJhc2guYXQoa2V5KVxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgcmV0dXJuIGNiKHUsIHZhbHVlKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByYWRpc2sucmVhZChrZXksIGNiKVxuICAgIH1cblxuICAgIC8vIE90aGVyd2lzZSBzdG9yZSB0aGUgdmFsdWUgcHJvdmlkZWQuXG4gICAgcmFkaXNrLmJhdGNoKGtleSwgdmFsdWUpXG4gICAgaWYgKGNiKSB7XG4gICAgICByYWRpc2suYmF0Y2guYWNrcy5wdXNoKGNiKVxuICAgIH1cbiAgICAvLyBEb24ndCB3YWl0IGlmIHdlIGhhdmUgYmF0Y2hlZCB0b28gbWFueS5cbiAgICBpZiAoKytyYWRpc2suYmF0Y2guZWQgPj0gb3B0LmJhdGNoKSB7XG4gICAgICByZXR1cm4gcmFkaXNrLnRocmFzaCgpXG4gICAgfVxuXG4gICAgLy8gT3RoZXJ3aXNlIHdhaXQgZm9yIG1vcmUgdXBkYXRlcyBiZWZvcmUgd3JpdGluZy5cbiAgICBjbGVhclRpbWVvdXQocmFkaXNrLmJhdGNoLnRpbWVvdXQpXG4gICAgcmFkaXNrLmJhdGNoLnRpbWVvdXQgPSBzZXRUaW1lb3V0KHJhZGlzay50aHJhc2gsIG9wdC53cml0ZSlcbiAgfVxuXG4gIHJhZGlzay5iYXRjaCA9IFJhZGl4KClcbiAgcmFkaXNrLmJhdGNoLmFja3MgPSBbXVxuICByYWRpc2suYmF0Y2guZWQgPSAwXG5cbiAgcmFkaXNrLnRocmFzaCA9ICgpID0+IHtcbiAgICBpZiAocmFkaXNrLnRocmFzaC5pbmcpIHtcbiAgICAgIHJldHVybiAocmFkaXNrLnRocmFzaC5tb3JlID0gdHJ1ZSlcbiAgICB9XG5cbiAgICBjbGVhclRpbWVvdXQocmFkaXNrLmJhdGNoLnRpbWVvdXQpXG4gICAgcmFkaXNrLnRocmFzaC5tb3JlID0gZmFsc2VcbiAgICByYWRpc2sudGhyYXNoLmluZyA9IHRydWVcbiAgICB2YXIgYmF0Y2ggPSAocmFkaXNrLnRocmFzaC5hdCA9IHJhZGlzay5iYXRjaClcbiAgICByYWRpc2suYmF0Y2ggPSBudWxsXG4gICAgcmFkaXNrLmJhdGNoID0gUmFkaXgoKVxuICAgIHJhZGlzay5iYXRjaC5hY2tzID0gW11cbiAgICByYWRpc2suYmF0Y2guZWQgPSAwXG4gICAgbGV0IGkgPSAwXG4gICAgcmFkaXNrLnNhdmUoYmF0Y2gsIGVyciA9PiB7XG4gICAgICAvLyBUaGlzIGlzIHRvIGlnbm9yZSBtdWx0aXBsZSBjYWxsYmFja3MgZnJvbSByYWRpc2suc2F2ZSBjYWxsaW5nXG4gICAgICAvLyByYWRpc2sud3JpdGU/IEl0IGxvb2tzIGxpa2UgbXVsdGlwbGUgY2FsbGJhY2tzIHdpbGwgYmUgbWFkZSBpZiBhXG4gICAgICAvLyBmaWxlIG5lZWRzIHRvIGJlIHNwbGl0LlxuICAgICAgaWYgKCsraSA+IDEpIHJldHVyblxuXG4gICAgICBpZiAoZXJyKSBvcHQubG9nKGVycilcbiAgICAgIGJhdGNoLmFja3MuZm9yRWFjaChjYiA9PiBjYihlcnIpKVxuICAgICAgcmFkaXNrLnRocmFzaC5hdCA9IG51bGxcbiAgICAgIHJhZGlzay50aHJhc2guaW5nID0gZmFsc2VcbiAgICAgIGlmIChyYWRpc2sudGhyYXNoLm1vcmUpIHJhZGlzay50aHJhc2goKVxuICAgIH0pXG4gIH1cblxuICAvLyAxLiBGaW5kIHRoZSBmaXJzdCByYWRpeCBpdGVtIGluIG1lbW9yeVxuICAvLyAyLiBVc2UgdGhhdCBhcyB0aGUgc3RhcnRpbmcgaW5kZXggaW4gdGhlIGRpcmVjdG9yeSBvZiBmaWxlc1xuICAvLyAzLiBGaW5kIHRoZSBmaXJzdCBmaWxlIHRoYXQgaXMgbGV4aWNhbGx5IGxhcmdlciB0aGFuIGl0XG4gIC8vIDQuIFJlYWQgdGhlIHByZXZpb3VzIGZpbGUgaW50byBtZW1vcnlcbiAgLy8gNS4gU2NhbiB0aHJvdWdoIGluIG1lbW9yeSByYWRpeCBmb3IgYWxsIHZhbHVlcyBsZXhpY2FsbHkgbGVzcyB0aGFuIGxpbWl0XG4gIC8vIDYuIE1lcmdlIGFuZCB3cml0ZSBhbGwgb2YgdGhvc2UgdG8gdGhlIGluLW1lbW9yeSBmaWxlIGFuZCBiYWNrIHRvIGRpc2tcbiAgLy8gNy4gSWYgZmlsZSBpcyB0byBsYXJnZSB0aGVuIHNwbGl0LiBNb3JlIGRldGFpbHMgbmVlZGVkIGhlcmVcbiAgcmFkaXNrLnNhdmUgPSAocmFkLCBjYikgPT4ge1xuICAgIGNvbnN0IHNhdmUgPSB7XG4gICAgICBmaW5kOiAodHJlZSwga2V5KSA9PiB7XG4gICAgICAgIC8vIFRoaXMgaXMgZmFsc2UgZm9yIGFueSBrZXkgdW50aWwgc2F2ZS5zdGFydCBpcyBzZXQgdG8gYW4gaW5pdGlhbCBrZXkuXG4gICAgICAgIGlmIChrZXkgPCBzYXZlLnN0YXJ0KSByZXR1cm5cblxuICAgICAgICBzYXZlLnN0YXJ0ID0ga2V5XG4gICAgICAgIG9wdC5zdG9yZS5saXN0KHNhdmUubGV4KVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfSxcbiAgICAgIGxleDogZmlsZSA9PiB7XG4gICAgICAgIGlmICghZmlsZSB8fCBmaWxlID4gc2F2ZS5zdGFydCkge1xuICAgICAgICAgIHNhdmUuZW5kID0gZmlsZVxuICAgICAgICAgIC8vICEgaXMgdXNlZCBhcyB0aGUgZmlyc3QgZmlsZSBuYW1lIGFzIGl0J3MgdGhlIGZpcnN0IHByaW50YWJsZVxuICAgICAgICAgIC8vIGNoYXJhY3Rlciwgc28gYWx3YXlzIG1hdGNoZXMgYXMgbGV4aWNhbGx5IGxlc3MgdGhhbiBhbnkgbm9kZS5cbiAgICAgICAgICBzYXZlLm1peChzYXZlLmZpbGUgfHwgXCIhXCIsIHNhdmUuc3RhcnQsIHNhdmUuZW5kKVxuICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH1cblxuICAgICAgICBzYXZlLmZpbGUgPSBmaWxlXG4gICAgICB9LFxuICAgICAgbWl4OiAoZmlsZSwgc3RhcnQsIGVuZCkgPT4ge1xuICAgICAgICBzYXZlLnN0YXJ0ID0gc2F2ZS5lbmQgPSBzYXZlLmZpbGUgPSB1XG4gICAgICAgIHJhZGlzay5wYXJzZShmaWxlLCAoZXJyLCBkaXNrKSA9PiB7XG4gICAgICAgICAgaWYgKGVycikgcmV0dXJuIGNiKGVycilcblxuICAgICAgICAgIFJhZGl4Lm1hcChyYWQsICh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgICAgICBpZiAoa2V5IDwgc3RhcnQpIHJldHVyblxuXG4gICAgICAgICAgICBpZiAoZW5kICYmIGVuZCA8IGtleSkge1xuICAgICAgICAgICAgICBzYXZlLnN0YXJ0ID0ga2V5XG4gICAgICAgICAgICAgIHJldHVybiBzYXZlLnN0YXJ0XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRpc2soa2V5LCB2YWx1ZSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJhZGlzay53cml0ZShmaWxlLCBkaXNrLCBzYXZlLm5leHQpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgbmV4dDogZXJyID0+IHtcbiAgICAgICAgaWYgKGVycikgcmV0dXJuIGNiKGVycilcblxuICAgICAgICBpZiAoc2F2ZS5zdGFydCkgcmV0dXJuIFJhZGl4Lm1hcChyYWQsIHNhdmUuZmluZClcblxuICAgICAgICBjYihlcnIpXG4gICAgICB9LFxuICAgIH1cbiAgICBSYWRpeC5tYXAocmFkLCBzYXZlLmZpbmQpXG4gIH1cblxuICByYWRpc2sud3JpdGUgPSAoZmlsZSwgcmFkLCBjYikgPT4ge1xuICAgIC8vIEludmFsaWRhdGUgY2FjaGUgb24gd3JpdGUuXG4gICAgY2FjaGUgPSBudWxsXG4gICAgY29uc3Qgd3JpdGUgPSB7XG4gICAgICB0ZXh0OiBcIlwiLFxuICAgICAgY291bnQ6IDAsXG4gICAgICBmaWxlOiBmaWxlLFxuICAgICAgZWFjaDogKHZhbHVlLCBrZXksIGssIHByZSkgPT4ge1xuICAgICAgICB3cml0ZS5jb3VudCsrXG4gICAgICAgIHZhciBlbmMgPVxuICAgICAgICAgIFJhZGlzay5lbmNvZGUocHJlLmxlbmd0aCkgK1xuICAgICAgICAgIFwiI1wiICtcbiAgICAgICAgICBSYWRpc2suZW5jb2RlKGspICtcbiAgICAgICAgICAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiID8gXCJcIiA6IFwiPVwiICsgUmFkaXNrLmVuY29kZSh2YWx1ZSkpICtcbiAgICAgICAgICBcIlxcblwiXG4gICAgICAgIC8vIENhbm5vdCBzcGxpdCB0aGUgZmlsZSBpZiBvbmx5IGhhdmUgb25lIGVudHJ5IHRvIHdyaXRlLlxuICAgICAgICBpZiAod3JpdGUuY291bnQgPiAxICYmIHdyaXRlLnRleHQubGVuZ3RoICsgZW5jLmxlbmd0aCA+IG9wdC5zaXplKSB7XG4gICAgICAgICAgd3JpdGUudGV4dCA9IFwiXCJcbiAgICAgICAgICAvLyBPdGhlcndpc2Ugc3BsaXQgdGhlIGVudHJpZXMgaW4gaGFsZi5cbiAgICAgICAgICB3cml0ZS5saW1pdCA9IE1hdGguY2VpbCh3cml0ZS5jb3VudCAvIDIpXG4gICAgICAgICAgd3JpdGUuY291bnQgPSAwXG4gICAgICAgICAgd3JpdGUuc3ViID0gUmFkaXgoKVxuICAgICAgICAgIFJhZGl4Lm1hcChyYWQsIHdyaXRlLnNsaWNlKVxuICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH1cblxuICAgICAgICB3cml0ZS50ZXh0ICs9IGVuY1xuICAgICAgfSxcbiAgICAgIHB1dDogKCkgPT4ge1xuICAgICAgICBvcHQuc3RvcmUucHV0KGZpbGUsIHdyaXRlLnRleHQsIGNiKVxuICAgICAgfSxcbiAgICAgIHNsaWNlOiAodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5IDwgd3JpdGUuZmlsZSkgcmV0dXJuXG5cbiAgICAgICAgaWYgKCsrd3JpdGUuY291bnQgPiB3cml0ZS5saW1pdCkge1xuICAgICAgICAgIHZhciBuYW1lID0gd3JpdGUuZmlsZVxuICAgICAgICAgIC8vIFVzZSBvbmx5IHRoZSBzb3VsIG9mIHRoZSBrZXkgYXMgdGhlIGZpbGVuYW1lIHNvIHRoYXQgYWxsXG4gICAgICAgICAgLy8gcHJvcGVydGllcyBvZiBhIHNvdWwgYXJlIHdyaXR0ZW4gdG8gdGhlIHNhbWUgZmlsZS5cbiAgICAgICAgICBsZXQgZW5kID0ga2V5LmluZGV4T2YoZW5xKVxuICAgICAgICAgIGlmIChlbmQgPT09IC0xKSB7XG4gICAgICAgICAgICB3cml0ZS5maWxlID0ga2V5XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHdyaXRlLmZpbGUgPSBrZXkuc3Vic3RyaW5nKDAsIGVuZClcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gd3JpdGUubGltaXQgY2FuIGJlIHJlYWNoZWQgYWZ0ZXIgYWxyZWFkeSB3cml0aW5nIHByb3BlcnRpZXMgb2ZcbiAgICAgICAgICAvLyB0aGUgY3VycmVudCBub2RlLCBzbyByZW1vdmUgaXQgZnJvbSB3cml0ZS5zdWIgYmVmb3JlIHdyaXRpbmcgdG9cbiAgICAgICAgICAvLyBkaXNrIHNvIHRoYXQgaXQncyBub3QgZHVwbGljYXRlZCBhY3Jvc3MgZmlsZXMuXG4gICAgICAgICAgd3JpdGUuc3ViKHdyaXRlLmZpbGUsIG51bGwpXG4gICAgICAgICAgd3JpdGUuY291bnQgPSAwXG4gICAgICAgICAgcmFkaXNrLndyaXRlKG5hbWUsIHdyaXRlLnN1Yiwgd3JpdGUubmV4dClcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG5cbiAgICAgICAgd3JpdGUuc3ViKGtleSwgdmFsdWUpXG4gICAgICB9LFxuICAgICAgbmV4dDogZXJyID0+IHtcbiAgICAgICAgaWYgKGVycikgcmV0dXJuIGNiKGVycilcblxuICAgICAgICB3cml0ZS5zdWIgPSBSYWRpeCgpXG4gICAgICAgIGlmICghUmFkaXgubWFwKHJhZCwgd3JpdGUuc2xpY2UpKSB7XG4gICAgICAgICAgcmFkaXNrLndyaXRlKHdyaXRlLmZpbGUsIHdyaXRlLnN1YiwgY2IpXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfVxuICAgIC8vIElmIFJhZGl4Lm1hcCBkb2Vzbid0IHJldHVybiB0cnVlIHdoZW4gY2FsbGVkIHdpdGggd3JpdGUuZWFjaCBhcyBhXG4gICAgLy8gY2FsbGJhY2sgdGhlbiBkaWRuJ3QgbmVlZCB0byBzcGxpdCB0aGUgZGF0YS4gVGhlIGFjY3VtdWxhdGVkIHdyaXRlLnRleHRcbiAgICAvLyBjYW4gdGhlbiBiZSBzdG9yZWQgd2l0aCB3cml0ZS5wdXQoKS5cbiAgICBpZiAoIVJhZGl4Lm1hcChyYWQsIHdyaXRlLmVhY2gsIHRydWUpKSB3cml0ZS5wdXQoKVxuICB9XG5cbiAgcmFkaXNrLnJlYWQgPSAoa2V5LCBjYikgPT4ge1xuICAgIGlmIChjYWNoZSkge1xuICAgICAgbGV0IHZhbHVlID0gY2FjaGUoa2V5KVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIGNiKHUsIHZhbHVlKVxuICAgIH1cbiAgICAvLyBPbmx5IHRoZSBzb3VsIG9mIHRoZSBrZXkgaXMgY29tcGFyZWQgdG8gZmlsZW5hbWVzIChzZWUgcmFkaXNrLndyaXRlKS5cbiAgICBsZXQgc291bCA9IGtleVxuICAgIGxldCBlbmQgPSBrZXkuaW5kZXhPZihlbnEpXG4gICAgaWYgKGVuZCAhPT0gLTEpIHtcbiAgICAgIHNvdWwgPSBrZXkuc3Vic3RyaW5nKDAsIGVuZClcbiAgICB9XG5cbiAgICBjb25zdCByZWFkID0ge1xuICAgICAgbGV4OiBmaWxlID0+IHtcbiAgICAgICAgLy8gc3RvcmUubGlzdCBzaG91bGQgY2FsbCBsZXggd2l0aG91dCBhIGZpbGUgbGFzdCwgd2hpY2ggbWVhbnMgYWxsIGZpbGVcbiAgICAgICAgLy8gbmFtZXMgd2VyZSBjb21wYXJlZCB0byBzb3VsLCBzbyB0aGUgY3VycmVudCByZWFkLmZpbGUgaXMgb2sgdG8gdXNlLlxuICAgICAgICBpZiAoIWZpbGUpIHtcbiAgICAgICAgICBpZiAoIXJlYWQuZmlsZSkge1xuICAgICAgICAgICAgY2IoXCJubyBmaWxlIGZvdW5kXCIsIHUpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICByYWRpc2sucGFyc2UocmVhZC5maWxlLCByZWFkLml0KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gV2FudCB0aGUgZmlsZW5hbWUgY2xvc2VzdCB0byBzb3VsLlxuICAgICAgICBpZiAoZmlsZSA+IHNvdWwgfHwgZmlsZSA8IHJlYWQuZmlsZSkgcmV0dXJuXG5cbiAgICAgICAgcmVhZC5maWxlID0gZmlsZVxuICAgICAgfSxcbiAgICAgIGl0OiAoZXJyLCBkaXNrKSA9PiB7XG4gICAgICAgIGlmIChlcnIpIG9wdC5sb2coZXJyKVxuICAgICAgICBpZiAoZGlzaykge1xuICAgICAgICAgIGNhY2hlID0gZGlza1xuICAgICAgICAgIHJlYWQudmFsdWUgPSBkaXNrKGtleSlcbiAgICAgICAgfVxuICAgICAgICBjYihlcnIsIHJlYWQudmFsdWUpXG4gICAgICB9LFxuICAgIH1cbiAgICBvcHQuc3RvcmUubGlzdChyZWFkLmxleClcbiAgfVxuXG4gIC8vIExldCB1cyBzdGFydCBieSBhc3N1bWluZyB3ZSBhcmUgdGhlIG9ubHkgcHJvY2VzcyB0aGF0IGlzXG4gIC8vIGNoYW5naW5nIHRoZSBkaXJlY3Rvcnkgb3IgYnVja2V0LiBOb3QgYmVjYXVzZSB3ZSBkbyBub3Qgd2FudFxuICAvLyB0byBiZSBtdWx0aS1wcm9jZXNzL21hY2hpbmUsIGJ1dCBiZWNhdXNlIHdlIHdhbnQgdG8gZXhwZXJpbWVudFxuICAvLyB3aXRoIGhvdyBtdWNoIHBlcmZvcm1hbmNlIGFuZCBzY2FsZSB3ZSBjYW4gZ2V0IG91dCBvZiBvbmx5IG9uZS5cbiAgLy8gVGhlbiB3ZSBjYW4gd29yayBvbiB0aGUgaGFyZGVyIHByb2JsZW0gb2YgYmVpbmcgbXVsdGktcHJvY2Vzcy5cbiAgcmFkaXNrLnBhcnNlID0gKGZpbGUsIGNiKSA9PiB7XG4gICAgY29uc3QgcGFyc2UgPSB7XG4gICAgICBkaXNrOiBSYWRpeCgpLFxuICAgICAgcmVhZDogKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuXG4gICAgICAgIGlmICghZGF0YSkgcmV0dXJuIGNiKHUsIHBhcnNlLmRpc2spXG5cbiAgICAgICAgbGV0IHByZSA9IFtdXG4gICAgICAgIC8vIFdvcmsgdGhvdWdoIGRhdGEgYnkgc3BsaXR0aW5nIGludG8gMyB2YWx1ZXMuIFRoZSBmaXJzdCB2YWx1ZSBzYXlzXG4gICAgICAgIC8vIGlmIHRoZSBzZWNvbmQgdmFsdWUgaXMgb25lIG9mOiB0aGUgcmFkaXggbGV2ZWwgZm9yIGEga2V5LCB0aGUga2V5XG4gICAgICAgIC8vIGl0ZXNlbGYsIG9yIGEgdmFsdWUuIFRoZSB0aGlyZCBpcyB0aGUgcmVzdCBvZiB0aGUgZGF0YSB0byB3b3JrIHdpdGguXG4gICAgICAgIGxldCB0bXAgPSBwYXJzZS5zcGxpdChkYXRhKVxuICAgICAgICB3aGlsZSAodG1wKSB7XG4gICAgICAgICAgbGV0IGtleVxuICAgICAgICAgIGxldCB2YWx1ZVxuICAgICAgICAgIGxldCBpID0gdG1wWzFdXG4gICAgICAgICAgdG1wID0gcGFyc2Uuc3BsaXQodG1wWzJdKSB8fCBcIlwiXG4gICAgICAgICAgaWYgKHRtcFswXSA9PT0gXCIjXCIpIHtcbiAgICAgICAgICAgIGtleSA9IHRtcFsxXVxuICAgICAgICAgICAgcHJlID0gcHJlLnNsaWNlKDAsIGkpXG4gICAgICAgICAgICBpZiAoaSA8PSBwcmUubGVuZ3RoKSBwcmUucHVzaChrZXkpXG4gICAgICAgICAgfVxuICAgICAgICAgIHRtcCA9IHBhcnNlLnNwbGl0KHRtcFsyXSkgfHwgXCJcIlxuICAgICAgICAgIGlmICh0bXBbMF0gPT09IFwiXFxuXCIpIGNvbnRpbnVlXG5cbiAgICAgICAgICBpZiAodG1wWzBdID09PSBcIj1cIikgdmFsdWUgPSB0bXBbMV1cbiAgICAgICAgICBpZiAodHlwZW9mIGtleSAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgdmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHBhcnNlLmRpc2socHJlLmpvaW4oXCJcIiksIHZhbHVlKVxuICAgICAgICAgIH1cbiAgICAgICAgICB0bXAgPSBwYXJzZS5zcGxpdCh0bXBbMl0pXG4gICAgICAgIH1cbiAgICAgICAgY2IodSwgcGFyc2UuZGlzaylcbiAgICAgIH0sXG4gICAgICBzcGxpdDogZGF0YSA9PiB7XG4gICAgICAgIGlmICghZGF0YSkgcmV0dXJuXG5cbiAgICAgICAgbGV0IGkgPSAtMVxuICAgICAgICBsZXQgYSA9IFwiXCJcbiAgICAgICAgbGV0IGMgPSBudWxsXG4gICAgICAgIHdoaWxlICgoYyA9IGRhdGFbKytpXSkpIHtcbiAgICAgICAgICBpZiAoYyA9PT0gdW5pdCkgYnJlYWtcblxuICAgICAgICAgIGEgKz0gY1xuICAgICAgICB9XG4gICAgICAgIGxldCBvID0ge31cbiAgICAgICAgaWYgKGMpIHtcbiAgICAgICAgICByZXR1cm4gW2EsIFJhZGlzay5kZWNvZGUoZGF0YS5zbGljZShpKSwgbyksIGRhdGEuc2xpY2UoaSArIG8uaSldXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfVxuICAgIG9wdC5zdG9yZS5nZXQoZmlsZSwgcGFyc2UucmVhZClcbiAgfVxuXG4gIHJldHVybiByYWRpc2tcbn1cblxuUmFkaXNrLmVuY29kZSA9IGRhdGEgPT4ge1xuICAvLyBBIGtleSBzaG91bGQgYmUgcGFzc2VkIGluIGFzIGEgc3RyaW5nIHRvIGVuY29kZSwgYSB2YWx1ZSBjYW4gb3B0aW9uYWxseSBiZVxuICAvLyBhbiBhcnJheSBvZiAyIGl0ZW1zIHRvIGluY2x1ZGUgdGhlIHZhbHVlJ3Mgc3RhdGUsIGFzIGlzIGRvbmUgYnkgc3RvcmUuanMuXG4gIGxldCBzdGF0ZSA9IFwiXCJcbiAgaWYgKGRhdGEgaW5zdGFuY2VvZiBBcnJheSAmJiBkYXRhLmxlbmd0aCA9PT0gMikge1xuICAgIHN0YXRlID0gZXR4ICsgZGF0YVsxXVxuICAgIGRhdGEgPSBkYXRhWzBdXG4gIH1cblxuICBpZiAodHlwZW9mIGRhdGEgPT09IFwic3RyaW5nXCIpIHtcbiAgICBsZXQgaSA9IDBcbiAgICBsZXQgY3VycmVudCA9IG51bGxcbiAgICBsZXQgdGV4dCA9IHVuaXRcbiAgICB3aGlsZSAoKGN1cnJlbnQgPSBkYXRhW2krK10pKSB7XG4gICAgICBpZiAoY3VycmVudCA9PT0gdW5pdCkgdGV4dCArPSB1bml0XG4gICAgfVxuICAgIHJldHVybiB0ZXh0ICsgJ1wiJyArIGRhdGEgKyBzdGF0ZSArIHVuaXRcbiAgfVxuXG4gIGNvbnN0IHJlbCA9IHV0aWxzLnJlbC5pcyhkYXRhKVxuICBpZiAocmVsKSByZXR1cm4gdW5pdCArIFwiI1wiICsgcmVsICsgc3RhdGUgKyB1bml0XG5cbiAgaWYgKHV0aWxzLm51bS5pcyhkYXRhKSkgcmV0dXJuIHVuaXQgKyBcIitcIiArIChkYXRhIHx8IDApICsgc3RhdGUgKyB1bml0XG5cbiAgaWYgKGRhdGEgPT09IHRydWUpIHJldHVybiB1bml0ICsgXCIrXCIgKyBzdGF0ZSArIHVuaXRcblxuICBpZiAoZGF0YSA9PT0gZmFsc2UpIHJldHVybiB1bml0ICsgXCItXCIgKyBzdGF0ZSArIHVuaXRcblxuICBpZiAoZGF0YSA9PT0gbnVsbCkgcmV0dXJuIHVuaXQgKyBcIiBcIiArIHN0YXRlICsgdW5pdFxufVxuXG5SYWRpc2suZGVjb2RlID0gKGRhdGEsIG9iaikgPT4ge1xuICB2YXIgdGV4dCA9IFwiXCJcbiAgdmFyIGkgPSAtMVxuICB2YXIgbiA9IDBcbiAgdmFyIGN1cnJlbnQgPSBudWxsXG4gIHZhciBwcmV2aW91cyA9IG51bGxcbiAgaWYgKGRhdGFbMF0gIT09IHVuaXQpIHJldHVyblxuXG4gIC8vIEZpbmQgYSBjb250cm9sIGNoYXJhY3RlciBwcmV2aW91cyB0byB0aGUgdGV4dCB3ZSB3YW50LCBza2lwcGluZ1xuICAvLyBjb25zZWN1dGl2ZSB1bml0IHNlcGFyYXRvciBjaGFyYWN0ZXJzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGRhdGEuXG4gIHdoaWxlICgoY3VycmVudCA9IGRhdGFbKytpXSkpIHtcbiAgICBpZiAocHJldmlvdXMpIHtcbiAgICAgIGlmIChjdXJyZW50ID09PSB1bml0KSB7XG4gICAgICAgIGlmICgtLW4gPD0gMCkgYnJlYWtcbiAgICAgIH1cbiAgICAgIHRleHQgKz0gY3VycmVudFxuICAgIH0gZWxzZSBpZiAoY3VycmVudCA9PT0gdW5pdCkge1xuICAgICAgbisrXG4gICAgfSBlbHNlIHtcbiAgICAgIHByZXZpb3VzID0gY3VycmVudCB8fCB0cnVlXG4gICAgfVxuICB9XG5cbiAgaWYgKG9iaikgb2JqLmkgPSBpICsgMVxuXG4gIGxldCBbdmFsdWUsIHN0YXRlXSA9IHRleHQuc3BsaXQoZXR4KVxuICBpZiAoIXN0YXRlKSB7XG4gICAgaWYgKHByZXZpb3VzID09PSAnXCInKSByZXR1cm4gdGV4dFxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIiNcIikgcmV0dXJuIHV0aWxzLnJlbC5pZnkodGV4dClcblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCIrXCIpIHtcbiAgICAgIGlmICh0ZXh0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIHRydWVcblxuICAgICAgcmV0dXJuIHBhcnNlRmxvYXQodGV4dClcbiAgICB9XG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiLVwiKSByZXR1cm4gZmFsc2VcblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCIgXCIpIHJldHVybiBudWxsXG4gIH0gZWxzZSB7XG4gICAgc3RhdGUgPSBwYXJzZUZsb2F0KHN0YXRlKVxuICAgIC8vIElmIHN0YXRlIHdhcyBmb3VuZCB0aGVuIHJldHVybiBhbiBhcnJheS5cbiAgICBpZiAocHJldmlvdXMgPT09ICdcIicpIHJldHVybiBbdmFsdWUsIHN0YXRlXVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIiNcIikgcmV0dXJuIFt1dGlscy5yZWwuaWZ5KHZhbHVlKSwgc3RhdGVdXG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiK1wiKSB7XG4gICAgICBpZiAodmFsdWUubGVuZ3RoID09PSAwKSByZXR1cm4gW3RydWUsIHN0YXRlXVxuXG4gICAgICByZXR1cm4gW3BhcnNlRmxvYXQodmFsdWUpLCBzdGF0ZV1cbiAgICB9XG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiLVwiKSByZXR1cm4gW2ZhbHNlLCBzdGF0ZV1cblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCIgXCIpIHJldHVybiBbbnVsbCwgc3RhdGVdXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSYWRpc2tcbiIsImNvbnN0IHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIilcblxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciBncm91cCBzZXBhcmF0b3IuXG5jb25zdCBncm91cCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMjkpXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIHJlY29yZCBzZXBhcmF0b3IuXG5jb25zdCByZWNvcmQgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDMwKVxuXG5jb25zdCBSYWRpeCA9ICgpID0+IHtcbiAgY29uc3QgcmFkaXggPSAoa2V5cywgdmFsdWUsIHRyZWUpID0+IHtcbiAgICBpZiAoIXRyZWUpIHtcbiAgICAgIGlmICghcmFkaXhbZ3JvdXBdKSByYWRpeFtncm91cF0gPSB7fVxuICAgICAgdHJlZSA9IHJhZGl4W2dyb3VwXVxuICAgIH1cbiAgICBpZiAoIWtleXMpIHJldHVybiB0cmVlXG5cbiAgICBsZXQgaSA9IDBcbiAgICBsZXQgdG1wID0ge31cbiAgICBsZXQga2V5ID0ga2V5c1tpXVxuICAgIGNvbnN0IG1heCA9IGtleXMubGVuZ3RoIC0gMVxuICAgIGNvbnN0IG5vVmFsdWUgPSB0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCJcbiAgICAvLyBGaW5kIGEgbWF0Y2hpbmcgdmFsdWUgdXNpbmcgdGhlIHNob3J0ZXN0IHN0cmluZyBmcm9tIGtleXMuXG4gICAgbGV0IGZvdW5kID0gdHJlZVtrZXldXG4gICAgd2hpbGUgKCFmb3VuZCAmJiBpIDwgbWF4KSB7XG4gICAgICBrZXkgKz0ga2V5c1srK2ldXG4gICAgICBmb3VuZCA9IHRyZWVba2V5XVxuICAgIH1cblxuICAgIGlmICghZm91bmQpIHtcbiAgICAgIC8vIElmIG5vdCBmb3VuZCBmcm9tIHRoZSBwcm92aWRlZCBrZXlzIHRyeSBtYXRjaGluZyB3aXRoIGFuIGV4aXN0aW5nIGtleS5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IHV0aWxzLm9iai5tYXAodHJlZSwgKGhhc1ZhbHVlLCBoYXNLZXkpID0+IHtcbiAgICAgICAgbGV0IGogPSAwXG4gICAgICAgIGxldCBtYXRjaGluZ0tleSA9IFwiXCJcbiAgICAgICAgd2hpbGUgKGhhc0tleVtqXSA9PT0ga2V5c1tqXSkge1xuICAgICAgICAgIG1hdGNoaW5nS2V5ICs9IGhhc0tleVtqKytdXG4gICAgICAgIH1cbiAgICAgICAgaWYgKG1hdGNoaW5nS2V5KSB7XG4gICAgICAgICAgaWYgKG5vVmFsdWUpIHtcbiAgICAgICAgICAgIC8vIG1hdGNoaW5nS2V5IGhhcyB0byBiZSBhcyBsb25nIGFzIHRoZSBvcmlnaW5hbCBrZXlzIHdoZW4gcmVhZGluZy5cbiAgICAgICAgICAgIGlmIChqIDw9IG1heCkgcmV0dXJuXG5cbiAgICAgICAgICAgIHRtcFtoYXNLZXkuc2xpY2UoaildID0gaGFzVmFsdWVcbiAgICAgICAgICAgIHJldHVybiBoYXNWYWx1ZVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGxldCByZXBsYWNlID0ge1xuICAgICAgICAgICAgW2hhc0tleS5zbGljZShqKV06IGhhc1ZhbHVlLFxuICAgICAgICAgICAgW2tleXMuc2xpY2UoaildOiB7W3JlY29yZF06IHZhbHVlfSxcbiAgICAgICAgICB9XG4gICAgICAgICAgdHJlZVttYXRjaGluZ0tleV0gPSB7W2dyb3VwXTogcmVwbGFjZX1cbiAgICAgICAgICBkZWxldGUgdHJlZVtoYXNLZXldXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgIGlmIChub1ZhbHVlKSByZXR1cm5cblxuICAgICAgICBpZiAoIXRyZWVba2V5XSkgdHJlZVtrZXldID0ge31cbiAgICAgICAgdHJlZVtrZXldW3JlY29yZF0gPSB2YWx1ZVxuICAgICAgfSBlbHNlIGlmIChub1ZhbHVlKSB7XG4gICAgICAgIHJldHVybiB0bXBcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGkgPT09IG1heCkge1xuICAgICAgLy8gSWYgbm8gdmFsdWUgdXNlIHRoZSBrZXkgcHJvdmlkZWQgdG8gcmV0dXJuIGEgd2hvbGUgZ3JvdXAgb3IgcmVjb3JkLlxuICAgICAgaWYgKG5vVmFsdWUpIHtcbiAgICAgICAgLy8gSWYgYW4gaW5kaXZpZHVhbCByZWNvcmQgaXNuJ3QgZm91bmQgdGhlbiByZXR1cm4gdGhlIHdob2xlIGdyb3VwLlxuICAgICAgICByZXR1cm4gdHlwZW9mIGZvdW5kW3JlY29yZF0gPT09IFwidW5kZWZpbmVkXCJcbiAgICAgICAgICA/IGZvdW5kW2dyb3VwXVxuICAgICAgICAgIDogZm91bmRbcmVjb3JkXVxuICAgICAgfVxuICAgICAgLy8gT3RoZXJ3aXNlIGNyZWF0ZSBhIG5ldyByZWNvcmQgYXQgdGhlIHByb3ZpZGVkIGtleSBmb3IgdmFsdWUuXG4gICAgICBmb3VuZFtyZWNvcmRdID0gdmFsdWVcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRm91bmQgYXQgYSBzaG9ydGVyIGtleSwgdHJ5IGFnYWluLlxuICAgICAgaWYgKCFmb3VuZFtncm91cF0gJiYgIW5vVmFsdWUpIGZvdW5kW2dyb3VwXSA9IHt9XG4gICAgICByZXR1cm4gcmFkaXgoa2V5cy5zbGljZSgrK2kpLCB2YWx1ZSwgZm91bmRbZ3JvdXBdKVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmFkaXhcbn1cblxuUmFkaXgubWFwID0gZnVuY3Rpb24gbWFwKHJhZGl4LCBjYiwgb3B0LCBwcmUpIHtcbiAgaWYgKCFwcmUpIHByZSA9IFtdXG4gIHZhciB0cmVlID0gcmFkaXhbZ3JvdXBdIHx8IHJhZGl4XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModHJlZSkuc29ydCgpXG4gIHZhciB1XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgbGV0IGtleSA9IGtleXNbaV1cbiAgICBsZXQgZm91bmQgPSB0cmVlW2tleV1cbiAgICBsZXQgdG1wID0gZm91bmRbcmVjb3JkXVxuICAgIGlmICh0eXBlb2YgdG1wICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICB0bXAgPSBjYih0bXAsIHByZS5qb2luKFwiXCIpICsga2V5LCBrZXksIHByZSlcbiAgICAgIGlmICh0eXBlb2YgdG1wICE9PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gdG1wXG4gICAgfSBlbHNlIGlmIChvcHQpIHtcbiAgICAgIGNiKHUsIHByZS5qb2luKFwiXCIpLCBrZXksIHByZSlcbiAgICB9XG4gICAgaWYgKGZvdW5kW2dyb3VwXSkge1xuICAgICAgcHJlLnB1c2goa2V5KVxuICAgICAgdG1wID0gbWFwKGZvdW5kW2dyb3VwXSwgY2IsIG9wdCwgcHJlKVxuICAgICAgaWYgKHR5cGVvZiB0bXAgIT09IFwidW5kZWZpbmVkXCIpIHJldHVybiB0bXBcbiAgICAgIHByZS5wb3AoKVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFJhZGl4XG4iLCJjb25zdCBqc0VudiA9IHJlcXVpcmUoXCJicm93c2VyLW9yLW5vZGVcIilcbmNvbnN0IFJhZGlzayA9IHJlcXVpcmUoXCIuL3JhZGlza1wiKVxuY29uc3QgUmFkaXggPSByZXF1aXJlKFwiLi9yYWRpeFwiKVxuY29uc3QgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKVxuXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIGVucXVpcnkuXG5jb25zdCBlbnEgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDUpXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIHVuaXQgc2VwYXJhdG9yLlxuY29uc3QgdW5pdCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMzEpXG5cbmNvbnN0IGZpbGVTeXN0ZW0gPSBkaXIgPT4ge1xuICBpZiAoanNFbnYuaXNOb2RlKSB7XG4gICAgY29uc3QgZnMgPSByZXF1aXJlKFwiZnNcIilcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGRpcilcbiAgICB9XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGRpciArIFwiLyFcIikpIHtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoXG4gICAgICAgIGRpciArIFwiLyFcIixcbiAgICAgICAgdW5pdCArIFwiKzBcIiArIHVuaXQgKyBcIiNcIiArIHVuaXQgKyAnXCJyb290JyArIHVuaXQsXG4gICAgICApXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldDogKGZpbGUsIGNiKSA9PiB7XG4gICAgICAgIGZzLnJlYWRGaWxlKGRpciArIFwiL1wiICsgZmlsZSwgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PT0gXCJFTk9FTlRcIikge1xuICAgICAgICAgICAgICBjYigpXG4gICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcImZpbGVzeXN0ZW0gZXJyb3I6XCIsIGVycilcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGRhdGEpIGRhdGEgPSBkYXRhLnRvU3RyaW5nKClcbiAgICAgICAgICBjYihlcnIsIGRhdGEpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcHV0OiAoZmlsZSwgZGF0YSwgY2IpID0+IHtcbiAgICAgICAgdmFyIHJhbmRvbSA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKC05KVxuICAgICAgICAvLyBEb24ndCBwdXQgdG1wIGZpbGVzIHVuZGVyIGRpciBzbyB0aGF0IHRoZXkncmUgbm90IGxpc3RlZC5cbiAgICAgICAgdmFyIHRtcCA9IGZpbGUgKyBcIi5cIiArIHJhbmRvbSArIFwiLnRtcFwiXG4gICAgICAgIGZzLndyaXRlRmlsZSh0bXAsIGRhdGEsIGVyciA9PiB7XG4gICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgY2IoZXJyKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnMucmVuYW1lKHRtcCwgZGlyICsgXCIvXCIgKyBmaWxlLCBjYilcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBsaXN0OiBjYiA9PiB7XG4gICAgICAgIGZzLnJlYWRkaXIoZGlyLCAoZXJyLCBmaWxlcykgPT4ge1xuICAgICAgICAgIGZpbGVzLmZvckVhY2goY2IpXG4gICAgICAgICAgY2IoKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICB9XG4gIH1cblxuICAvLyBUT0RPOiBBZGQgaW5kZXhlZERCXG4gIHJldHVybiB7XG4gICAgZ2V0OiAoZmlsZSwgY2IpID0+IHtcbiAgICAgIGNiKG51bGwsIHVuaXQgKyBcIiswXCIgKyB1bml0ICsgXCIjXCIgKyB1bml0ICsgJ1wicm9vdCcgKyB1bml0KVxuICAgIH0sXG4gICAgcHV0OiAoZmlsZSwgZGF0YSwgY2IpID0+IHtcbiAgICAgIGNiKG51bGwpXG4gICAgfSxcbiAgICBsaXN0OiBjYiA9PiB7XG4gICAgICBjYihcIiFcIilcbiAgICAgIGNiKClcbiAgICB9LFxuICB9XG59XG5cbi8vIFN0b3JlIHByb3ZpZGVzIGdldCBhbmQgcHV0IG1ldGhvZHMgdGhhdCBjYW4gYWNjZXNzIHJhZGlzay5cbmNvbnN0IFN0b3JlID0gb3B0ID0+IHtcbiAgaWYgKCF1dGlscy5vYmouaXMob3B0KSkgb3B0ID0ge31cbiAgb3B0LmZpbGUgPSBTdHJpbmcob3B0LmZpbGUgfHwgXCJyYWRhdGFcIilcbiAgaWYgKCFvcHQuc3RvcmUpIG9wdC5zdG9yZSA9IGZpbGVTeXN0ZW0ob3B0LmZpbGUpXG4gIGNvbnN0IHJhZGlzayA9IFJhZGlzayhvcHQpXG5cbiAgcmV0dXJuIHtcbiAgICBnZXQ6IChsZXgsIGNiKSA9PiB7XG4gICAgICBpZiAoIWxleCkge1xuICAgICAgICBjYihcImxleCByZXF1aXJlZFwiKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgdmFyIHNvdWwgPSBsZXhbXCIjXCJdXG4gICAgICB2YXIga2V5ID0gbGV4W1wiLlwiXSB8fCBcIlwiXG4gICAgICB2YXIgbm9kZVxuICAgICAgY29uc3QgZWFjaCA9ICh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmICghbm9kZSkgbm9kZSA9IHtfOiB7XCIjXCI6IHNvdWwsIFwiPlwiOiB7fX19XG4gICAgICAgIG5vZGVba2V5XSA9IHZhbHVlWzBdXG4gICAgICAgIG5vZGUuX1tcIj5cIl1ba2V5XSA9IHZhbHVlWzFdXG4gICAgICB9XG5cbiAgICAgIHJhZGlzayhzb3VsICsgZW5xICsga2V5LCAoZXJyLCB2YWx1ZSkgPT4ge1xuICAgICAgICBsZXQgZ3JhcGhcbiAgICAgICAgaWYgKHV0aWxzLm9iai5pcyh2YWx1ZSkpIHtcbiAgICAgICAgICBSYWRpeC5tYXAodmFsdWUsIGVhY2gpXG4gICAgICAgICAgaWYgKCFub2RlKSBlYWNoKHZhbHVlLCBrZXkpXG4gICAgICAgICAgZ3JhcGggPSB7W3NvdWxdOiBub2RlfVxuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgZWFjaCh2YWx1ZSwga2V5KVxuICAgICAgICAgIGdyYXBoID0ge1tzb3VsXTogbm9kZX1cbiAgICAgICAgfVxuICAgICAgICBjYihlcnIsIGdyYXBoKVxuICAgICAgfSlcbiAgICB9LFxuICAgIHB1dDogKGdyYXBoLCBjYikgPT4ge1xuICAgICAgaWYgKCFncmFwaCkge1xuICAgICAgICBjYihcImdyYXBoIHJlcXVpcmVkXCIpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB2YXIgY291bnQgPSAwXG4gICAgICBjb25zdCBhY2sgPSBlcnIgPT4ge1xuICAgICAgICBjb3VudC0tXG4gICAgICAgIGlmIChhY2suZXJyKSByZXR1cm5cblxuICAgICAgICBhY2suZXJyID0gZXJyXG4gICAgICAgIGlmIChhY2suZXJyKSB7XG4gICAgICAgICAgY2IoYWNrLmVycilcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjb3VudCA9PT0gMCkgY2IobnVsbClcbiAgICAgIH1cblxuICAgICAgT2JqZWN0LmtleXMoZ3JhcGgpLmZvckVhY2goc291bCA9PiB7XG4gICAgICAgIHZhciBub2RlID0gZ3JhcGhbc291bF1cbiAgICAgICAgT2JqZWN0LmtleXMobm9kZSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmIChrZXkgPT09IFwiX1wiKSByZXR1cm5cblxuICAgICAgICAgIGNvdW50KytcbiAgICAgICAgICBsZXQgdmFsdWUgPSBub2RlW2tleV1cbiAgICAgICAgICBsZXQgc3RhdGUgPSBub2RlLl9bXCI+XCJdW2tleV1cbiAgICAgICAgICByYWRpc2soc291bCArIGVucSArIGtleSwgW3ZhbHVlLCBzdGF0ZV0sIGFjaylcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSxcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFN0b3JlXG4iLCJjb25zdCBudW0gPSB7XG4gIGlzOiBuID0+XG4gICAgIShuIGluc3RhbmNlb2YgQXJyYXkpICYmXG4gICAgKG4gLSBwYXJzZUZsb2F0KG4pICsgMSA+PSAwIHx8IEluZmluaXR5ID09PSBuIHx8IC1JbmZpbml0eSA9PT0gbiksXG59XG5cbmNvbnN0IG9iaiA9IHtcbiAgaXM6IG8gPT4ge1xuICAgIGlmICghbykgcmV0dXJuIGZhbHNlXG5cbiAgICByZXR1cm4gKFxuICAgICAgKG8gaW5zdGFuY2VvZiBPYmplY3QgJiYgby5jb25zdHJ1Y3RvciA9PT0gT2JqZWN0KSB8fFxuICAgICAgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pLm1hdGNoKC9eXFxbb2JqZWN0IChcXHcrKVxcXSQvKVsxXSA9PT1cbiAgICAgICAgXCJPYmplY3RcIlxuICAgIClcbiAgfSxcbiAgbWFwOiAobGlzdCwgY2IsIG8pID0+IHtcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGxpc3QpXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBsZXQgcmVzdWx0ID0gY2IobGlzdFtrZXlzW2ldXSwga2V5c1tpXSwgbylcbiAgICAgIGlmICh0eXBlb2YgcmVzdWx0ICE9PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gcmVzdWx0XG4gICAgfVxuICB9LFxuICBwdXQ6IChvLCBrZXksIHZhbHVlKSA9PiB7XG4gICAgaWYgKCFvKSBvID0ge31cbiAgICBvW2tleV0gPSB2YWx1ZVxuICAgIHJldHVybiBvXG4gIH0sXG4gIGRlbDogKG8sIGtleSkgPT4ge1xuICAgIGlmICghbykgcmV0dXJuXG5cbiAgICBvW2tleV0gPSBudWxsXG4gICAgZGVsZXRlIG9ba2V5XVxuICAgIHJldHVybiBvXG4gIH0sXG59XG5cbmNvbnN0IG1hcF9zb3VsID0gKHNvdWwsIGtleSwgbykgPT4ge1xuICAvLyBJZiBpZCBpcyBhbHJlYWR5IGRlZmluZWQgQU5EIHdlJ3JlIHN0aWxsIGxvb3BpbmcgdGhyb3VnaCB0aGUgb2JqZWN0LFxuICAvLyB0aGVuIGl0IGlzIGNvbnNpZGVyZWQgaW52YWxpZC5cbiAgaWYgKG8uaWQpIHtcbiAgICBvLmlkID0gZmFsc2VcbiAgICByZXR1cm5cbiAgfVxuXG4gIGlmIChrZXkgPT09IFwiI1wiICYmIHR5cGVvZiBzb3VsID09PSBcInN0cmluZ1wiKSB7XG4gICAgby5pZCA9IHNvdWxcbiAgICByZXR1cm5cbiAgfVxuXG4gIC8vIElmIHRoZXJlIGV4aXN0cyBhbnl0aGluZyBlbHNlIG9uIHRoZSBvYmplY3QgdGhhdCBpc24ndCB0aGUgc291bCxcbiAgLy8gdGhlbiBpdCBpcyBjb25zaWRlcmVkIGludmFsaWQuXG4gIG8uaWQgPSBmYWxzZVxufVxuXG4vLyBDaGVjayBpZiBhbiBvYmplY3QgaXMgYSBzb3VsIHJlbGF0aW9uLCBpZSB7JyMnOiAnVVVJRCd9XG5jb25zdCByZWwgPSB7XG4gIGlzOiB2YWx1ZSA9PiB7XG4gICAgaWYgKHZhbHVlICYmIHZhbHVlW1wiI1wiXSAmJiAhdmFsdWUuXyAmJiBvYmouaXModmFsdWUpKSB7XG4gICAgICBsZXQgbyA9IHt9XG4gICAgICBvYmoubWFwKHZhbHVlLCBtYXBfc291bCwgbylcbiAgICAgIGlmIChvLmlkKSByZXR1cm4gby5pZFxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZVxuICB9LFxuICAvLyBDb252ZXJ0IGEgc291bCBpbnRvIGEgcmVsYXRpb24gYW5kIHJldHVybiBpdC5cbiAgaWZ5OiBzb3VsID0+IG9iai5wdXQoe30sIFwiI1wiLCBzb3VsKSxcbn1cblxuY29uc3QgdGV4dCA9IHtcbiAgcmFuZG9tOiBsZW5ndGggPT4ge1xuICAgIHZhciBzID0gXCJcIlxuICAgIGNvbnN0IGMgPSBcIjAxMjM0NTY3ODlBQkNERUZHSElKS0xNTk9QUVJTVFVWV1haYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXpcIlxuICAgIGlmICghbGVuZ3RoKSBsZW5ndGggPSAyNFxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHMgKz0gYy5jaGFyQXQoTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogYy5sZW5ndGgpKVxuICAgIH1cbiAgICByZXR1cm4gc1xuICB9LFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtudW0sIG9iaiwgcmVsLCB0ZXh0fVxuIiwiY29uc3QganNFbnYgPSByZXF1aXJlKFwiYnJvd3Nlci1vci1ub2RlXCIpXG5jb25zdCBEdXAgPSByZXF1aXJlKFwiLi9kdXBcIilcbmNvbnN0IEdldCA9IHJlcXVpcmUoXCIuL2dldFwiKVxuY29uc3QgSGFtID0gcmVxdWlyZShcIi4vaGFtXCIpXG5jb25zdCBTdG9yZSA9IHJlcXVpcmUoXCIuL3N0b3JlXCIpXG5jb25zdCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpXG5cbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgZW5xdWlyeS5cbmNvbnN0IGVucSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoNSlcblxuLy8gV2lyZSBzdGFydHMgYSB3ZWJzb2NrZXQgY2xpZW50IG9yIHNlcnZlciBhbmQgcmV0dXJucyBnZXQgYW5kIHB1dCBtZXRob2RzXG4vLyBmb3IgYWNjZXNzIHRvIHRoZSB3aXJlIHNwZWMgYW5kIHN0b3JhZ2UuXG5jb25zdCBXaXJlID0gb3B0ID0+IHtcbiAgaWYgKCF1dGlscy5vYmouaXMob3B0KSkgb3B0ID0ge31cblxuICBjb25zdCBkdXAgPSBEdXAob3B0Lm1heEFnZSlcbiAgY29uc3Qgc3RvcmUgPSBTdG9yZShvcHQpXG4gIGNvbnN0IGdyYXBoID0ge31cbiAgY29uc3QgcXVldWUgPSB7fVxuICBjb25zdCBsaXN0ZW4gPSB7fVxuXG4gIGNvbnN0IGdldCA9IChtc2csIHNlbmQpID0+IHtcbiAgICBjb25zdCBhY2sgPSBHZXQobXNnLmdldCwgZ3JhcGgpXG4gICAgaWYgKGFjaykge1xuICAgICAgc2VuZChcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIFwiI1wiOiBkdXAudHJhY2sodXRpbHMudGV4dC5yYW5kb20oOSkpLFxuICAgICAgICAgIFwiQFwiOiBtc2dbXCIjXCJdLFxuICAgICAgICAgIHB1dDogYWNrLFxuICAgICAgICB9KSxcbiAgICAgIClcbiAgICB9IGVsc2Uge1xuICAgICAgc3RvcmUuZ2V0KG1zZy5nZXQsIChlcnIsIGFjaykgPT4ge1xuICAgICAgICBzZW5kKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIFwiI1wiOiBkdXAudHJhY2sodXRpbHMudGV4dC5yYW5kb20oOSkpLFxuICAgICAgICAgICAgXCJAXCI6IG1zZ1tcIiNcIl0sXG4gICAgICAgICAgICBwdXQ6IGFjayxcbiAgICAgICAgICAgIGVycjogZXJyLFxuICAgICAgICAgIH0pLFxuICAgICAgICApXG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHB1dCA9IChtc2csIHNlbmQpID0+IHtcbiAgICAvLyBTdG9yZSB1cGRhdGVzIHJldHVybmVkIGZyb20gSGFtLm1peCBhbmQgZGVmZXIgdXBkYXRlcyBpZiByZXF1aXJlZC5cbiAgICBjb25zdCB1cGRhdGUgPSBIYW0ubWl4KG1zZy5wdXQsIGdyYXBoLCBsaXN0ZW4pXG4gICAgc3RvcmUucHV0KHVwZGF0ZS5ub3csIGVyciA9PiB7XG4gICAgICBzZW5kKFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgXCIjXCI6IGR1cC50cmFjayh1dGlscy50ZXh0LnJhbmRvbSg5KSksXG4gICAgICAgICAgXCJAXCI6IG1zZ1tcIiNcIl0sXG4gICAgICAgICAgZXJyOiBlcnIsXG4gICAgICAgIH0pLFxuICAgICAgKVxuICAgIH0pXG4gICAgaWYgKHVwZGF0ZS53YWl0ICE9PSAwKSB7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHB1dCh7cHV0OiB1cGRhdGUuZGVmZXJ9LCBzZW5kKSwgdXBkYXRlLndhaXQpXG4gICAgfVxuICB9XG5cbiAgY29uc3QgYXBpID0gc2VuZCA9PiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGdldDogKGxleCwgY2IsIG9wdCkgPT4ge1xuICAgICAgICBpZiAoIWNiKSByZXR1cm5cblxuICAgICAgICBpZiAoIXV0aWxzLm9iai5pcyhvcHQpKSBvcHQgPSB7fVxuICAgICAgICBjb25zdCBhY2sgPSBHZXQobGV4LCBncmFwaClcbiAgICAgICAgaWYgKGFjaykge1xuICAgICAgICAgIGNiKHtwdXQ6IGFja30pXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBzdG9yZS5nZXQobGV4LCAoZXJyLCBhY2spID0+IHtcbiAgICAgICAgICBpZiAoYWNrKSB7XG4gICAgICAgICAgICBjYih7cHV0OiBhY2ssIGVycjogZXJyfSlcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChlcnIpIGNvbnNvbGUubG9nKGVycilcblxuICAgICAgICAgIGNvbnN0IHRyYWNrID0gdXRpbHMudGV4dC5yYW5kb20oOSlcbiAgICAgICAgICBxdWV1ZVt0cmFja10gPSBjYlxuICAgICAgICAgIHNlbmQoXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgIFwiI1wiOiBkdXAudHJhY2sodHJhY2spLFxuICAgICAgICAgICAgICBnZXQ6IGxleCxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIClcbiAgICAgICAgICAvLyBSZXNwb25kIHRvIGNhbGxiYWNrIHdpdGggbnVsbCBpZiBubyByZXNwb25zZS5cbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNiID0gcXVldWVbdHJhY2tdXG4gICAgICAgICAgICBpZiAoY2IpIHtcbiAgICAgICAgICAgICAgY29uc3QgaWQgPSBsZXhbXCIjXCJdXG4gICAgICAgICAgICAgIGNvbnN0IGFjayA9IHtbaWRdOiBudWxsfVxuICAgICAgICAgICAgICBpZiAobGV4W1wiLlwiXSkgYWNrW2lkXSA9IHtbbGV4W1wiLlwiXV06IG51bGx9XG4gICAgICAgICAgICAgIGNiKHtwdXQ6IGFja30pXG4gICAgICAgICAgICAgIGRlbGV0ZSBxdWV1ZVt0cmFja11cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LCBvcHQud2FpdCB8fCAxMDApXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcHV0OiAoZGF0YSwgY2IpID0+IHtcbiAgICAgICAgLy8gRGVmZXJyZWQgdXBkYXRlcyBhcmUgb25seSBzdG9yZWQgdXNpbmcgd2lyZSBzcGVjLCB0aGV5J3JlIGlnbm9yZWRcbiAgICAgICAgLy8gaGVyZSB1c2luZyB0aGUgYXBpLiBUaGlzIGlzIG9rIGJlY2F1c2UgY29ycmVjdCB0aW1lc3RhbXBzIHNob3VsZCBiZVxuICAgICAgICAvLyB1c2VkIHdoZXJlYXMgd2lyZSBzcGVjIG5lZWRzIHRvIGhhbmRsZSBjbG9jayBza2V3LlxuICAgICAgICBjb25zdCB1cGRhdGUgPSBIYW0ubWl4KGRhdGEsIGdyYXBoLCBsaXN0ZW4pXG4gICAgICAgIHN0b3JlLnB1dCh1cGRhdGUubm93LCBjYilcbiAgICAgICAgLy8gQWxzbyBwdXQgZGF0YSBvbiB0aGUgd2lyZSBzcGVjLlxuICAgICAgICAvLyBUT0RPOiBOb3RlIHRoYXQgdGhpcyBtZWFucyBhbGwgY2xpZW50cyBub3cgcmVjZWl2ZSBhbGwgdXBkYXRlcywgc29cbiAgICAgICAgLy8gbmVlZCB0byBmaWx0ZXIgd2hhdCBzaG91bGQgYmUgc3RvcmVkLCBib3RoIGluIGdyYXBoIGFuZCBvbiBkaXNrLlxuICAgICAgICBzZW5kKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIFwiI1wiOiBkdXAudHJhY2sodXRpbHMudGV4dC5yYW5kb20oOSkpLFxuICAgICAgICAgICAgcHV0OiBkYXRhLFxuICAgICAgICAgIH0pLFxuICAgICAgICApXG4gICAgICB9LFxuICAgICAgb246IChsZXgsIGNiKSA9PiB7XG4gICAgICAgIGlmICghY2IpIHJldHVyblxuXG4gICAgICAgIGxldCBpZCA9IGxleFtcIiNcIl1cbiAgICAgICAgaWYgKCFpZCkgcmV0dXJuXG5cbiAgICAgICAgaWYgKGxleFtcIi5cIl0pIGlkICs9IGVucSArIGxleFtcIi5cIl1cbiAgICAgICAgaWYgKGxpc3RlbltpZF0pIHtcbiAgICAgICAgICBpZiAoIWxpc3RlbltpZF0uaW5jbHVkZXMoY2IpKSBsaXN0ZW5baWRdLnB1c2goY2IpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbGlzdGVuW2lkXSA9IFtjYl1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIG9mZjogKGxleCwgY2IpID0+IHtcbiAgICAgICAgbGV0IGlkID0gbGV4W1wiI1wiXVxuICAgICAgICBpZiAoIWlkKSByZXR1cm5cblxuICAgICAgICBpZiAobGV4W1wiLlwiXSkgaWQgKz0gZW5xICsgbGV4W1wiLlwiXVxuICAgICAgICBpZiAoIWxpc3RlbltpZF0pIHJldHVyblxuXG4gICAgICAgIGlmIChjYikge1xuICAgICAgICAgIGlmIChsaXN0ZW5baWRdLmluY2x1ZGVzKGNiKSkge1xuICAgICAgICAgICAgbGlzdGVuW2lkXS5zcGxpY2UobGlzdGVuW2lkXS5pbmRleE9mKGNiKSwgMSlcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gUmVtb3ZlIGFsbCBjYWxsYmFja3Mgd2hlbiBub25lIHByb3ZpZGVkLlxuICAgICAgICAgIGRlbGV0ZSBsaXN0ZW5baWRdXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfVxuICB9XG5cbiAgaWYgKGpzRW52LmlzTm9kZSkge1xuICAgIGNvbnN0IFdlYlNvY2tldCA9IHJlcXVpcmUoXCJ3c1wiKVxuICAgIGxldCB3c3MgPSBvcHQud3NzXG4gICAgLy8gTm9kZSdzIHdlYnNvY2tldCBzZXJ2ZXIgcHJvdmlkZXMgY2xpZW50cyBhcyBhbiBhcnJheSwgd2hlcmVhc1xuICAgIC8vIG1vY2stc29ja2V0cyBwcm92aWRlcyBjbGllbnRzIGFzIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGFuIGFycmF5LlxuICAgIGxldCBjbGllbnRzID0gKCkgPT4gd3NzLmNsaWVudHMoKVxuICAgIGlmICghd3NzKSB7XG4gICAgICB3c3MgPSBuZXcgV2ViU29ja2V0LlNlcnZlcih7cG9ydDogODA4MH0pXG4gICAgICBjbGllbnRzID0gKCkgPT4gd3NzLmNsaWVudHNcbiAgICB9XG5cbiAgICBjb25zdCBzZW5kID0gKGRhdGEsIGlzQmluYXJ5KSA9PiB7XG4gICAgICBjbGllbnRzKCkuZm9yRWFjaChjbGllbnQgPT4ge1xuICAgICAgICBpZiAoY2xpZW50LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG4gICAgICAgICAgY2xpZW50LnNlbmQoZGF0YSwge2JpbmFyeTogaXNCaW5hcnl9KVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cbiAgICB3c3Mub24oXCJjb25uZWN0aW9uXCIsIHdzID0+IHtcbiAgICAgIHdzLm9uKFwiZXJyb3JcIiwgY29uc29sZS5lcnJvcilcblxuICAgICAgd3Mub24oXCJtZXNzYWdlXCIsIChkYXRhLCBpc0JpbmFyeSkgPT4ge1xuICAgICAgICBjb25zdCBtc2cgPSBKU09OLnBhcnNlKGRhdGEpXG4gICAgICAgIGlmIChkdXAuY2hlY2sobXNnW1wiI1wiXSkpIHJldHVyblxuXG4gICAgICAgIGR1cC50cmFjayhtc2dbXCIjXCJdKVxuICAgICAgICBpZiAobXNnLmdldCkgZ2V0KG1zZywgc2VuZClcbiAgICAgICAgaWYgKG1zZy5wdXQpIHB1dChtc2csIHNlbmQpXG4gICAgICAgIHNlbmQoZGF0YSwgaXNCaW5hcnkpXG5cbiAgICAgICAgY29uc3QgaWQgPSBtc2dbXCJAXCJdXG4gICAgICAgIGNvbnN0IGNiID0gcXVldWVbaWRdXG4gICAgICAgIGlmIChjYikge1xuICAgICAgICAgIGRlbGV0ZSBtc2dbXCIjXCJdXG4gICAgICAgICAgZGVsZXRlIG1zZ1tcIkBcIl1cbiAgICAgICAgICBjYihtc2cpXG5cbiAgICAgICAgICBkZWxldGUgcXVldWVbaWRdXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSlcbiAgICByZXR1cm4gYXBpKHNlbmQpXG4gIH1cblxuICBsZXQgd3MgPSBuZXcgV2ViU29ja2V0KFwid3M6Ly9sb2NhbGhvc3Q6ODA4MFwiKVxuICBjb25zdCBzZW5kID0gZGF0YSA9PiB7XG4gICAgaWYgKCF3cyB8fCB3cy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikge1xuICAgICAgY29uc29sZS5sb2coXCJ3ZWJzb2NrZXQgbm90IGF2YWlsYWJsZVwiKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgd3Muc2VuZChkYXRhKVxuICB9XG4gIGNvbnN0IHN0YXJ0ID0gKCkgPT4ge1xuICAgIGlmICghd3MpIHdzID0gbmV3IFdlYlNvY2tldChcIndzOi8vbG9jYWxob3N0OjgwODBcIilcbiAgICB3cy5vbmNsb3NlID0gYyA9PiB7XG4gICAgICB3cyA9IG51bGxcbiAgICAgIHNldFRpbWVvdXQoc3RhcnQsIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDUwMDApKVxuICAgIH1cbiAgICB3cy5vbmVycm9yID0gZSA9PiB7XG4gICAgICBjb25zb2xlLmVycm9yKGUpXG4gICAgfVxuICAgIHdzLm9ubWVzc2FnZSA9IG0gPT4ge1xuICAgICAgY29uc3QgbXNnID0gSlNPTi5wYXJzZShtLmRhdGEpXG4gICAgICBpZiAoZHVwLmNoZWNrKG1zZ1tcIiNcIl0pKSByZXR1cm5cblxuICAgICAgZHVwLnRyYWNrKG1zZ1tcIiNcIl0pXG4gICAgICBpZiAobXNnLmdldCkgZ2V0KG1zZywgc2VuZClcbiAgICAgIGlmIChtc2cucHV0KSBwdXQobXNnLCBzZW5kKVxuICAgICAgc2VuZChtLmRhdGEpXG5cbiAgICAgIGNvbnN0IGlkID0gbXNnW1wiQFwiXVxuICAgICAgY29uc3QgY2IgPSBxdWV1ZVtpZF1cbiAgICAgIGlmIChjYikge1xuICAgICAgICBkZWxldGUgbXNnW1wiI1wiXVxuICAgICAgICBkZWxldGUgbXNnW1wiQFwiXVxuICAgICAgICBjYihtc2cpXG5cbiAgICAgICAgZGVsZXRlIHF1ZXVlW2lkXVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXJ0KClcbiAgcmV0dXJuIGFwaShzZW5kKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFdpcmVcbiIsIi8qIChpZ25vcmVkKSAqLyIsIi8vIFRoZSBtb2R1bGUgY2FjaGVcbnZhciBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX18gPSB7fTtcblxuLy8gVGhlIHJlcXVpcmUgZnVuY3Rpb25cbmZ1bmN0aW9uIF9fd2VicGFja19yZXF1aXJlX18obW9kdWxlSWQpIHtcblx0Ly8gQ2hlY2sgaWYgbW9kdWxlIGlzIGluIGNhY2hlXG5cdHZhciBjYWNoZWRNb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdO1xuXHRpZiAoY2FjaGVkTW9kdWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY2FjaGVkTW9kdWxlLmV4cG9ydHM7XG5cdH1cblx0Ly8gQ3JlYXRlIGEgbmV3IG1vZHVsZSAoYW5kIHB1dCBpdCBpbnRvIHRoZSBjYWNoZSlcblx0dmFyIG1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF0gPSB7XG5cdFx0Ly8gbm8gbW9kdWxlLmlkIG5lZWRlZFxuXHRcdC8vIG5vIG1vZHVsZS5sb2FkZWQgbmVlZGVkXG5cdFx0ZXhwb3J0czoge31cblx0fTtcblxuXHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cblx0X193ZWJwYWNrX21vZHVsZXNfX1ttb2R1bGVJZF0obW9kdWxlLCBtb2R1bGUuZXhwb3J0cywgX193ZWJwYWNrX3JlcXVpcmVfXyk7XG5cblx0Ly8gUmV0dXJuIHRoZSBleHBvcnRzIG9mIHRoZSBtb2R1bGVcblx0cmV0dXJuIG1vZHVsZS5leHBvcnRzO1xufVxuXG4iLCIiLCIvLyBzdGFydHVwXG4vLyBMb2FkIGVudHJ5IG1vZHVsZSBhbmQgcmV0dXJuIGV4cG9ydHNcbi8vIFRoaXMgZW50cnkgbW9kdWxlIGlzIHJlZmVyZW5jZWQgYnkgb3RoZXIgbW9kdWxlcyBzbyBpdCBjYW4ndCBiZSBpbmxpbmVkXG52YXIgX193ZWJwYWNrX2V4cG9ydHNfXyA9IF9fd2VicGFja19yZXF1aXJlX18oXCIuL3NyYy9ob2xzdGVyLmpzXCIpO1xuIiwiIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9
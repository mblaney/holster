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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsV0FBVztBQUNYO0FBQ0EsU0FBUztBQUNULE9BQU87QUFDUDtBQUNBOztBQUVBOztBQUVBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxZQUFZO0FBQ1o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBOztBQUVBOztBQUVBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU07QUFDTjtBQUNBLE1BQU07QUFDTjtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBOztBQUVBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTs7QUFFQTtBQUNBLElBQUk7QUFDSjtBQUNBO0FB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dEJBO1VBQ0E7VUFDQTtVQUNBIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vSG9sc3Rlci8uL25vZGVfbW9kdWxlcy9icm93c2VyLW9yLW5vZGUvZGlzdC9pbmRleC5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vbm9kZV9tb2R1bGVzL3dzL2Jyb3dzZXIuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9kdXAuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9nZXQuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9oYW0uanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9ob2xzdGVyLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvcmFkaXNrLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvcmFkaXguanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9zdG9yZS5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL3V0aWxzLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvd2lyZS5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyL2lnbm9yZWR8L2hvbWUvbWFsL3dvcmsvaG9sc3Rlci9zcmN8ZnMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly9Ib2xzdGVyL3dlYnBhY2svYmVmb3JlLXN0YXJ0dXAiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL3N0YXJ0dXAiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL2FmdGVyLXN0YXJ0dXAiXSwic291cmNlc0NvbnRlbnQiOlsidmFyIF9fZGVmUHJvcCA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbnZhciBfX2dldE93blByb3BEZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcjtcbnZhciBfX2dldE93blByb3BOYW1lcyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzO1xudmFyIF9faGFzT3duUHJvcCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG52YXIgX19leHBvcnQgPSAodGFyZ2V0LCBhbGwpID0+IHtcbiAgZm9yICh2YXIgbmFtZSBpbiBhbGwpXG4gICAgX19kZWZQcm9wKHRhcmdldCwgbmFtZSwgeyBnZXQ6IGFsbFtuYW1lXSwgZW51bWVyYWJsZTogdHJ1ZSB9KTtcbn07XG52YXIgX19jb3B5UHJvcHMgPSAodG8sIGZyb20sIGV4Y2VwdCwgZGVzYykgPT4ge1xuICBpZiAoZnJvbSAmJiB0eXBlb2YgZnJvbSA9PT0gXCJvYmplY3RcIiB8fCB0eXBlb2YgZnJvbSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgZm9yIChsZXQga2V5IG9mIF9fZ2V0T3duUHJvcE5hbWVzKGZyb20pKVxuICAgICAgaWYgKCFfX2hhc093blByb3AuY2FsbCh0bywga2V5KSAmJiBrZXkgIT09IGV4Y2VwdClcbiAgICAgICAgX19kZWZQcm9wKHRvLCBrZXksIHsgZ2V0OiAoKSA9PiBmcm9tW2tleV0sIGVudW1lcmFibGU6ICEoZGVzYyA9IF9fZ2V0T3duUHJvcERlc2MoZnJvbSwga2V5KSkgfHwgZGVzYy5lbnVtZXJhYmxlIH0pO1xuICB9XG4gIHJldHVybiB0bztcbn07XG52YXIgX190b0NvbW1vbkpTID0gKG1vZCkgPT4gX19jb3B5UHJvcHMoX19kZWZQcm9wKHt9LCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KSwgbW9kKTtcblxuLy8gc3JjL2luZGV4LnRzXG52YXIgc3JjX2V4cG9ydHMgPSB7fTtcbl9fZXhwb3J0KHNyY19leHBvcnRzLCB7XG4gIGlzQnJvd3NlcjogKCkgPT4gaXNCcm93c2VyLFxuICBpc0J1bjogKCkgPT4gaXNCdW4sXG4gIGlzRGVubzogKCkgPT4gaXNEZW5vLFxuICBpc0pzRG9tOiAoKSA9PiBpc0pzRG9tLFxuICBpc05vZGU6ICgpID0+IGlzTm9kZSxcbiAgaXNXZWJXb3JrZXI6ICgpID0+IGlzV2ViV29ya2VyXG59KTtcbm1vZHVsZS5leHBvcnRzID0gX190b0NvbW1vbkpTKHNyY19leHBvcnRzKTtcbnZhciBpc0Jyb3dzZXIgPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiB3aW5kb3cuZG9jdW1lbnQgIT09IFwidW5kZWZpbmVkXCI7XG52YXIgaXNOb2RlID0gKFxuICAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgcHJvY2Vzcy52ZXJzaW9ucyAhPSBudWxsICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgcHJvY2Vzcy52ZXJzaW9ucy5ub2RlICE9IG51bGxcbik7XG52YXIgaXNXZWJXb3JrZXIgPSB0eXBlb2Ygc2VsZiA9PT0gXCJvYmplY3RcIiAmJiBzZWxmLmNvbnN0cnVjdG9yICYmIHNlbGYuY29uc3RydWN0b3IubmFtZSA9PT0gXCJEZWRpY2F0ZWRXb3JrZXJHbG9iYWxTY29wZVwiO1xudmFyIGlzSnNEb20gPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIHdpbmRvdy5uYW1lID09PSBcIm5vZGVqc1wiIHx8IHR5cGVvZiBuYXZpZ2F0b3IgIT09IFwidW5kZWZpbmVkXCIgJiYgXCJ1c2VyQWdlbnRcIiBpbiBuYXZpZ2F0b3IgJiYgdHlwZW9mIG5hdmlnYXRvci51c2VyQWdlbnQgPT09IFwic3RyaW5nXCIgJiYgKG5hdmlnYXRvci51c2VyQWdlbnQuaW5jbHVkZXMoXCJOb2RlLmpzXCIpIHx8IG5hdmlnYXRvci51c2VyQWdlbnQuaW5jbHVkZXMoXCJqc2RvbVwiKSk7XG52YXIgaXNEZW5vID0gKFxuICAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBEZW5vICE9PSBcInVuZGVmaW5lZFwiICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgdHlwZW9mIERlbm8udmVyc2lvbiAhPT0gXCJ1bmRlZmluZWRcIiAmJiAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBEZW5vLnZlcnNpb24uZGVubyAhPT0gXCJ1bmRlZmluZWRcIlxuKTtcbnZhciBpc0J1biA9IHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIHByb2Nlc3MudmVyc2lvbnMgIT0gbnVsbCAmJiBwcm9jZXNzLnZlcnNpb25zLmJ1biAhPSBudWxsO1xuLy8gQW5ub3RhdGUgdGhlIENvbW1vbkpTIGV4cG9ydCBuYW1lcyBmb3IgRVNNIGltcG9ydCBpbiBub2RlOlxuMCAmJiAobW9kdWxlLmV4cG9ydHMgPSB7XG4gIGlzQnJvd3NlcixcbiAgaXNCdW4sXG4gIGlzRGVubyxcbiAgaXNKc0RvbSxcbiAgaXNOb2RlLFxuICBpc1dlYldvcmtlclxufSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ3dzIGRvZXMgbm90IHdvcmsgaW4gdGhlIGJyb3dzZXIuIEJyb3dzZXIgY2xpZW50cyBtdXN0IHVzZSB0aGUgbmF0aXZlICcgK1xuICAgICAgJ1dlYlNvY2tldCBvYmplY3QnXG4gICk7XG59O1xuIiwiY29uc3QgRHVwID0gbWF4QWdlID0+IHtcbiAgLy8gQWxsb3cgbWF4QWdlIHRvIGJlIHBhc3NlZCBpbiBhcyB0ZXN0cyB3YWl0IG9uIHRoZSBzZXRUaW1lb3V0LlxuICBpZiAoIW1heEFnZSkgbWF4QWdlID0gOTAwMFxuICBjb25zdCBkdXAgPSB7c3RvcmU6IHt9fVxuICBkdXAuY2hlY2sgPSBpZCA9PiAoZHVwLnN0b3JlW2lkXSA/IGR1cC50cmFjayhpZCkgOiBmYWxzZSlcbiAgZHVwLnRyYWNrID0gaWQgPT4ge1xuICAgIC8vIEtlZXAgdGhlIGxpdmVsaW5lc3Mgb2YgdGhlIG1lc3NhZ2UgdXAgd2hpbGUgaXQgaXMgYmVpbmcgcmVjZWl2ZWQuXG4gICAgZHVwLnN0b3JlW2lkXSA9IERhdGUubm93KClcbiAgICBpZiAoIWR1cC5leHBpcnkpIHtcbiAgICAgIGR1cC5leHBpcnkgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKVxuICAgICAgICBPYmplY3Qua2V5cyhkdXAuc3RvcmUpLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgIGlmIChub3cgLSBkdXAuc3RvcmVbaWRdID4gbWF4QWdlKSBkZWxldGUgZHVwLnN0b3JlW2lkXVxuICAgICAgICB9KVxuICAgICAgICBkdXAuZXhwaXJ5ID0gbnVsbFxuICAgICAgfSwgbWF4QWdlKVxuICAgIH1cbiAgICByZXR1cm4gaWRcbiAgfVxuICByZXR1cm4gZHVwXG59XG5cbm1vZHVsZS5leHBvcnRzID0gRHVwXG4iLCJjb25zdCBHZXQgPSAobGV4LCBncmFwaCkgPT4ge1xuICBjb25zdCBzb3VsID0gbGV4W1wiI1wiXVxuICBjb25zdCBrZXkgPSBsZXhbXCIuXCJdXG4gIHZhciBub2RlID0gZ3JhcGhbc291bF1cblxuICAvLyBDYW4gb25seSByZXR1cm4gYSBub2RlIGlmIGEga2V5IGlzIHByb3ZpZGVkLCBiZWNhdXNlIHRoZSBncmFwaCBtYXkgbm90XG4gIC8vIGhhdmUgYWxsIHRoZSBrZXlzIHBvcHVsYXRlZCBmb3IgYSBnaXZlbiBzb3VsLiBUaGlzIGlzIGJlY2F1c2UgSGFtLm1peFxuICAvLyBvbmx5IGFkZHMgaW5jb21pbmcgY2hhbmdlcyB0byB0aGUgZ3JhcGguXG4gIGlmICghbm9kZSB8fCAha2V5KSByZXR1cm5cblxuICBsZXQgdmFsdWUgPSBub2RlW2tleV1cbiAgaWYgKCF2YWx1ZSkgcmV0dXJuXG5cbiAgbm9kZSA9IHtfOiBub2RlLl8sIFtrZXldOiB2YWx1ZX1cbiAgbm9kZS5fW1wiPlwiXSA9IHtba2V5XTogbm9kZS5fW1wiPlwiXVtrZXldfVxuICByZXR1cm4ge1tzb3VsXTogbm9kZX1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBHZXRcbiIsIi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgZW5xdWlyeS5cbmNvbnN0IGVucSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoNSlcblxuLy8gc3RhdGUgYW5kIHZhbHVlIGFyZSB0aGUgaW5jb21pbmcgY2hhbmdlcy5cbi8vIGN1cnJlbnRTdGF0ZSBhbmQgY3VycmVudFZhbHVlIGFyZSB0aGUgY3VycmVudCBncmFwaCBkYXRhLlxuY29uc3QgSGFtID0gKHN0YXRlLCBjdXJyZW50U3RhdGUsIHZhbHVlLCBjdXJyZW50VmFsdWUpID0+IHtcbiAgaWYgKHN0YXRlIDwgY3VycmVudFN0YXRlKSByZXR1cm4ge2hpc3RvcmljYWw6IHRydWV9XG5cbiAgaWYgKHN0YXRlID4gY3VycmVudFN0YXRlKSByZXR1cm4ge2luY29taW5nOiB0cnVlfVxuXG4gIC8vIHN0YXRlIGlzIGVxdWFsIHRvIGN1cnJlbnRTdGF0ZSwgbGV4aWNhbGx5IGNvbXBhcmUgdG8gcmVzb2x2ZSBjb25mbGljdC5cbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpIHx8IFwiXCJcbiAgfVxuICBpZiAodHlwZW9mIGN1cnJlbnRWYWx1ZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIGN1cnJlbnRWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KGN1cnJlbnRWYWx1ZSkgfHwgXCJcIlxuICB9XG4gIC8vIE5vIHVwZGF0ZSByZXF1aXJlZC5cbiAgaWYgKHZhbHVlID09PSBjdXJyZW50VmFsdWUpIHJldHVybiB7c3RhdGU6IHRydWV9XG5cbiAgLy8gS2VlcCB0aGUgY3VycmVudCB2YWx1ZS5cbiAgaWYgKHZhbHVlIDwgY3VycmVudFZhbHVlKSByZXR1cm4ge2N1cnJlbnQ6IHRydWV9XG5cbiAgLy8gT3RoZXJ3aXNlIHVwZGF0ZSB1c2luZyB0aGUgaW5jb21pbmcgdmFsdWUuXG4gIHJldHVybiB7aW5jb21pbmc6IHRydWV9XG59XG5cbkhhbS5taXggPSAoY2hhbmdlLCBncmFwaCwgbGlzdGVuKSA9PiB7XG4gIHZhciBtYWNoaW5lID0gRGF0ZS5ub3coKVxuICB2YXIgbm93ID0ge31cbiAgdmFyIGRlZmVyID0ge31cbiAgbGV0IHdhaXQgPSAwXG5cbiAgT2JqZWN0LmtleXMoY2hhbmdlKS5mb3JFYWNoKHNvdWwgPT4ge1xuICAgIGNvbnN0IG5vZGUgPSBjaGFuZ2Vbc291bF1cbiAgICBsZXQgdXBkYXRlZCA9IGZhbHNlXG4gICAgT2JqZWN0LmtleXMobm9kZSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PT0gXCJfXCIpIHJldHVyblxuXG4gICAgICBjb25zdCB2YWx1ZSA9IG5vZGVba2V5XVxuICAgICAgY29uc3Qgc3RhdGUgPSBub2RlLl9bXCI+XCJdW2tleV1cbiAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IChncmFwaFtzb3VsXSB8fCB7fSlba2V5XVxuICAgICAgY29uc3QgY3VycmVudFN0YXRlID0gKGdyYXBoW3NvdWxdIHx8IHtfOiB7XCI+XCI6IHt9fX0pLl9bXCI+XCJdW2tleV0gfHwgMFxuXG4gICAgICAvLyBEZWZlciB0aGUgdXBkYXRlIGlmIGFoZWFkIG9mIG1hY2hpbmUgdGltZS5cbiAgICAgIGNvbnN0IHNrZXcgPSBzdGF0ZSAtIG1hY2hpbmVcbiAgICAgIGlmIChza2V3ID4gMCkge1xuICAgICAgICAvLyBJZ25vcmUgdXBkYXRlIGlmIGFoZWFkIGJ5IG1vcmUgdGhhbiAyNCBob3Vycy5cbiAgICAgICAgaWYgKHNrZXcgPiA4NjQwMDAwMCkgcmV0dXJuXG5cbiAgICAgICAgLy8gV2FpdCB0aGUgc2hvcnRlc3QgZGlmZmVyZW5jZSBiZWZvcmUgdHJ5aW5nIHRoZSB1cGRhdGVzIGFnYWluLlxuICAgICAgICBpZiAod2FpdCA9PT0gMCB8fCBza2V3IDwgd2FpdCkgd2FpdCA9IHNrZXdcbiAgICAgICAgaWYgKCFkZWZlcltzb3VsXSkgZGVmZXJbc291bF0gPSB7Xzoge1wiI1wiOiBzb3VsLCBcIj5cIjoge319fVxuICAgICAgICBkZWZlcltzb3VsXVtrZXldID0gdmFsdWVcbiAgICAgICAgZGVmZXJbc291bF0uX1tcIj5cIl1ba2V5XSA9IHN0YXRlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBIYW0oc3RhdGUsIGN1cnJlbnRTdGF0ZSwgdmFsdWUsIGN1cnJlbnRWYWx1ZSlcbiAgICAgICAgaWYgKHJlc3VsdC5pbmNvbWluZykge1xuICAgICAgICAgIGlmICghbm93W3NvdWxdKSBub3dbc291bF0gPSB7Xzoge1wiI1wiOiBzb3VsLCBcIj5cIjoge319fVxuICAgICAgICAgIC8vIFRPRE86IGdyYXBoIHNob3VsZCBub3QganVzdCBncm93IGluZGVmaW50aXRlbHkgaW4gbWVtb3J5LlxuICAgICAgICAgIC8vIE5lZWQgdG8gaGF2ZSBhIG1heCBzaXplIGFmdGVyIHdoaWNoIHN0YXJ0IGRyb3BwaW5nIHRoZSBvbGRlc3Qgc3RhdGVcbiAgICAgICAgICAvLyBEbyBzb21ldGhpbmcgc2ltaWxhciB0byBEdXAgd2hpY2ggY2FuIGhhbmRsZSBkZWxldGVzP1xuICAgICAgICAgIGlmICghZ3JhcGhbc291bF0pIGdyYXBoW3NvdWxdID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgICBncmFwaFtzb3VsXVtrZXldID0gbm93W3NvdWxdW2tleV0gPSB2YWx1ZVxuICAgICAgICAgIGdyYXBoW3NvdWxdLl9bXCI+XCJdW2tleV0gPSBub3dbc291bF0uX1tcIj5cIl1ba2V5XSA9IHN0YXRlXG4gICAgICAgICAgLy8gQ2FsbCBldmVudCBsaXN0ZW5lcnMgZm9yIHVwZGF0ZSBvbiBrZXksIG1peCBpcyBjYWxsZWQgYmVmb3JlXG4gICAgICAgICAgLy8gcHV0IGhhcyBmaW5pc2hlZCBzbyB3YWl0IGZvciB3aGF0IGNvdWxkIGJlIG11bHRpcGxlIG5lc3RlZFxuICAgICAgICAgIC8vIHVwZGF0ZXMgb24gYSBub2RlLlxuICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaWQgPSBzb3VsICsgZW5xICsga2V5XG4gICAgICAgICAgICBpZiAobGlzdGVuW2lkXSkgbGlzdGVuW2lkXS5mb3JFYWNoKGNiID0+IGNiKCkpXG4gICAgICAgICAgfSwgMTAwKVxuICAgICAgICAgIHVwZGF0ZWQgPSB0cnVlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIC8vIENhbGwgZXZlbnQgbGlzdGVuZXJzIGZvciB1cGRhdGUgb24gc291bC5cbiAgICBpZiAodXBkYXRlZCAmJiBsaXN0ZW5bc291bF0pXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgbGlzdGVuW3NvdWxdLmZvckVhY2goY2IgPT4gY2IoKSlcbiAgICAgIH0sIDEwMClcbiAgfSlcbiAgcmV0dXJuIHtub3c6IG5vdywgZGVmZXI6IGRlZmVyLCB3YWl0OiB3YWl0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEhhbVxuIiwiY29uc3QgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKVxuY29uc3QgV2lyZSA9IHJlcXVpcmUoXCIuL3dpcmVcIilcblxuY29uc3QgSG9sc3RlciA9IG9wdCA9PiB7XG4gIGNvbnN0IHdpcmUgPSBXaXJlKG9wdClcbiAgLy8gTWFwIGNhbGxiYWNrcyBzaW5jZSB0aGUgdXNlcidzIGNhbGxiYWNrIGlzIG5vdCBwYXNzZWQgdG8gd2lyZS5vbi5cbiAgY29uc3QgbWFwID0gbmV3IE1hcCgpXG4gIC8vIEFsbG93IGNvbmN1cnJlbnQgY2FsbHMgdG8gdGhlIGFwaSBieSBzdG9yaW5nIGVhY2ggY29udGV4dC5cbiAgY29uc3QgYWxsY3R4ID0gbmV3IE1hcCgpXG5cbiAgY29uc3Qgb2sgPSBkYXRhID0+IHtcbiAgICByZXR1cm4gKFxuICAgICAgZGF0YSA9PT0gbnVsbCB8fFxuICAgICAgZGF0YSA9PT0gdHJ1ZSB8fFxuICAgICAgZGF0YSA9PT0gZmFsc2UgfHxcbiAgICAgIHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiIHx8XG4gICAgICB1dGlscy5yZWwuaXMoZGF0YSkgfHxcbiAgICAgIHV0aWxzLm51bS5pcyhkYXRhKVxuICAgIClcbiAgfVxuXG4gIC8vIGNoZWNrIHJldHVybnMgdHJ1ZSBpZiBkYXRhIGlzIG9rIHRvIGFkZCB0byBhIGdyYXBoLCBhbiBlcnJvciBzdHJpbmcgaWZcbiAgLy8gdGhlIGRhdGEgY2FuJ3QgYmUgY29udmVydGVkLCBhbmQgdGhlIGtleXMgb24gdGhlIGRhdGEgb2JqZWN0IG90aGVyd2lzZS5cbiAgY29uc3QgY2hlY2sgPSBkYXRhID0+IHtcbiAgICBpZiAob2soZGF0YSkpIHJldHVybiB0cnVlXG5cbiAgICBpZiAodXRpbHMub2JqLmlzKGRhdGEpKSB7XG4gICAgICBjb25zdCBrZXlzID0gW11cbiAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGRhdGEpKSB7XG4gICAgICAgIGlmIChrZXkgPT09IFwiX1wiKSB7XG4gICAgICAgICAgcmV0dXJuIFwiZXJyb3IgdW5kZXJzY29yZSBjYW5ub3QgYmUgdXNlZCBhcyBhbiBpdGVtIG5hbWVcIlxuICAgICAgICB9XG4gICAgICAgIGlmICh1dGlscy5vYmouaXModmFsdWUpIHx8IG9rKHZhbHVlKSkge1xuICAgICAgICAgIGtleXMucHVzaChrZXkpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYGVycm9yIHske2tleX06JHt2YWx1ZX19IGNhbm5vdCBiZSBjb252ZXJ0ZWQgdG8gZ3JhcGhgXG4gICAgICB9XG4gICAgICBpZiAoa2V5cy5sZW5ndGggIT09IDApIHJldHVybiBrZXlzXG4gICAgfVxuICAgIHJldHVybiBgZXJyb3IgJHtkYXRhfSBjYW5ub3QgYmUgY29udmVydGVkIHRvIGEgZ3JhcGhgXG4gIH1cblxuICAvLyBncmFwaCBjb252ZXJ0cyBvYmplY3RzIHRvIGdyYXBoIGZvcm1hdCB3aXRoIHVwZGF0ZWQgc3RhdGVzLlxuICBjb25zdCBncmFwaCA9IChzb3VsLCBkYXRhLCBnKSA9PiB7XG4gICAgaWYgKCFnKSBnID0ge1tzb3VsXToge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX19XG4gICAgZWxzZSBnW3NvdWxdID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cblxuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGRhdGEpKSB7XG4gICAgICBnW3NvdWxdW2tleV0gPSB2YWx1ZVxuICAgICAgZ1tzb3VsXS5fW1wiPlwiXVtrZXldID0gRGF0ZS5ub3coKVxuICAgIH1cbiAgICByZXR1cm4gZ1xuICB9XG5cbiAgY29uc3QgYXBpID0gY3R4aWQgPT4ge1xuICAgIGNvbnN0IGdldCA9IChsZXgsIHNvdWwsIGFjaykgPT4ge1xuICAgICAgd2lyZS5nZXQodXRpbHMub2JqLnB1dChsZXgsIFwiI1wiLCBzb3VsKSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgaWYgKG1zZy5lcnIpIGNvbnNvbGUubG9nKG1zZy5lcnIpXG4gICAgICAgIGlmIChtc2cucHV0ICYmIG1zZy5wdXRbc291bF0pIHtcbiAgICAgICAgICBkZWxldGUgbXNnLnB1dFtzb3VsXS5fXG4gICAgICAgICAgLy8gUmVzb2x2ZSBhbnkgcmVscyBvbiB0aGUgbm9kZSBiZWZvcmUgcmV0dXJuaW5nIHRvIHRoZSB1c2VyLlxuICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKG1zZy5wdXRbc291bF0pKSB7XG4gICAgICAgICAgICBjb25zdCBpZCA9IHV0aWxzLnJlbC5pcyhtc2cucHV0W3NvdWxdW2tleV0pXG4gICAgICAgICAgICBpZiAoaWQpIHtcbiAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IG5ldyBQcm9taXNlKHJlcyA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgX2N0eGlkID0gdXRpbHMudGV4dC5yYW5kb20oKVxuICAgICAgICAgICAgICAgIGFsbGN0eC5zZXQoX2N0eGlkLCB7Y2hhaW46IFt7aXRlbTogbnVsbCwgc291bDogaWR9XX0pXG4gICAgICAgICAgICAgICAgYXBpKF9jdHhpZCkudGhlbihudWxsLCByZXMpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIG1zZy5wdXRbc291bF1ba2V5XSA9IGRhdGFcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgYWNrKG1zZy5wdXRbc291bF0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTm8gZGF0YSBjYWxsYmFjay5cbiAgICAgICAgICBhY2sobnVsbClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG5cbiAgICBjb25zdCBkb25lID0gZGF0YSA9PiB7XG4gICAgICBjb25zdCBjdHggPSBhbGxjdHguZ2V0KGN0eGlkKVxuICAgICAgaWYgKGN0eCAmJiB0eXBlb2YgY3R4LmNiICE9PSBcInVuZGVmaW5lZFwiKSBjdHguY2IoZGF0YSlcbiAgICAgIGVsc2UgaWYgKGRhdGEpIGNvbnNvbGUubG9nKGRhdGEpXG4gICAgICBhbGxjdHguZGVsZXRlKGN0eGlkKVxuICAgIH1cblxuICAgIGNvbnN0IHJlc29sdmUgPSAocmVxdWVzdCwgY2IpID0+IHtcbiAgICAgIGNvbnN0IGdldCA9IHJlcXVlc3QgJiYgdHlwZW9mIHJlcXVlc3QuZ2V0ICE9PSBcInVuZGVmaW5lZFwiXG4gICAgICBjb25zdCBwdXQgPSByZXF1ZXN0ICYmIHR5cGVvZiByZXF1ZXN0LnB1dCAhPT0gXCJ1bmRlZmluZWRcIlxuICAgICAgY29uc3Qgb24gPSByZXF1ZXN0ICYmIHR5cGVvZiByZXF1ZXN0Lm9uICE9PSBcInVuZGVmaW5lZFwiXG4gICAgICBjb25zdCBvZmYgPSByZXF1ZXN0ICYmIHR5cGVvZiByZXF1ZXN0Lm9mZiAhPT0gXCJ1bmRlZmluZWRcIlxuXG4gICAgICBsZXQgZm91bmQgPSBmYWxzZVxuICAgICAgY29uc3QgY3R4ID0gYWxsY3R4LmdldChjdHhpZClcbiAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgY3R4LmNoYWluLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChjdHguY2hhaW5baV0uc291bCAhPT0gbnVsbCkgY29udGludWVcblxuICAgICAgICBmb3VuZCA9IHRydWVcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cblxuICAgICAgaWYgKGZvdW5kKSB7XG4gICAgICAgIC8vIEZvdW5kIGEgc291bCB0aGF0IG5lZWRzIHJlc29sdmluZywgbmVlZCB0aGUgcHJldmlvdXMgY29udGV4dFxuICAgICAgICAvLyAoaWUgdGhlIHBhcmVudCBub2RlKSB0byBmaW5kIGEgc291bCByZWxhdGlvbiBmb3IgaXQuXG4gICAgICAgIGNvbnN0IHtpdGVtLCBzb3VsfSA9IGN0eC5jaGFpbltpIC0gMV1cbiAgICAgICAgd2lyZS5nZXQoe1wiI1wiOiBzb3VsLCBcIi5cIjogaXRlbX0sIG1zZyA9PiB7XG4gICAgICAgICAgaWYgKG1zZy5lcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBlcnJvciBnZXR0aW5nICR7aXRlbX0gb24gJHtzb3VsfTogJHttc2cuZXJyfWApXG4gICAgICAgICAgICBpZiAoY2IpIGNiKG51bGwpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBub2RlID0gbXNnLnB1dCAmJiBtc2cucHV0W3NvdWxdXG4gICAgICAgICAgaWYgKG5vZGUgJiYgdHlwZW9mIG5vZGVbaXRlbV0gIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIGxldCBpZCA9IHV0aWxzLnJlbC5pcyhub2RlW2l0ZW1dKVxuICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgIGN0eC5jaGFpbltpXS5zb3VsID0gaWRcbiAgICAgICAgICAgICAgLy8gTm90IHN1cmUgd2h5IHRoZSBtYXAgbmVlZHMgdG8gYmUgc2V0IHJhdGhlciB0aGFuIGp1c3QgY3R4P1xuICAgICAgICAgICAgICBhbGxjdHguc2V0KGN0eGlkLCB7Y2hhaW46IGN0eC5jaGFpbiwgY2I6IGN0eC5jYn0pXG4gICAgICAgICAgICAgIC8vIENhbGwgYXBpIGFnYWluIHVzaW5nIHRoZSB1cGRhdGVkIGNvbnRleHQuXG4gICAgICAgICAgICAgIGlmIChnZXQpIGFwaShjdHhpZCkudGhlbihudWxsLCByZXF1ZXN0LmdldCwgY2IpXG4gICAgICAgICAgICAgIGVsc2UgaWYgKHB1dCkgYXBpKGN0eGlkKS5wdXQocmVxdWVzdC5wdXQsIGNiKVxuICAgICAgICAgICAgICBlbHNlIGlmIChvbikgYXBpKGN0eGlkKS5vbihjYilcbiAgICAgICAgICAgICAgZWxzZSBpZiAob2ZmKSBhcGkoY3R4aWQpLm9mZihjYilcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZ2V0KSB7XG4gICAgICAgICAgICAgIC8vIFJlcXVlc3Qgd2FzIG5vdCBmb3IgYSBub2RlLCByZXR1cm4gYSBwcm9wZXJ0eSBvbiB0aGUgY3VycmVudFxuICAgICAgICAgICAgICAvLyBzb3VsLlxuICAgICAgICAgICAgICBjYihub2RlW2l0ZW1dKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChwdXQpIHtcbiAgICAgICAgICAgICAgLy8gUmVxdWVzdCB3YXMgY2hhaW5lZCBiZWZvcmUgcHV0LCBzbyByZWwgZG9lc24ndCBleGlzdCB5ZXQuXG4gICAgICAgICAgICAgIGlkID0gdXRpbHMudGV4dC5yYW5kb20oKVxuICAgICAgICAgICAgICBjb25zdCByZWwgPSB7W2l0ZW1dOiB1dGlscy5yZWwuaWZ5KGlkKX1cbiAgICAgICAgICAgICAgd2lyZS5wdXQoZ3JhcGgoc291bCwgcmVsKSwgZXJyID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICBjYihgZXJyb3IgcHV0dGluZyAke2l0ZW19IG9uICR7c291bH06ICR7ZXJyfWApXG4gICAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjdHguY2hhaW5baV0uc291bCA9IGlkXG4gICAgICAgICAgICAgICAgYXBpKGN0eGlkKS5wdXQocmVxdWVzdC5wdXQsIGNiKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSBlbHNlIGlmIChvbikge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgcmVzb2x2aW5nIG9uIGZvciAke2l0ZW19IG9uICR7c291bH1gKVxuICAgICAgICAgICAgICBjYihudWxsKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChvZmYpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIHJlc29sdmluZyBvZmYgZm9yICR7aXRlbX0gb24gJHtzb3VsfWApXG4gICAgICAgICAgICAgIGlmIChjYikgY2IobnVsbClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKHB1dCkge1xuICAgICAgICAgICAgY2IoYGVycm9yICR7aXRlbX0gbm90IGZvdW5kIG9uICR7c291bH1gKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgJHtpdGVtfSBub3QgZm91bmQgb24gJHtzb3VsfWApXG4gICAgICAgICAgICBpZiAoY2IpIGNiKG51bGwpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAvLyBDYWxsYmFjayBoYXMgYmVlbiBwYXNzZWQgdG8gbmV4dCBzb3VsIGxvb2t1cCBvciBjYWxsZWQgYWJvdmUsIHNvXG4gICAgICAgIC8vIHJldHVybiBmYWxzZSBhcyB0aGUgY2FsbGluZyBjb2RlIHNob3VsZCBub3QgY29udGludWUuXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuXG4gICAgICBpZiAoZ2V0ICYmIGN0eC5jaGFpbltjdHguY2hhaW4ubGVuZ3RoIC0gMV0uaXRlbSAhPT0gbnVsbCkge1xuICAgICAgICAvLyBUaGUgY29udGV4dCBoYXMgYmVlbiByZXNvbHZlZCBidXQgaXQgZG9lcyBub3QgaW5jbHVkZSB0aGUgcmVxdWVzdGVkXG4gICAgICAgIC8vIG5vZGUsIHdoaWNoIHJlcXVpcmVzIG9uZSBtb3JlIGxvb2t1cC5cbiAgICAgICAgY3R4LmNoYWluLnB1c2goe2l0ZW06IG51bGwsIHNvdWw6IG51bGx9KVxuICAgICAgICBhcGkoY3R4aWQpLnRoZW4obnVsbCwgcmVxdWVzdC5nZXQsIGNiKVxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIH1cblxuICAgICAgLy8gUmV0dXJuIHRoZSBsYXN0IGNvbnRleHQsIGllIHRoZSBzb3VsIHJlcXVpcmVkIGJ5IHRoZSBjYWxsaW5nIGNvZGUuXG4gICAgICByZXR1cm4gY3R4LmNoYWluW2N0eC5jaGFpbi5sZW5ndGggLSAxXVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBnZXQ6IChrZXksIGxleCwgY2IpID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBsZXggPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgIGNiID0gbGV4XG4gICAgICAgICAgbGV4ID0gbnVsbFxuICAgICAgICB9XG4gICAgICAgIGlmIChrZXkgPT09IG51bGwgfHwga2V5ID09PSBcIlwiIHx8IGtleSA9PT0gXCJfXCIpIHtcbiAgICAgICAgICBpZiAoY2IpIGNiKG51bGwpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBjdHhpZCA9IHV0aWxzLnRleHQucmFuZG9tKClcbiAgICAgICAgLy8gVG9wIGxldmVsIGtleXMgYXJlIGFkZGVkIHRvIGEgcm9vdCBub2RlIHNvIHRoZWlyIHZhbHVlcyBkb24ndCBuZWVkXG4gICAgICAgIC8vIHRvIGJlIG9iamVjdHMuXG4gICAgICAgIGFsbGN0eC5zZXQoY3R4aWQsIHtjaGFpbjogW3tpdGVtOiBrZXksIHNvdWw6IFwicm9vdFwifV0sIGNiOiBjYn0pXG4gICAgICAgIGlmICghY2IpIHJldHVybiBhcGkoY3R4aWQpXG5cbiAgICAgICAgLy8gV2hlbiB0aGVyZSdzIGEgY2FsbGJhY2sgbmVlZCB0byByZXNvbHZlIHRoZSBjb250ZXh0IGZpcnN0LlxuICAgICAgICBjb25zdCB7c291bH0gPSByZXNvbHZlKHtnZXQ6IGxleH0sIGRvbmUpXG4gICAgICAgIGlmIChzb3VsKSBnZXQobGV4LCBzb3VsLCBkb25lKVxuICAgICAgfSxcbiAgICAgIHRoZW46IChrZXksIGxleCwgY2IpID0+IHtcbiAgICAgICAgY29uc3QgYWNrID0gZGF0YSA9PiB7XG4gICAgICAgICAgY2IgPyBjYihkYXRhKSA6IGRvbmUoZGF0YSlcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgbGV4ID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICBjYiA9IGxleFxuICAgICAgICAgIGxleCA9IG51bGxcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWN0eGlkKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coXCJwbGVhc2UgcHJvdmlkZSBhIGtleSB1c2luZyBnZXQoa2V5KVwiKVxuICAgICAgICAgIGFjayhudWxsKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY3R4ID0gYWxsY3R4LmdldChjdHhpZClcbiAgICAgICAgLy8gY3R4IGFscmVhZHkgcmVtb3ZlZCBieSBhbm90aGVyIGNoYWluZWQgY2FsbGJhY2sgaXMgb2s/XG4gICAgICAgIGlmICghY3R4KSByZXR1cm5cblxuICAgICAgICBpZiAoY2IgJiYgdHlwZW9mIGN0eC5jYiA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgIC8vIFRoaXMgKGFuZCBhY2spIGFsbG93cyBuZXN0ZWQgb2JqZWN0cyB0byBzZXQgdGhlaXIgb3duIGNhbGxiYWNrcy5cbiAgICAgICAgICBjdHguY2IgPSBjYlxuICAgICAgICAgIGNiID0gbnVsbFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGtleSA9PT0gXCJcIiB8fCBrZXkgPT09IFwiX1wiKSB7XG4gICAgICAgICAgYWNrKG51bGwpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBQdXNoIHRoZSBrZXkgdG8gdGhlIGNvbnRleHQgYXMgaXQgbmVlZHMgYSBzb3VsIGxvb2t1cC5cbiAgICAgICAgLy8gKG51bGwgaXMgdXNlZCB0byBjYWxsIHRoZSBhcGkgd2l0aCB1cGRhdGVkIGNvbnRleHQpXG4gICAgICAgIGlmIChrZXkgIT09IG51bGwpIGN0eC5jaGFpbi5wdXNoKHtpdGVtOiBrZXksIHNvdWw6IG51bGx9KVxuICAgICAgICBpZiAoIWN0eC5jYikgcmV0dXJuIGFwaShjdHhpZClcblxuICAgICAgICAvLyBXaGVuIHRoZXJlJ3MgYSBjYWxsYmFjayBuZWVkIHRvIHJlc29sdmUgdGhlIGNvbnRleHQgZmlyc3QuXG4gICAgICAgIGNvbnN0IHtzb3VsfSA9IHJlc29sdmUoe2dldDogbGV4fSwgYWNrKVxuICAgICAgICBpZiAoc291bCkgZ2V0KGxleCwgc291bCwgYWNrKVxuICAgICAgfSxcbiAgICAgIHB1dDogKGRhdGEsIGNiKSA9PiB7XG4gICAgICAgIGNvbnN0IGFjayA9IGVyciA9PiB7XG4gICAgICAgICAgY2IgPyBjYihlcnIpIDogZG9uZShlcnIpXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWN0eGlkKSB7XG4gICAgICAgICAgYWNrKFwicGxlYXNlIHByb3ZpZGUgYSBrZXkgdXNpbmcgZ2V0KGtleSlcIilcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGN0eCA9IGFsbGN0eC5nZXQoY3R4aWQpXG4gICAgICAgIC8vIGN0eCBhbHJlYWR5IHJlbW92ZWQgYnkgYW5vdGhlciBjaGFpbmVkIGNhbGxiYWNrIGlzIG9rP1xuICAgICAgICBpZiAoIWN0eCkgcmV0dXJuXG5cbiAgICAgICAgaWYgKCFjdHguY2IpIHtcbiAgICAgICAgICBpZiAoIWNiKSByZXR1cm5cblxuICAgICAgICAgIC8vIFRoaXMgKGFuZCBhY2spIGFsbG93cyBuZXN0ZWQgb2JqZWN0cyB0byBzZXQgdGhlaXIgb3duIGNhbGxiYWNrcy5cbiAgICAgICAgICBjdHguY2IgPSBjYlxuICAgICAgICAgIGNiID0gbnVsbFxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gY2hlY2soZGF0YSlcbiAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAvLyBBbGwgc3RyaW5ncyByZXR1cm5lZCBmcm9tIGNoZWNrIGFyZSBlcnJvcnMsIGNhbm5vdCBjb250aW51ZS5cbiAgICAgICAgICBhY2socmVzdWx0KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVzb2x2ZSB0aGUgY3VycmVudCBjb250ZXh0IGJlZm9yZSBwdXR0aW5nIGRhdGEuXG4gICAgICAgIGNvbnN0IHtpdGVtLCBzb3VsfSA9IHJlc29sdmUoe3B1dDogZGF0YX0sIGFjaylcbiAgICAgICAgaWYgKCFzb3VsKSByZXR1cm5cblxuICAgICAgICBpZiAocmVzdWx0ID09PSB0cnVlKSB7XG4gICAgICAgICAgLy8gV2hlbiByZXN1bHQgaXMgdHJ1ZSBkYXRhIGlzIGEgcHJvcGVydHkgdG8gcHV0IG9uIHRoZSBjdXJyZW50IHNvdWwuXG4gICAgICAgICAgLy8gTmVlZCB0byBjaGVjayBpZiBpdGVtIGlzIGEgcmVsIGFuZCBhbHNvIHNldCB0aGUgbm9kZSB0byBudWxsLiAoVGhpc1xuICAgICAgICAgIC8vIGFwcGxpZXMgZm9yIGFueSB1cGRhdGUgZnJvbSBhIHJlbCB0byBhIHByb3BlcnR5LCBub3QganVzdCBudWxsLilcbiAgICAgICAgICB3aXJlLmdldCh7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgICAgIGlmIChtc2cuZXJyKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBlcnJvciBnZXR0aW5nICR7c291bH06ICR7bXNnLmVycn1gKVxuICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IG1zZy5wdXQgJiYgbXNnLnB1dFtzb3VsXSAmJiBtc2cucHV0W3NvdWxdW2l0ZW1dXG4gICAgICAgICAgICBjb25zdCBpZCA9IHV0aWxzLnJlbC5pcyhjdXJyZW50KVxuICAgICAgICAgICAgaWYgKCFpZCkge1xuICAgICAgICAgICAgICAvLyBOb3QgYSByZWwsIGNhbiBqdXN0IHB1dCB0aGUgZGF0YS5cbiAgICAgICAgICAgICAgd2lyZS5wdXQoZ3JhcGgoc291bCwge1tpdGVtXTogZGF0YX0pLCBhY2spXG4gICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aXJlLmdldCh7XCIjXCI6IGlkfSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgICAgICAgaWYgKG1zZy5lcnIpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgZ2V0dGluZyAke2lkfTogJHttc2cuZXJyfWApXG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBpZiAoIW1zZy5wdXQgfHwgIW1zZy5wdXRbaWRdKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yICR7aWR9IG5vdCBmb3VuZGApXG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBkZWxldGUgbXNnLnB1dFtpZF0uX1xuICAgICAgICAgICAgICAvLyBudWxsIGVhY2ggb2YgdGhlIHByb3BlcnRpZXMgb24gdGhlIG5vZGUgYmVmb3JlIHB1dHRpbmcgZGF0YS5cbiAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMobXNnLnB1dFtpZF0pKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXJyID0gYXdhaXQgbmV3IFByb21pc2UocmVzID0+IHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IF9jdHhpZCA9IHV0aWxzLnRleHQucmFuZG9tKClcbiAgICAgICAgICAgICAgICAgIGFsbGN0eC5zZXQoX2N0eGlkLCB7Y2hhaW46IFt7aXRlbToga2V5LCBzb3VsOiBpZH1dfSlcbiAgICAgICAgICAgICAgICAgIGFwaShfY3R4aWQpLnB1dChudWxsLCByZXMpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICBhY2soZXJyKVxuICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHdpcmUucHV0KGdyYXBoKHNvdWwsIHtbaXRlbV06IGRhdGF9KSwgYWNrKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3RoZXJ3aXNlIHB1dCB0aGUgZGF0YSB1c2luZyB0aGUga2V5cyByZXR1cm5lZCBpbiByZXN1bHQuXG4gICAgICAgIC8vIE5lZWQgdG8gY2hlY2sgaWYgYSByZWwgaGFzIGFscmVhZHkgYmVlbiBhZGRlZCBvbiB0aGUgY3VycmVudCBub2RlLlxuICAgICAgICB3aXJlLmdldCh7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgICBpZiAobXNnLmVycikge1xuICAgICAgICAgICAgYWNrKGBlcnJvciBnZXR0aW5nICR7c291bH06ICR7bXNnLmVycn1gKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgY3VycmVudCA9IG1zZy5wdXQgJiYgbXNnLnB1dFtzb3VsXSAmJiBtc2cucHV0W3NvdWxdW2l0ZW1dXG4gICAgICAgICAgY29uc3QgaWQgPSB1dGlscy5yZWwuaXMoY3VycmVudClcbiAgICAgICAgICBpZiAoIWlkKSB7XG4gICAgICAgICAgICAvLyBUaGUgY3VycmVudCByZWwgZG9lc24ndCBleGlzdCwgc28gYWRkIGl0IGZpcnN0LlxuICAgICAgICAgICAgY29uc3QgcmVsID0ge1tpdGVtXTogdXRpbHMucmVsLmlmeSh1dGlscy50ZXh0LnJhbmRvbSgpKX1cbiAgICAgICAgICAgIHdpcmUucHV0KGdyYXBoKHNvdWwsIHJlbCksIGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBhY2soYGVycm9yIHB1dHRpbmcgJHtpdGVtfSBvbiAke3NvdWx9OiAke2Vycn1gKVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IF9jdHhpZCA9IHV0aWxzLnRleHQucmFuZG9tKClcbiAgICAgICAgICAgICAgICBjb25zdCBjaGFpbiA9IFt7aXRlbTogaXRlbSwgc291bDogc291bH1dXG4gICAgICAgICAgICAgICAgLy8gUGFzcyB0aGUgcHJldmlvdXMgY29udGV4dCdzIGNhbGxiYWNrIG9uIGhlcmUuXG4gICAgICAgICAgICAgICAgYWxsY3R4LnNldChfY3R4aWQsIHtjaGFpbjogY2hhaW4sIGNiOiBjdHguY2J9KVxuICAgICAgICAgICAgICAgIGFwaShfY3R4aWQpLnB1dChkYXRhKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IHB1dCA9IGZhbHNlXG4gICAgICAgICAgY29uc3QgdXBkYXRlID0ge31cbiAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiByZXN1bHQpIHtcbiAgICAgICAgICAgIGNvbnN0IGVyciA9IGF3YWl0IG5ldyBQcm9taXNlKHJlcyA9PiB7XG4gICAgICAgICAgICAgIGlmICh1dGlscy5vYmouaXMoZGF0YVtrZXldKSkge1xuICAgICAgICAgICAgICAgIC8vIFVzZSB0aGUgY3VycmVudCByZWwgYXMgdGhlIGNvbnRleHQgZm9yIG5lc3RlZCBvYmplY3RzLlxuICAgICAgICAgICAgICAgIGNvbnN0IF9jdHhpZCA9IHV0aWxzLnRleHQucmFuZG9tKClcbiAgICAgICAgICAgICAgICBhbGxjdHguc2V0KF9jdHhpZCwge2NoYWluOiBbe2l0ZW06IGtleSwgc291bDogaWR9XX0pXG4gICAgICAgICAgICAgICAgYXBpKF9jdHhpZCkucHV0KGRhdGFba2V5XSwgcmVzKVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHB1dCA9IHRydWVcbiAgICAgICAgICAgICAgICAvLyBHcm91cCBvdGhlciBwcm9wZXJ0aWVzIGludG8gb25lIHVwZGF0ZS5cbiAgICAgICAgICAgICAgICB1cGRhdGVba2V5XSA9IGRhdGFba2V5XVxuICAgICAgICAgICAgICAgIHJlcyhudWxsKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICBhY2soZXJyKVxuICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHB1dCkgd2lyZS5wdXQoZ3JhcGgoaWQsIHVwZGF0ZSksIGFjaylcbiAgICAgICAgICBlbHNlIGFjaygpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgb246IGNiID0+IHtcbiAgICAgICAgaWYgKCFjYikgcmV0dXJuXG5cbiAgICAgICAgaWYgKCFjdHhpZCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFwicGxlYXNlIHByb3ZpZGUgYSBrZXkgdXNpbmcgZ2V0KGtleSlcIilcbiAgICAgICAgICBjYihudWxsKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVzb2x2ZSB0aGUgY3VycmVudCBjb250ZXh0IGJlZm9yZSBhZGRpbmcgZXZlbnQgbGlzdGVuZXIuXG4gICAgICAgIGNvbnN0IHtpdGVtLCBzb3VsfSA9IHJlc29sdmUoe29uOiB0cnVlfSwgY2IpXG4gICAgICAgIGlmICghc291bCkgcmV0dXJuXG5cbiAgICAgICAgYWxsY3R4LnNldChjdHhpZCwge2NoYWluOiBbe2l0ZW06IGl0ZW0sIHNvdWw6IHNvdWx9XX0pXG4gICAgICAgIC8vIE1hcCB0aGUgdXNlcidzIGNhbGxiYWNrIGJlY2F1c2UgaXQgY2FuIGFsc28gYmUgcGFzc2VkIHRvIG9mZixcbiAgICAgICAgLy8gc28gbmVlZCBhIHJlZmVyZW5jZSB0byBpdCB0byBjb21wYXJlIHRoZW0uXG4gICAgICAgIG1hcC5zZXQoY2IsICgpID0+IGFwaShjdHhpZCkudGhlbihudWxsLCBjYikpXG4gICAgICAgIC8vIENoZWNrIGlmIGl0ZW0gaXMgYSByZWwgYW5kIGFkZCBldmVudCBsaXN0ZW5lciBmb3IgdGhlIG5vZGUuXG4gICAgICAgIHdpcmUuZ2V0KHtcIiNcIjogc291bCwgXCIuXCI6IGl0ZW19LCBhc3luYyBtc2cgPT4ge1xuICAgICAgICAgIGlmIChtc2cuZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgZ2V0dGluZyAke3NvdWx9OiAke21zZy5lcnJ9YClcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBtc2cucHV0ICYmIG1zZy5wdXRbc291bF0gJiYgbXNnLnB1dFtzb3VsXVtpdGVtXVxuICAgICAgICAgIGNvbnN0IGlkID0gdXRpbHMucmVsLmlzKGN1cnJlbnQpXG4gICAgICAgICAgaWYgKGlkKSB3aXJlLm9uKHtcIiNcIjogaWR9LCBtYXAuZ2V0KGNiKSlcbiAgICAgICAgICBlbHNlIHdpcmUub24oe1wiI1wiOiBzb3VsLCBcIi5cIjogaXRlbX0sIG1hcC5nZXQoY2IpKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIG9mZjogY2IgPT4ge1xuICAgICAgICBpZiAoIWN0eGlkKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coXCJwbGVhc2UgcHJvdmlkZSBhIGtleSB1c2luZyBnZXQoa2V5KVwiKVxuICAgICAgICAgIGlmIChjYikgY2IobnVsbClcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlc29sdmUgdGhlIGN1cnJlbnQgY29udGV4dCBiZWZvcmUgcmVtb3ZpbmcgZXZlbnQgbGlzdGVuZXIuXG4gICAgICAgIGNvbnN0IHtpdGVtLCBzb3VsfSA9IHJlc29sdmUoe29mZjogdHJ1ZX0sIGNiKVxuICAgICAgICBpZiAoIXNvdWwpIHJldHVyblxuXG4gICAgICAgIC8vIENoZWNrIGlmIGl0ZW0gaXMgYSByZWwgYW5kIHJlbW92ZSBldmVudCBsaXN0ZW5lciBmb3IgdGhlIG5vZGUuXG4gICAgICAgIHdpcmUuZ2V0KHtcIiNcIjogc291bCwgXCIuXCI6IGl0ZW19LCBhc3luYyBtc2cgPT4ge1xuICAgICAgICAgIGlmIChtc2cuZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgZ2V0dGluZyAke3NvdWx9OiAke21zZy5lcnJ9YClcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBtc2cucHV0ICYmIG1zZy5wdXRbc291bF0gJiYgbXNnLnB1dFtzb3VsXVtpdGVtXVxuICAgICAgICAgIGNvbnN0IGlkID0gdXRpbHMucmVsLmlzKGN1cnJlbnQpXG4gICAgICAgICAgaWYgKGlkKSB3aXJlLm9mZih7XCIjXCI6IGlkfSwgbWFwLmdldChjYikpXG4gICAgICAgICAgZWxzZSB3aXJlLm9mZih7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgbWFwLmdldChjYikpXG4gICAgICAgICAgbWFwLmRlbGV0ZShjYilcbiAgICAgICAgICBhbGxjdHguZGVsZXRlKGN0eGlkKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIC8vIEFsbG93IHRoZSB3aXJlIHNwZWMgdG8gYmUgdXNlZCB2aWEgaG9sc3Rlci5cbiAgICAgIHdpcmU6IHdpcmUsXG4gICAgfVxuICB9XG4gIHJldHVybiBhcGkoKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEhvbHN0ZXJcbiIsImNvbnN0IFJhZGl4ID0gcmVxdWlyZShcIi4vcmFkaXhcIilcbmNvbnN0IHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIilcblxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciBlbmQgb2YgdGV4dC5cbmNvbnN0IGV0eCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMylcbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgZW5xdWlyeS5cbmNvbnN0IGVucSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoNSlcbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgdW5pdCBzZXBhcmF0b3IuXG5jb25zdCB1bml0ID0gU3RyaW5nLmZyb21DaGFyQ29kZSgzMSlcblxuLy8gUmFkaXNrIHByb3ZpZGVzIGFjY2VzcyB0byBhIHJhZGl4IHRyZWUgdGhhdCBpcyBzdG9yZWQgaW4gdGhlIHByb3ZpZGVkXG4vLyBvcHQuc3RvcmUgaW50ZXJmYWNlLlxuY29uc3QgUmFkaXNrID0gb3B0ID0+IHtcbiAgdmFyIHVcbiAgdmFyIGNhY2hlID0gbnVsbFxuXG4gIGlmICghb3B0KSBvcHQgPSB7fVxuICBpZiAoIW9wdC5sb2cpIG9wdC5sb2cgPSBjb25zb2xlLmxvZ1xuICBpZiAoIW9wdC5iYXRjaCkgb3B0LmJhdGNoID0gMTAgKiAxMDAwXG4gIGlmICghb3B0LndyaXRlKSBvcHQud3JpdGUgPSAxIC8vIFdhaXQgdGltZSBiZWZvcmUgd3JpdGUgaW4gbWlsbGlzZWNvbmRzLlxuICBpZiAoIW9wdC5zaXplKSBvcHQuc2l6ZSA9IDEwMjQgKiAxMDI0IC8vIEZpbGUgc2l6ZSBvbiBkaXNrLCBkZWZhdWx0IDFNQi5cbiAgaWYgKCFvcHQuc3RvcmUpIHtcbiAgICBvcHQubG9nKFxuICAgICAgXCJSYWRpc2sgbmVlZHMgYHN0b3JlYCBpbnRlcmZhY2Ugd2l0aCBge2dldDogZm4sIHB1dDogZm4sIGxpc3Q6IGZufWBcIixcbiAgICApXG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKCFvcHQuc3RvcmUuZ2V0KSB7XG4gICAgb3B0LmxvZyhcIlJhZGlzayBuZWVkcyBgc3RvcmUuZ2V0YCBpbnRlcmZhY2Ugd2l0aCBgKGZpbGUsIGNiKWBcIilcbiAgICByZXR1cm5cbiAgfVxuICBpZiAoIW9wdC5zdG9yZS5wdXQpIHtcbiAgICBvcHQubG9nKFwiUmFkaXNrIG5lZWRzIGBzdG9yZS5wdXRgIGludGVyZmFjZSB3aXRoIGAoZmlsZSwgZGF0YSwgY2IpYFwiKVxuICAgIHJldHVyblxuICB9XG4gIGlmICghb3B0LnN0b3JlLmxpc3QpIHtcbiAgICBvcHQubG9nKFwiUmFkaXNrIG5lZWRzIGEgc3RyZWFtaW5nIGBzdG9yZS5saXN0YCBpbnRlcmZhY2Ugd2l0aCBgKGNiKWBcIilcbiAgICByZXR1cm5cbiAgfVxuXG4gIC8vIEFueSBhbmQgYWxsIHN0b3JhZ2UgYWRhcHRlcnMgc2hvdWxkOlxuICAvLyAxLiBCZWNhdXNlIHdyaXRpbmcgdG8gZGlzayB0YWtlcyB0aW1lLCB3ZSBzaG91bGQgYmF0Y2ggZGF0YSB0byBkaXNrLlxuICAvLyAgICBUaGlzIGltcHJvdmVzIHBlcmZvcm1hbmNlLCBhbmQgcmVkdWNlcyBwb3RlbnRpYWwgZGlzayBjb3JydXB0aW9uLlxuICAvLyAyLiBJZiBhIGJhdGNoIGV4Y2VlZHMgYSBjZXJ0YWluIG51bWJlciBvZiB3cml0ZXMsIHdlIHNob3VsZCBpbW1lZGlhdGVseVxuICAvLyAgICB3cml0ZSB0byBkaXNrIHdoZW4gcGh5c2ljYWxseSBwb3NzaWJsZS4gVGhpcyBjYXBzIHRvdGFsIHBlcmZvcm1hbmNlLFxuICAvLyAgICBidXQgcmVkdWNlcyBwb3RlbnRpYWwgbG9zcy5cbiAgY29uc3QgcmFkaXNrID0gKGtleSwgdmFsdWUsIGNiKSA9PiB7XG4gICAga2V5ID0gXCJcIiArIGtleVxuXG4gICAgLy8gSWYgbm8gdmFsdWUgaXMgcHJvdmlkZWQgdGhlbiB0aGUgc2Vjb25kIHBhcmFtZXRlciBpcyB0aGUgY2FsbGJhY2tcbiAgICAvLyBmdW5jdGlvbi4gUmVhZCB2YWx1ZSBmcm9tIG1lbW9yeSBvciBkaXNrIGFuZCBjYWxsIGNhbGxiYWNrIHdpdGggaXQuXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICBjYiA9IHZhbHVlXG4gICAgICB2YWx1ZSA9IHJhZGlzay5iYXRjaChrZXkpXG4gICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIHJldHVybiBjYih1LCB2YWx1ZSlcbiAgICAgIH1cblxuICAgICAgaWYgKHJhZGlzay50aHJhc2guYXQpIHtcbiAgICAgICAgdmFsdWUgPSByYWRpc2sudGhyYXNoLmF0KGtleSlcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgIHJldHVybiBjYih1LCB2YWx1ZSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmFkaXNrLnJlYWQoa2V5LCBjYilcbiAgICB9XG5cbiAgICAvLyBPdGhlcndpc2Ugc3RvcmUgdGhlIHZhbHVlIHByb3ZpZGVkLlxuICAgIHJhZGlzay5iYXRjaChrZXksIHZhbHVlKVxuICAgIGlmIChjYikge1xuICAgICAgcmFkaXNrLmJhdGNoLmFja3MucHVzaChjYilcbiAgICB9XG4gICAgLy8gRG9uJ3Qgd2FpdCBpZiB3ZSBoYXZlIGJhdGNoZWQgdG9vIG1hbnkuXG4gICAgaWYgKCsrcmFkaXNrLmJhdGNoLmVkID49IG9wdC5iYXRjaCkge1xuICAgICAgcmV0dXJuIHJhZGlzay50aHJhc2goKVxuICAgIH1cblxuICAgIC8vIE90aGVyd2lzZSB3YWl0IGZvciBtb3JlIHVwZGF0ZXMgYmVmb3JlIHdyaXRpbmcuXG4gICAgY2xlYXJUaW1lb3V0KHJhZGlzay5iYXRjaC50aW1lb3V0KVxuICAgIHJhZGlzay5iYXRjaC50aW1lb3V0ID0gc2V0VGltZW91dChyYWRpc2sudGhyYXNoLCBvcHQud3JpdGUpXG4gIH1cblxuICByYWRpc2suYmF0Y2ggPSBSYWRpeCgpXG4gIHJhZGlzay5iYXRjaC5hY2tzID0gW11cbiAgcmFkaXNrLmJhdGNoLmVkID0gMFxuXG4gIHJhZGlzay50aHJhc2ggPSAoKSA9PiB7XG4gICAgaWYgKHJhZGlzay50aHJhc2guaW5nKSB7XG4gICAgICByZXR1cm4gKHJhZGlzay50aHJhc2gubW9yZSA9IHRydWUpXG4gICAgfVxuXG4gICAgY2xlYXJUaW1lb3V0KHJhZGlzay5iYXRjaC50aW1lb3V0KVxuICAgIHJhZGlzay50aHJhc2gubW9yZSA9IGZhbHNlXG4gICAgcmFkaXNrLnRocmFzaC5pbmcgPSB0cnVlXG4gICAgdmFyIGJhdGNoID0gKHJhZGlzay50aHJhc2guYXQgPSByYWRpc2suYmF0Y2gpXG4gICAgcmFkaXNrLmJhdGNoID0gbnVsbFxuICAgIHJhZGlzay5iYXRjaCA9IFJhZGl4KClcbiAgICByYWRpc2suYmF0Y2guYWNrcyA9IFtdXG4gICAgcmFkaXNrLmJhdGNoLmVkID0gMFxuICAgIGxldCBpID0gMFxuICAgIHJhZGlzay5zYXZlKGJhdGNoLCBlcnIgPT4ge1xuICAgICAgLy8gVGhpcyBpcyB0byBpZ25vcmUgbXVsdGlwbGUgY2FsbGJhY2tzIGZyb20gcmFkaXNrLnNhdmUgY2FsbGluZ1xuICAgICAgLy8gcmFkaXNrLndyaXRlPyBJdCBsb29rcyBsaWtlIG11bHRpcGxlIGNhbGxiYWNrcyB3aWxsIGJlIG1hZGUgaWYgYVxuICAgICAgLy8gZmlsZSBuZWVkcyB0byBiZSBzcGxpdC5cbiAgICAgIGlmICgrK2kgPiAxKSByZXR1cm5cblxuICAgICAgaWYgKGVycikgb3B0LmxvZyhlcnIpXG4gICAgICBiYXRjaC5hY2tzLmZvckVhY2goY2IgPT4gY2IoZXJyKSlcbiAgICAgIHJhZGlzay50aHJhc2guYXQgPSBudWxsXG4gICAgICByYWRpc2sudGhyYXNoLmluZyA9IGZhbHNlXG4gICAgICBpZiAocmFkaXNrLnRocmFzaC5tb3JlKSByYWRpc2sudGhyYXNoKClcbiAgICB9KVxuICB9XG5cbiAgLy8gMS4gRmluZCB0aGUgZmlyc3QgcmFkaXggaXRlbSBpbiBtZW1vcnlcbiAgLy8gMi4gVXNlIHRoYXQgYXMgdGhlIHN0YXJ0aW5nIGluZGV4IGluIHRoZSBkaXJlY3Rvcnkgb2YgZmlsZXNcbiAgLy8gMy4gRmluZCB0aGUgZmlyc3QgZmlsZSB0aGF0IGlzIGxleGljYWxseSBsYXJnZXIgdGhhbiBpdFxuICAvLyA0LiBSZWFkIHRoZSBwcmV2aW91cyBmaWxlIGludG8gbWVtb3J5XG4gIC8vIDUuIFNjYW4gdGhyb3VnaCBpbiBtZW1vcnkgcmFkaXggZm9yIGFsbCB2YWx1ZXMgbGV4aWNhbGx5IGxlc3MgdGhhbiBsaW1pdFxuICAvLyA2LiBNZXJnZSBhbmQgd3JpdGUgYWxsIG9mIHRob3NlIHRvIHRoZSBpbi1tZW1vcnkgZmlsZSBhbmQgYmFjayB0byBkaXNrXG4gIC8vIDcuIElmIGZpbGUgaXMgdG8gbGFyZ2UgdGhlbiBzcGxpdC4gTW9yZSBkZXRhaWxzIG5lZWRlZCBoZXJlXG4gIHJhZGlzay5zYXZlID0gKHJhZCwgY2IpID0+IHtcbiAgICBjb25zdCBzYXZlID0ge1xuICAgICAgZmluZDogKHRyZWUsIGtleSkgPT4ge1xuICAgICAgICAvLyBUaGlzIGlzIGZhbHNlIGZvciBhbnkga2V5IHVudGlsIHNhdmUuc3RhcnQgaXMgc2V0IHRvIGFuIGluaXRpYWwga2V5LlxuICAgICAgICBpZiAoa2V5IDwgc2F2ZS5zdGFydCkgcmV0dXJuXG5cbiAgICAgICAgc2F2ZS5zdGFydCA9IGtleVxuICAgICAgICBvcHQuc3RvcmUubGlzdChzYXZlLmxleClcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH0sXG4gICAgICBsZXg6IGZpbGUgPT4ge1xuICAgICAgICBpZiAoIWZpbGUgfHwgZmlsZSA+IHNhdmUuc3RhcnQpIHtcbiAgICAgICAgICBzYXZlLmVuZCA9IGZpbGVcbiAgICAgICAgICAvLyAhIGlzIHVzZWQgYXMgdGhlIGZpcnN0IGZpbGUgbmFtZSBhcyBpdCdzIHRoZSBmaXJzdCBwcmludGFibGVcbiAgICAgICAgICAvLyBjaGFyYWN0ZXIsIHNvIGFsd2F5cyBtYXRjaGVzIGFzIGxleGljYWxseSBsZXNzIHRoYW4gYW55IG5vZGUuXG4gICAgICAgICAgc2F2ZS5taXgoc2F2ZS5maWxlIHx8IFwiIVwiLCBzYXZlLnN0YXJ0LCBzYXZlLmVuZClcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG5cbiAgICAgICAgc2F2ZS5maWxlID0gZmlsZVxuICAgICAgfSxcbiAgICAgIG1peDogKGZpbGUsIHN0YXJ0LCBlbmQpID0+IHtcbiAgICAgICAgc2F2ZS5zdGFydCA9IHNhdmUuZW5kID0gc2F2ZS5maWxlID0gdVxuICAgICAgICByYWRpc2sucGFyc2UoZmlsZSwgKGVyciwgZGlzaykgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgICAgICBSYWRpeC5tYXAocmFkLCAodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKGtleSA8IHN0YXJ0KSByZXR1cm5cblxuICAgICAgICAgICAgaWYgKGVuZCAmJiBlbmQgPCBrZXkpIHtcbiAgICAgICAgICAgICAgc2F2ZS5zdGFydCA9IGtleVxuICAgICAgICAgICAgICByZXR1cm4gc2F2ZS5zdGFydFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkaXNrKGtleSwgdmFsdWUpXG4gICAgICAgICAgfSlcbiAgICAgICAgICByYWRpc2sud3JpdGUoZmlsZSwgZGlzaywgc2F2ZS5uZXh0KVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIG5leHQ6IGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgICAgaWYgKHNhdmUuc3RhcnQpIHJldHVybiBSYWRpeC5tYXAocmFkLCBzYXZlLmZpbmQpXG5cbiAgICAgICAgY2IoZXJyKVxuICAgICAgfSxcbiAgICB9XG4gICAgUmFkaXgubWFwKHJhZCwgc2F2ZS5maW5kKVxuICB9XG5cbiAgcmFkaXNrLndyaXRlID0gKGZpbGUsIHJhZCwgY2IpID0+IHtcbiAgICAvLyBJbnZhbGlkYXRlIGNhY2hlIG9uIHdyaXRlLlxuICAgIGNhY2hlID0gbnVsbFxuICAgIGNvbnN0IHdyaXRlID0ge1xuICAgICAgdGV4dDogXCJcIixcbiAgICAgIGNvdW50OiAwLFxuICAgICAgZmlsZTogZmlsZSxcbiAgICAgIGVhY2g6ICh2YWx1ZSwga2V5LCBrLCBwcmUpID0+IHtcbiAgICAgICAgd3JpdGUuY291bnQrK1xuICAgICAgICB2YXIgZW5jID1cbiAgICAgICAgICBSYWRpc2suZW5jb2RlKHByZS5sZW5ndGgpICtcbiAgICAgICAgICBcIiNcIiArXG4gICAgICAgICAgUmFkaXNrLmVuY29kZShrKSArXG4gICAgICAgICAgKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIiA/IFwiXCIgOiBcIj1cIiArIFJhZGlzay5lbmNvZGUodmFsdWUpKSArXG4gICAgICAgICAgXCJcXG5cIlxuICAgICAgICAvLyBDYW5ub3Qgc3BsaXQgdGhlIGZpbGUgaWYgb25seSBoYXZlIG9uZSBlbnRyeSB0byB3cml0ZS5cbiAgICAgICAgaWYgKHdyaXRlLmNvdW50ID4gMSAmJiB3cml0ZS50ZXh0Lmxlbmd0aCArIGVuYy5sZW5ndGggPiBvcHQuc2l6ZSkge1xuICAgICAgICAgIHdyaXRlLnRleHQgPSBcIlwiXG4gICAgICAgICAgLy8gT3RoZXJ3aXNlIHNwbGl0IHRoZSBlbnRyaWVzIGluIGhhbGYuXG4gICAgICAgICAgd3JpdGUubGltaXQgPSBNYXRoLmNlaWwod3JpdGUuY291bnQgLyAyKVxuICAgICAgICAgIHdyaXRlLmNvdW50ID0gMFxuICAgICAgICAgIHdyaXRlLnN1YiA9IFJhZGl4KClcbiAgICAgICAgICBSYWRpeC5tYXAocmFkLCB3cml0ZS5zbGljZSlcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG5cbiAgICAgICAgd3JpdGUudGV4dCArPSBlbmNcbiAgICAgIH0sXG4gICAgICBwdXQ6ICgpID0+IHtcbiAgICAgICAgb3B0LnN0b3JlLnB1dChmaWxlLCB3cml0ZS50ZXh0LCBjYilcbiAgICAgIH0sXG4gICAgICBzbGljZTogKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA8IHdyaXRlLmZpbGUpIHJldHVyblxuXG4gICAgICAgIGlmICgrK3dyaXRlLmNvdW50ID4gd3JpdGUubGltaXQpIHtcbiAgICAgICAgICB2YXIgbmFtZSA9IHdyaXRlLmZpbGVcbiAgICAgICAgICAvLyBVc2Ugb25seSB0aGUgc291bCBvZiB0aGUga2V5IGFzIHRoZSBmaWxlbmFtZSBzbyB0aGF0IGFsbFxuICAgICAgICAgIC8vIHByb3BlcnRpZXMgb2YgYSBzb3VsIGFyZSB3cml0dGVuIHRvIHRoZSBzYW1lIGZpbGUuXG4gICAgICAgICAgbGV0IGVuZCA9IGtleS5pbmRleE9mKGVucSlcbiAgICAgICAgICBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICAgICAgd3JpdGUuZmlsZSA9IGtleVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3cml0ZS5maWxlID0ga2V5LnN1YnN0cmluZygwLCBlbmQpXG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIHdyaXRlLmxpbWl0IGNhbiBiZSByZWFjaGVkIGFmdGVyIGFscmVhZHkgd3JpdGluZyBwcm9wZXJ0aWVzIG9mXG4gICAgICAgICAgLy8gdGhlIGN1cnJlbnQgbm9kZSwgc28gcmVtb3ZlIGl0IGZyb20gd3JpdGUuc3ViIGJlZm9yZSB3cml0aW5nIHRvXG4gICAgICAgICAgLy8gZGlzayBzbyB0aGF0IGl0J3Mgbm90IGR1cGxpY2F0ZWQgYWNyb3NzIGZpbGVzLlxuICAgICAgICAgIHdyaXRlLnN1Yih3cml0ZS5maWxlLCBudWxsKVxuICAgICAgICAgIHdyaXRlLmNvdW50ID0gMFxuICAgICAgICAgIHJhZGlzay53cml0ZShuYW1lLCB3cml0ZS5zdWIsIHdyaXRlLm5leHQpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHdyaXRlLnN1YihrZXksIHZhbHVlKVxuICAgICAgfSxcbiAgICAgIG5leHQ6IGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgICAgd3JpdGUuc3ViID0gUmFkaXgoKVxuICAgICAgICBpZiAoIVJhZGl4Lm1hcChyYWQsIHdyaXRlLnNsaWNlKSkge1xuICAgICAgICAgIHJhZGlzay53cml0ZSh3cml0ZS5maWxlLCB3cml0ZS5zdWIsIGNiKVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH1cbiAgICAvLyBJZiBSYWRpeC5tYXAgZG9lc24ndCByZXR1cm4gdHJ1ZSB3aGVuIGNhbGxlZCB3aXRoIHdyaXRlLmVhY2ggYXMgYVxuICAgIC8vIGNhbGxiYWNrIHRoZW4gZGlkbid0IG5lZWQgdG8gc3BsaXQgdGhlIGRhdGEuIFRoZSBhY2N1bXVsYXRlZCB3cml0ZS50ZXh0XG4gICAgLy8gY2FuIHRoZW4gYmUgc3RvcmVkIHdpdGggd3JpdGUucHV0KCkuXG4gICAgaWYgKCFSYWRpeC5tYXAocmFkLCB3cml0ZS5lYWNoLCB0cnVlKSkgd3JpdGUucHV0KClcbiAgfVxuXG4gIHJhZGlzay5yZWFkID0gKGtleSwgY2IpID0+IHtcbiAgICBpZiAoY2FjaGUpIHtcbiAgICAgIGxldCB2YWx1ZSA9IGNhY2hlKGtleSlcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHJldHVybiBjYih1LCB2YWx1ZSlcbiAgICB9XG4gICAgLy8gT25seSB0aGUgc291bCBvZiB0aGUga2V5IGlzIGNvbXBhcmVkIHRvIGZpbGVuYW1lcyAoc2VlIHJhZGlzay53cml0ZSkuXG4gICAgbGV0IHNvdWwgPSBrZXlcbiAgICBsZXQgZW5kID0ga2V5LmluZGV4T2YoZW5xKVxuICAgIGlmIChlbmQgIT09IC0xKSB7XG4gICAgICBzb3VsID0ga2V5LnN1YnN0cmluZygwLCBlbmQpXG4gICAgfVxuXG4gICAgY29uc3QgcmVhZCA9IHtcbiAgICAgIGxleDogZmlsZSA9PiB7XG4gICAgICAgIC8vIHN0b3JlLmxpc3Qgc2hvdWxkIGNhbGwgbGV4IHdpdGhvdXQgYSBmaWxlIGxhc3QsIHdoaWNoIG1lYW5zIGFsbCBmaWxlXG4gICAgICAgIC8vIG5hbWVzIHdlcmUgY29tcGFyZWQgdG8gc291bCwgc28gdGhlIGN1cnJlbnQgcmVhZC5maWxlIGlzIG9rIHRvIHVzZS5cbiAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgaWYgKCFyZWFkLmZpbGUpIHtcbiAgICAgICAgICAgIGNiKFwibm8gZmlsZSBmb3VuZFwiLCB1KVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmFkaXNrLnBhcnNlKHJlYWQuZmlsZSwgcmVhZC5pdClcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFdhbnQgdGhlIGZpbGVuYW1lIGNsb3Nlc3QgdG8gc291bC5cbiAgICAgICAgaWYgKGZpbGUgPiBzb3VsIHx8IGZpbGUgPCByZWFkLmZpbGUpIHJldHVyblxuXG4gICAgICAgIHJlYWQuZmlsZSA9IGZpbGVcbiAgICAgIH0sXG4gICAgICBpdDogKGVyciwgZGlzaykgPT4ge1xuICAgICAgICBpZiAoZXJyKSBvcHQubG9nKGVycilcbiAgICAgICAgaWYgKGRpc2spIHtcbiAgICAgICAgICBjYWNoZSA9IGRpc2tcbiAgICAgICAgICByZWFkLnZhbHVlID0gZGlzayhrZXkpXG4gICAgICAgIH1cbiAgICAgICAgY2IoZXJyLCByZWFkLnZhbHVlKVxuICAgICAgfSxcbiAgICB9XG4gICAgb3B0LnN0b3JlLmxpc3QocmVhZC5sZXgpXG4gIH1cblxuICAvLyBMZXQgdXMgc3RhcnQgYnkgYXNzdW1pbmcgd2UgYXJlIHRoZSBvbmx5IHByb2Nlc3MgdGhhdCBpc1xuICAvLyBjaGFuZ2luZyB0aGUgZGlyZWN0b3J5IG9yIGJ1Y2tldC4gTm90IGJlY2F1c2Ugd2UgZG8gbm90IHdhbnRcbiAgLy8gdG8gYmUgbXVsdGktcHJvY2Vzcy9tYWNoaW5lLCBidXQgYmVjYXVzZSB3ZSB3YW50IHRvIGV4cGVyaW1lbnRcbiAgLy8gd2l0aCBob3cgbXVjaCBwZXJmb3JtYW5jZSBhbmQgc2NhbGUgd2UgY2FuIGdldCBvdXQgb2Ygb25seSBvbmUuXG4gIC8vIFRoZW4gd2UgY2FuIHdvcmsgb24gdGhlIGhhcmRlciBwcm9ibGVtIG9mIGJlaW5nIG11bHRpLXByb2Nlc3MuXG4gIHJhZGlzay5wYXJzZSA9IChmaWxlLCBjYikgPT4ge1xuICAgIGNvbnN0IHBhcnNlID0ge1xuICAgICAgZGlzazogUmFkaXgoKSxcbiAgICAgIHJlYWQ6IChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgaWYgKGVycikgcmV0dXJuIGNiKGVycilcblxuICAgICAgICBpZiAoIWRhdGEpIHJldHVybiBjYih1LCBwYXJzZS5kaXNrKVxuXG4gICAgICAgIGxldCBwcmUgPSBbXVxuICAgICAgICAvLyBXb3JrIHRob3VnaCBkYXRhIGJ5IHNwbGl0dGluZyBpbnRvIDMgdmFsdWVzLiBUaGUgZmlyc3QgdmFsdWUgc2F5c1xuICAgICAgICAvLyBpZiB0aGUgc2Vjb25kIHZhbHVlIGlzIG9uZSBvZjogdGhlIHJhZGl4IGxldmVsIGZvciBhIGtleSwgdGhlIGtleVxuICAgICAgICAvLyBpdGVzZWxmLCBvciBhIHZhbHVlLiBUaGUgdGhpcmQgaXMgdGhlIHJlc3Qgb2YgdGhlIGRhdGEgdG8gd29yayB3aXRoLlxuICAgICAgICBsZXQgdG1wID0gcGFyc2Uuc3BsaXQoZGF0YSlcbiAgICAgICAgd2hpbGUgKHRtcCkge1xuICAgICAgICAgIGxldCBrZXlcbiAgICAgICAgICBsZXQgdmFsdWVcbiAgICAgICAgICBsZXQgaSA9IHRtcFsxXVxuICAgICAgICAgIHRtcCA9IHBhcnNlLnNwbGl0KHRtcFsyXSkgfHwgXCJcIlxuICAgICAgICAgIGlmICh0bXBbMF0gPT09IFwiI1wiKSB7XG4gICAgICAgICAgICBrZXkgPSB0bXBbMV1cbiAgICAgICAgICAgIHByZSA9IHByZS5zbGljZSgwLCBpKVxuICAgICAgICAgICAgaWYgKGkgPD0gcHJlLmxlbmd0aCkgcHJlLnB1c2goa2V5KVxuICAgICAgICAgIH1cbiAgICAgICAgICB0bXAgPSBwYXJzZS5zcGxpdCh0bXBbMl0pIHx8IFwiXCJcbiAgICAgICAgICBpZiAodG1wWzBdID09PSBcIlxcblwiKSBjb250aW51ZVxuXG4gICAgICAgICAgaWYgKHRtcFswXSA9PT0gXCI9XCIpIHZhbHVlID0gdG1wWzFdXG4gICAgICAgICAgaWYgKHR5cGVvZiBrZXkgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHZhbHVlICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICBwYXJzZS5kaXNrKHByZS5qb2luKFwiXCIpLCB2YWx1ZSlcbiAgICAgICAgICB9XG4gICAgICAgICAgdG1wID0gcGFyc2Uuc3BsaXQodG1wWzJdKVxuICAgICAgICB9XG4gICAgICAgIGNiKHUsIHBhcnNlLmRpc2spXG4gICAgICB9LFxuICAgICAgc3BsaXQ6IGRhdGEgPT4ge1xuICAgICAgICBpZiAoIWRhdGEpIHJldHVyblxuXG4gICAgICAgIGxldCBpID0gLTFcbiAgICAgICAgbGV0IGEgPSBcIlwiXG4gICAgICAgIGxldCBjID0gbnVsbFxuICAgICAgICB3aGlsZSAoKGMgPSBkYXRhWysraV0pKSB7XG4gICAgICAgICAgaWYgKGMgPT09IHVuaXQpIGJyZWFrXG5cbiAgICAgICAgICBhICs9IGNcbiAgICAgICAgfVxuICAgICAgICBsZXQgbyA9IHt9XG4gICAgICAgIGlmIChjKSB7XG4gICAgICAgICAgcmV0dXJuIFthLCBSYWRpc2suZGVjb2RlKGRhdGEuc2xpY2UoaSksIG8pLCBkYXRhLnNsaWNlKGkgKyBvLmkpXVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH1cbiAgICBvcHQuc3RvcmUuZ2V0KGZpbGUsIHBhcnNlLnJlYWQpXG4gIH1cblxuICByZXR1cm4gcmFkaXNrXG59XG5cblJhZGlzay5lbmNvZGUgPSBkYXRhID0+IHtcbiAgLy8gQSBrZXkgc2hvdWxkIGJlIHBhc3NlZCBpbiBhcyBhIHN0cmluZyB0byBlbmNvZGUsIGEgdmFsdWUgY2FuIG9wdGlvbmFsbHkgYmVcbiAgLy8gYW4gYXJyYXkgb2YgMiBpdGVtcyB0byBpbmNsdWRlIHRoZSB2YWx1ZSdzIHN0YXRlLCBhcyBpcyBkb25lIGJ5IHN0b3JlLmpzLlxuICBsZXQgc3RhdGUgPSBcIlwiXG4gIGlmIChkYXRhIGluc3RhbmNlb2YgQXJyYXkgJiYgZGF0YS5sZW5ndGggPT09IDIpIHtcbiAgICBzdGF0ZSA9IGV0eCArIGRhdGFbMV1cbiAgICBkYXRhID0gZGF0YVswXVxuICB9XG5cbiAgaWYgKHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiKSB7XG4gICAgbGV0IGkgPSAwXG4gICAgbGV0IGN1cnJlbnQgPSBudWxsXG4gICAgbGV0IHRleHQgPSB1bml0XG4gICAgd2hpbGUgKChjdXJyZW50ID0gZGF0YVtpKytdKSkge1xuICAgICAgaWYgKGN1cnJlbnQgPT09IHVuaXQpIHRleHQgKz0gdW5pdFxuICAgIH1cbiAgICByZXR1cm4gdGV4dCArICdcIicgKyBkYXRhICsgc3RhdGUgKyB1bml0XG4gIH1cblxuICBjb25zdCByZWwgPSB1dGlscy5yZWwuaXMoZGF0YSlcbiAgaWYgKHJlbCkgcmV0dXJuIHVuaXQgKyBcIiNcIiArIHJlbCArIHN0YXRlICsgdW5pdFxuXG4gIGlmICh1dGlscy5udW0uaXMoZGF0YSkpIHJldHVybiB1bml0ICsgXCIrXCIgKyAoZGF0YSB8fCAwKSArIHN0YXRlICsgdW5pdFxuXG4gIGlmIChkYXRhID09PSB0cnVlKSByZXR1cm4gdW5pdCArIFwiK1wiICsgc3RhdGUgKyB1bml0XG5cbiAgaWYgKGRhdGEgPT09IGZhbHNlKSByZXR1cm4gdW5pdCArIFwiLVwiICsgc3RhdGUgKyB1bml0XG5cbiAgaWYgKGRhdGEgPT09IG51bGwpIHJldHVybiB1bml0ICsgXCIgXCIgKyBzdGF0ZSArIHVuaXRcbn1cblxuUmFkaXNrLmRlY29kZSA9IChkYXRhLCBvYmopID0+IHtcbiAgdmFyIHRleHQgPSBcIlwiXG4gIHZhciBpID0gLTFcbiAgdmFyIG4gPSAwXG4gIHZhciBjdXJyZW50ID0gbnVsbFxuICB2YXIgcHJldmlvdXMgPSBudWxsXG4gIGlmIChkYXRhWzBdICE9PSB1bml0KSByZXR1cm5cblxuICAvLyBGaW5kIGEgY29udHJvbCBjaGFyYWN0ZXIgcHJldmlvdXMgdG8gdGhlIHRleHQgd2Ugd2FudCwgc2tpcHBpbmdcbiAgLy8gY29uc2VjdXRpdmUgdW5pdCBzZXBhcmF0b3IgY2hhcmFjdGVycyBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBkYXRhLlxuICB3aGlsZSAoKGN1cnJlbnQgPSBkYXRhWysraV0pKSB7XG4gICAgaWYgKHByZXZpb3VzKSB7XG4gICAgICBpZiAoY3VycmVudCA9PT0gdW5pdCkge1xuICAgICAgICBpZiAoLS1uIDw9IDApIGJyZWFrXG4gICAgICB9XG4gICAgICB0ZXh0ICs9IGN1cnJlbnRcbiAgICB9IGVsc2UgaWYgKGN1cnJlbnQgPT09IHVuaXQpIHtcbiAgICAgIG4rK1xuICAgIH0gZWxzZSB7XG4gICAgICBwcmV2aW91cyA9IGN1cnJlbnQgfHwgdHJ1ZVxuICAgIH1cbiAgfVxuXG4gIGlmIChvYmopIG9iai5pID0gaSArIDFcblxuICBsZXQgW3ZhbHVlLCBzdGF0ZV0gPSB0ZXh0LnNwbGl0KGV0eClcbiAgaWYgKCFzdGF0ZSkge1xuICAgIGlmIChwcmV2aW91cyA9PT0gJ1wiJykgcmV0dXJuIHRleHRcblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCIjXCIpIHJldHVybiB1dGlscy5yZWwuaWZ5KHRleHQpXG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiK1wiKSB7XG4gICAgICBpZiAodGV4dC5sZW5ndGggPT09IDApIHJldHVybiB0cnVlXG5cbiAgICAgIHJldHVybiBwYXJzZUZsb2F0KHRleHQpXG4gICAgfVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIi1cIikgcmV0dXJuIGZhbHNlXG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiIFwiKSByZXR1cm4gbnVsbFxuICB9IGVsc2Uge1xuICAgIHN0YXRlID0gcGFyc2VGbG9hdChzdGF0ZSlcbiAgICAvLyBJZiBzdGF0ZSB3YXMgZm91bmQgdGhlbiByZXR1cm4gYW4gYXJyYXkuXG4gICAgaWYgKHByZXZpb3VzID09PSAnXCInKSByZXR1cm4gW3ZhbHVlLCBzdGF0ZV1cblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCIjXCIpIHJldHVybiBbdXRpbHMucmVsLmlmeSh2YWx1ZSksIHN0YXRlXVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIitcIikge1xuICAgICAgaWYgKHZhbHVlLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFt0cnVlLCBzdGF0ZV1cblxuICAgICAgcmV0dXJuIFtwYXJzZUZsb2F0KHZhbHVlKSwgc3RhdGVdXG4gICAgfVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIi1cIikgcmV0dXJuIFtmYWxzZSwgc3RhdGVdXG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiIFwiKSByZXR1cm4gW251bGwsIHN0YXRlXVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmFkaXNrXG4iLCJjb25zdCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpXG5cbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgZ3JvdXAgc2VwYXJhdG9yLlxuY29uc3QgZ3JvdXAgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDI5KVxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciByZWNvcmQgc2VwYXJhdG9yLlxuY29uc3QgcmVjb3JkID0gU3RyaW5nLmZyb21DaGFyQ29kZSgzMClcblxuY29uc3QgUmFkaXggPSAoKSA9PiB7XG4gIGNvbnN0IHJhZGl4ID0gKGtleXMsIHZhbHVlLCB0cmVlKSA9PiB7XG4gICAgaWYgKCF0cmVlKSB7XG4gICAgICBpZiAoIXJhZGl4W2dyb3VwXSkgcmFkaXhbZ3JvdXBdID0ge31cbiAgICAgIHRyZWUgPSByYWRpeFtncm91cF1cbiAgICB9XG4gICAgaWYgKCFrZXlzKSByZXR1cm4gdHJlZVxuXG4gICAgbGV0IGkgPSAwXG4gICAgbGV0IHRtcCA9IHt9XG4gICAgbGV0IGtleSA9IGtleXNbaV1cbiAgICBjb25zdCBtYXggPSBrZXlzLmxlbmd0aCAtIDFcbiAgICBjb25zdCBub1ZhbHVlID0gdHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiXG4gICAgLy8gRmluZCBhIG1hdGNoaW5nIHZhbHVlIHVzaW5nIHRoZSBzaG9ydGVzdCBzdHJpbmcgZnJvbSBrZXlzLlxuICAgIGxldCBmb3VuZCA9IHRyZWVba2V5XVxuICAgIHdoaWxlICghZm91bmQgJiYgaSA8IG1heCkge1xuICAgICAga2V5ICs9IGtleXNbKytpXVxuICAgICAgZm91bmQgPSB0cmVlW2tleV1cbiAgICB9XG5cbiAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAvLyBJZiBub3QgZm91bmQgZnJvbSB0aGUgcHJvdmlkZWQga2V5cyB0cnkgbWF0Y2hpbmcgd2l0aCBhbiBleGlzdGluZyBrZXkuXG4gICAgICBjb25zdCByZXN1bHQgPSB1dGlscy5vYmoubWFwKHRyZWUsIChoYXNWYWx1ZSwgaGFzS2V5KSA9PiB7XG4gICAgICAgIGxldCBqID0gMFxuICAgICAgICBsZXQgbWF0Y2hpbmdLZXkgPSBcIlwiXG4gICAgICAgIHdoaWxlIChoYXNLZXlbal0gPT09IGtleXNbal0pIHtcbiAgICAgICAgICBtYXRjaGluZ0tleSArPSBoYXNLZXlbaisrXVxuICAgICAgICB9XG4gICAgICAgIGlmIChtYXRjaGluZ0tleSkge1xuICAgICAgICAgIGlmIChub1ZhbHVlKSB7XG4gICAgICAgICAgICAvLyBtYXRjaGluZ0tleSBoYXMgdG8gYmUgYXMgbG9uZyBhcyB0aGUgb3JpZ2luYWwga2V5cyB3aGVuIHJlYWRpbmcuXG4gICAgICAgICAgICBpZiAoaiA8PSBtYXgpIHJldHVyblxuXG4gICAgICAgICAgICB0bXBbaGFzS2V5LnNsaWNlKGopXSA9IGhhc1ZhbHVlXG4gICAgICAgICAgICByZXR1cm4gaGFzVmFsdWVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsZXQgcmVwbGFjZSA9IHtcbiAgICAgICAgICAgIFtoYXNLZXkuc2xpY2UoaildOiBoYXNWYWx1ZSxcbiAgICAgICAgICAgIFtrZXlzLnNsaWNlKGopXToge1tyZWNvcmRdOiB2YWx1ZX0sXG4gICAgICAgICAgfVxuICAgICAgICAgIHRyZWVbbWF0Y2hpbmdLZXldID0ge1tncm91cF06IHJlcGxhY2V9XG4gICAgICAgICAgZGVsZXRlIHRyZWVbaGFzS2V5XVxuICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICBpZiAobm9WYWx1ZSkgcmV0dXJuXG5cbiAgICAgICAgaWYgKCF0cmVlW2tleV0pIHRyZWVba2V5XSA9IHt9XG4gICAgICAgIHRyZWVba2V5XVtyZWNvcmRdID0gdmFsdWVcbiAgICAgIH0gZWxzZSBpZiAobm9WYWx1ZSkge1xuICAgICAgICByZXR1cm4gdG1wXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpID09PSBtYXgpIHtcbiAgICAgIC8vIElmIG5vIHZhbHVlIHVzZSB0aGUga2V5IHByb3ZpZGVkIHRvIHJldHVybiBhIHdob2xlIGdyb3VwIG9yIHJlY29yZC5cbiAgICAgIGlmIChub1ZhbHVlKSB7XG4gICAgICAgIC8vIElmIGFuIGluZGl2aWR1YWwgcmVjb3JkIGlzbid0IGZvdW5kIHRoZW4gcmV0dXJuIHRoZSB3aG9sZSBncm91cC5cbiAgICAgICAgcmV0dXJuIHR5cGVvZiBmb3VuZFtyZWNvcmRdID09PSBcInVuZGVmaW5lZFwiXG4gICAgICAgICAgPyBmb3VuZFtncm91cF1cbiAgICAgICAgICA6IGZvdW5kW3JlY29yZF1cbiAgICAgIH1cbiAgICAgIC8vIE90aGVyd2lzZSBjcmVhdGUgYSBuZXcgcmVjb3JkIGF0IHRoZSBwcm92aWRlZCBrZXkgZm9yIHZhbHVlLlxuICAgICAgZm91bmRbcmVjb3JkXSA9IHZhbHVlXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEZvdW5kIGF0IGEgc2hvcnRlciBrZXksIHRyeSBhZ2Fpbi5cbiAgICAgIGlmICghZm91bmRbZ3JvdXBdICYmICFub1ZhbHVlKSBmb3VuZFtncm91cF0gPSB7fVxuICAgICAgcmV0dXJuIHJhZGl4KGtleXMuc2xpY2UoKytpKSwgdmFsdWUsIGZvdW5kW2dyb3VwXSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJhZGl4XG59XG5cblJhZGl4Lm1hcCA9IGZ1bmN0aW9uIG1hcChyYWRpeCwgY2IsIG9wdCwgcHJlKSB7XG4gIGlmICghcHJlKSBwcmUgPSBbXVxuICB2YXIgdHJlZSA9IHJhZGl4W2dyb3VwXSB8fCByYWRpeFxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHRyZWUpLnNvcnQoKVxuICB2YXIgdVxuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgIGxldCBrZXkgPSBrZXlzW2ldXG4gICAgbGV0IGZvdW5kID0gdHJlZVtrZXldXG4gICAgbGV0IHRtcCA9IGZvdW5kW3JlY29yZF1cbiAgICBpZiAodHlwZW9mIHRtcCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgdG1wID0gY2IodG1wLCBwcmUuam9pbihcIlwiKSArIGtleSwga2V5LCBwcmUpXG4gICAgICBpZiAodHlwZW9mIHRtcCAhPT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIHRtcFxuICAgIH0gZWxzZSBpZiAob3B0KSB7XG4gICAgICBjYih1LCBwcmUuam9pbihcIlwiKSwga2V5LCBwcmUpXG4gICAgfVxuICAgIGlmIChmb3VuZFtncm91cF0pIHtcbiAgICAgIHByZS5wdXNoKGtleSlcbiAgICAgIHRtcCA9IG1hcChmb3VuZFtncm91cF0sIGNiLCBvcHQsIHByZSlcbiAgICAgIGlmICh0eXBlb2YgdG1wICE9PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gdG1wXG4gICAgICBwcmUucG9wKClcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSYWRpeFxuIiwiY29uc3QganNFbnYgPSByZXF1aXJlKFwiYnJvd3Nlci1vci1ub2RlXCIpXG5jb25zdCBSYWRpc2sgPSByZXF1aXJlKFwiLi9yYWRpc2tcIilcbmNvbnN0IFJhZGl4ID0gcmVxdWlyZShcIi4vcmFkaXhcIilcbmNvbnN0IHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIilcblxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciBlbnF1aXJ5LlxuY29uc3QgZW5xID0gU3RyaW5nLmZyb21DaGFyQ29kZSg1KVxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciB1bml0IHNlcGFyYXRvci5cbmNvbnN0IHVuaXQgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDMxKVxuXG5jb25zdCBmaWxlU3lzdGVtID0gZGlyID0+IHtcbiAgaWYgKGpzRW52LmlzTm9kZSkge1xuICAgIGNvbnN0IGZzID0gcmVxdWlyZShcImZzXCIpXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGRpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhkaXIpXG4gICAgfVxuICAgIGlmICghZnMuZXhpc3RzU3luYyhkaXIgKyBcIi8hXCIpKSB7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKFxuICAgICAgICBkaXIgKyBcIi8hXCIsXG4gICAgICAgIHVuaXQgKyBcIiswXCIgKyB1bml0ICsgXCIjXCIgKyB1bml0ICsgJ1wicm9vdCcgKyB1bml0LFxuICAgICAgKVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBnZXQ6IChmaWxlLCBjYikgPT4ge1xuICAgICAgICBmcy5yZWFkRmlsZShkaXIgKyBcIi9cIiArIGZpbGUsIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFwiRU5PRU5UXCIpIHtcbiAgICAgICAgICAgICAgY2IoKVxuICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJmaWxlc3lzdGVtIGVycm9yOlwiLCBlcnIpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChkYXRhKSBkYXRhID0gZGF0YS50b1N0cmluZygpXG4gICAgICAgICAgY2IoZXJyLCBkYXRhKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHB1dDogKGZpbGUsIGRhdGEsIGNiKSA9PiB7XG4gICAgICAgIHZhciByYW5kb20gPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgtOSlcbiAgICAgICAgLy8gRG9uJ3QgcHV0IHRtcCBmaWxlcyB1bmRlciBkaXIgc28gdGhhdCB0aGV5J3JlIG5vdCBsaXN0ZWQuXG4gICAgICAgIHZhciB0bXAgPSBmaWxlICsgXCIuXCIgKyByYW5kb20gKyBcIi50bXBcIlxuICAgICAgICBmcy53cml0ZUZpbGUodG1wLCBkYXRhLCBlcnIgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIGNiKGVycilcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZzLnJlbmFtZSh0bXAsIGRpciArIFwiL1wiICsgZmlsZSwgY2IpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgbGlzdDogY2IgPT4ge1xuICAgICAgICBmcy5yZWFkZGlyKGRpciwgKGVyciwgZmlsZXMpID0+IHtcbiAgICAgICAgICBmaWxlcy5mb3JFYWNoKGNiKVxuICAgICAgICAgIGNiKClcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgfVxuICB9XG5cbiAgLy8gVE9ETzogQWRkIGluZGV4ZWREQlxuICByZXR1cm4ge1xuICAgIGdldDogKGZpbGUsIGNiKSA9PiB7XG4gICAgICBjYihudWxsLCB1bml0ICsgXCIrMFwiICsgdW5pdCArIFwiI1wiICsgdW5pdCArICdcInJvb3QnICsgdW5pdClcbiAgICB9LFxuICAgIHB1dDogKGZpbGUsIGRhdGEsIGNiKSA9PiB7XG4gICAgICBjYihudWxsKVxuICAgIH0sXG4gICAgbGlzdDogY2IgPT4ge1xuICAgICAgY2IoXCIhXCIpXG4gICAgICBjYigpXG4gICAgfSxcbiAgfVxufVxuXG4vLyBTdG9yZSBwcm92aWRlcyBnZXQgYW5kIHB1dCBtZXRob2RzIHRoYXQgY2FuIGFjY2VzcyByYWRpc2suXG5jb25zdCBTdG9yZSA9IG9wdCA9PiB7XG4gIGlmICghdXRpbHMub2JqLmlzKG9wdCkpIG9wdCA9IHt9XG4gIG9wdC5maWxlID0gU3RyaW5nKG9wdC5maWxlIHx8IFwicmFkYXRhXCIpXG4gIGlmICghb3B0LnN0b3JlKSBvcHQuc3RvcmUgPSBmaWxlU3lzdGVtKG9wdC5maWxlKVxuICBjb25zdCByYWRpc2sgPSBSYWRpc2sob3B0KVxuXG4gIHJldHVybiB7XG4gICAgZ2V0OiAobGV4LCBjYikgPT4ge1xuICAgICAgaWYgKCFsZXgpIHtcbiAgICAgICAgY2IoXCJsZXggcmVxdWlyZWRcIilcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZhciBzb3VsID0gbGV4W1wiI1wiXVxuICAgICAgdmFyIGtleSA9IGxleFtcIi5cIl0gfHwgXCJcIlxuICAgICAgdmFyIG5vZGVcbiAgICAgIGNvbnN0IGVhY2ggPSAodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICBpZiAoIW5vZGUpIG5vZGUgPSB7Xzoge1wiI1wiOiBzb3VsLCBcIj5cIjoge319fVxuICAgICAgICBub2RlW2tleV0gPSB2YWx1ZVswXVxuICAgICAgICBub2RlLl9bXCI+XCJdW2tleV0gPSB2YWx1ZVsxXVxuICAgICAgfVxuXG4gICAgICByYWRpc2soc291bCArIGVucSArIGtleSwgKGVyciwgdmFsdWUpID0+IHtcbiAgICAgICAgbGV0IGdyYXBoXG4gICAgICAgIGlmICh1dGlscy5vYmouaXModmFsdWUpKSB7XG4gICAgICAgICAgUmFkaXgubWFwKHZhbHVlLCBlYWNoKVxuICAgICAgICAgIGlmICghbm9kZSkgZWFjaCh2YWx1ZSwga2V5KVxuICAgICAgICAgIGdyYXBoID0ge1tzb3VsXTogbm9kZX1cbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSkge1xuICAgICAgICAgIGVhY2godmFsdWUsIGtleSlcbiAgICAgICAgICBncmFwaCA9IHtbc291bF06IG5vZGV9XG4gICAgICAgIH1cbiAgICAgICAgY2IoZXJyLCBncmFwaClcbiAgICAgIH0pXG4gICAgfSxcbiAgICBwdXQ6IChncmFwaCwgY2IpID0+IHtcbiAgICAgIGlmICghZ3JhcGgpIHtcbiAgICAgICAgY2IoXCJncmFwaCByZXF1aXJlZFwiKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgdmFyIGNvdW50ID0gMFxuICAgICAgY29uc3QgYWNrID0gZXJyID0+IHtcbiAgICAgICAgY291bnQtLVxuICAgICAgICBpZiAoYWNrLmVycikgcmV0dXJuXG5cbiAgICAgICAgYWNrLmVyciA9IGVyclxuICAgICAgICBpZiAoYWNrLmVycikge1xuICAgICAgICAgIGNiKGFjay5lcnIpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY291bnQgPT09IDApIGNiKG51bGwpXG4gICAgICB9XG5cbiAgICAgIE9iamVjdC5rZXlzKGdyYXBoKS5mb3JFYWNoKHNvdWwgPT4ge1xuICAgICAgICB2YXIgbm9kZSA9IGdyYXBoW3NvdWxdXG4gICAgICAgIE9iamVjdC5rZXlzKG5vZGUpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoa2V5ID09PSBcIl9cIikgcmV0dXJuXG5cbiAgICAgICAgICBjb3VudCsrXG4gICAgICAgICAgbGV0IHZhbHVlID0gbm9kZVtrZXldXG4gICAgICAgICAgbGV0IHN0YXRlID0gbm9kZS5fW1wiPlwiXVtrZXldXG4gICAgICAgICAgcmFkaXNrKHNvdWwgKyBlbnEgKyBrZXksIFt2YWx1ZSwgc3RhdGVdLCBhY2spXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0sXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBTdG9yZVxuIiwiY29uc3QgbnVtID0ge1xuICBpczogbiA9PlxuICAgICEobiBpbnN0YW5jZW9mIEFycmF5KSAmJlxuICAgIChuIC0gcGFyc2VGbG9hdChuKSArIDEgPj0gMCB8fCBJbmZpbml0eSA9PT0gbiB8fCAtSW5maW5pdHkgPT09IG4pLFxufVxuXG5jb25zdCBvYmogPSB7XG4gIGlzOiBvID0+IHtcbiAgICBpZiAoIW8pIHJldHVybiBmYWxzZVxuXG4gICAgcmV0dXJuIChcbiAgICAgIChvIGluc3RhbmNlb2YgT2JqZWN0ICYmIG8uY29uc3RydWN0b3IgPT09IE9iamVjdCkgfHxcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKS5tYXRjaCgvXlxcW29iamVjdCAoXFx3KylcXF0kLylbMV0gPT09XG4gICAgICAgIFwiT2JqZWN0XCJcbiAgICApXG4gIH0sXG4gIG1hcDogKGxpc3QsIGNiLCBvKSA9PiB7XG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhsaXN0KVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgbGV0IHJlc3VsdCA9IGNiKGxpc3Rba2V5c1tpXV0sIGtleXNbaV0sIG8pXG4gICAgICBpZiAodHlwZW9mIHJlc3VsdCAhPT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIHJlc3VsdFxuICAgIH1cbiAgfSxcbiAgcHV0OiAobywga2V5LCB2YWx1ZSkgPT4ge1xuICAgIGlmICghbykgbyA9IHt9XG4gICAgb1trZXldID0gdmFsdWVcbiAgICByZXR1cm4gb1xuICB9LFxuICBkZWw6IChvLCBrZXkpID0+IHtcbiAgICBpZiAoIW8pIHJldHVyblxuXG4gICAgb1trZXldID0gbnVsbFxuICAgIGRlbGV0ZSBvW2tleV1cbiAgICByZXR1cm4gb1xuICB9LFxufVxuXG5jb25zdCBtYXBfc291bCA9IChzb3VsLCBrZXksIG8pID0+IHtcbiAgLy8gSWYgaWQgaXMgYWxyZWFkeSBkZWZpbmVkIEFORCB3ZSdyZSBzdGlsbCBsb29waW5nIHRocm91Z2ggdGhlIG9iamVjdCxcbiAgLy8gdGhlbiBpdCBpcyBjb25zaWRlcmVkIGludmFsaWQuXG4gIGlmIChvLmlkKSB7XG4gICAgby5pZCA9IGZhbHNlXG4gICAgcmV0dXJuXG4gIH1cblxuICBpZiAoa2V5ID09PSBcIiNcIiAmJiB0eXBlb2Ygc291bCA9PT0gXCJzdHJpbmdcIikge1xuICAgIG8uaWQgPSBzb3VsXG4gICAgcmV0dXJuXG4gIH1cblxuICAvLyBJZiB0aGVyZSBleGlzdHMgYW55dGhpbmcgZWxzZSBvbiB0aGUgb2JqZWN0IHRoYXQgaXNuJ3QgdGhlIHNvdWwsXG4gIC8vIHRoZW4gaXQgaXMgY29uc2lkZXJlZCBpbnZhbGlkLlxuICBvLmlkID0gZmFsc2Vcbn1cblxuLy8gQ2hlY2sgaWYgYW4gb2JqZWN0IGlzIGEgc291bCByZWxhdGlvbiwgaWUgeycjJzogJ1VVSUQnfVxuY29uc3QgcmVsID0ge1xuICBpczogdmFsdWUgPT4ge1xuICAgIGlmICh2YWx1ZSAmJiB2YWx1ZVtcIiNcIl0gJiYgIXZhbHVlLl8gJiYgb2JqLmlzKHZhbHVlKSkge1xuICAgICAgbGV0IG8gPSB7fVxuICAgICAgb2JqLm1hcCh2YWx1ZSwgbWFwX3NvdWwsIG8pXG4gICAgICBpZiAoby5pZCkgcmV0dXJuIG8uaWRcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2VcbiAgfSxcbiAgLy8gQ29udmVydCBhIHNvdWwgaW50byBhIHJlbGF0aW9uIGFuZCByZXR1cm4gaXQuXG4gIGlmeTogc291bCA9PiBvYmoucHV0KHt9LCBcIiNcIiwgc291bCksXG59XG5cbmNvbnN0IHRleHQgPSB7XG4gIHJhbmRvbTogbGVuZ3RoID0+IHtcbiAgICB2YXIgcyA9IFwiXCJcbiAgICBjb25zdCBjID0gXCIwMTIzNDU2Nzg5QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6XCJcbiAgICBpZiAoIWxlbmd0aCkgbGVuZ3RoID0gMjRcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBzICs9IGMuY2hhckF0KE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGMubGVuZ3RoKSlcbiAgICB9XG4gICAgcmV0dXJuIHNcbiAgfSxcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7bnVtLCBvYmosIHJlbCwgdGV4dH1cbiIsImNvbnN0IGpzRW52ID0gcmVxdWlyZShcImJyb3dzZXItb3Itbm9kZVwiKVxuY29uc3QgRHVwID0gcmVxdWlyZShcIi4vZHVwXCIpXG5jb25zdCBHZXQgPSByZXF1aXJlKFwiLi9nZXRcIilcbmNvbnN0IEhhbSA9IHJlcXVpcmUoXCIuL2hhbVwiKVxuY29uc3QgU3RvcmUgPSByZXF1aXJlKFwiLi9zdG9yZVwiKVxuY29uc3QgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKVxuXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIGVucXVpcnkuXG5jb25zdCBlbnEgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDUpXG5cbi8vIFdpcmUgc3RhcnRzIGEgd2Vic29ja2V0IGNsaWVudCBvciBzZXJ2ZXIgYW5kIHJldHVybnMgZ2V0IGFuZCBwdXQgbWV0aG9kc1xuLy8gZm9yIGFjY2VzcyB0byB0aGUgd2lyZSBzcGVjIGFuZCBzdG9yYWdlLlxuY29uc3QgV2lyZSA9IG9wdCA9PiB7XG4gIGlmICghdXRpbHMub2JqLmlzKG9wdCkpIG9wdCA9IHt9XG5cbiAgY29uc3QgZHVwID0gRHVwKG9wdC5tYXhBZ2UpXG4gIGNvbnN0IHN0b3JlID0gU3RvcmUob3B0KVxuICBjb25zdCBncmFwaCA9IHt9XG4gIGNvbnN0IHF1ZXVlID0ge31cbiAgY29uc3QgbGlzdGVuID0ge31cblxuICBjb25zdCBnZXQgPSAobXNnLCBzZW5kKSA9PiB7XG4gICAgY29uc3QgYWNrID0gR2V0KG1zZy5nZXQsIGdyYXBoKVxuICAgIGlmIChhY2spIHtcbiAgICAgIHNlbmQoXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKHV0aWxzLnRleHQucmFuZG9tKDkpKSxcbiAgICAgICAgICBcIkBcIjogbXNnW1wiI1wiXSxcbiAgICAgICAgICBwdXQ6IGFjayxcbiAgICAgICAgfSksXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIHN0b3JlLmdldChtc2cuZ2V0LCAoZXJyLCBhY2spID0+IHtcbiAgICAgICAgc2VuZChcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKHV0aWxzLnRleHQucmFuZG9tKDkpKSxcbiAgICAgICAgICAgIFwiQFwiOiBtc2dbXCIjXCJdLFxuICAgICAgICAgICAgcHV0OiBhY2ssXG4gICAgICAgICAgICBlcnI6IGVycixcbiAgICAgICAgICB9KSxcbiAgICAgICAgKVxuICAgICAgfSlcbiAgICB9XG4gIH1cblxuICBjb25zdCBwdXQgPSAobXNnLCBzZW5kKSA9PiB7XG4gICAgLy8gU3RvcmUgdXBkYXRlcyByZXR1cm5lZCBmcm9tIEhhbS5taXggYW5kIGRlZmVyIHVwZGF0ZXMgaWYgcmVxdWlyZWQuXG4gICAgY29uc3QgdXBkYXRlID0gSGFtLm1peChtc2cucHV0LCBncmFwaCwgbGlzdGVuKVxuICAgIHN0b3JlLnB1dCh1cGRhdGUubm93LCBlcnIgPT4ge1xuICAgICAgc2VuZChcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIFwiI1wiOiBkdXAudHJhY2sodXRpbHMudGV4dC5yYW5kb20oOSkpLFxuICAgICAgICAgIFwiQFwiOiBtc2dbXCIjXCJdLFxuICAgICAgICAgIGVycjogZXJyLFxuICAgICAgICB9KSxcbiAgICAgIClcbiAgICB9KVxuICAgIGlmICh1cGRhdGUud2FpdCAhPT0gMCkge1xuICAgICAgc2V0VGltZW91dCgoKSA9PiBwdXQoe3B1dDogdXBkYXRlLmRlZmVyfSwgc2VuZCksIHVwZGF0ZS53YWl0KVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGFwaSA9IHNlbmQgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICBnZXQ6IChsZXgsIGNiLCBvcHQpID0+IHtcbiAgICAgICAgaWYgKCFjYikgcmV0dXJuXG5cbiAgICAgICAgaWYgKCF1dGlscy5vYmouaXMob3B0KSkgb3B0ID0ge31cbiAgICAgICAgY29uc3QgYWNrID0gR2V0KGxleCwgZ3JhcGgpXG4gICAgICAgIGlmIChhY2spIHtcbiAgICAgICAgICBjYih7cHV0OiBhY2t9KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgc3RvcmUuZ2V0KGxleCwgKGVyciwgYWNrKSA9PiB7XG4gICAgICAgICAgaWYgKGFjaykge1xuICAgICAgICAgICAgY2Ioe3B1dDogYWNrLCBlcnI6IGVycn0pXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoZXJyKSBjb25zb2xlLmxvZyhlcnIpXG5cbiAgICAgICAgICBjb25zdCB0cmFjayA9IHV0aWxzLnRleHQucmFuZG9tKDkpXG4gICAgICAgICAgcXVldWVbdHJhY2tdID0gY2JcbiAgICAgICAgICBzZW5kKFxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKHRyYWNrKSxcbiAgICAgICAgICAgICAgZ2V0OiBsZXgsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICApXG4gICAgICAgICAgLy8gUmVzcG9uZCB0byBjYWxsYmFjayB3aXRoIG51bGwgaWYgbm8gcmVzcG9uc2UuXG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjYiA9IHF1ZXVlW3RyYWNrXVxuICAgICAgICAgICAgaWYgKGNiKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGlkID0gbGV4W1wiI1wiXVxuICAgICAgICAgICAgICBjb25zdCBhY2sgPSB7W2lkXTogbnVsbH1cbiAgICAgICAgICAgICAgaWYgKGxleFtcIi5cIl0pIGFja1tpZF0gPSB7W2xleFtcIi5cIl1dOiBudWxsfVxuICAgICAgICAgICAgICBjYih7cHV0OiBhY2t9KVxuICAgICAgICAgICAgICBkZWxldGUgcXVldWVbdHJhY2tdXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSwgb3B0LndhaXQgfHwgMTAwKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHB1dDogKGRhdGEsIGNiKSA9PiB7XG4gICAgICAgIC8vIERlZmVycmVkIHVwZGF0ZXMgYXJlIG9ubHkgc3RvcmVkIHVzaW5nIHdpcmUgc3BlYywgdGhleSdyZSBpZ25vcmVkXG4gICAgICAgIC8vIGhlcmUgdXNpbmcgdGhlIGFwaS4gVGhpcyBpcyBvayBiZWNhdXNlIGNvcnJlY3QgdGltZXN0YW1wcyBzaG91bGQgYmVcbiAgICAgICAgLy8gdXNlZCB3aGVyZWFzIHdpcmUgc3BlYyBuZWVkcyB0byBoYW5kbGUgY2xvY2sgc2tldy5cbiAgICAgICAgY29uc3QgdXBkYXRlID0gSGFtLm1peChkYXRhLCBncmFwaCwgbGlzdGVuKVxuICAgICAgICBzdG9yZS5wdXQodXBkYXRlLm5vdywgY2IpXG4gICAgICAgIC8vIEFsc28gcHV0IGRhdGEgb24gdGhlIHdpcmUgc3BlYy5cbiAgICAgICAgLy8gVE9ETzogTm90ZSB0aGF0IHRoaXMgbWVhbnMgYWxsIGNsaWVudHMgbm93IHJlY2VpdmUgYWxsIHVwZGF0ZXMsIHNvXG4gICAgICAgIC8vIG5lZWQgdG8gZmlsdGVyIHdoYXQgc2hvdWxkIGJlIHN0b3JlZCwgYm90aCBpbiBncmFwaCBhbmQgb24gZGlzay5cbiAgICAgICAgc2VuZChcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKHV0aWxzLnRleHQucmFuZG9tKDkpKSxcbiAgICAgICAgICAgIHB1dDogZGF0YSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKVxuICAgICAgfSxcbiAgICAgIG9uOiAobGV4LCBjYikgPT4ge1xuICAgICAgICBpZiAoIWNiKSByZXR1cm5cblxuICAgICAgICBsZXQgaWQgPSBsZXhbXCIjXCJdXG4gICAgICAgIGlmICghaWQpIHJldHVyblxuXG4gICAgICAgIGlmIChsZXhbXCIuXCJdKSBpZCArPSBlbnEgKyBsZXhbXCIuXCJdXG4gICAgICAgIGlmIChsaXN0ZW5baWRdKSB7XG4gICAgICAgICAgaWYgKCFsaXN0ZW5baWRdLmluY2x1ZGVzKGNiKSkgbGlzdGVuW2lkXS5wdXNoKGNiKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxpc3RlbltpZF0gPSBbY2JdXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBvZmY6IChsZXgsIGNiKSA9PiB7XG4gICAgICAgIGxldCBpZCA9IGxleFtcIiNcIl1cbiAgICAgICAgaWYgKCFpZCkgcmV0dXJuXG5cbiAgICAgICAgaWYgKGxleFtcIi5cIl0pIGlkICs9IGVucSArIGxleFtcIi5cIl1cbiAgICAgICAgaWYgKCFsaXN0ZW5baWRdKSByZXR1cm5cblxuICAgICAgICBpZiAoY2IpIHtcbiAgICAgICAgICBpZiAobGlzdGVuW2lkXS5pbmNsdWRlcyhjYikpIHtcbiAgICAgICAgICAgIGxpc3RlbltpZF0uc3BsaWNlKGxpc3RlbltpZF0uaW5kZXhPZihjYiksIDEpXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFJlbW92ZSBhbGwgY2FsbGJhY2tzIHdoZW4gbm9uZSBwcm92aWRlZC5cbiAgICAgICAgICBkZWxldGUgbGlzdGVuW2lkXVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIGlmIChqc0Vudi5pc05vZGUpIHtcbiAgICBjb25zdCBXZWJTb2NrZXQgPSByZXF1aXJlKFwid3NcIilcbiAgICBsZXQgd3NzID0gb3B0Lndzc1xuICAgIC8vIE5vZGUncyB3ZWJzb2NrZXQgc2VydmVyIHByb3ZpZGVzIGNsaWVudHMgYXMgYW4gYXJyYXksIHdoZXJlYXNcbiAgICAvLyBtb2NrLXNvY2tldHMgcHJvdmlkZXMgY2xpZW50cyBhcyBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhbiBhcnJheS5cbiAgICBsZXQgY2xpZW50cyA9ICgpID0+IHdzcy5jbGllbnRzKClcbiAgICBpZiAoIXdzcykge1xuICAgICAgd3NzID0gbmV3IFdlYlNvY2tldC5TZXJ2ZXIoe3BvcnQ6IDgwODB9KVxuICAgICAgY2xpZW50cyA9ICgpID0+IHdzcy5jbGllbnRzXG4gICAgfVxuXG4gICAgY29uc3Qgc2VuZCA9IChkYXRhLCBpc0JpbmFyeSkgPT4ge1xuICAgICAgY2xpZW50cygpLmZvckVhY2goY2xpZW50ID0+IHtcbiAgICAgICAgaWYgKGNsaWVudC5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuICAgICAgICAgIGNsaWVudC5zZW5kKGRhdGEsIHtiaW5hcnk6IGlzQmluYXJ5fSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gICAgd3NzLm9uKFwiY29ubmVjdGlvblwiLCB3cyA9PiB7XG4gICAgICB3cy5vbihcImVycm9yXCIsIGNvbnNvbGUuZXJyb3IpXG5cbiAgICAgIHdzLm9uKFwibWVzc2FnZVwiLCAoZGF0YSwgaXNCaW5hcnkpID0+IHtcbiAgICAgICAgY29uc3QgbXNnID0gSlNPTi5wYXJzZShkYXRhKVxuICAgICAgICBpZiAoZHVwLmNoZWNrKG1zZ1tcIiNcIl0pKSByZXR1cm5cblxuICAgICAgICBkdXAudHJhY2sobXNnW1wiI1wiXSlcbiAgICAgICAgaWYgKG1zZy5nZXQpIGdldChtc2csIHNlbmQpXG4gICAgICAgIGlmIChtc2cucHV0KSBwdXQobXNnLCBzZW5kKVxuICAgICAgICBzZW5kKGRhdGEsIGlzQmluYXJ5KVxuXG4gICAgICAgIGNvbnN0IGlkID0gbXNnW1wiQFwiXVxuICAgICAgICBjb25zdCBjYiA9IHF1ZXVlW2lkXVxuICAgICAgICBpZiAoY2IpIHtcbiAgICAgICAgICBkZWxldGUgbXNnW1wiI1wiXVxuICAgICAgICAgIGRlbGV0ZSBtc2dbXCJAXCJdXG4gICAgICAgICAgY2IobXNnKVxuXG4gICAgICAgICAgZGVsZXRlIHF1ZXVlW2lkXVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pXG4gICAgcmV0dXJuIGFwaShzZW5kKVxuICB9XG5cbiAgbGV0IHdzID0gbmV3IFdlYlNvY2tldChcIndzOi8vbG9jYWxob3N0OjgwODBcIilcbiAgY29uc3Qgc2VuZCA9IGRhdGEgPT4ge1xuICAgIGlmICghd3MgfHwgd3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHtcbiAgICAgIGNvbnNvbGUubG9nKFwid2Vic29ja2V0IG5vdCBhdmFpbGFibGVcIilcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHdzLnNlbmQoZGF0YSlcbiAgfVxuICBjb25zdCBzdGFydCA9ICgpID0+IHtcbiAgICBpZiAoIXdzKSB3cyA9IG5ldyBXZWJTb2NrZXQoXCJ3czovL2xvY2FsaG9zdDo4MDgwXCIpXG4gICAgd3Mub25jbG9zZSA9IGMgPT4ge1xuICAgICAgd3MgPSBudWxsXG4gICAgICBzZXRUaW1lb3V0KHN0YXJ0LCBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiA1MDAwKSlcbiAgICB9XG4gICAgd3Mub25lcnJvciA9IGUgPT4ge1xuICAgICAgY29uc29sZS5lcnJvcihlKVxuICAgIH1cbiAgICB3cy5vbm1lc3NhZ2UgPSBtID0+IHtcbiAgICAgIGNvbnN0IG1zZyA9IEpTT04ucGFyc2UobS5kYXRhKVxuICAgICAgaWYgKGR1cC5jaGVjayhtc2dbXCIjXCJdKSkgcmV0dXJuXG5cbiAgICAgIGR1cC50cmFjayhtc2dbXCIjXCJdKVxuICAgICAgaWYgKG1zZy5nZXQpIGdldChtc2csIHNlbmQpXG4gICAgICBpZiAobXNnLnB1dCkgcHV0KG1zZywgc2VuZClcbiAgICAgIHNlbmQobS5kYXRhKVxuXG4gICAgICBjb25zdCBpZCA9IG1zZ1tcIkBcIl1cbiAgICAgIGNvbnN0IGNiID0gcXVldWVbaWRdXG4gICAgICBpZiAoY2IpIHtcbiAgICAgICAgZGVsZXRlIG1zZ1tcIiNcIl1cbiAgICAgICAgZGVsZXRlIG1zZ1tcIkBcIl1cbiAgICAgICAgY2IobXNnKVxuXG4gICAgICAgIGRlbGV0ZSBxdWV1ZVtpZF1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGFydCgpXG4gIHJldHVybiBhcGkoc2VuZClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBXaXJlXG4iLCIvKiAoaWdub3JlZCkgKi8iLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdKG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiIiwiLy8gc3RhcnR1cFxuLy8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4vLyBUaGlzIGVudHJ5IG1vZHVsZSBpcyByZWZlcmVuY2VkIGJ5IG90aGVyIG1vZHVsZXMgc28gaXQgY2FuJ3QgYmUgaW5saW5lZFxudmFyIF9fd2VicGFja19leHBvcnRzX18gPSBfX3dlYnBhY2tfcmVxdWlyZV9fKFwiLi9zcmMvaG9sc3Rlci5qc1wiKTtcbiIsIiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==
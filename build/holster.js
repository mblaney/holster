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
        if (cb && !api.cb) {
          // This (and ack) allows nested objects to keep their own callbacks.
          api.cb = cb
          cb = null
        }

        const ack = err => {
          cb ? cb(err) : done(err)
        }

        if (key === "" || key === "_") {
          ack(null)
          return api(api.ctx)
        }

        if (api.ctx && api.ctx.length !== 0) {
          // Push the key to the context as it needs a soul lookup.
          // (null is used to call the api with updated context)
          if (key !== null) api.ctx.push({item: key, soul: null})
        } else {
          if (key === null) {
            ack(null)
            return api(api.ctx)
          }

          // Top level keys are added to a root node so their values don't need
          // to be objects.
          api.ctx = [{item: key, soul: "root"}]
        }
        if (!api.cb) return api(api.ctx)

        // When there's a callback need to resolve the context first.
        const {soul} = resolve({get: lex}, ack)
        if (!soul) return api(api.ctx)

        wire.get(utils.obj.put(lex, "#", soul), async msg => {
          if (msg.err) console.log(msg.err)
          if (msg.put && msg.put[soul]) {
            delete msg.put[soul]._
            // Resolve any rels on the node before returning to the user.
            for (const key of Object.keys(msg.put[soul])) {
              const id = utils.rel.is(msg.put[soul][key])
              if (id) {
                const data = await new Promise(resolve => {
                  api([{item: null, soul: id}]).get(null, resolve)
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
          // Need to check if item is a rel and also set the node to null. (This
          // applies for any update from a rel to a property, not just null.)
          wire.get({"#": soul, ".": item}, async msg => {
            if (msg.err) {
              console.log(`error getting ${soul}: ${msg.err}`)
              return
            }

            const current = msg.put && msg.put[soul] && msg.put[soul][item]
            const id = utils.rel.is(current)
            if (!id) return

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
          })

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
          for (const key of result) {
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
  if (!opt.wait) opt.wait = 1
  if (!opt.size) opt.size = 1024 * 1024 // 1MB
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
    radisk.batch.timeout = setTimeout(radisk.thrash, opt.wait)
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

// Wire starts a websocket client or server and returns get and put methods
// for access to the wire spec and storage.
const Wire = opt => {
  if (!utils.obj.is(opt)) opt = {}

  const dup = Dup(opt.maxAge)
  const store = Store(opt)
  var graph = {}
  var queue = {}

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
    const update = Ham.mix(msg.put, graph)
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
        const update = Ham.mix(data, graph)
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxXQUFXO0FBQ1g7QUFDQSxTQUFTO0FBQ1QsT0FBTztBQUNQO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFlBQVk7QUFDWjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLE9BQU87QUFDUDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7O0FBRUE7O0FBRUE7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTTtBQUNOO0FBQ0EsTUFBTTtBQUNOO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTs7QUFFQTtBQUNBOztBQUVBOztBQUVBO0FBQ0EsSUFBSTtBQUNKO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBOztBQUVBOzs7Ozs7Ozs7OztBQ3JiQSxjQUFjLG1CQUFPLENBQUMsK0JBQVM7O0FBRS9CO0FBQ0E7QUFDQTtBQUNBOztBQUVB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O0FBQ0EsT0FBTztBQUNQO0FBQ0E7O0FBRUE7QUFDQSxzQkFBc0IsbUJBQU8sQ0FBQyx3Q0FBSTtBQUNsQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esa0NBQWtDLFdBQVc7QUFDN0M7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSw2QkFBNkIsaUJBQWlCO0FBQzlDO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQSxPQUFPO0FBQ1AsS0FBSztBQUNMO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTs7Ozs7Ozs7Ozs7QUM3TUE7Ozs7OztVQ0FBO1VBQ0E7O1VBRUE7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7O1VBRUE7VUFDQTs7VUFFQTtVQUNBO1VBQ0E7Ozs7VUV0QkE7VUFDQTtVQUNBO1VBQ0EiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9Ib2xzdGVyLy4vbm9kZV9tb2R1bGVzL2Jyb3dzZXItb3Itbm9kZS9kaXN0L2luZGV4LmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9ub2RlX21vZHVsZXMvd3MvYnJvd3Nlci5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL2R1cC5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL2dldC5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL2hhbS5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL2hvbHN0ZXIuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9yYWRpc2suanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9yYWRpeC5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL3N0b3JlLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvdXRpbHMuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy93aXJlLmpzIiwid2VicGFjazovL0hvbHN0ZXIvaWdub3JlZHwvaG9tZS9tYWwvd29yay9ob2xzdGVyL3NyY3xmcyIsIndlYnBhY2s6Ly9Ib2xzdGVyL3dlYnBhY2svYm9vdHN0cmFwIiwid2VicGFjazovL0hvbHN0ZXIvd2VicGFjay9iZWZvcmUtc3RhcnR1cCIsIndlYnBhY2s6Ly9Ib2xzdGVyL3dlYnBhY2svc3RhcnR1cCIsIndlYnBhY2s6Ly9Ib2xzdGVyL3dlYnBhY2svYWZ0ZXItc3RhcnR1cCJdLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgX19kZWZQcm9wID0gT2JqZWN0LmRlZmluZVByb3BlcnR5O1xudmFyIF9fZ2V0T3duUHJvcERlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yO1xudmFyIF9fZ2V0T3duUHJvcE5hbWVzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXM7XG52YXIgX19oYXNPd25Qcm9wID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcbnZhciBfX2V4cG9ydCA9ICh0YXJnZXQsIGFsbCkgPT4ge1xuICBmb3IgKHZhciBuYW1lIGluIGFsbClcbiAgICBfX2RlZlByb3AodGFyZ2V0LCBuYW1lLCB7IGdldDogYWxsW25hbWVdLCBlbnVtZXJhYmxlOiB0cnVlIH0pO1xufTtcbnZhciBfX2NvcHlQcm9wcyA9ICh0bywgZnJvbSwgZXhjZXB0LCBkZXNjKSA9PiB7XG4gIGlmIChmcm9tICYmIHR5cGVvZiBmcm9tID09PSBcIm9iamVjdFwiIHx8IHR5cGVvZiBmcm9tID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICBmb3IgKGxldCBrZXkgb2YgX19nZXRPd25Qcm9wTmFtZXMoZnJvbSkpXG4gICAgICBpZiAoIV9faGFzT3duUHJvcC5jYWxsKHRvLCBrZXkpICYmIGtleSAhPT0gZXhjZXB0KVxuICAgICAgICBfX2RlZlByb3AodG8sIGtleSwgeyBnZXQ6ICgpID0+IGZyb21ba2V5XSwgZW51bWVyYWJsZTogIShkZXNjID0gX19nZXRPd25Qcm9wRGVzYyhmcm9tLCBrZXkpKSB8fCBkZXNjLmVudW1lcmFibGUgfSk7XG4gIH1cbiAgcmV0dXJuIHRvO1xufTtcbnZhciBfX3RvQ29tbW9uSlMgPSAobW9kKSA9PiBfX2NvcHlQcm9wcyhfX2RlZlByb3Aoe30sIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pLCBtb2QpO1xuXG4vLyBzcmMvaW5kZXgudHNcbnZhciBzcmNfZXhwb3J0cyA9IHt9O1xuX19leHBvcnQoc3JjX2V4cG9ydHMsIHtcbiAgaXNCcm93c2VyOiAoKSA9PiBpc0Jyb3dzZXIsXG4gIGlzQnVuOiAoKSA9PiBpc0J1bixcbiAgaXNEZW5vOiAoKSA9PiBpc0Rlbm8sXG4gIGlzSnNEb206ICgpID0+IGlzSnNEb20sXG4gIGlzTm9kZTogKCkgPT4gaXNOb2RlLFxuICBpc1dlYldvcmtlcjogKCkgPT4gaXNXZWJXb3JrZXJcbn0pO1xubW9kdWxlLmV4cG9ydHMgPSBfX3RvQ29tbW9uSlMoc3JjX2V4cG9ydHMpO1xudmFyIGlzQnJvd3NlciA9IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHdpbmRvdy5kb2N1bWVudCAhPT0gXCJ1bmRlZmluZWRcIjtcbnZhciBpc05vZGUgPSAoXG4gIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgdHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgLy8gQHRzLWV4cGVjdC1lcnJvclxuICBwcm9jZXNzLnZlcnNpb25zICE9IG51bGwgJiYgLy8gQHRzLWV4cGVjdC1lcnJvclxuICBwcm9jZXNzLnZlcnNpb25zLm5vZGUgIT0gbnVsbFxuKTtcbnZhciBpc1dlYldvcmtlciA9IHR5cGVvZiBzZWxmID09PSBcIm9iamVjdFwiICYmIHNlbGYuY29uc3RydWN0b3IgJiYgc2VsZi5jb25zdHJ1Y3Rvci5uYW1lID09PSBcIkRlZGljYXRlZFdvcmtlckdsb2JhbFNjb3BlXCI7XG52YXIgaXNKc0RvbSA9IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgJiYgd2luZG93Lm5hbWUgPT09IFwibm9kZWpzXCIgfHwgdHlwZW9mIG5hdmlnYXRvciAhPT0gXCJ1bmRlZmluZWRcIiAmJiBcInVzZXJBZ2VudFwiIGluIG5hdmlnYXRvciAmJiB0eXBlb2YgbmF2aWdhdG9yLnVzZXJBZ2VudCA9PT0gXCJzdHJpbmdcIiAmJiAobmF2aWdhdG9yLnVzZXJBZ2VudC5pbmNsdWRlcyhcIk5vZGUuanNcIikgfHwgbmF2aWdhdG9yLnVzZXJBZ2VudC5pbmNsdWRlcyhcImpzZG9tXCIpKTtcbnZhciBpc0Rlbm8gPSAoXG4gIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgdHlwZW9mIERlbm8gIT09IFwidW5kZWZpbmVkXCIgJiYgLy8gQHRzLWV4cGVjdC1lcnJvclxuICB0eXBlb2YgRGVuby52ZXJzaW9uICE9PSBcInVuZGVmaW5lZFwiICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgdHlwZW9mIERlbm8udmVyc2lvbi5kZW5vICE9PSBcInVuZGVmaW5lZFwiXG4pO1xudmFyIGlzQnVuID0gdHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2Vzcy52ZXJzaW9ucyAhPSBudWxsICYmIHByb2Nlc3MudmVyc2lvbnMuYnVuICE9IG51bGw7XG4vLyBBbm5vdGF0ZSB0aGUgQ29tbW9uSlMgZXhwb3J0IG5hbWVzIGZvciBFU00gaW1wb3J0IGluIG5vZGU6XG4wICYmIChtb2R1bGUuZXhwb3J0cyA9IHtcbiAgaXNCcm93c2VyLFxuICBpc0J1bixcbiAgaXNEZW5vLFxuICBpc0pzRG9tLFxuICBpc05vZGUsXG4gIGlzV2ViV29ya2VyXG59KTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gIHRocm93IG5ldyBFcnJvcihcbiAgICAnd3MgZG9lcyBub3Qgd29yayBpbiB0aGUgYnJvd3Nlci4gQnJvd3NlciBjbGllbnRzIG11c3QgdXNlIHRoZSBuYXRpdmUgJyArXG4gICAgICAnV2ViU29ja2V0IG9iamVjdCdcbiAgKTtcbn07XG4iLCJjb25zdCBEdXAgPSBtYXhBZ2UgPT4ge1xuICAvLyBBbGxvdyBtYXhBZ2UgdG8gYmUgcGFzc2VkIGluIGFzIHRlc3RzIHdhaXQgb24gdGhlIHNldFRpbWVvdXQuXG4gIGlmICghbWF4QWdlKSBtYXhBZ2UgPSA5MDAwXG4gIGNvbnN0IGR1cCA9IHtzdG9yZToge319XG4gIGR1cC5jaGVjayA9IGlkID0+IChkdXAuc3RvcmVbaWRdID8gZHVwLnRyYWNrKGlkKSA6IGZhbHNlKVxuICBkdXAudHJhY2sgPSBpZCA9PiB7XG4gICAgLy8gS2VlcCB0aGUgbGl2ZWxpbmVzcyBvZiB0aGUgbWVzc2FnZSB1cCB3aGlsZSBpdCBpcyBiZWluZyByZWNlaXZlZC5cbiAgICBkdXAuc3RvcmVbaWRdID0gRGF0ZS5ub3coKVxuICAgIGlmICghZHVwLmV4cGlyeSkge1xuICAgICAgZHVwLmV4cGlyeSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpXG4gICAgICAgIE9iamVjdC5rZXlzKGR1cC5zdG9yZSkuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgaWYgKG5vdyAtIGR1cC5zdG9yZVtpZF0gPiBtYXhBZ2UpIGRlbGV0ZSBkdXAuc3RvcmVbaWRdXG4gICAgICAgIH0pXG4gICAgICAgIGR1cC5leHBpcnkgPSBudWxsXG4gICAgICB9LCBtYXhBZ2UpXG4gICAgfVxuICAgIHJldHVybiBpZFxuICB9XG4gIHJldHVybiBkdXBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEdXBcbiIsImNvbnN0IEdldCA9IChsZXgsIGdyYXBoKSA9PiB7XG4gIGNvbnN0IHNvdWwgPSBsZXhbXCIjXCJdXG4gIGNvbnN0IGtleSA9IGxleFtcIi5cIl1cbiAgdmFyIG5vZGUgPSBncmFwaFtzb3VsXVxuXG4gIC8vIENhbiBvbmx5IHJldHVybiBhIG5vZGUgaWYgYSBrZXkgaXMgcHJvdmlkZWQsIGJlY2F1c2UgdGhlIGdyYXBoIG1heSBub3RcbiAgLy8gaGF2ZSBhbGwgdGhlIGtleXMgcG9wdWxhdGVkIGZvciBhIGdpdmVuIHNvdWwuIFRoaXMgaXMgYmVjYXVzZSBIYW0ubWl4XG4gIC8vIG9ubHkgYWRkcyBpbmNvbWluZyBjaGFuZ2VzIHRvIHRoZSBncmFwaC5cbiAgaWYgKCFub2RlIHx8ICFrZXkpIHJldHVyblxuXG4gIGxldCB2YWx1ZSA9IG5vZGVba2V5XVxuICBpZiAoIXZhbHVlKSByZXR1cm5cblxuICBub2RlID0ge186IG5vZGUuXywgW2tleV06IHZhbHVlfVxuICBub2RlLl9bXCI+XCJdID0ge1trZXldOiBub2RlLl9bXCI+XCJdW2tleV19XG4gIHJldHVybiB7W3NvdWxdOiBub2RlfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEdldFxuIiwiLy8gc3RhdGUgYW5kIHZhbHVlIGFyZSB0aGUgaW5jb21pbmcgY2hhbmdlcy5cbi8vIGN1cnJlbnRTdGF0ZSBhbmQgY3VycmVudFZhbHVlIGFyZSB0aGUgY3VycmVudCBncmFwaCBkYXRhLlxuY29uc3QgSGFtID0gKHN0YXRlLCBjdXJyZW50U3RhdGUsIHZhbHVlLCBjdXJyZW50VmFsdWUpID0+IHtcbiAgaWYgKHN0YXRlIDwgY3VycmVudFN0YXRlKSByZXR1cm4ge2hpc3RvcmljYWw6IHRydWV9XG5cbiAgaWYgKHN0YXRlID4gY3VycmVudFN0YXRlKSByZXR1cm4ge2luY29taW5nOiB0cnVlfVxuXG4gIC8vIHN0YXRlIGlzIGVxdWFsIHRvIGN1cnJlbnRTdGF0ZSwgbGV4aWNhbGx5IGNvbXBhcmUgdG8gcmVzb2x2ZSBjb25mbGljdC5cbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpIHx8IFwiXCJcbiAgfVxuICBpZiAodHlwZW9mIGN1cnJlbnRWYWx1ZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIGN1cnJlbnRWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KGN1cnJlbnRWYWx1ZSkgfHwgXCJcIlxuICB9XG4gIC8vIE5vIHVwZGF0ZSByZXF1aXJlZC5cbiAgaWYgKHZhbHVlID09PSBjdXJyZW50VmFsdWUpIHJldHVybiB7c3RhdGU6IHRydWV9XG5cbiAgLy8gS2VlcCB0aGUgY3VycmVudCB2YWx1ZS5cbiAgaWYgKHZhbHVlIDwgY3VycmVudFZhbHVlKSByZXR1cm4ge2N1cnJlbnQ6IHRydWV9XG5cbiAgLy8gT3RoZXJ3aXNlIHVwZGF0ZSB1c2luZyB0aGUgaW5jb21pbmcgdmFsdWUuXG4gIHJldHVybiB7aW5jb21pbmc6IHRydWV9XG59XG5cbkhhbS5taXggPSAoY2hhbmdlLCBncmFwaCkgPT4ge1xuICB2YXIgbWFjaGluZSA9IERhdGUubm93KClcbiAgdmFyIHVwZGF0ZSA9IHt9XG4gIHZhciBkZWZlciA9IHt9XG4gIGxldCB3YWl0ID0gMFxuXG4gIE9iamVjdC5rZXlzKGNoYW5nZSkuZm9yRWFjaChzb3VsID0+IHtcbiAgICBjb25zdCBub2RlID0gY2hhbmdlW3NvdWxdXG4gICAgT2JqZWN0LmtleXMobm9kZSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PT0gXCJfXCIpIHJldHVyblxuXG4gICAgICBjb25zdCB2YWx1ZSA9IG5vZGVba2V5XVxuICAgICAgY29uc3Qgc3RhdGUgPSBub2RlLl9bXCI+XCJdW2tleV1cbiAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IChncmFwaFtzb3VsXSB8fCB7fSlba2V5XVxuICAgICAgY29uc3QgY3VycmVudFN0YXRlID0gKGdyYXBoW3NvdWxdIHx8IHtfOiB7XCI+XCI6IHt9fX0pLl9bXCI+XCJdW2tleV0gfHwgMFxuXG4gICAgICAvLyBEZWZlciB0aGUgdXBkYXRlIGlmIGFoZWFkIG9mIG1hY2hpbmUgdGltZS5cbiAgICAgIGNvbnN0IHNrZXcgPSBzdGF0ZSAtIG1hY2hpbmVcbiAgICAgIGlmIChza2V3ID4gMCkge1xuICAgICAgICAvLyBJZ25vcmUgdXBkYXRlIGlmIGFoZWFkIGJ5IG1vcmUgdGhhbiAyNCBob3Vycy5cbiAgICAgICAgaWYgKHNrZXcgPiA4NjQwMDAwMCkgcmV0dXJuXG5cbiAgICAgICAgLy8gV2FpdCB0aGUgc2hvcnRlc3QgZGlmZmVyZW5jZSBiZWZvcmUgdHJ5aW5nIHRoZSB1cGRhdGVzIGFnYWluLlxuICAgICAgICBpZiAod2FpdCA9PT0gMCB8fCBza2V3IDwgd2FpdCkgd2FpdCA9IHNrZXdcbiAgICAgICAgaWYgKCFkZWZlcltzb3VsXSkgZGVmZXJbc291bF0gPSB7Xzoge1wiI1wiOiBzb3VsLCBcIj5cIjoge319fVxuICAgICAgICBkZWZlcltzb3VsXVtrZXldID0gdmFsdWVcbiAgICAgICAgZGVmZXJbc291bF0uX1tcIj5cIl1ba2V5XSA9IHN0YXRlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBIYW0oc3RhdGUsIGN1cnJlbnRTdGF0ZSwgdmFsdWUsIGN1cnJlbnRWYWx1ZSlcbiAgICAgICAgaWYgKHJlc3VsdC5pbmNvbWluZykge1xuICAgICAgICAgIGlmICghdXBkYXRlW3NvdWxdKSB1cGRhdGVbc291bF0gPSB7Xzoge1wiI1wiOiBzb3VsLCBcIj5cIjoge319fVxuICAgICAgICAgIC8vIFRPRE86IGdyYXBoIHNob3VsZCBub3QganVzdCBncm93IGluZGVmaW50aXRlbHkgaW4gbWVtb3J5LlxuICAgICAgICAgIC8vIE5lZWQgdG8gaGF2ZSBhIG1heCBzaXplIGFmdGVyIHdoaWNoIHN0YXJ0IGRyb3BwaW5nIHRoZSBvbGRlc3Qgc3RhdGVcbiAgICAgICAgICAvLyBEbyBzb21ldGhpbmcgc2ltaWxhciB0byBEdXAgd2hpY2ggY2FuIGhhbmRsZSBkZWxldGVzP1xuICAgICAgICAgIGlmICghZ3JhcGhbc291bF0pIGdyYXBoW3NvdWxdID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgICBncmFwaFtzb3VsXVtrZXldID0gdXBkYXRlW3NvdWxdW2tleV0gPSB2YWx1ZVxuICAgICAgICAgIGdyYXBoW3NvdWxdLl9bXCI+XCJdW2tleV0gPSB1cGRhdGVbc291bF0uX1tcIj5cIl1ba2V5XSA9IHN0YXRlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICB9KVxuICByZXR1cm4ge25vdzogdXBkYXRlLCBkZWZlcjogZGVmZXIsIHdhaXQ6IHdhaXR9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gSGFtXG4iLCJjb25zdCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpXG5jb25zdCBXaXJlID0gcmVxdWlyZShcIi4vd2lyZVwiKVxuXG5jb25zdCBIb2xzdGVyID0gb3B0ID0+IHtcbiAgY29uc3Qgd2lyZSA9IFdpcmUob3B0KVxuXG4gIGNvbnN0IG9rID0gZGF0YSA9PiB7XG4gICAgcmV0dXJuIChcbiAgICAgIGRhdGEgPT09IG51bGwgfHxcbiAgICAgIGRhdGEgPT09IHRydWUgfHxcbiAgICAgIGRhdGEgPT09IGZhbHNlIHx8XG4gICAgICB0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIiB8fFxuICAgICAgdXRpbHMucmVsLmlzKGRhdGEpIHx8XG4gICAgICB1dGlscy5udW0uaXMoZGF0YSlcbiAgICApXG4gIH1cblxuICAvLyBjaGVjayByZXR1cm5zIHRydWUgaWYgZGF0YSBpcyBvayB0byBhZGQgdG8gYSBncmFwaCwgYW4gZXJyb3Igc3RyaW5nIGlmXG4gIC8vIHRoZSBkYXRhIGNhbid0IGJlIGNvbnZlcnRlZCwgYW5kIHRoZSBrZXlzIG9uIHRoZSBkYXRhIG9iamVjdCBvdGhlcndpc2UuXG4gIGNvbnN0IGNoZWNrID0gZGF0YSA9PiB7XG4gICAgaWYgKG9rKGRhdGEpKSByZXR1cm4gdHJ1ZVxuXG4gICAgaWYgKHV0aWxzLm9iai5pcyhkYXRhKSkge1xuICAgICAgY29uc3Qga2V5cyA9IFtdXG4gICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhkYXRhKSkge1xuICAgICAgICBpZiAoa2V5ID09PSBcIl9cIikge1xuICAgICAgICAgIHJldHVybiBcImVycm9yIHVuZGVyc2NvcmUgY2Fubm90IGJlIHVzZWQgYXMgYW4gaXRlbSBuYW1lXCJcbiAgICAgICAgfVxuICAgICAgICBpZiAodXRpbHMub2JqLmlzKHZhbHVlKSB8fCBvayh2YWx1ZSkpIHtcbiAgICAgICAgICBrZXlzLnB1c2goa2V5KVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBlcnJvciB7JHtrZXl9OiR7dmFsdWV9fSBjYW5ub3QgYmUgY29udmVydGVkIHRvIGdyYXBoYFxuICAgICAgfVxuICAgICAgaWYgKGtleXMubGVuZ3RoICE9PSAwKSByZXR1cm4ga2V5c1xuICAgIH1cbiAgICByZXR1cm4gYGVycm9yICR7ZGF0YX0gY2Fubm90IGJlIGNvbnZlcnRlZCB0byBhIGdyYXBoYFxuICB9XG5cbiAgLy8gZ3JhcGggY29udmVydHMgb2JqZWN0cyB0byBncmFwaCBmb3JtYXQgd2l0aCB1cGRhdGVkIHN0YXRlcy5cbiAgY29uc3QgZ3JhcGggPSAoc291bCwgZGF0YSwgZykgPT4ge1xuICAgIGlmICghZykgZyA9IHtbc291bF06IHtfOiB7XCIjXCI6IHNvdWwsIFwiPlwiOiB7fX19fVxuICAgIGVsc2UgZ1tzb3VsXSA9IHtfOiB7XCIjXCI6IHNvdWwsIFwiPlwiOiB7fX19XG5cbiAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhkYXRhKSkge1xuICAgICAgZ1tzb3VsXVtrZXldID0gdmFsdWVcbiAgICAgIGdbc291bF0uX1tcIj5cIl1ba2V5XSA9IERhdGUubm93KClcbiAgICB9XG4gICAgcmV0dXJuIGdcbiAgfVxuXG4gIGNvbnN0IGFwaSA9IGN0eCA9PiB7XG4gICAgYXBpLmN0eCA9IGN0eFxuXG4gICAgY29uc3QgcmVzb2x2ZSA9IChyZXF1ZXN0LCBjYikgPT4ge1xuICAgICAgY29uc3QgZ2V0ID0gdHlwZW9mIHJlcXVlc3QuZ2V0ICE9PSBcInVuZGVmaW5lZFwiXG4gICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGFwaS5jdHgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGFwaS5jdHhbaV0uc291bCAhPT0gbnVsbCkgY29udGludWVcblxuICAgICAgICAvLyBUaGUgY3VycmVudCBzb3VsIGluIHRoZSBjb250ZXh0IGNoYWluIGlzIG51bGwsIG5lZWQgdGhlIHByZXZpb3VzXG4gICAgICAgIC8vIGNvbnRleHQgKGllIHRoZSBwYXJlbnQgbm9kZSkgdG8gZmluZCBhIHNvdWwgcmVsYXRpb24gZm9yIGl0LlxuICAgICAgICBjb25zdCB7aXRlbSwgc291bH0gPSBhcGkuY3R4W2kgLSAxXVxuICAgICAgICB3aXJlLmdldCh7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgbXNnID0+IHtcbiAgICAgICAgICBpZiAobXNnLmVycikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIGdldHRpbmcgJHtpdGVtfSBvbiAke3NvdWx9OiAke21zZy5lcnJ9YClcbiAgICAgICAgICAgIGNiKG51bGwpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBBbiBlYXJsaWVyIGNhbGxiYWNrIGhhcyBhbHJlYWR5IGNvbXBsZXRlZCB0aGUgcmVxdWVzdC5cbiAgICAgICAgICBpZiAoYXBpLmN0eC5sZW5ndGggPT09IDApIHJldHVyblxuXG4gICAgICAgICAgY29uc3Qgbm9kZSA9IG1zZy5wdXQgJiYgbXNnLnB1dFtzb3VsXVxuICAgICAgICAgIGlmIChub2RlICYmIG5vZGVbaXRlbV0gIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIGxldCBpZCA9IHV0aWxzLnJlbC5pcyhub2RlW2l0ZW1dKVxuICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgIGFwaS5jdHhbaV0uc291bCA9IGlkXG4gICAgICAgICAgICAgIC8vIENhbGwgYXBpIGFnYWluIHVzaW5nIHRoZSB1cGRhdGVkIGNvbnRleHQuXG4gICAgICAgICAgICAgIGlmIChnZXQpIGFwaShhcGkuY3R4KS5nZXQobnVsbCwgcmVxdWVzdC5nZXQsIGNiKVxuICAgICAgICAgICAgICBlbHNlIGFwaShhcGkuY3R4KS5wdXQocmVxdWVzdC5wdXQsIGNiKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChnZXQpIHtcbiAgICAgICAgICAgICAgLy8gUmVxdWVzdCB3YXMgbm90IGZvciBhIG5vZGUsIHJldHVybiBhIHByb3BlcnR5IG9uIHRoZSBjdXJyZW50XG4gICAgICAgICAgICAgIC8vIHNvdWwuXG4gICAgICAgICAgICAgIGNiKG5vZGVbaXRlbV0pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBSZXF1ZXN0IHdhcyBhIGNoYWluZWQgZ2V0IGJlZm9yZSBwdXQsIHNvIHJlbCBkb24ndCBleGlzdCB5ZXQuXG4gICAgICAgICAgICAgIGlkID0gdXRpbHMudGV4dC5yYW5kb20oKVxuICAgICAgICAgICAgICBjb25zdCByZWwgPSB7W2l0ZW1dOiB1dGlscy5yZWwuaWZ5KGlkKX1cbiAgICAgICAgICAgICAgd2lyZS5wdXQoZ3JhcGgoc291bCwgcmVsKSwgZXJyID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICBhY2soYGVycm9yIHB1dHRpbmcgJHtpdGVtfSBvbiAke3NvdWx9OiAke2Vycn1gKVxuICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgYXBpLmN0eFtpXS5zb3VsID0gaWRcbiAgICAgICAgICAgICAgICBhcGkoYXBpLmN0eCkucHV0KHJlcXVlc3QucHV0LCBjYilcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yICR7aXRlbX0gbm90IGZvdW5kIG9uICR7c291bH1gKVxuICAgICAgICAgICAgY2IobnVsbClcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIC8vIENhbGxiYWNrIGhhcyBiZWVuIHBhc3NlZCB0byBuZXh0IHNvdWwgbG9va3VwIG9yIGNhbGxlZCBhYm92ZSwgc29cbiAgICAgICAgLy8gcmV0dXJuIGZhbHNlIGFzIHRoZSBjYWxsaW5nIGNvZGUgc2hvdWxkIG5vdCBjb250aW51ZS5cbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICB9XG5cbiAgICAgIGlmIChnZXQgJiYgYXBpLmN0eFthcGkuY3R4Lmxlbmd0aCAtIDFdLml0ZW0gIT09IG51bGwpIHtcbiAgICAgICAgLy8gVGhlIGNvbnRleHQgaGFzIGJlZW4gcmVzb2x2ZWQsIGJ1dCBpdCBkb2VzIG5vdCBpbmNsdWRlIHRoZSBub2RlXG4gICAgICAgIC8vIHJlcXVlc3RlZCBpbiBhIGdldCByZXF1ZXN0LCB0aGlzIHJlcXVpcmVzIG9uZSBtb3JlIGxvb2t1cC5cbiAgICAgICAgYXBpLmN0eC5wdXNoKHtpdGVtOiBudWxsLCBzb3VsOiBudWxsfSlcbiAgICAgICAgYXBpKGFwaS5jdHgpLmdldChudWxsLCByZXF1ZXN0LmdldCwgY2IpXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuXG4gICAgICAvLyBSZXR1cm4gdGhlIGxhc3QgY29udGV4dCwgaWUgdGhlIHNvdWwgcmVxdWlyZWQgYnkgdGhlIGNhbGxpbmcgY29kZS5cbiAgICAgIHJldHVybiBhcGkuY3R4W2FwaS5jdHgubGVuZ3RoIC0gMV1cbiAgICB9XG5cbiAgICAvLyBkb25lIG1ha2VzIHN1cmUgdGhlIGdpdmVuIGNhbGxiYWNrIGlzIG9ubHkgY2FsbGVkIG9uY2UuXG4gICAgY29uc3QgZG9uZSA9IGRhdGEgPT4ge1xuICAgICAgLy8gY29udGV4dCBuZWVkcyB0byBiZSBjbGVhcmVkIGluIGNhc2UgYXBpIGlzIHVzZWQgYWdhaW4uXG4gICAgICBpZiAoYXBpLmN0eCkgYXBpLmN0eCA9IFtdXG4gICAgICBpZiAoYXBpLmNiKSB7XG4gICAgICAgIC8vIFJlbGFzZSBhcGkuY2IgYmVmb3JlIGNhbGxpbmcgaXQgc28gdGhlIG5leHQgY2hhaW4gY2FsbCBjYW4gdXNlIGl0LlxuICAgICAgICBjb25zdCB0bXAgPSBhcGkuY2JcbiAgICAgICAgYXBpLmNiID0gbnVsbFxuICAgICAgICB0bXAoZGF0YSlcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIC8vIExvZyBlcnJvcnMgd2hlbiBhcGkuY2IgaXMgbm90IHNldC5cbiAgICAgIGlmIChkYXRhKSBjb25zb2xlLmxvZyhkYXRhKVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBnZXQ6IChrZXksIGxleCwgY2IpID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBsZXggPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgIGNiID0gbGV4XG4gICAgICAgICAgbGV4ID0gbnVsbFxuICAgICAgICB9XG4gICAgICAgIGlmIChjYiAmJiAhYXBpLmNiKSB7XG4gICAgICAgICAgLy8gVGhpcyAoYW5kIGFjaykgYWxsb3dzIG5lc3RlZCBvYmplY3RzIHRvIGtlZXAgdGhlaXIgb3duIGNhbGxiYWNrcy5cbiAgICAgICAgICBhcGkuY2IgPSBjYlxuICAgICAgICAgIGNiID0gbnVsbFxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYWNrID0gZXJyID0+IHtcbiAgICAgICAgICBjYiA/IGNiKGVycikgOiBkb25lKGVycilcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChrZXkgPT09IFwiXCIgfHwga2V5ID09PSBcIl9cIikge1xuICAgICAgICAgIGFjayhudWxsKVxuICAgICAgICAgIHJldHVybiBhcGkoYXBpLmN0eClcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhcGkuY3R4ICYmIGFwaS5jdHgubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgLy8gUHVzaCB0aGUga2V5IHRvIHRoZSBjb250ZXh0IGFzIGl0IG5lZWRzIGEgc291bCBsb29rdXAuXG4gICAgICAgICAgLy8gKG51bGwgaXMgdXNlZCB0byBjYWxsIHRoZSBhcGkgd2l0aCB1cGRhdGVkIGNvbnRleHQpXG4gICAgICAgICAgaWYgKGtleSAhPT0gbnVsbCkgYXBpLmN0eC5wdXNoKHtpdGVtOiBrZXksIHNvdWw6IG51bGx9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChrZXkgPT09IG51bGwpIHtcbiAgICAgICAgICAgIGFjayhudWxsKVxuICAgICAgICAgICAgcmV0dXJuIGFwaShhcGkuY3R4KVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFRvcCBsZXZlbCBrZXlzIGFyZSBhZGRlZCB0byBhIHJvb3Qgbm9kZSBzbyB0aGVpciB2YWx1ZXMgZG9uJ3QgbmVlZFxuICAgICAgICAgIC8vIHRvIGJlIG9iamVjdHMuXG4gICAgICAgICAgYXBpLmN0eCA9IFt7aXRlbToga2V5LCBzb3VsOiBcInJvb3RcIn1dXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFhcGkuY2IpIHJldHVybiBhcGkoYXBpLmN0eClcblxuICAgICAgICAvLyBXaGVuIHRoZXJlJ3MgYSBjYWxsYmFjayBuZWVkIHRvIHJlc29sdmUgdGhlIGNvbnRleHQgZmlyc3QuXG4gICAgICAgIGNvbnN0IHtzb3VsfSA9IHJlc29sdmUoe2dldDogbGV4fSwgYWNrKVxuICAgICAgICBpZiAoIXNvdWwpIHJldHVybiBhcGkoYXBpLmN0eClcblxuICAgICAgICB3aXJlLmdldCh1dGlscy5vYmoucHV0KGxleCwgXCIjXCIsIHNvdWwpLCBhc3luYyBtc2cgPT4ge1xuICAgICAgICAgIGlmIChtc2cuZXJyKSBjb25zb2xlLmxvZyhtc2cuZXJyKVxuICAgICAgICAgIGlmIChtc2cucHV0ICYmIG1zZy5wdXRbc291bF0pIHtcbiAgICAgICAgICAgIGRlbGV0ZSBtc2cucHV0W3NvdWxdLl9cbiAgICAgICAgICAgIC8vIFJlc29sdmUgYW55IHJlbHMgb24gdGhlIG5vZGUgYmVmb3JlIHJldHVybmluZyB0byB0aGUgdXNlci5cbiAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKG1zZy5wdXRbc291bF0pKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGlkID0gdXRpbHMucmVsLmlzKG1zZy5wdXRbc291bF1ba2V5XSlcbiAgICAgICAgICAgICAgaWYgKGlkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgICAgICAgICAgYXBpKFt7aXRlbTogbnVsbCwgc291bDogaWR9XSkuZ2V0KG51bGwsIHJlc29sdmUpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICBtc2cucHV0W3NvdWxdW2tleV0gPSBkYXRhXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFjayhtc2cucHV0W3NvdWxdKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBObyBkYXRhIGNhbGxiYWNrLlxuICAgICAgICAgICAgYWNrKG51bGwpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICByZXR1cm4gYXBpKGFwaS5jdHgpXG4gICAgICB9LFxuICAgICAgcHV0OiAoZGF0YSwgY2IpID0+IHtcbiAgICAgICAgaWYgKCFhcGkuY2IpIHtcbiAgICAgICAgICBpZiAoIWNiKSByZXR1cm5cblxuICAgICAgICAgIC8vIFRoaXMgKGFuZCBhY2spIGFsbG93cyBuZXN0ZWQgb2JqZWN0cyB0byBrZWVwIHRoZWlyIG93biBjYWxsYmFja3MuXG4gICAgICAgICAgYXBpLmNiID0gY2JcbiAgICAgICAgICBjYiA9IG51bGxcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGFjayA9IGVyciA9PiB7XG4gICAgICAgICAgY2IgPyBjYihlcnIpIDogZG9uZShlcnIpXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWFwaS5jdHggfHwgYXBpLmN0eC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBhY2soXCJwbGVhc2UgcHJvdmlkZSBhIGtleSB1c2luZyBnZXQoa2V5KSBiZWZvcmUgcHV0XCIpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZXN1bHQgPSBjaGVjayhkYXRhKVxuICAgICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgIC8vIEFsbCBzdHJpbmdzIHJldHVybmVkIGZyb20gY2hlY2sgYXJlIGVycm9ycywgY2Fubm90IGNvbnRpbnVlLlxuICAgICAgICAgIGFjayhyZXN1bHQpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXNvbHZlIHRoZSBjdXJyZW50IGNvbnRleHQgYmVmb3JlIHB1dHRpbmcgZGF0YS5cbiAgICAgICAgY29uc3Qge2l0ZW0sIHNvdWx9ID0gcmVzb2x2ZSh7cHV0OiBkYXRhfSwgYWNrKVxuICAgICAgICBpZiAoIXNvdWwpIHJldHVyblxuXG4gICAgICAgIGlmIChyZXN1bHQgPT09IHRydWUpIHtcbiAgICAgICAgICAvLyBXaGVuIHJlc3VsdCBpcyB0cnVlIGRhdGEgaXMgYSBwcm9wZXJ0eSB0byBwdXQgb24gdGhlIGN1cnJlbnQgc291bC5cbiAgICAgICAgICAvLyBOZWVkIHRvIGNoZWNrIGlmIGl0ZW0gaXMgYSByZWwgYW5kIGFsc28gc2V0IHRoZSBub2RlIHRvIG51bGwuIChUaGlzXG4gICAgICAgICAgLy8gYXBwbGllcyBmb3IgYW55IHVwZGF0ZSBmcm9tIGEgcmVsIHRvIGEgcHJvcGVydHksIG5vdCBqdXN0IG51bGwuKVxuICAgICAgICAgIHdpcmUuZ2V0KHtcIiNcIjogc291bCwgXCIuXCI6IGl0ZW19LCBhc3luYyBtc2cgPT4ge1xuICAgICAgICAgICAgaWYgKG1zZy5lcnIpIHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIGdldHRpbmcgJHtzb3VsfTogJHttc2cuZXJyfWApXG4gICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gbXNnLnB1dCAmJiBtc2cucHV0W3NvdWxdICYmIG1zZy5wdXRbc291bF1baXRlbV1cbiAgICAgICAgICAgIGNvbnN0IGlkID0gdXRpbHMucmVsLmlzKGN1cnJlbnQpXG4gICAgICAgICAgICBpZiAoIWlkKSByZXR1cm5cblxuICAgICAgICAgICAgd2lyZS5nZXQoe1wiI1wiOiBpZH0sIGFzeW5jIG1zZyA9PiB7XG4gICAgICAgICAgICAgIGlmIChtc2cuZXJyKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIGdldHRpbmcgJHtpZH06ICR7bXNnLmVycn1gKVxuICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgaWYgKCFtc2cucHV0IHx8ICFtc2cucHV0W2lkXSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBlcnJvciAke2lkfSBub3QgZm91bmRgKVxuICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgZGVsZXRlIG1zZy5wdXRbaWRdLl9cbiAgICAgICAgICAgICAgLy8gbnVsbCBlYWNoIG9mIHRoZSBwcm9wZXJ0aWVzIG9uIHRoZSBub2RlLlxuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhtc2cucHV0W2lkXSkpIHtcbiAgICAgICAgICAgICAgICBhcGkoW3tpdGVtOiBrZXksIHNvdWw6IGlkfV0pLnB1dChudWxsLCBlcnIgPT4ge1xuICAgICAgICAgICAgICAgICAgaWYgKGVyciAhPT0gbnVsbCkgY29uc29sZS5sb2coZXJyKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSlcblxuICAgICAgICAgIHdpcmUucHV0KGdyYXBoKHNvdWwsIHtbaXRlbV06IGRhdGF9KSwgYWNrKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3RoZXJ3aXNlIHB1dCB0aGUgZGF0YSB1c2luZyB0aGUga2V5cyByZXR1cm5lZCBpbiByZXN1bHQuXG4gICAgICAgIC8vIE5lZWQgdG8gY2hlY2sgaWYgYSByZWwgaGFzIGFscmVhZHkgYmVlbiBhZGRlZCBvbiB0aGUgY3VycmVudCBub2RlLlxuICAgICAgICB3aXJlLmdldCh7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgICBpZiAobXNnLmVycikge1xuICAgICAgICAgICAgYWNrKGBlcnJvciBnZXR0aW5nICR7c291bH06ICR7bXNnLmVycn1gKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgY3VycmVudCA9IG1zZy5wdXQgJiYgbXNnLnB1dFtzb3VsXSAmJiBtc2cucHV0W3NvdWxdW2l0ZW1dXG4gICAgICAgICAgY29uc3QgaWQgPSB1dGlscy5yZWwuaXMoY3VycmVudClcbiAgICAgICAgICBpZiAoIWlkKSB7XG4gICAgICAgICAgICAvLyBUaGUgY3VycmVudCByZWwgZG9lc24ndCBleGlzdCwgc28gYWRkIGl0IGZpcnN0LlxuICAgICAgICAgICAgY29uc3QgcmVsID0ge1tpdGVtXTogdXRpbHMucmVsLmlmeSh1dGlscy50ZXh0LnJhbmRvbSgpKX1cbiAgICAgICAgICAgIHdpcmUucHV0KGdyYXBoKHNvdWwsIHJlbCksIGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBhY2soYGVycm9yIHB1dHRpbmcgJHtpdGVtfSBvbiAke3NvdWx9OiAke2Vycn1gKVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGFwaShhcGkuY3R4KS5wdXQoZGF0YSwgYWNrKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IHB1dCA9IGZhbHNlXG4gICAgICAgICAgY29uc3QgdXBkYXRlID0ge31cbiAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiByZXN1bHQpIHtcbiAgICAgICAgICAgIGNvbnN0IGVyciA9IGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgICAgICBpZiAodXRpbHMub2JqLmlzKGRhdGFba2V5XSkpIHtcbiAgICAgICAgICAgICAgICAvLyBVc2UgdGhlIGN1cnJlbnQgcmVsIGFzIHRoZSBjb250ZXh0IGZvciBuZXN0ZWQgb2JqZWN0cy5cbiAgICAgICAgICAgICAgICBhcGkoW3tpdGVtOiBrZXksIHNvdWw6IGlkfV0pLnB1dChkYXRhW2tleV0sIHJlc29sdmUpXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcHV0ID0gdHJ1ZVxuICAgICAgICAgICAgICAgIC8vIEdyb3VwIG90aGVyIHByb3BlcnRpZXMgaW50byBvbmUgdXBkYXRlLlxuICAgICAgICAgICAgICAgIHVwZGF0ZVtrZXldID0gZGF0YVtrZXldXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICBhY2soZXJyKVxuICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHB1dCkgd2lyZS5wdXQoZ3JhcGgoaWQsIHVwZGF0ZSksIGFjaylcbiAgICAgICAgICBlbHNlIGFjaygpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgLy8gQWxsb3cgdGhlIHdpcmUgc3BlYyB0byBiZSB1c2VkIHZpYSBob2xzdGVyLlxuICAgICAgd2lyZTogd2lyZSxcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFwaSgpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gSG9sc3RlclxuIiwiY29uc3QgUmFkaXggPSByZXF1aXJlKFwiLi9yYWRpeFwiKVxuY29uc3QgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKVxuXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIGVuZCBvZiB0ZXh0LlxuY29uc3QgZXR4ID0gU3RyaW5nLmZyb21DaGFyQ29kZSgzKVxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciBlbnF1aXJ5LlxuY29uc3QgZW5xID0gU3RyaW5nLmZyb21DaGFyQ29kZSg1KVxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciB1bml0IHNlcGFyYXRvci5cbmNvbnN0IHVuaXQgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDMxKVxuXG4vLyBSYWRpc2sgcHJvdmlkZXMgYWNjZXNzIHRvIGEgcmFkaXggdHJlZSB0aGF0IGlzIHN0b3JlZCBpbiB0aGUgcHJvdmlkZWRcbi8vIG9wdC5zdG9yZSBpbnRlcmZhY2UuXG5jb25zdCBSYWRpc2sgPSBvcHQgPT4ge1xuICB2YXIgdVxuICB2YXIgY2FjaGUgPSBudWxsXG5cbiAgaWYgKCFvcHQpIG9wdCA9IHt9XG4gIGlmICghb3B0LmxvZykgb3B0LmxvZyA9IGNvbnNvbGUubG9nXG4gIGlmICghb3B0LmJhdGNoKSBvcHQuYmF0Y2ggPSAxMCAqIDEwMDBcbiAgaWYgKCFvcHQud2FpdCkgb3B0LndhaXQgPSAxXG4gIGlmICghb3B0LnNpemUpIG9wdC5zaXplID0gMTAyNCAqIDEwMjQgLy8gMU1CXG4gIGlmICghb3B0LnN0b3JlKSB7XG4gICAgb3B0LmxvZyhcbiAgICAgIFwiUmFkaXNrIG5lZWRzIGBzdG9yZWAgaW50ZXJmYWNlIHdpdGggYHtnZXQ6IGZuLCBwdXQ6IGZuLCBsaXN0OiBmbn1gXCIsXG4gICAgKVxuICAgIHJldHVyblxuICB9XG4gIGlmICghb3B0LnN0b3JlLmdldCkge1xuICAgIG9wdC5sb2coXCJSYWRpc2sgbmVlZHMgYHN0b3JlLmdldGAgaW50ZXJmYWNlIHdpdGggYChmaWxlLCBjYilgXCIpXG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKCFvcHQuc3RvcmUucHV0KSB7XG4gICAgb3B0LmxvZyhcIlJhZGlzayBuZWVkcyBgc3RvcmUucHV0YCBpbnRlcmZhY2Ugd2l0aCBgKGZpbGUsIGRhdGEsIGNiKWBcIilcbiAgICByZXR1cm5cbiAgfVxuICBpZiAoIW9wdC5zdG9yZS5saXN0KSB7XG4gICAgb3B0LmxvZyhcIlJhZGlzayBuZWVkcyBhIHN0cmVhbWluZyBgc3RvcmUubGlzdGAgaW50ZXJmYWNlIHdpdGggYChjYilgXCIpXG4gICAgcmV0dXJuXG4gIH1cblxuICAvLyBBbnkgYW5kIGFsbCBzdG9yYWdlIGFkYXB0ZXJzIHNob3VsZDpcbiAgLy8gMS4gQmVjYXVzZSB3cml0aW5nIHRvIGRpc2sgdGFrZXMgdGltZSwgd2Ugc2hvdWxkIGJhdGNoIGRhdGEgdG8gZGlzay5cbiAgLy8gICAgVGhpcyBpbXByb3ZlcyBwZXJmb3JtYW5jZSwgYW5kIHJlZHVjZXMgcG90ZW50aWFsIGRpc2sgY29ycnVwdGlvbi5cbiAgLy8gMi4gSWYgYSBiYXRjaCBleGNlZWRzIGEgY2VydGFpbiBudW1iZXIgb2Ygd3JpdGVzLCB3ZSBzaG91bGQgaW1tZWRpYXRlbHlcbiAgLy8gICAgd3JpdGUgdG8gZGlzayB3aGVuIHBoeXNpY2FsbHkgcG9zc2libGUuIFRoaXMgY2FwcyB0b3RhbCBwZXJmb3JtYW5jZSxcbiAgLy8gICAgYnV0IHJlZHVjZXMgcG90ZW50aWFsIGxvc3MuXG4gIGNvbnN0IHJhZGlzayA9IChrZXksIHZhbHVlLCBjYikgPT4ge1xuICAgIGtleSA9IFwiXCIgKyBrZXlcblxuICAgIC8vIElmIG5vIHZhbHVlIGlzIHByb3ZpZGVkIHRoZW4gdGhlIHNlY29uZCBwYXJhbWV0ZXIgaXMgdGhlIGNhbGxiYWNrXG4gICAgLy8gZnVuY3Rpb24uIFJlYWQgdmFsdWUgZnJvbSBtZW1vcnkgb3IgZGlzayBhbmQgY2FsbCBjYWxsYmFjayB3aXRoIGl0LlxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgY2IgPSB2YWx1ZVxuICAgICAgdmFsdWUgPSByYWRpc2suYmF0Y2goa2V5KVxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICByZXR1cm4gY2IodSwgdmFsdWUpXG4gICAgICB9XG5cbiAgICAgIGlmIChyYWRpc2sudGhyYXNoLmF0KSB7XG4gICAgICAgIHZhbHVlID0gcmFkaXNrLnRocmFzaC5hdChrZXkpXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICByZXR1cm4gY2IodSwgdmFsdWUpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJhZGlzay5yZWFkKGtleSwgY2IpXG4gICAgfVxuXG4gICAgLy8gT3RoZXJ3aXNlIHN0b3JlIHRoZSB2YWx1ZSBwcm92aWRlZC5cbiAgICByYWRpc2suYmF0Y2goa2V5LCB2YWx1ZSlcbiAgICBpZiAoY2IpIHtcbiAgICAgIHJhZGlzay5iYXRjaC5hY2tzLnB1c2goY2IpXG4gICAgfVxuICAgIC8vIERvbid0IHdhaXQgaWYgd2UgaGF2ZSBiYXRjaGVkIHRvbyBtYW55LlxuICAgIGlmICgrK3JhZGlzay5iYXRjaC5lZCA+PSBvcHQuYmF0Y2gpIHtcbiAgICAgIHJldHVybiByYWRpc2sudGhyYXNoKClcbiAgICB9XG5cbiAgICAvLyBPdGhlcndpc2Ugd2FpdCBmb3IgbW9yZSB1cGRhdGVzIGJlZm9yZSB3cml0aW5nLlxuICAgIGNsZWFyVGltZW91dChyYWRpc2suYmF0Y2gudGltZW91dClcbiAgICByYWRpc2suYmF0Y2gudGltZW91dCA9IHNldFRpbWVvdXQocmFkaXNrLnRocmFzaCwgb3B0LndhaXQpXG4gIH1cblxuICByYWRpc2suYmF0Y2ggPSBSYWRpeCgpXG4gIHJhZGlzay5iYXRjaC5hY2tzID0gW11cbiAgcmFkaXNrLmJhdGNoLmVkID0gMFxuXG4gIHJhZGlzay50aHJhc2ggPSAoKSA9PiB7XG4gICAgaWYgKHJhZGlzay50aHJhc2guaW5nKSB7XG4gICAgICByZXR1cm4gKHJhZGlzay50aHJhc2gubW9yZSA9IHRydWUpXG4gICAgfVxuXG4gICAgY2xlYXJUaW1lb3V0KHJhZGlzay5iYXRjaC50aW1lb3V0KVxuICAgIHJhZGlzay50aHJhc2gubW9yZSA9IGZhbHNlXG4gICAgcmFkaXNrLnRocmFzaC5pbmcgPSB0cnVlXG4gICAgdmFyIGJhdGNoID0gKHJhZGlzay50aHJhc2guYXQgPSByYWRpc2suYmF0Y2gpXG4gICAgcmFkaXNrLmJhdGNoID0gbnVsbFxuICAgIHJhZGlzay5iYXRjaCA9IFJhZGl4KClcbiAgICByYWRpc2suYmF0Y2guYWNrcyA9IFtdXG4gICAgcmFkaXNrLmJhdGNoLmVkID0gMFxuICAgIGxldCBpID0gMFxuICAgIHJhZGlzay5zYXZlKGJhdGNoLCBlcnIgPT4ge1xuICAgICAgLy8gVGhpcyBpcyB0byBpZ25vcmUgbXVsdGlwbGUgY2FsbGJhY2tzIGZyb20gcmFkaXNrLnNhdmUgY2FsbGluZ1xuICAgICAgLy8gcmFkaXNrLndyaXRlPyBJdCBsb29rcyBsaWtlIG11bHRpcGxlIGNhbGxiYWNrcyB3aWxsIGJlIG1hZGUgaWYgYVxuICAgICAgLy8gZmlsZSBuZWVkcyB0byBiZSBzcGxpdC5cbiAgICAgIGlmICgrK2kgPiAxKSByZXR1cm5cblxuICAgICAgaWYgKGVycikgb3B0LmxvZyhlcnIpXG4gICAgICBiYXRjaC5hY2tzLmZvckVhY2goY2IgPT4gY2IoZXJyKSlcbiAgICAgIHJhZGlzay50aHJhc2guYXQgPSBudWxsXG4gICAgICByYWRpc2sudGhyYXNoLmluZyA9IGZhbHNlXG4gICAgICBpZiAocmFkaXNrLnRocmFzaC5tb3JlKSByYWRpc2sudGhyYXNoKClcbiAgICB9KVxuICB9XG5cbiAgLy8gMS4gRmluZCB0aGUgZmlyc3QgcmFkaXggaXRlbSBpbiBtZW1vcnlcbiAgLy8gMi4gVXNlIHRoYXQgYXMgdGhlIHN0YXJ0aW5nIGluZGV4IGluIHRoZSBkaXJlY3Rvcnkgb2YgZmlsZXNcbiAgLy8gMy4gRmluZCB0aGUgZmlyc3QgZmlsZSB0aGF0IGlzIGxleGljYWxseSBsYXJnZXIgdGhhbiBpdFxuICAvLyA0LiBSZWFkIHRoZSBwcmV2aW91cyBmaWxlIGludG8gbWVtb3J5XG4gIC8vIDUuIFNjYW4gdGhyb3VnaCBpbiBtZW1vcnkgcmFkaXggZm9yIGFsbCB2YWx1ZXMgbGV4aWNhbGx5IGxlc3MgdGhhbiBsaW1pdFxuICAvLyA2LiBNZXJnZSBhbmQgd3JpdGUgYWxsIG9mIHRob3NlIHRvIHRoZSBpbi1tZW1vcnkgZmlsZSBhbmQgYmFjayB0byBkaXNrXG4gIC8vIDcuIElmIGZpbGUgaXMgdG8gbGFyZ2UgdGhlbiBzcGxpdC4gTW9yZSBkZXRhaWxzIG5lZWRlZCBoZXJlXG4gIHJhZGlzay5zYXZlID0gKHJhZCwgY2IpID0+IHtcbiAgICBjb25zdCBzYXZlID0ge1xuICAgICAgZmluZDogKHRyZWUsIGtleSkgPT4ge1xuICAgICAgICAvLyBUaGlzIGlzIGZhbHNlIGZvciBhbnkga2V5IHVudGlsIHNhdmUuc3RhcnQgaXMgc2V0IHRvIGFuIGluaXRpYWwga2V5LlxuICAgICAgICBpZiAoa2V5IDwgc2F2ZS5zdGFydCkgcmV0dXJuXG5cbiAgICAgICAgc2F2ZS5zdGFydCA9IGtleVxuICAgICAgICBvcHQuc3RvcmUubGlzdChzYXZlLmxleClcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH0sXG4gICAgICBsZXg6IGZpbGUgPT4ge1xuICAgICAgICBpZiAoIWZpbGUgfHwgZmlsZSA+IHNhdmUuc3RhcnQpIHtcbiAgICAgICAgICBzYXZlLmVuZCA9IGZpbGVcbiAgICAgICAgICAvLyAhIGlzIHVzZWQgYXMgdGhlIGZpcnN0IGZpbGUgbmFtZSBhcyBpdCdzIHRoZSBmaXJzdCBwcmludGFibGVcbiAgICAgICAgICAvLyBjaGFyYWN0ZXIsIHNvIGFsd2F5cyBtYXRjaGVzIGFzIGxleGljYWxseSBsZXNzIHRoYW4gYW55IG5vZGUuXG4gICAgICAgICAgc2F2ZS5taXgoc2F2ZS5maWxlIHx8IFwiIVwiLCBzYXZlLnN0YXJ0LCBzYXZlLmVuZClcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG5cbiAgICAgICAgc2F2ZS5maWxlID0gZmlsZVxuICAgICAgfSxcbiAgICAgIG1peDogKGZpbGUsIHN0YXJ0LCBlbmQpID0+IHtcbiAgICAgICAgc2F2ZS5zdGFydCA9IHNhdmUuZW5kID0gc2F2ZS5maWxlID0gdVxuICAgICAgICByYWRpc2sucGFyc2UoZmlsZSwgKGVyciwgZGlzaykgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgICAgICBSYWRpeC5tYXAocmFkLCAodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKGtleSA8IHN0YXJ0KSByZXR1cm5cblxuICAgICAgICAgICAgaWYgKGVuZCAmJiBlbmQgPCBrZXkpIHtcbiAgICAgICAgICAgICAgc2F2ZS5zdGFydCA9IGtleVxuICAgICAgICAgICAgICByZXR1cm4gc2F2ZS5zdGFydFxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBkaXNrKGtleSwgdmFsdWUpXG4gICAgICAgICAgfSlcbiAgICAgICAgICByYWRpc2sud3JpdGUoZmlsZSwgZGlzaywgc2F2ZS5uZXh0KVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIG5leHQ6IGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgICAgaWYgKHNhdmUuc3RhcnQpIHJldHVybiBSYWRpeC5tYXAocmFkLCBzYXZlLmZpbmQpXG5cbiAgICAgICAgY2IoZXJyKVxuICAgICAgfSxcbiAgICB9XG4gICAgUmFkaXgubWFwKHJhZCwgc2F2ZS5maW5kKVxuICB9XG5cbiAgcmFkaXNrLndyaXRlID0gKGZpbGUsIHJhZCwgY2IpID0+IHtcbiAgICAvLyBJbnZhbGlkYXRlIGNhY2hlIG9uIHdyaXRlLlxuICAgIGNhY2hlID0gbnVsbFxuICAgIGNvbnN0IHdyaXRlID0ge1xuICAgICAgdGV4dDogXCJcIixcbiAgICAgIGNvdW50OiAwLFxuICAgICAgZmlsZTogZmlsZSxcbiAgICAgIGVhY2g6ICh2YWx1ZSwga2V5LCBrLCBwcmUpID0+IHtcbiAgICAgICAgd3JpdGUuY291bnQrK1xuICAgICAgICB2YXIgZW5jID1cbiAgICAgICAgICBSYWRpc2suZW5jb2RlKHByZS5sZW5ndGgpICtcbiAgICAgICAgICBcIiNcIiArXG4gICAgICAgICAgUmFkaXNrLmVuY29kZShrKSArXG4gICAgICAgICAgKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIiA/IFwiXCIgOiBcIj1cIiArIFJhZGlzay5lbmNvZGUodmFsdWUpKSArXG4gICAgICAgICAgXCJcXG5cIlxuICAgICAgICAvLyBDYW5ub3Qgc3BsaXQgdGhlIGZpbGUgaWYgb25seSBoYXZlIG9uZSBlbnRyeSB0byB3cml0ZS5cbiAgICAgICAgaWYgKHdyaXRlLmNvdW50ID4gMSAmJiB3cml0ZS50ZXh0Lmxlbmd0aCArIGVuYy5sZW5ndGggPiBvcHQuc2l6ZSkge1xuICAgICAgICAgIHdyaXRlLnRleHQgPSBcIlwiXG4gICAgICAgICAgLy8gT3RoZXJ3aXNlIHNwbGl0IHRoZSBlbnRyaWVzIGluIGhhbGYuXG4gICAgICAgICAgd3JpdGUubGltaXQgPSBNYXRoLmNlaWwod3JpdGUuY291bnQgLyAyKVxuICAgICAgICAgIHdyaXRlLmNvdW50ID0gMFxuICAgICAgICAgIHdyaXRlLnN1YiA9IFJhZGl4KClcbiAgICAgICAgICBSYWRpeC5tYXAocmFkLCB3cml0ZS5zbGljZSlcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG5cbiAgICAgICAgd3JpdGUudGV4dCArPSBlbmNcbiAgICAgIH0sXG4gICAgICBwdXQ6ICgpID0+IHtcbiAgICAgICAgb3B0LnN0b3JlLnB1dChmaWxlLCB3cml0ZS50ZXh0LCBjYilcbiAgICAgIH0sXG4gICAgICBzbGljZTogKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKGtleSA8IHdyaXRlLmZpbGUpIHJldHVyblxuXG4gICAgICAgIGlmICgrK3dyaXRlLmNvdW50ID4gd3JpdGUubGltaXQpIHtcbiAgICAgICAgICB2YXIgbmFtZSA9IHdyaXRlLmZpbGVcbiAgICAgICAgICAvLyBVc2Ugb25seSB0aGUgc291bCBvZiB0aGUga2V5IGFzIHRoZSBmaWxlbmFtZSBzbyB0aGF0IGFsbFxuICAgICAgICAgIC8vIHByb3BlcnRpZXMgb2YgYSBzb3VsIGFyZSB3cml0dGVuIHRvIHRoZSBzYW1lIGZpbGUuXG4gICAgICAgICAgbGV0IGVuZCA9IGtleS5pbmRleE9mKGVucSlcbiAgICAgICAgICBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICAgICAgd3JpdGUuZmlsZSA9IGtleVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3cml0ZS5maWxlID0ga2V5LnN1YnN0cmluZygwLCBlbmQpXG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIHdyaXRlLmxpbWl0IGNhbiBiZSByZWFjaGVkIGFmdGVyIGFscmVhZHkgd3JpdGluZyBwcm9wZXJ0aWVzIG9mXG4gICAgICAgICAgLy8gdGhlIGN1cnJlbnQgbm9kZSwgc28gcmVtb3ZlIGl0IGZyb20gd3JpdGUuc3ViIGJlZm9yZSB3cml0aW5nIHRvXG4gICAgICAgICAgLy8gZGlzayBzbyB0aGF0IGl0J3Mgbm90IGR1cGxpY2F0ZWQgYWNyb3NzIGZpbGVzLlxuICAgICAgICAgIHdyaXRlLnN1Yih3cml0ZS5maWxlLCBudWxsKVxuICAgICAgICAgIHdyaXRlLmNvdW50ID0gMFxuICAgICAgICAgIHJhZGlzay53cml0ZShuYW1lLCB3cml0ZS5zdWIsIHdyaXRlLm5leHQpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHdyaXRlLnN1YihrZXksIHZhbHVlKVxuICAgICAgfSxcbiAgICAgIG5leHQ6IGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgICAgd3JpdGUuc3ViID0gUmFkaXgoKVxuICAgICAgICBpZiAoIVJhZGl4Lm1hcChyYWQsIHdyaXRlLnNsaWNlKSkge1xuICAgICAgICAgIHJhZGlzay53cml0ZSh3cml0ZS5maWxlLCB3cml0ZS5zdWIsIGNiKVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH1cbiAgICAvLyBJZiBSYWRpeC5tYXAgZG9lc24ndCByZXR1cm4gdHJ1ZSB3aGVuIGNhbGxlZCB3aXRoIHdyaXRlLmVhY2ggYXMgYVxuICAgIC8vIGNhbGxiYWNrIHRoZW4gZGlkbid0IG5lZWQgdG8gc3BsaXQgdGhlIGRhdGEuIFRoZSBhY2N1bXVsYXRlZCB3cml0ZS50ZXh0XG4gICAgLy8gY2FuIHRoZW4gYmUgc3RvcmVkIHdpdGggd3JpdGUucHV0KCkuXG4gICAgaWYgKCFSYWRpeC5tYXAocmFkLCB3cml0ZS5lYWNoLCB0cnVlKSkgd3JpdGUucHV0KClcbiAgfVxuXG4gIHJhZGlzay5yZWFkID0gKGtleSwgY2IpID0+IHtcbiAgICBpZiAoY2FjaGUpIHtcbiAgICAgIGxldCB2YWx1ZSA9IGNhY2hlKGtleSlcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHJldHVybiBjYih1LCB2YWx1ZSlcbiAgICB9XG4gICAgLy8gT25seSB0aGUgc291bCBvZiB0aGUga2V5IGlzIGNvbXBhcmVkIHRvIGZpbGVuYW1lcyAoc2VlIHJhZGlzay53cml0ZSkuXG4gICAgbGV0IHNvdWwgPSBrZXlcbiAgICBsZXQgZW5kID0ga2V5LmluZGV4T2YoZW5xKVxuICAgIGlmIChlbmQgIT09IC0xKSB7XG4gICAgICBzb3VsID0ga2V5LnN1YnN0cmluZygwLCBlbmQpXG4gICAgfVxuXG4gICAgY29uc3QgcmVhZCA9IHtcbiAgICAgIGxleDogZmlsZSA9PiB7XG4gICAgICAgIC8vIHN0b3JlLmxpc3Qgc2hvdWxkIGNhbGwgbGV4IHdpdGhvdXQgYSBmaWxlIGxhc3QsIHdoaWNoIG1lYW5zIGFsbCBmaWxlXG4gICAgICAgIC8vIG5hbWVzIHdlcmUgY29tcGFyZWQgdG8gc291bCwgc28gdGhlIGN1cnJlbnQgcmVhZC5maWxlIGlzIG9rIHRvIHVzZS5cbiAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgaWYgKCFyZWFkLmZpbGUpIHtcbiAgICAgICAgICAgIGNiKFwibm8gZmlsZSBmb3VuZFwiLCB1KVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmFkaXNrLnBhcnNlKHJlYWQuZmlsZSwgcmVhZC5pdClcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFdhbnQgdGhlIGZpbGVuYW1lIGNsb3Nlc3QgdG8gc291bC5cbiAgICAgICAgaWYgKGZpbGUgPiBzb3VsIHx8IGZpbGUgPCByZWFkLmZpbGUpIHJldHVyblxuXG4gICAgICAgIHJlYWQuZmlsZSA9IGZpbGVcbiAgICAgIH0sXG4gICAgICBpdDogKGVyciwgZGlzaykgPT4ge1xuICAgICAgICBpZiAoZXJyKSBvcHQubG9nKGVycilcbiAgICAgICAgaWYgKGRpc2spIHtcbiAgICAgICAgICBjYWNoZSA9IGRpc2tcbiAgICAgICAgICByZWFkLnZhbHVlID0gZGlzayhrZXkpXG4gICAgICAgIH1cbiAgICAgICAgY2IoZXJyLCByZWFkLnZhbHVlKVxuICAgICAgfSxcbiAgICB9XG4gICAgb3B0LnN0b3JlLmxpc3QocmVhZC5sZXgpXG4gIH1cblxuICAvLyBMZXQgdXMgc3RhcnQgYnkgYXNzdW1pbmcgd2UgYXJlIHRoZSBvbmx5IHByb2Nlc3MgdGhhdCBpc1xuICAvLyBjaGFuZ2luZyB0aGUgZGlyZWN0b3J5IG9yIGJ1Y2tldC4gTm90IGJlY2F1c2Ugd2UgZG8gbm90IHdhbnRcbiAgLy8gdG8gYmUgbXVsdGktcHJvY2Vzcy9tYWNoaW5lLCBidXQgYmVjYXVzZSB3ZSB3YW50IHRvIGV4cGVyaW1lbnRcbiAgLy8gd2l0aCBob3cgbXVjaCBwZXJmb3JtYW5jZSBhbmQgc2NhbGUgd2UgY2FuIGdldCBvdXQgb2Ygb25seSBvbmUuXG4gIC8vIFRoZW4gd2UgY2FuIHdvcmsgb24gdGhlIGhhcmRlciBwcm9ibGVtIG9mIGJlaW5nIG11bHRpLXByb2Nlc3MuXG4gIHJhZGlzay5wYXJzZSA9IChmaWxlLCBjYikgPT4ge1xuICAgIGNvbnN0IHBhcnNlID0ge1xuICAgICAgZGlzazogUmFkaXgoKSxcbiAgICAgIHJlYWQ6IChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgaWYgKGVycikgcmV0dXJuIGNiKGVycilcblxuICAgICAgICBpZiAoIWRhdGEpIHJldHVybiBjYih1LCBwYXJzZS5kaXNrKVxuXG4gICAgICAgIGxldCBwcmUgPSBbXVxuICAgICAgICAvLyBXb3JrIHRob3VnaCBkYXRhIGJ5IHNwbGl0dGluZyBpbnRvIDMgdmFsdWVzLiBUaGUgZmlyc3QgdmFsdWUgc2F5c1xuICAgICAgICAvLyBpZiB0aGUgc2Vjb25kIHZhbHVlIGlzIG9uZSBvZjogdGhlIHJhZGl4IGxldmVsIGZvciBhIGtleSwgdGhlIGtleVxuICAgICAgICAvLyBpdGVzZWxmLCBvciBhIHZhbHVlLiBUaGUgdGhpcmQgaXMgdGhlIHJlc3Qgb2YgdGhlIGRhdGEgdG8gd29yayB3aXRoLlxuICAgICAgICBsZXQgdG1wID0gcGFyc2Uuc3BsaXQoZGF0YSlcbiAgICAgICAgd2hpbGUgKHRtcCkge1xuICAgICAgICAgIGxldCBrZXlcbiAgICAgICAgICBsZXQgdmFsdWVcbiAgICAgICAgICBsZXQgaSA9IHRtcFsxXVxuICAgICAgICAgIHRtcCA9IHBhcnNlLnNwbGl0KHRtcFsyXSkgfHwgXCJcIlxuICAgICAgICAgIGlmICh0bXBbMF0gPT09IFwiI1wiKSB7XG4gICAgICAgICAgICBrZXkgPSB0bXBbMV1cbiAgICAgICAgICAgIHByZSA9IHByZS5zbGljZSgwLCBpKVxuICAgICAgICAgICAgaWYgKGkgPD0gcHJlLmxlbmd0aCkgcHJlLnB1c2goa2V5KVxuICAgICAgICAgIH1cbiAgICAgICAgICB0bXAgPSBwYXJzZS5zcGxpdCh0bXBbMl0pIHx8IFwiXCJcbiAgICAgICAgICBpZiAodG1wWzBdID09PSBcIlxcblwiKSBjb250aW51ZVxuXG4gICAgICAgICAgaWYgKHRtcFswXSA9PT0gXCI9XCIpIHZhbHVlID0gdG1wWzFdXG4gICAgICAgICAgaWYgKHR5cGVvZiBrZXkgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHZhbHVlICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICBwYXJzZS5kaXNrKHByZS5qb2luKFwiXCIpLCB2YWx1ZSlcbiAgICAgICAgICB9XG4gICAgICAgICAgdG1wID0gcGFyc2Uuc3BsaXQodG1wWzJdKVxuICAgICAgICB9XG4gICAgICAgIGNiKHUsIHBhcnNlLmRpc2spXG4gICAgICB9LFxuICAgICAgc3BsaXQ6IGRhdGEgPT4ge1xuICAgICAgICBpZiAoIWRhdGEpIHJldHVyblxuXG4gICAgICAgIGxldCBpID0gLTFcbiAgICAgICAgbGV0IGEgPSBcIlwiXG4gICAgICAgIGxldCBjID0gbnVsbFxuICAgICAgICB3aGlsZSAoKGMgPSBkYXRhWysraV0pKSB7XG4gICAgICAgICAgaWYgKGMgPT09IHVuaXQpIGJyZWFrXG5cbiAgICAgICAgICBhICs9IGNcbiAgICAgICAgfVxuICAgICAgICBsZXQgbyA9IHt9XG4gICAgICAgIGlmIChjKSB7XG4gICAgICAgICAgcmV0dXJuIFthLCBSYWRpc2suZGVjb2RlKGRhdGEuc2xpY2UoaSksIG8pLCBkYXRhLnNsaWNlKGkgKyBvLmkpXVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH1cbiAgICBvcHQuc3RvcmUuZ2V0KGZpbGUsIHBhcnNlLnJlYWQpXG4gIH1cblxuICByZXR1cm4gcmFkaXNrXG59XG5cblJhZGlzay5lbmNvZGUgPSBkYXRhID0+IHtcbiAgLy8gQSBrZXkgc2hvdWxkIGJlIHBhc3NlZCBpbiBhcyBhIHN0cmluZyB0byBlbmNvZGUsIGEgdmFsdWUgY2FuIG9wdGlvbmFsbHkgYmVcbiAgLy8gYW4gYXJyYXkgb2YgMiBpdGVtcyB0byBpbmNsdWRlIHRoZSB2YWx1ZSdzIHN0YXRlLCBhcyBpcyBkb25lIGJ5IHN0b3JlLmpzLlxuICBsZXQgc3RhdGUgPSBcIlwiXG4gIGlmIChkYXRhIGluc3RhbmNlb2YgQXJyYXkgJiYgZGF0YS5sZW5ndGggPT09IDIpIHtcbiAgICBzdGF0ZSA9IGV0eCArIGRhdGFbMV1cbiAgICBkYXRhID0gZGF0YVswXVxuICB9XG5cbiAgaWYgKHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiKSB7XG4gICAgbGV0IGkgPSAwXG4gICAgbGV0IGN1cnJlbnQgPSBudWxsXG4gICAgbGV0IHRleHQgPSB1bml0XG4gICAgd2hpbGUgKChjdXJyZW50ID0gZGF0YVtpKytdKSkge1xuICAgICAgaWYgKGN1cnJlbnQgPT09IHVuaXQpIHRleHQgKz0gdW5pdFxuICAgIH1cbiAgICByZXR1cm4gdGV4dCArICdcIicgKyBkYXRhICsgc3RhdGUgKyB1bml0XG4gIH1cblxuICBjb25zdCByZWwgPSB1dGlscy5yZWwuaXMoZGF0YSlcbiAgaWYgKHJlbCkgcmV0dXJuIHVuaXQgKyBcIiNcIiArIHJlbCArIHN0YXRlICsgdW5pdFxuXG4gIGlmICh1dGlscy5udW0uaXMoZGF0YSkpIHJldHVybiB1bml0ICsgXCIrXCIgKyAoZGF0YSB8fCAwKSArIHN0YXRlICsgdW5pdFxuXG4gIGlmIChkYXRhID09PSB0cnVlKSByZXR1cm4gdW5pdCArIFwiK1wiICsgc3RhdGUgKyB1bml0XG5cbiAgaWYgKGRhdGEgPT09IGZhbHNlKSByZXR1cm4gdW5pdCArIFwiLVwiICsgc3RhdGUgKyB1bml0XG5cbiAgaWYgKGRhdGEgPT09IG51bGwpIHJldHVybiB1bml0ICsgXCIgXCIgKyBzdGF0ZSArIHVuaXRcbn1cblxuUmFkaXNrLmRlY29kZSA9IChkYXRhLCBvYmopID0+IHtcbiAgdmFyIHRleHQgPSBcIlwiXG4gIHZhciBpID0gLTFcbiAgdmFyIG4gPSAwXG4gIHZhciBjdXJyZW50ID0gbnVsbFxuICB2YXIgcHJldmlvdXMgPSBudWxsXG4gIGlmIChkYXRhWzBdICE9PSB1bml0KSByZXR1cm5cblxuICAvLyBGaW5kIGEgY29udHJvbCBjaGFyYWN0ZXIgcHJldmlvdXMgdG8gdGhlIHRleHQgd2Ugd2FudCwgc2tpcHBpbmdcbiAgLy8gY29uc2VjdXRpdmUgdW5pdCBzZXBhcmF0b3IgY2hhcmFjdGVycyBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBkYXRhLlxuICB3aGlsZSAoKGN1cnJlbnQgPSBkYXRhWysraV0pKSB7XG4gICAgaWYgKHByZXZpb3VzKSB7XG4gICAgICBpZiAoY3VycmVudCA9PT0gdW5pdCkge1xuICAgICAgICBpZiAoLS1uIDw9IDApIGJyZWFrXG4gICAgICB9XG4gICAgICB0ZXh0ICs9IGN1cnJlbnRcbiAgICB9IGVsc2UgaWYgKGN1cnJlbnQgPT09IHVuaXQpIHtcbiAgICAgIG4rK1xuICAgIH0gZWxzZSB7XG4gICAgICBwcmV2aW91cyA9IGN1cnJlbnQgfHwgdHJ1ZVxuICAgIH1cbiAgfVxuXG4gIGlmIChvYmopIG9iai5pID0gaSArIDFcblxuICBsZXQgW3ZhbHVlLCBzdGF0ZV0gPSB0ZXh0LnNwbGl0KGV0eClcbiAgaWYgKCFzdGF0ZSkge1xuICAgIGlmIChwcmV2aW91cyA9PT0gJ1wiJykgcmV0dXJuIHRleHRcblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCIjXCIpIHJldHVybiB1dGlscy5yZWwuaWZ5KHRleHQpXG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiK1wiKSB7XG4gICAgICBpZiAodGV4dC5sZW5ndGggPT09IDApIHJldHVybiB0cnVlXG5cbiAgICAgIHJldHVybiBwYXJzZUZsb2F0KHRleHQpXG4gICAgfVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIi1cIikgcmV0dXJuIGZhbHNlXG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiIFwiKSByZXR1cm4gbnVsbFxuICB9IGVsc2Uge1xuICAgIHN0YXRlID0gcGFyc2VGbG9hdChzdGF0ZSlcbiAgICAvLyBJZiBzdGF0ZSB3YXMgZm91bmQgdGhlbiByZXR1cm4gYW4gYXJyYXkuXG4gICAgaWYgKHByZXZpb3VzID09PSAnXCInKSByZXR1cm4gW3ZhbHVlLCBzdGF0ZV1cblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCIjXCIpIHJldHVybiBbdXRpbHMucmVsLmlmeSh2YWx1ZSksIHN0YXRlXVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIitcIikge1xuICAgICAgaWYgKHZhbHVlLmxlbmd0aCA9PT0gMCkgcmV0dXJuIFt0cnVlLCBzdGF0ZV1cblxuICAgICAgcmV0dXJuIFtwYXJzZUZsb2F0KHZhbHVlKSwgc3RhdGVdXG4gICAgfVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIi1cIikgcmV0dXJuIFtmYWxzZSwgc3RhdGVdXG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiIFwiKSByZXR1cm4gW251bGwsIHN0YXRlXVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmFkaXNrXG4iLCJjb25zdCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpXG5cbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgZ3JvdXAgc2VwYXJhdG9yLlxuY29uc3QgZ3JvdXAgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDI5KVxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciByZWNvcmQgc2VwYXJhdG9yLlxuY29uc3QgcmVjb3JkID0gU3RyaW5nLmZyb21DaGFyQ29kZSgzMClcblxuY29uc3QgUmFkaXggPSAoKSA9PiB7XG4gIGNvbnN0IHJhZGl4ID0gKGtleXMsIHZhbHVlLCB0cmVlKSA9PiB7XG4gICAgaWYgKCF0cmVlKSB7XG4gICAgICBpZiAoIXJhZGl4W2dyb3VwXSkgcmFkaXhbZ3JvdXBdID0ge31cbiAgICAgIHRyZWUgPSByYWRpeFtncm91cF1cbiAgICB9XG4gICAgaWYgKCFrZXlzKSByZXR1cm4gdHJlZVxuXG4gICAgbGV0IGkgPSAwXG4gICAgbGV0IHRtcCA9IHt9XG4gICAgbGV0IGtleSA9IGtleXNbaV1cbiAgICBjb25zdCBtYXggPSBrZXlzLmxlbmd0aCAtIDFcbiAgICBjb25zdCBub1ZhbHVlID0gdHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiXG4gICAgLy8gRmluZCBhIG1hdGNoaW5nIHZhbHVlIHVzaW5nIHRoZSBzaG9ydGVzdCBzdHJpbmcgZnJvbSBrZXlzLlxuICAgIGxldCBmb3VuZCA9IHRyZWVba2V5XVxuICAgIHdoaWxlICghZm91bmQgJiYgaSA8IG1heCkge1xuICAgICAga2V5ICs9IGtleXNbKytpXVxuICAgICAgZm91bmQgPSB0cmVlW2tleV1cbiAgICB9XG5cbiAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAvLyBJZiBub3QgZm91bmQgZnJvbSB0aGUgcHJvdmlkZWQga2V5cyB0cnkgbWF0Y2hpbmcgd2l0aCBhbiBleGlzdGluZyBrZXkuXG4gICAgICBjb25zdCByZXN1bHQgPSB1dGlscy5vYmoubWFwKHRyZWUsIChoYXNWYWx1ZSwgaGFzS2V5KSA9PiB7XG4gICAgICAgIGxldCBqID0gMFxuICAgICAgICBsZXQgbWF0Y2hpbmdLZXkgPSBcIlwiXG4gICAgICAgIHdoaWxlIChoYXNLZXlbal0gPT09IGtleXNbal0pIHtcbiAgICAgICAgICBtYXRjaGluZ0tleSArPSBoYXNLZXlbaisrXVxuICAgICAgICB9XG4gICAgICAgIGlmIChtYXRjaGluZ0tleSkge1xuICAgICAgICAgIGlmIChub1ZhbHVlKSB7XG4gICAgICAgICAgICAvLyBtYXRjaGluZ0tleSBoYXMgdG8gYmUgYXMgbG9uZyBhcyB0aGUgb3JpZ2luYWwga2V5cyB3aGVuIHJlYWRpbmcuXG4gICAgICAgICAgICBpZiAoaiA8PSBtYXgpIHJldHVyblxuXG4gICAgICAgICAgICB0bXBbaGFzS2V5LnNsaWNlKGopXSA9IGhhc1ZhbHVlXG4gICAgICAgICAgICByZXR1cm4gaGFzVmFsdWVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsZXQgcmVwbGFjZSA9IHtcbiAgICAgICAgICAgIFtoYXNLZXkuc2xpY2UoaildOiBoYXNWYWx1ZSxcbiAgICAgICAgICAgIFtrZXlzLnNsaWNlKGopXToge1tyZWNvcmRdOiB2YWx1ZX0sXG4gICAgICAgICAgfVxuICAgICAgICAgIHRyZWVbbWF0Y2hpbmdLZXldID0ge1tncm91cF06IHJlcGxhY2V9XG4gICAgICAgICAgZGVsZXRlIHRyZWVbaGFzS2V5XVxuICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICBpZiAobm9WYWx1ZSkgcmV0dXJuXG5cbiAgICAgICAgaWYgKCF0cmVlW2tleV0pIHRyZWVba2V5XSA9IHt9XG4gICAgICAgIHRyZWVba2V5XVtyZWNvcmRdID0gdmFsdWVcbiAgICAgIH0gZWxzZSBpZiAobm9WYWx1ZSkge1xuICAgICAgICByZXR1cm4gdG1wXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpID09PSBtYXgpIHtcbiAgICAgIC8vIElmIG5vIHZhbHVlIHVzZSB0aGUga2V5IHByb3ZpZGVkIHRvIHJldHVybiBhIHdob2xlIGdyb3VwIG9yIHJlY29yZC5cbiAgICAgIGlmIChub1ZhbHVlKSB7XG4gICAgICAgIC8vIElmIGFuIGluZGl2aWR1YWwgcmVjb3JkIGlzbid0IGZvdW5kIHRoZW4gcmV0dXJuIHRoZSB3aG9sZSBncm91cC5cbiAgICAgICAgcmV0dXJuIHR5cGVvZiBmb3VuZFtyZWNvcmRdID09PSBcInVuZGVmaW5lZFwiXG4gICAgICAgICAgPyBmb3VuZFtncm91cF1cbiAgICAgICAgICA6IGZvdW5kW3JlY29yZF1cbiAgICAgIH1cbiAgICAgIC8vIE90aGVyd2lzZSBjcmVhdGUgYSBuZXcgcmVjb3JkIGF0IHRoZSBwcm92aWRlZCBrZXkgZm9yIHZhbHVlLlxuICAgICAgZm91bmRbcmVjb3JkXSA9IHZhbHVlXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEZvdW5kIGF0IGEgc2hvcnRlciBrZXksIHRyeSBhZ2Fpbi5cbiAgICAgIGlmICghZm91bmRbZ3JvdXBdICYmICFub1ZhbHVlKSBmb3VuZFtncm91cF0gPSB7fVxuICAgICAgcmV0dXJuIHJhZGl4KGtleXMuc2xpY2UoKytpKSwgdmFsdWUsIGZvdW5kW2dyb3VwXSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJhZGl4XG59XG5cblJhZGl4Lm1hcCA9IGZ1bmN0aW9uIG1hcChyYWRpeCwgY2IsIG9wdCwgcHJlKSB7XG4gIGlmICghcHJlKSBwcmUgPSBbXVxuICB2YXIgdHJlZSA9IHJhZGl4W2dyb3VwXSB8fCByYWRpeFxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHRyZWUpLnNvcnQoKVxuICB2YXIgdVxuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgIGxldCBrZXkgPSBrZXlzW2ldXG4gICAgbGV0IGZvdW5kID0gdHJlZVtrZXldXG4gICAgbGV0IHRtcCA9IGZvdW5kW3JlY29yZF1cbiAgICBpZiAodHlwZW9mIHRtcCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgdG1wID0gY2IodG1wLCBwcmUuam9pbihcIlwiKSArIGtleSwga2V5LCBwcmUpXG4gICAgICBpZiAodHlwZW9mIHRtcCAhPT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIHRtcFxuICAgIH0gZWxzZSBpZiAob3B0KSB7XG4gICAgICBjYih1LCBwcmUuam9pbihcIlwiKSwga2V5LCBwcmUpXG4gICAgfVxuICAgIGlmIChmb3VuZFtncm91cF0pIHtcbiAgICAgIHByZS5wdXNoKGtleSlcbiAgICAgIHRtcCA9IG1hcChmb3VuZFtncm91cF0sIGNiLCBvcHQsIHByZSlcbiAgICAgIGlmICh0eXBlb2YgdG1wICE9PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gdG1wXG4gICAgICBwcmUucG9wKClcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSYWRpeFxuIiwiY29uc3QganNFbnYgPSByZXF1aXJlKFwiYnJvd3Nlci1vci1ub2RlXCIpXG5jb25zdCBSYWRpc2sgPSByZXF1aXJlKFwiLi9yYWRpc2tcIilcbmNvbnN0IFJhZGl4ID0gcmVxdWlyZShcIi4vcmFkaXhcIilcbmNvbnN0IHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIilcblxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciBlbnF1aXJ5LlxuY29uc3QgZW5xID0gU3RyaW5nLmZyb21DaGFyQ29kZSg1KVxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciB1bml0IHNlcGFyYXRvci5cbmNvbnN0IHVuaXQgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDMxKVxuXG5jb25zdCBmaWxlU3lzdGVtID0gZGlyID0+IHtcbiAgaWYgKGpzRW52LmlzTm9kZSkge1xuICAgIGNvbnN0IGZzID0gcmVxdWlyZShcImZzXCIpXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGRpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhkaXIpXG4gICAgfVxuICAgIGlmICghZnMuZXhpc3RzU3luYyhkaXIgKyBcIi8hXCIpKSB7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKFxuICAgICAgICBkaXIgKyBcIi8hXCIsXG4gICAgICAgIHVuaXQgKyBcIiswXCIgKyB1bml0ICsgXCIjXCIgKyB1bml0ICsgJ1wicm9vdCcgKyB1bml0LFxuICAgICAgKVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBnZXQ6IChmaWxlLCBjYikgPT4ge1xuICAgICAgICBmcy5yZWFkRmlsZShkaXIgKyBcIi9cIiArIGZpbGUsIChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFwiRU5PRU5UXCIpIHtcbiAgICAgICAgICAgICAgY2IoKVxuICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJmaWxlc3lzdGVtIGVycm9yOlwiLCBlcnIpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChkYXRhKSBkYXRhID0gZGF0YS50b1N0cmluZygpXG4gICAgICAgICAgY2IoZXJyLCBkYXRhKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHB1dDogKGZpbGUsIGRhdGEsIGNiKSA9PiB7XG4gICAgICAgIHZhciByYW5kb20gPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgtOSlcbiAgICAgICAgLy8gRG9uJ3QgcHV0IHRtcCBmaWxlcyB1bmRlciBkaXIgc28gdGhhdCB0aGV5J3JlIG5vdCBsaXN0ZWQuXG4gICAgICAgIHZhciB0bXAgPSBmaWxlICsgXCIuXCIgKyByYW5kb20gKyBcIi50bXBcIlxuICAgICAgICBmcy53cml0ZUZpbGUodG1wLCBkYXRhLCBlcnIgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIGNiKGVycilcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZzLnJlbmFtZSh0bXAsIGRpciArIFwiL1wiICsgZmlsZSwgY2IpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgbGlzdDogY2IgPT4ge1xuICAgICAgICBmcy5yZWFkZGlyKGRpciwgKGVyciwgZmlsZXMpID0+IHtcbiAgICAgICAgICBmaWxlcy5mb3JFYWNoKGNiKVxuICAgICAgICAgIGNiKClcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgfVxuICB9XG5cbiAgLy8gVE9ETzogQWRkIGluZGV4ZWREQlxuICByZXR1cm4ge1xuICAgIGdldDogKGZpbGUsIGNiKSA9PiB7XG4gICAgICBjYihudWxsLCB1bml0ICsgXCIrMFwiICsgdW5pdCArIFwiI1wiICsgdW5pdCArICdcInJvb3QnICsgdW5pdClcbiAgICB9LFxuICAgIHB1dDogKGZpbGUsIGRhdGEsIGNiKSA9PiB7XG4gICAgICBjYihudWxsKVxuICAgIH0sXG4gICAgbGlzdDogY2IgPT4ge1xuICAgICAgY2IoXCIhXCIpXG4gICAgICBjYigpXG4gICAgfSxcbiAgfVxufVxuXG4vLyBTdG9yZSBwcm92aWRlcyBnZXQgYW5kIHB1dCBtZXRob2RzIHRoYXQgY2FuIGFjY2VzcyByYWRpc2suXG5jb25zdCBTdG9yZSA9IG9wdCA9PiB7XG4gIGlmICghdXRpbHMub2JqLmlzKG9wdCkpIG9wdCA9IHt9XG4gIG9wdC5maWxlID0gU3RyaW5nKG9wdC5maWxlIHx8IFwicmFkYXRhXCIpXG4gIGlmICghb3B0LnN0b3JlKSBvcHQuc3RvcmUgPSBmaWxlU3lzdGVtKG9wdC5maWxlKVxuICBjb25zdCByYWRpc2sgPSBSYWRpc2sob3B0KVxuXG4gIHJldHVybiB7XG4gICAgZ2V0OiAobGV4LCBjYikgPT4ge1xuICAgICAgaWYgKCFsZXgpIHtcbiAgICAgICAgY2IoXCJsZXggcmVxdWlyZWRcIilcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZhciBzb3VsID0gbGV4W1wiI1wiXVxuICAgICAgdmFyIGtleSA9IGxleFtcIi5cIl0gfHwgXCJcIlxuICAgICAgdmFyIG5vZGVcbiAgICAgIGNvbnN0IGVhY2ggPSAodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICBpZiAoIW5vZGUpIG5vZGUgPSB7Xzoge1wiI1wiOiBzb3VsLCBcIj5cIjoge319fVxuICAgICAgICBub2RlW2tleV0gPSB2YWx1ZVswXVxuICAgICAgICBub2RlLl9bXCI+XCJdW2tleV0gPSB2YWx1ZVsxXVxuICAgICAgfVxuXG4gICAgICByYWRpc2soc291bCArIGVucSArIGtleSwgKGVyciwgdmFsdWUpID0+IHtcbiAgICAgICAgbGV0IGdyYXBoXG4gICAgICAgIGlmICh1dGlscy5vYmouaXModmFsdWUpKSB7XG4gICAgICAgICAgUmFkaXgubWFwKHZhbHVlLCBlYWNoKVxuICAgICAgICAgIGlmICghbm9kZSkgZWFjaCh2YWx1ZSwga2V5KVxuICAgICAgICAgIGdyYXBoID0ge1tzb3VsXTogbm9kZX1cbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZSkge1xuICAgICAgICAgIGVhY2godmFsdWUsIGtleSlcbiAgICAgICAgICBncmFwaCA9IHtbc291bF06IG5vZGV9XG4gICAgICAgIH1cbiAgICAgICAgY2IoZXJyLCBncmFwaClcbiAgICAgIH0pXG4gICAgfSxcbiAgICBwdXQ6IChncmFwaCwgY2IpID0+IHtcbiAgICAgIGlmICghZ3JhcGgpIHtcbiAgICAgICAgY2IoXCJncmFwaCByZXF1aXJlZFwiKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgdmFyIGNvdW50ID0gMFxuICAgICAgY29uc3QgYWNrID0gZXJyID0+IHtcbiAgICAgICAgY291bnQtLVxuICAgICAgICBpZiAoYWNrLmVycikgcmV0dXJuXG5cbiAgICAgICAgYWNrLmVyciA9IGVyclxuICAgICAgICBpZiAoYWNrLmVycikge1xuICAgICAgICAgIGNiKGFjay5lcnIpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY291bnQgPT09IDApIGNiKG51bGwpXG4gICAgICB9XG5cbiAgICAgIE9iamVjdC5rZXlzKGdyYXBoKS5mb3JFYWNoKHNvdWwgPT4ge1xuICAgICAgICB2YXIgbm9kZSA9IGdyYXBoW3NvdWxdXG4gICAgICAgIE9iamVjdC5rZXlzKG5vZGUpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoa2V5ID09PSBcIl9cIikgcmV0dXJuXG5cbiAgICAgICAgICBjb3VudCsrXG4gICAgICAgICAgbGV0IHZhbHVlID0gbm9kZVtrZXldXG4gICAgICAgICAgbGV0IHN0YXRlID0gbm9kZS5fW1wiPlwiXVtrZXldXG4gICAgICAgICAgcmFkaXNrKHNvdWwgKyBlbnEgKyBrZXksIFt2YWx1ZSwgc3RhdGVdLCBhY2spXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0sXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBTdG9yZVxuIiwiY29uc3QgbnVtID0ge1xuICBpczogbiA9PlxuICAgICEobiBpbnN0YW5jZW9mIEFycmF5KSAmJlxuICAgIChuIC0gcGFyc2VGbG9hdChuKSArIDEgPj0gMCB8fCBJbmZpbml0eSA9PT0gbiB8fCAtSW5maW5pdHkgPT09IG4pLFxufVxuXG5jb25zdCBvYmogPSB7XG4gIGlzOiBvID0+IHtcbiAgICBpZiAoIW8pIHJldHVybiBmYWxzZVxuXG4gICAgcmV0dXJuIChcbiAgICAgIChvIGluc3RhbmNlb2YgT2JqZWN0ICYmIG8uY29uc3RydWN0b3IgPT09IE9iamVjdCkgfHxcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKS5tYXRjaCgvXlxcW29iamVjdCAoXFx3KylcXF0kLylbMV0gPT09XG4gICAgICAgIFwiT2JqZWN0XCJcbiAgICApXG4gIH0sXG4gIG1hcDogKGxpc3QsIGNiLCBvKSA9PiB7XG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhsaXN0KVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgbGV0IHJlc3VsdCA9IGNiKGxpc3Rba2V5c1tpXV0sIGtleXNbaV0sIG8pXG4gICAgICBpZiAodHlwZW9mIHJlc3VsdCAhPT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIHJlc3VsdFxuICAgIH1cbiAgfSxcbiAgcHV0OiAobywga2V5LCB2YWx1ZSkgPT4ge1xuICAgIGlmICghbykgbyA9IHt9XG4gICAgb1trZXldID0gdmFsdWVcbiAgICByZXR1cm4gb1xuICB9LFxuICBkZWw6IChvLCBrZXkpID0+IHtcbiAgICBpZiAoIW8pIHJldHVyblxuXG4gICAgb1trZXldID0gbnVsbFxuICAgIGRlbGV0ZSBvW2tleV1cbiAgICByZXR1cm4gb1xuICB9LFxufVxuXG5jb25zdCBtYXBfc291bCA9IChzb3VsLCBrZXksIG8pID0+IHtcbiAgLy8gSWYgaWQgaXMgYWxyZWFkeSBkZWZpbmVkIEFORCB3ZSdyZSBzdGlsbCBsb29waW5nIHRocm91Z2ggdGhlIG9iamVjdCxcbiAgLy8gdGhlbiBpdCBpcyBjb25zaWRlcmVkIGludmFsaWQuXG4gIGlmIChvLmlkKSB7XG4gICAgby5pZCA9IGZhbHNlXG4gICAgcmV0dXJuXG4gIH1cblxuICBpZiAoa2V5ID09PSBcIiNcIiAmJiB0eXBlb2Ygc291bCA9PT0gXCJzdHJpbmdcIikge1xuICAgIG8uaWQgPSBzb3VsXG4gICAgcmV0dXJuXG4gIH1cblxuICAvLyBJZiB0aGVyZSBleGlzdHMgYW55dGhpbmcgZWxzZSBvbiB0aGUgb2JqZWN0IHRoYXQgaXNuJ3QgdGhlIHNvdWwsXG4gIC8vIHRoZW4gaXQgaXMgY29uc2lkZXJlZCBpbnZhbGlkLlxuICBvLmlkID0gZmFsc2Vcbn1cblxuLy8gQ2hlY2sgaWYgYW4gb2JqZWN0IGlzIGEgc291bCByZWxhdGlvbiwgaWUgeycjJzogJ1VVSUQnfVxuY29uc3QgcmVsID0ge1xuICBpczogdmFsdWUgPT4ge1xuICAgIGlmICh2YWx1ZSAmJiB2YWx1ZVtcIiNcIl0gJiYgIXZhbHVlLl8gJiYgb2JqLmlzKHZhbHVlKSkge1xuICAgICAgbGV0IG8gPSB7fVxuICAgICAgb2JqLm1hcCh2YWx1ZSwgbWFwX3NvdWwsIG8pXG4gICAgICBpZiAoby5pZCkgcmV0dXJuIG8uaWRcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2VcbiAgfSxcbiAgLy8gQ29udmVydCBhIHNvdWwgaW50byBhIHJlbGF0aW9uIGFuZCByZXR1cm4gaXQuXG4gIGlmeTogc291bCA9PiBvYmoucHV0KHt9LCBcIiNcIiwgc291bCksXG59XG5cbmNvbnN0IHRleHQgPSB7XG4gIHJhbmRvbTogbGVuZ3RoID0+IHtcbiAgICB2YXIgcyA9IFwiXCJcbiAgICBjb25zdCBjID0gXCIwMTIzNDU2Nzg5QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6XCJcbiAgICBpZiAoIWxlbmd0aCkgbGVuZ3RoID0gMjRcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBzICs9IGMuY2hhckF0KE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGMubGVuZ3RoKSlcbiAgICB9XG4gICAgcmV0dXJuIHNcbiAgfSxcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7bnVtLCBvYmosIHJlbCwgdGV4dH1cbiIsImNvbnN0IGpzRW52ID0gcmVxdWlyZShcImJyb3dzZXItb3Itbm9kZVwiKVxuY29uc3QgRHVwID0gcmVxdWlyZShcIi4vZHVwXCIpXG5jb25zdCBHZXQgPSByZXF1aXJlKFwiLi9nZXRcIilcbmNvbnN0IEhhbSA9IHJlcXVpcmUoXCIuL2hhbVwiKVxuY29uc3QgU3RvcmUgPSByZXF1aXJlKFwiLi9zdG9yZVwiKVxuY29uc3QgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKVxuXG4vLyBXaXJlIHN0YXJ0cyBhIHdlYnNvY2tldCBjbGllbnQgb3Igc2VydmVyIGFuZCByZXR1cm5zIGdldCBhbmQgcHV0IG1ldGhvZHNcbi8vIGZvciBhY2Nlc3MgdG8gdGhlIHdpcmUgc3BlYyBhbmQgc3RvcmFnZS5cbmNvbnN0IFdpcmUgPSBvcHQgPT4ge1xuICBpZiAoIXV0aWxzLm9iai5pcyhvcHQpKSBvcHQgPSB7fVxuXG4gIGNvbnN0IGR1cCA9IER1cChvcHQubWF4QWdlKVxuICBjb25zdCBzdG9yZSA9IFN0b3JlKG9wdClcbiAgdmFyIGdyYXBoID0ge31cbiAgdmFyIHF1ZXVlID0ge31cblxuICBjb25zdCBnZXQgPSAobXNnLCBzZW5kKSA9PiB7XG4gICAgY29uc3QgYWNrID0gR2V0KG1zZy5nZXQsIGdyYXBoKVxuICAgIGlmIChhY2spIHtcbiAgICAgIHNlbmQoXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKHV0aWxzLnRleHQucmFuZG9tKDkpKSxcbiAgICAgICAgICBcIkBcIjogbXNnW1wiI1wiXSxcbiAgICAgICAgICBwdXQ6IGFjayxcbiAgICAgICAgfSksXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIHN0b3JlLmdldChtc2cuZ2V0LCAoZXJyLCBhY2spID0+IHtcbiAgICAgICAgc2VuZChcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKHV0aWxzLnRleHQucmFuZG9tKDkpKSxcbiAgICAgICAgICAgIFwiQFwiOiBtc2dbXCIjXCJdLFxuICAgICAgICAgICAgcHV0OiBhY2ssXG4gICAgICAgICAgICBlcnI6IGVycixcbiAgICAgICAgICB9KSxcbiAgICAgICAgKVxuICAgICAgfSlcbiAgICB9XG4gIH1cblxuICBjb25zdCBwdXQgPSAobXNnLCBzZW5kKSA9PiB7XG4gICAgLy8gU3RvcmUgdXBkYXRlcyByZXR1cm5lZCBmcm9tIEhhbS5taXggYW5kIGRlZmVyIHVwZGF0ZXMgaWYgcmVxdWlyZWQuXG4gICAgY29uc3QgdXBkYXRlID0gSGFtLm1peChtc2cucHV0LCBncmFwaClcbiAgICBzdG9yZS5wdXQodXBkYXRlLm5vdywgZXJyID0+IHtcbiAgICAgIHNlbmQoXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKHV0aWxzLnRleHQucmFuZG9tKDkpKSxcbiAgICAgICAgICBcIkBcIjogbXNnW1wiI1wiXSxcbiAgICAgICAgICBlcnI6IGVycixcbiAgICAgICAgfSksXG4gICAgICApXG4gICAgfSlcbiAgICBpZiAodXBkYXRlLndhaXQgIT09IDApIHtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4gcHV0KHtwdXQ6IHVwZGF0ZS5kZWZlcn0sIHNlbmQpLCB1cGRhdGUud2FpdClcbiAgICB9XG4gIH1cblxuICBjb25zdCBhcGkgPSBzZW5kID0+IHtcbiAgICByZXR1cm4ge1xuICAgICAgZ2V0OiAobGV4LCBjYiwgb3B0KSA9PiB7XG4gICAgICAgIGlmICghY2IpIHJldHVyblxuXG4gICAgICAgIGlmICghdXRpbHMub2JqLmlzKG9wdCkpIG9wdCA9IHt9XG4gICAgICAgIGNvbnN0IGFjayA9IEdldChsZXgsIGdyYXBoKVxuICAgICAgICBpZiAoYWNrKSB7XG4gICAgICAgICAgY2Ioe3B1dDogYWNrfSlcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIHN0b3JlLmdldChsZXgsIChlcnIsIGFjaykgPT4ge1xuICAgICAgICAgIGlmIChhY2spIHtcbiAgICAgICAgICAgIGNiKHtwdXQ6IGFjaywgZXJyOiBlcnJ9KVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGVycikgY29uc29sZS5sb2coZXJyKVxuXG4gICAgICAgICAgY29uc3QgdHJhY2sgPSB1dGlscy50ZXh0LnJhbmRvbSg5KVxuICAgICAgICAgIHF1ZXVlW3RyYWNrXSA9IGNiXG4gICAgICAgICAgc2VuZChcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgXCIjXCI6IGR1cC50cmFjayh0cmFjayksXG4gICAgICAgICAgICAgIGdldDogbGV4LFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgKVxuICAgICAgICAgIC8vIFJlc3BvbmQgdG8gY2FsbGJhY2sgd2l0aCBudWxsIGlmIG5vIHJlc3BvbnNlLlxuICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2IgPSBxdWV1ZVt0cmFja11cbiAgICAgICAgICAgIGlmIChjYikge1xuICAgICAgICAgICAgICBjb25zdCBpZCA9IGxleFtcIiNcIl1cbiAgICAgICAgICAgICAgY29uc3QgYWNrID0ge1tpZF06IG51bGx9XG4gICAgICAgICAgICAgIGlmIChsZXhbXCIuXCJdKSBhY2tbaWRdID0ge1tsZXhbXCIuXCJdXTogbnVsbH1cbiAgICAgICAgICAgICAgY2Ioe3B1dDogYWNrfSlcbiAgICAgICAgICAgICAgZGVsZXRlIHF1ZXVlW3RyYWNrXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sIG9wdC53YWl0IHx8IDEwMClcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBwdXQ6IChkYXRhLCBjYikgPT4ge1xuICAgICAgICAvLyBEZWZlcnJlZCB1cGRhdGVzIGFyZSBvbmx5IHN0b3JlZCB1c2luZyB3aXJlIHNwZWMsIHRoZXkncmUgaWdub3JlZFxuICAgICAgICAvLyBoZXJlIHVzaW5nIHRoZSBhcGkuIFRoaXMgaXMgb2sgYmVjYXVzZSBjb3JyZWN0IHRpbWVzdGFtcHMgc2hvdWxkIGJlXG4gICAgICAgIC8vIHVzZWQgd2hlcmVhcyB3aXJlIHNwZWMgbmVlZHMgdG8gaGFuZGxlIGNsb2NrIHNrZXcuXG4gICAgICAgIGNvbnN0IHVwZGF0ZSA9IEhhbS5taXgoZGF0YSwgZ3JhcGgpXG4gICAgICAgIHN0b3JlLnB1dCh1cGRhdGUubm93LCBjYilcbiAgICAgICAgLy8gQWxzbyBwdXQgZGF0YSBvbiB0aGUgd2lyZSBzcGVjLlxuICAgICAgICAvLyBUT0RPOiBOb3RlIHRoYXQgdGhpcyBtZWFucyBhbGwgY2xpZW50cyBub3cgcmVjZWl2ZSBhbGwgdXBkYXRlcywgc29cbiAgICAgICAgLy8gbmVlZCB0byBmaWx0ZXIgd2hhdCBzaG91bGQgYmUgc3RvcmVkLCBib3RoIGluIGdyYXBoIGFuZCBvbiBkaXNrLlxuICAgICAgICBzZW5kKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIFwiI1wiOiBkdXAudHJhY2sodXRpbHMudGV4dC5yYW5kb20oOSkpLFxuICAgICAgICAgICAgcHV0OiBkYXRhLFxuICAgICAgICAgIH0pLFxuICAgICAgICApXG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIGlmIChqc0Vudi5pc05vZGUpIHtcbiAgICBjb25zdCBXZWJTb2NrZXQgPSByZXF1aXJlKFwid3NcIilcbiAgICBsZXQgd3NzID0gb3B0Lndzc1xuICAgIC8vIE5vZGUncyB3ZWJzb2NrZXQgc2VydmVyIHByb3ZpZGVzIGNsaWVudHMgYXMgYW4gYXJyYXksIHdoZXJlYXNcbiAgICAvLyBtb2NrLXNvY2tldHMgcHJvdmlkZXMgY2xpZW50cyBhcyBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhbiBhcnJheS5cbiAgICBsZXQgY2xpZW50cyA9ICgpID0+IHdzcy5jbGllbnRzKClcbiAgICBpZiAoIXdzcykge1xuICAgICAgd3NzID0gbmV3IFdlYlNvY2tldC5TZXJ2ZXIoe3BvcnQ6IDgwODB9KVxuICAgICAgY2xpZW50cyA9ICgpID0+IHdzcy5jbGllbnRzXG4gICAgfVxuXG4gICAgY29uc3Qgc2VuZCA9IChkYXRhLCBpc0JpbmFyeSkgPT4ge1xuICAgICAgY2xpZW50cygpLmZvckVhY2goY2xpZW50ID0+IHtcbiAgICAgICAgaWYgKGNsaWVudC5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuICAgICAgICAgIGNsaWVudC5zZW5kKGRhdGEsIHtiaW5hcnk6IGlzQmluYXJ5fSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gICAgd3NzLm9uKFwiY29ubmVjdGlvblwiLCB3cyA9PiB7XG4gICAgICB3cy5vbihcImVycm9yXCIsIGNvbnNvbGUuZXJyb3IpXG5cbiAgICAgIHdzLm9uKFwibWVzc2FnZVwiLCAoZGF0YSwgaXNCaW5hcnkpID0+IHtcbiAgICAgICAgY29uc3QgbXNnID0gSlNPTi5wYXJzZShkYXRhKVxuICAgICAgICBpZiAoZHVwLmNoZWNrKG1zZ1tcIiNcIl0pKSByZXR1cm5cblxuICAgICAgICBkdXAudHJhY2sobXNnW1wiI1wiXSlcbiAgICAgICAgaWYgKG1zZy5nZXQpIGdldChtc2csIHNlbmQpXG4gICAgICAgIGlmIChtc2cucHV0KSBwdXQobXNnLCBzZW5kKVxuICAgICAgICBzZW5kKGRhdGEsIGlzQmluYXJ5KVxuXG4gICAgICAgIGNvbnN0IGlkID0gbXNnW1wiQFwiXVxuICAgICAgICBjb25zdCBjYiA9IHF1ZXVlW2lkXVxuICAgICAgICBpZiAoY2IpIHtcbiAgICAgICAgICBkZWxldGUgbXNnW1wiI1wiXVxuICAgICAgICAgIGRlbGV0ZSBtc2dbXCJAXCJdXG4gICAgICAgICAgY2IobXNnKVxuXG4gICAgICAgICAgZGVsZXRlIHF1ZXVlW2lkXVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0pXG4gICAgcmV0dXJuIGFwaShzZW5kKVxuICB9XG5cbiAgbGV0IHdzID0gbmV3IFdlYlNvY2tldChcIndzOi8vbG9jYWxob3N0OjgwODBcIilcbiAgY29uc3Qgc2VuZCA9IGRhdGEgPT4ge1xuICAgIGlmICghd3MgfHwgd3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHtcbiAgICAgIGNvbnNvbGUubG9nKFwid2Vic29ja2V0IG5vdCBhdmFpbGFibGVcIilcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHdzLnNlbmQoZGF0YSlcbiAgfVxuICBjb25zdCBzdGFydCA9ICgpID0+IHtcbiAgICBpZiAoIXdzKSB3cyA9IG5ldyBXZWJTb2NrZXQoXCJ3czovL2xvY2FsaG9zdDo4MDgwXCIpXG4gICAgd3Mub25jbG9zZSA9IGMgPT4ge1xuICAgICAgd3MgPSBudWxsXG4gICAgICBzZXRUaW1lb3V0KHN0YXJ0LCBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiA1MDAwKSlcbiAgICB9XG4gICAgd3Mub25lcnJvciA9IGUgPT4ge1xuICAgICAgY29uc29sZS5lcnJvcihlKVxuICAgIH1cbiAgICB3cy5vbm1lc3NhZ2UgPSBtID0+IHtcbiAgICAgIGNvbnN0IG1zZyA9IEpTT04ucGFyc2UobS5kYXRhKVxuICAgICAgaWYgKGR1cC5jaGVjayhtc2dbXCIjXCJdKSkgcmV0dXJuXG5cbiAgICAgIGR1cC50cmFjayhtc2dbXCIjXCJdKVxuICAgICAgaWYgKG1zZy5nZXQpIGdldChtc2csIHNlbmQpXG4gICAgICBpZiAobXNnLnB1dCkgcHV0KG1zZywgc2VuZClcbiAgICAgIHNlbmQobS5kYXRhKVxuXG4gICAgICBjb25zdCBpZCA9IG1zZ1tcIkBcIl1cbiAgICAgIGNvbnN0IGNiID0gcXVldWVbaWRdXG4gICAgICBpZiAoY2IpIHtcbiAgICAgICAgZGVsZXRlIG1zZ1tcIiNcIl1cbiAgICAgICAgZGVsZXRlIG1zZ1tcIkBcIl1cbiAgICAgICAgY2IobXNnKVxuXG4gICAgICAgIGRlbGV0ZSBxdWV1ZVtpZF1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGFydCgpXG4gIHJldHVybiBhcGkoc2VuZClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBXaXJlXG4iLCIvKiAoaWdub3JlZCkgKi8iLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdKG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiIiwiLy8gc3RhcnR1cFxuLy8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4vLyBUaGlzIGVudHJ5IG1vZHVsZSBpcyByZWZlcmVuY2VkIGJ5IG90aGVyIG1vZHVsZXMgc28gaXQgY2FuJ3QgYmUgaW5saW5lZFxudmFyIF9fd2VicGFja19leHBvcnRzX18gPSBfX3dlYnBhY2tfcmVxdWlyZV9fKFwiLi9zcmMvaG9sc3Rlci5qc1wiKTtcbiIsIiJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==
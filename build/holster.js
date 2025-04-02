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

    const resolve = (data, cb) => {
      const get = typeof data.get !== "undefined"
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
            const rel = utils.rel.is(node[item])
            if (rel) {
              api.ctx[i].soul = rel
            } else {
              // Request was not for a node, use the previous context to set
              // the item as the property on the current soul.
              api.ctx[i].property = item
              api.ctx[i].soul = soul
            }
            // Call api again using the updated context.
            if (get) api(api.ctx).get(null, data.get, cb)
            else api(api.ctx).put(data.put, cb)
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
        api(api.ctx).get(null, data.get, cb)
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
        const {property, soul} = resolve({get: lex}, done)
        if (!soul) return api(api.ctx)

        wire.get(utils.obj.put(lex, "#", soul), msg => {
          if (msg.err) console.log(msg.err)
          if (msg.put && msg.put[soul]) {
            if (typeof msg.put[soul][property] !== "undefined") {
              done(msg.put[soul][property])
            } else {
              delete msg.put[soul]._
              done(msg.put[soul])
            }
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTO0FBQ1QsT0FBTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7Ozs7Ozs7Ozs7QUNyUUEsY0FBYyxtQkFBTyxDQUFDLCtCQUFTO0FBQy9CLGNBQWMsbUJBQU8sQ0FBQywrQkFBUzs7QUFFL0I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSw2Q0FBNkMsMkJBQTJCO0FBQ3hFO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxXQUFXO0FBQ1g7QUFDQSxTQUFTO0FBQ1QsT0FBTztBQUNQO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFlBQVk7QUFDWjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLE9BQU87QUFDUDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFD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QUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTs7Ozs7Ozs7Ozs7QUM3TUE7Ozs7OztVQ0FBO1VBQ0E7O1VBRUE7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7O1VBRUE7VUFDQTs7VUFFQTtVQUNBO1VBQ0E7Ozs7VUV0QkE7VUFDQTtVQUNBO1VBQ0EiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9Ib2xzdGVyLy4vbm9kZV9tb2R1bGVzL2Jyb3dzZXItb3Itbm9kZS9kaXN0L2luZGV4LmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9ub2RlX21vZHVsZXMvd3MvYnJvd3Nlci5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL2R1cC5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL2dldC5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL2hhbS5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL2hvbHN0ZXIuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9yYWRpc2suanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy9yYWRpeC5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL3N0b3JlLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvdXRpbHMuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy93aXJlLmpzIiwid2VicGFjazovL0hvbHN0ZXIvaWdub3JlZHwvaG9tZS9tYWwvd29yay9ob2xzdGVyL3NyY3xmcyIsIndlYnBhY2s6Ly9Ib2xzdGVyL3dlYnBhY2svYm9vdHN0cmFwIiwid2VicGFjazovL0hvbHN0ZXIvd2VicGFjay9iZWZvcmUtc3RhcnR1cCIsIndlYnBhY2s6Ly9Ib2xzdGVyL3dlYnBhY2svc3RhcnR1cCIsIndlYnBhY2s6Ly9Ib2xzdGVyL3dlYnBhY2svYWZ0ZXItc3RhcnR1cCJdLCJzb3VyY2VzQ29udGVudCI6WyJ2YXIgX19kZWZQcm9wID0gT2JqZWN0LmRlZmluZVByb3BlcnR5O1xudmFyIF9fZ2V0T3duUHJvcERlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yO1xudmFyIF9fZ2V0T3duUHJvcE5hbWVzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXM7XG52YXIgX19oYXNPd25Qcm9wID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcbnZhciBfX2V4cG9ydCA9ICh0YXJnZXQsIGFsbCkgPT4ge1xuICBmb3IgKHZhciBuYW1lIGluIGFsbClcbiAgICBfX2RlZlByb3AodGFyZ2V0LCBuYW1lLCB7IGdldDogYWxsW25hbWVdLCBlbnVtZXJhYmxlOiB0cnVlIH0pO1xufTtcbnZhciBfX2NvcHlQcm9wcyA9ICh0bywgZnJvbSwgZXhjZXB0LCBkZXNjKSA9PiB7XG4gIGlmIChmcm9tICYmIHR5cGVvZiBmcm9tID09PSBcIm9iamVjdFwiIHx8IHR5cGVvZiBmcm9tID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICBmb3IgKGxldCBrZXkgb2YgX19nZXRPd25Qcm9wTmFtZXMoZnJvbSkpXG4gICAgICBpZiAoIV9faGFzT3duUHJvcC5jYWxsKHRvLCBrZXkpICYmIGtleSAhPT0gZXhjZXB0KVxuICAgICAgICBfX2RlZlByb3AodG8sIGtleSwgeyBnZXQ6ICgpID0+IGZyb21ba2V5XSwgZW51bWVyYWJsZTogIShkZXNjID0gX19nZXRPd25Qcm9wRGVzYyhmcm9tLCBrZXkpKSB8fCBkZXNjLmVudW1lcmFibGUgfSk7XG4gIH1cbiAgcmV0dXJuIHRvO1xufTtcbnZhciBfX3RvQ29tbW9uSlMgPSAobW9kKSA9PiBfX2NvcHlQcm9wcyhfX2RlZlByb3Aoe30sIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pLCBtb2QpO1xuXG4vLyBzcmMvaW5kZXgudHNcbnZhciBzcmNfZXhwb3J0cyA9IHt9O1xuX19leHBvcnQoc3JjX2V4cG9ydHMsIHtcbiAgaXNCcm93c2VyOiAoKSA9PiBpc0Jyb3dzZXIsXG4gIGlzQnVuOiAoKSA9PiBpc0J1bixcbiAgaXNEZW5vOiAoKSA9PiBpc0Rlbm8sXG4gIGlzSnNEb206ICgpID0+IGlzSnNEb20sXG4gIGlzTm9kZTogKCkgPT4gaXNOb2RlLFxuICBpc1dlYldvcmtlcjogKCkgPT4gaXNXZWJXb3JrZXJcbn0pO1xubW9kdWxlLmV4cG9ydHMgPSBfX3RvQ29tbW9uSlMoc3JjX2V4cG9ydHMpO1xudmFyIGlzQnJvd3NlciA9IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHdpbmRvdy5kb2N1bWVudCAhPT0gXCJ1bmRlZmluZWRcIjtcbnZhciBpc05vZGUgPSAoXG4gIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgdHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgLy8gQHRzLWV4cGVjdC1lcnJvclxuICBwcm9jZXNzLnZlcnNpb25zICE9IG51bGwgJiYgLy8gQHRzLWV4cGVjdC1lcnJvclxuICBwcm9jZXNzLnZlcnNpb25zLm5vZGUgIT0gbnVsbFxuKTtcbnZhciBpc1dlYldvcmtlciA9IHR5cGVvZiBzZWxmID09PSBcIm9iamVjdFwiICYmIHNlbGYuY29uc3RydWN0b3IgJiYgc2VsZi5jb25zdHJ1Y3Rvci5uYW1lID09PSBcIkRlZGljYXRlZFdvcmtlckdsb2JhbFNjb3BlXCI7XG52YXIgaXNKc0RvbSA9IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgJiYgd2luZG93Lm5hbWUgPT09IFwibm9kZWpzXCIgfHwgdHlwZW9mIG5hdmlnYXRvciAhPT0gXCJ1bmRlZmluZWRcIiAmJiBcInVzZXJBZ2VudFwiIGluIG5hdmlnYXRvciAmJiB0eXBlb2YgbmF2aWdhdG9yLnVzZXJBZ2VudCA9PT0gXCJzdHJpbmdcIiAmJiAobmF2aWdhdG9yLnVzZXJBZ2VudC5pbmNsdWRlcyhcIk5vZGUuanNcIikgfHwgbmF2aWdhdG9yLnVzZXJBZ2VudC5pbmNsdWRlcyhcImpzZG9tXCIpKTtcbnZhciBpc0Rlbm8gPSAoXG4gIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgdHlwZW9mIERlbm8gIT09IFwidW5kZWZpbmVkXCIgJiYgLy8gQHRzLWV4cGVjdC1lcnJvclxuICB0eXBlb2YgRGVuby52ZXJzaW9uICE9PSBcInVuZGVmaW5lZFwiICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgdHlwZW9mIERlbm8udmVyc2lvbi5kZW5vICE9PSBcInVuZGVmaW5lZFwiXG4pO1xudmFyIGlzQnVuID0gdHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2Vzcy52ZXJzaW9ucyAhPSBudWxsICYmIHByb2Nlc3MudmVyc2lvbnMuYnVuICE9IG51bGw7XG4vLyBBbm5vdGF0ZSB0aGUgQ29tbW9uSlMgZXhwb3J0IG5hbWVzIGZvciBFU00gaW1wb3J0IGluIG5vZGU6XG4wICYmIChtb2R1bGUuZXhwb3J0cyA9IHtcbiAgaXNCcm93c2VyLFxuICBpc0J1bixcbiAgaXNEZW5vLFxuICBpc0pzRG9tLFxuICBpc05vZGUsXG4gIGlzV2ViV29ya2VyXG59KTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gIHRocm93IG5ldyBFcnJvcihcbiAgICAnd3MgZG9lcyBub3Qgd29yayBpbiB0aGUgYnJvd3Nlci4gQnJvd3NlciBjbGllbnRzIG11c3QgdXNlIHRoZSBuYXRpdmUgJyArXG4gICAgICAnV2ViU29ja2V0IG9iamVjdCdcbiAgKTtcbn07XG4iLCJjb25zdCBEdXAgPSBtYXhBZ2UgPT4ge1xuICAvLyBBbGxvdyBtYXhBZ2UgdG8gYmUgcGFzc2VkIGluIGFzIHRlc3RzIHdhaXQgb24gdGhlIHNldFRpbWVvdXQuXG4gIGlmICghbWF4QWdlKSBtYXhBZ2UgPSA5MDAwXG4gIGNvbnN0IGR1cCA9IHtzdG9yZToge319XG4gIGR1cC5jaGVjayA9IGlkID0+IChkdXAuc3RvcmVbaWRdID8gZHVwLnRyYWNrKGlkKSA6IGZhbHNlKVxuICBkdXAudHJhY2sgPSBpZCA9PiB7XG4gICAgLy8gS2VlcCB0aGUgbGl2ZWxpbmVzcyBvZiB0aGUgbWVzc2FnZSB1cCB3aGlsZSBpdCBpcyBiZWluZyByZWNlaXZlZC5cbiAgICBkdXAuc3RvcmVbaWRdID0gRGF0ZS5ub3coKVxuICAgIGlmICghZHVwLmV4cGlyeSkge1xuICAgICAgZHVwLmV4cGlyeSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpXG4gICAgICAgIE9iamVjdC5rZXlzKGR1cC5zdG9yZSkuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgaWYgKG5vdyAtIGR1cC5zdG9yZVtpZF0gPiBtYXhBZ2UpIGRlbGV0ZSBkdXAuc3RvcmVbaWRdXG4gICAgICAgIH0pXG4gICAgICAgIGR1cC5leHBpcnkgPSBudWxsXG4gICAgICB9LCBtYXhBZ2UpXG4gICAgfVxuICAgIHJldHVybiBpZFxuICB9XG4gIHJldHVybiBkdXBcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEdXBcbiIsImNvbnN0IEdldCA9IChsZXgsIGdyYXBoKSA9PiB7XG4gIGNvbnN0IHNvdWwgPSBsZXhbXCIjXCJdXG4gIGNvbnN0IGtleSA9IGxleFtcIi5cIl1cbiAgdmFyIG5vZGUgPSBncmFwaFtzb3VsXVxuXG4gIC8vIENhbiBvbmx5IHJldHVybiBhIG5vZGUgaWYgYSBrZXkgaXMgcHJvdmlkZWQsIGJlY2F1c2UgdGhlIGdyYXBoIG1heSBub3RcbiAgLy8gaGF2ZSBhbGwgdGhlIGtleXMgcG9wdWxhdGVkIGZvciBhIGdpdmVuIHNvdWwuIFRoaXMgaXMgYmVjYXVzZSBIYW0ubWl4XG4gIC8vIG9ubHkgYWRkcyBpbmNvbWluZyBjaGFuZ2VzIHRvIHRoZSBncmFwaC5cbiAgaWYgKCFub2RlIHx8ICFrZXkpIHJldHVyblxuXG4gIGxldCB2YWx1ZSA9IG5vZGVba2V5XVxuICBpZiAoIXZhbHVlKSByZXR1cm5cblxuICBub2RlID0ge186IG5vZGUuXywgW2tleV06IHZhbHVlfVxuICBub2RlLl9bXCI+XCJdID0ge1trZXldOiBub2RlLl9bXCI+XCJdW2tleV19XG4gIHJldHVybiB7W3NvdWxdOiBub2RlfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEdldFxuIiwiLy8gc3RhdGUgYW5kIHZhbHVlIGFyZSB0aGUgaW5jb21pbmcgY2hhbmdlcy5cbi8vIGN1cnJlbnRTdGF0ZSBhbmQgY3VycmVudFZhbHVlIGFyZSB0aGUgY3VycmVudCBncmFwaCBkYXRhLlxuY29uc3QgSGFtID0gKHN0YXRlLCBjdXJyZW50U3RhdGUsIHZhbHVlLCBjdXJyZW50VmFsdWUpID0+IHtcbiAgaWYgKHN0YXRlIDwgY3VycmVudFN0YXRlKSByZXR1cm4ge2hpc3RvcmljYWw6IHRydWV9XG5cbiAgaWYgKHN0YXRlID4gY3VycmVudFN0YXRlKSByZXR1cm4ge2luY29taW5nOiB0cnVlfVxuXG4gIC8vIHN0YXRlIGlzIGVxdWFsIHRvIGN1cnJlbnRTdGF0ZSwgbGV4aWNhbGx5IGNvbXBhcmUgdG8gcmVzb2x2ZSBjb25mbGljdC5cbiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpIHx8IFwiXCJcbiAgfVxuICBpZiAodHlwZW9mIGN1cnJlbnRWYWx1ZSAhPT0gXCJzdHJpbmdcIikge1xuICAgIGN1cnJlbnRWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KGN1cnJlbnRWYWx1ZSkgfHwgXCJcIlxuICB9XG4gIC8vIE5vIHVwZGF0ZSByZXF1aXJlZC5cbiAgaWYgKHZhbHVlID09PSBjdXJyZW50VmFsdWUpIHJldHVybiB7c3RhdGU6IHRydWV9XG5cbiAgLy8gS2VlcCB0aGUgY3VycmVudCB2YWx1ZS5cbiAgaWYgKHZhbHVlIDwgY3VycmVudFZhbHVlKSByZXR1cm4ge2N1cnJlbnQ6IHRydWV9XG5cbiAgLy8gT3RoZXJ3aXNlIHVwZGF0ZSB1c2luZyB0aGUgaW5jb21pbmcgdmFsdWUuXG4gIHJldHVybiB7aW5jb21pbmc6IHRydWV9XG59XG5cbkhhbS5taXggPSAoY2hhbmdlLCBncmFwaCkgPT4ge1xuICB2YXIgbWFjaGluZSA9IERhdGUubm93KClcbiAgdmFyIHVwZGF0ZSA9IHt9XG4gIHZhciBkZWZlciA9IHt9XG4gIGxldCB3YWl0ID0gMFxuXG4gIE9iamVjdC5rZXlzKGNoYW5nZSkuZm9yRWFjaChzb3VsID0+IHtcbiAgICBjb25zdCBub2RlID0gY2hhbmdlW3NvdWxdXG4gICAgT2JqZWN0LmtleXMobm9kZSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgaWYgKGtleSA9PT0gXCJfXCIpIHJldHVyblxuXG4gICAgICBjb25zdCB2YWx1ZSA9IG5vZGVba2V5XVxuICAgICAgY29uc3Qgc3RhdGUgPSBub2RlLl9bXCI+XCJdW2tleV1cbiAgICAgIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IChncmFwaFtzb3VsXSB8fCB7fSlba2V5XVxuICAgICAgY29uc3QgY3VycmVudFN0YXRlID0gKGdyYXBoW3NvdWxdIHx8IHtfOiB7XCI+XCI6IHt9fX0pLl9bXCI+XCJdW2tleV0gfHwgMFxuXG4gICAgICAvLyBEZWZlciB0aGUgdXBkYXRlIGlmIGFoZWFkIG9mIG1hY2hpbmUgdGltZS5cbiAgICAgIGNvbnN0IHNrZXcgPSBzdGF0ZSAtIG1hY2hpbmVcbiAgICAgIGlmIChza2V3ID4gMCkge1xuICAgICAgICAvLyBJZ25vcmUgdXBkYXRlIGlmIGFoZWFkIGJ5IG1vcmUgdGhhbiAyNCBob3Vycy5cbiAgICAgICAgaWYgKHNrZXcgPiA4NjQwMDAwMCkgcmV0dXJuXG5cbiAgICAgICAgLy8gV2FpdCB0aGUgc2hvcnRlc3QgZGlmZmVyZW5jZSBiZWZvcmUgdHJ5aW5nIHRoZSB1cGRhdGVzIGFnYWluLlxuICAgICAgICBpZiAod2FpdCA9PT0gMCB8fCBza2V3IDwgd2FpdCkgd2FpdCA9IHNrZXdcbiAgICAgICAgaWYgKCFkZWZlcltzb3VsXSkgZGVmZXJbc291bF0gPSB7Xzoge1wiI1wiOiBzb3VsLCBcIj5cIjoge319fVxuICAgICAgICBkZWZlcltzb3VsXVtrZXldID0gdmFsdWVcbiAgICAgICAgZGVmZXJbc291bF0uX1tcIj5cIl1ba2V5XSA9IHN0YXRlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBIYW0oc3RhdGUsIGN1cnJlbnRTdGF0ZSwgdmFsdWUsIGN1cnJlbnRWYWx1ZSlcbiAgICAgICAgaWYgKHJlc3VsdC5pbmNvbWluZykge1xuICAgICAgICAgIGlmICghdXBkYXRlW3NvdWxdKSB1cGRhdGVbc291bF0gPSB7Xzoge1wiI1wiOiBzb3VsLCBcIj5cIjoge319fVxuICAgICAgICAgIC8vIFRPRE86IGdyYXBoIHNob3VsZCBub3QganVzdCBncm93IGluZGVmaW50aXRlbHkgaW4gbWVtb3J5LlxuICAgICAgICAgIC8vIE5lZWQgdG8gaGF2ZSBhIG1heCBzaXplIGFmdGVyIHdoaWNoIHN0YXJ0IGRyb3BwaW5nIHRoZSBvbGRlc3Qgc3RhdGVcbiAgICAgICAgICAvLyBEbyBzb21ldGhpbmcgc2ltaWxhciB0byBEdXAgd2hpY2ggY2FuIGhhbmRsZSBkZWxldGVzP1xuICAgICAgICAgIGlmICghZ3JhcGhbc291bF0pIGdyYXBoW3NvdWxdID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgICBncmFwaFtzb3VsXVtrZXldID0gdXBkYXRlW3NvdWxdW2tleV0gPSB2YWx1ZVxuICAgICAgICAgIGdyYXBoW3NvdWxdLl9bXCI+XCJdW2tleV0gPSB1cGRhdGVbc291bF0uX1tcIj5cIl1ba2V5XSA9IHN0YXRlXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICB9KVxuICByZXR1cm4ge25vdzogdXBkYXRlLCBkZWZlcjogZGVmZXIsIHdhaXQ6IHdhaXR9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gSGFtXG4iLCJjb25zdCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpXG5jb25zdCBXaXJlID0gcmVxdWlyZShcIi4vd2lyZVwiKVxuXG5jb25zdCBIb2xzdGVyID0gb3B0ID0+IHtcbiAgY29uc3Qgd2lyZSA9IFdpcmUob3B0KVxuXG4gIGNvbnN0IG9rID0gZGF0YSA9PiB7XG4gICAgcmV0dXJuIChcbiAgICAgIGRhdGEgPT09IG51bGwgfHxcbiAgICAgIGRhdGEgPT09IHRydWUgfHxcbiAgICAgIGRhdGEgPT09IGZhbHNlIHx8XG4gICAgICB0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIiB8fFxuICAgICAgdXRpbHMucmVsLmlzKGRhdGEpIHx8XG4gICAgICB1dGlscy5udW0uaXMoZGF0YSlcbiAgICApXG4gIH1cblxuICAvLyBjaGVjayByZXR1cm5zIHRydWUgaWYgZGF0YSBpcyBvayB0byBhZGQgdG8gYSBncmFwaCwgYW4gZXJyb3Igc3RyaW5nIGlmXG4gIC8vIHRoZSBkYXRhIGNhbid0IGJlIGNvbnZlcnRlZCwgYW5kIHRoZSBrZXlzIG9uIHRoZSBkYXRhIG9iamVjdCBvdGhlcndpc2UuXG4gIGNvbnN0IGNoZWNrID0gZGF0YSA9PiB7XG4gICAgaWYgKG9rKGRhdGEpKSByZXR1cm4gdHJ1ZVxuXG4gICAgaWYgKHV0aWxzLm9iai5pcyhkYXRhKSkge1xuICAgICAgY29uc3Qga2V5cyA9IFtdXG4gICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhkYXRhKSkge1xuICAgICAgICBpZiAoa2V5ID09PSBcIl9cIikge1xuICAgICAgICAgIHJldHVybiBcImVycm9yIHVuZGVyc2NvcmUgY2Fubm90IGJlIHVzZWQgYXMgYW4gaXRlbSBuYW1lXCJcbiAgICAgICAgfVxuICAgICAgICBpZiAodXRpbHMub2JqLmlzKHZhbHVlKSB8fCBvayh2YWx1ZSkpIHtcbiAgICAgICAgICBrZXlzLnB1c2goa2V5KVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGBlcnJvciB7JHtrZXl9OiR7dmFsdWV9fSBjYW5ub3QgYmUgY29udmVydGVkIHRvIGdyYXBoYFxuICAgICAgfVxuICAgICAgaWYgKGtleXMubGVuZ3RoICE9PSAwKSByZXR1cm4ga2V5c1xuICAgIH1cbiAgICByZXR1cm4gYGVycm9yICR7ZGF0YX0gY2Fubm90IGJlIGNvbnZlcnRlZCB0byBhIGdyYXBoYFxuICB9XG5cbiAgLy8gZ3JhcGggY29udmVydHMgb2JqZWN0cyB0byBncmFwaCBmb3JtYXQgd2l0aCB1cGRhdGVkIHN0YXRlcy5cbiAgY29uc3QgZ3JhcGggPSAoc291bCwgZGF0YSwgZykgPT4ge1xuICAgIGlmICghZykgZyA9IHtbc291bF06IHtfOiB7XCIjXCI6IHNvdWwsIFwiPlwiOiB7fX19fVxuICAgIGVsc2UgZ1tzb3VsXSA9IHtfOiB7XCIjXCI6IHNvdWwsIFwiPlwiOiB7fX19XG5cbiAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhkYXRhKSkge1xuICAgICAgZ1tzb3VsXVtrZXldID0gdmFsdWVcbiAgICAgIGdbc291bF0uX1tcIj5cIl1ba2V5XSA9IERhdGUubm93KClcbiAgICB9XG4gICAgcmV0dXJuIGdcbiAgfVxuXG4gIGNvbnN0IGFwaSA9IGN0eCA9PiB7XG4gICAgYXBpLmN0eCA9IGN0eFxuXG4gICAgY29uc3QgcmVzb2x2ZSA9IChkYXRhLCBjYikgPT4ge1xuICAgICAgY29uc3QgZ2V0ID0gdHlwZW9mIGRhdGEuZ2V0ICE9PSBcInVuZGVmaW5lZFwiXG4gICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGFwaS5jdHgubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGFwaS5jdHhbaV0uc291bCAhPT0gbnVsbCkgY29udGludWVcblxuICAgICAgICAvLyBUaGUgY3VycmVudCBzb3VsIGluIHRoZSBjb250ZXh0IGNoYWluIGlzIG51bGwsIG5lZWQgdGhlIHByZXZpb3VzXG4gICAgICAgIC8vIGNvbnRleHQgKGllIHRoZSBwYXJlbnQgbm9kZSkgdG8gZmluZCBhIHNvdWwgcmVsYXRpb24gZm9yIGl0LlxuICAgICAgICBjb25zdCB7aXRlbSwgc291bH0gPSBhcGkuY3R4W2kgLSAxXVxuICAgICAgICB3aXJlLmdldCh7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgbXNnID0+IHtcbiAgICAgICAgICBpZiAobXNnLmVycikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYGVycm9yIGdldHRpbmcgJHtpdGVtfSBvbiAke3NvdWx9OiAke21zZy5lcnJ9YClcbiAgICAgICAgICAgIGNiKG51bGwpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBBbiBlYXJsaWVyIGNhbGxiYWNrIGhhcyBhbHJlYWR5IGNvbXBsZXRlZCB0aGUgcmVxdWVzdC5cbiAgICAgICAgICBpZiAoYXBpLmN0eC5sZW5ndGggPT09IDApIHJldHVyblxuXG4gICAgICAgICAgY29uc3Qgbm9kZSA9IG1zZy5wdXQgJiYgbXNnLnB1dFtzb3VsXVxuICAgICAgICAgIGlmIChub2RlICYmIG5vZGVbaXRlbV0gIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlbCA9IHV0aWxzLnJlbC5pcyhub2RlW2l0ZW1dKVxuICAgICAgICAgICAgaWYgKHJlbCkge1xuICAgICAgICAgICAgICBhcGkuY3R4W2ldLnNvdWwgPSByZWxcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFJlcXVlc3Qgd2FzIG5vdCBmb3IgYSBub2RlLCB1c2UgdGhlIHByZXZpb3VzIGNvbnRleHQgdG8gc2V0XG4gICAgICAgICAgICAgIC8vIHRoZSBpdGVtIGFzIHRoZSBwcm9wZXJ0eSBvbiB0aGUgY3VycmVudCBzb3VsLlxuICAgICAgICAgICAgICBhcGkuY3R4W2ldLnByb3BlcnR5ID0gaXRlbVxuICAgICAgICAgICAgICBhcGkuY3R4W2ldLnNvdWwgPSBzb3VsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBDYWxsIGFwaSBhZ2FpbiB1c2luZyB0aGUgdXBkYXRlZCBjb250ZXh0LlxuICAgICAgICAgICAgaWYgKGdldCkgYXBpKGFwaS5jdHgpLmdldChudWxsLCBkYXRhLmdldCwgY2IpXG4gICAgICAgICAgICBlbHNlIGFwaShhcGkuY3R4KS5wdXQoZGF0YS5wdXQsIGNiKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgZXJyb3IgJHtpdGVtfSBub3QgZm91bmQgb24gJHtzb3VsfWApXG4gICAgICAgICAgICBjYihudWxsKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLy8gQ2FsbGJhY2sgaGFzIGJlZW4gcGFzc2VkIHRvIG5leHQgc291bCBsb29rdXAgb3IgY2FsbGVkIGFib3ZlLCBzb1xuICAgICAgICAvLyByZXR1cm4gZmFsc2UgYXMgdGhlIGNhbGxpbmcgY29kZSBzaG91bGQgbm90IGNvbnRpbnVlLlxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIH1cblxuICAgICAgaWYgKGdldCAmJiBhcGkuY3R4W2FwaS5jdHgubGVuZ3RoIC0gMV0uaXRlbSAhPT0gbnVsbCkge1xuICAgICAgICAvLyBUaGUgY29udGV4dCBoYXMgYmVlbiByZXNvbHZlZCwgYnV0IGl0IGRvZXMgbm90IGluY2x1ZGUgdGhlIG5vZGVcbiAgICAgICAgLy8gcmVxdWVzdGVkIGluIGEgZ2V0IHJlcXVlc3QsIHRoaXMgcmVxdWlyZXMgb25lIG1vcmUgbG9va3VwLlxuICAgICAgICBhcGkuY3R4LnB1c2goe2l0ZW06IG51bGwsIHNvdWw6IG51bGx9KVxuICAgICAgICBhcGkoYXBpLmN0eCkuZ2V0KG51bGwsIGRhdGEuZ2V0LCBjYilcbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICB9XG5cbiAgICAgIC8vIFJldHVybiB0aGUgbGFzdCBjb250ZXh0LCBpZSB0aGUgc291bCByZXF1aXJlZCBieSB0aGUgY2FsbGluZyBjb2RlLlxuICAgICAgcmV0dXJuIGFwaS5jdHhbYXBpLmN0eC5sZW5ndGggLSAxXVxuICAgIH1cblxuICAgIC8vIGRvbmUgbWFrZXMgc3VyZSB0aGUgZ2l2ZW4gY2FsbGJhY2sgaXMgb25seSBjYWxsZWQgb25jZS5cbiAgICBjb25zdCBkb25lID0gZGF0YSA9PiB7XG4gICAgICAvLyBjb250ZXh0IG5lZWRzIHRvIGJlIGNsZWFyZWQgaW4gY2FzZSBhcGkgaXMgdXNlZCBhZ2Fpbi5cbiAgICAgIGlmIChhcGkuY3R4KSBhcGkuY3R4ID0gW11cbiAgICAgIGlmIChhcGkuY2IpIHtcbiAgICAgICAgLy8gUmVsYXNlIGFwaS5jYiBiZWZvcmUgY2FsbGluZyBpdCBzbyB0aGUgbmV4dCBjaGFpbiBjYWxsIGNhbiB1c2UgaXQuXG4gICAgICAgIGNvbnN0IHRtcCA9IGFwaS5jYlxuICAgICAgICBhcGkuY2IgPSBudWxsXG4gICAgICAgIHRtcChkYXRhKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgLy8gTG9nIGVycm9ycyB3aGVuIGFwaS5jYiBpcyBub3Qgc2V0LlxuICAgICAgaWYgKGRhdGEpIGNvbnNvbGUubG9nKGRhdGEpXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldDogKGtleSwgbGV4LCBjYikgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGxleCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgY2IgPSBsZXhcbiAgICAgICAgICBsZXggPSBudWxsXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFhcGkuY2IpIGFwaS5jYiA9IGNiXG4gICAgICAgIGlmIChrZXkgPT09IFwiXCIgfHwga2V5ID09PSBcIl9cIikge1xuICAgICAgICAgIGRvbmUobnVsbClcbiAgICAgICAgICByZXR1cm4gYXBpKGFwaS5jdHgpXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYXBpLmN0eCAmJiBhcGkuY3R4Lmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgIC8vIFB1c2ggdGhlIGtleSB0byB0aGUgY29udGV4dCBhcyBpdCBuZWVkcyBhIHNvdWwgbG9va3VwLlxuICAgICAgICAgIC8vIChudWxsIGlzIHVzZWQgYnkgcmVzb2x2ZSB0byBjYWxsIHRoZSBhcGkgd2l0aCB0aGUgdXBkYXRlZCBjb250ZXh0KVxuICAgICAgICAgIGlmIChrZXkgIT09IG51bGwpIGFwaS5jdHgucHVzaCh7aXRlbToga2V5LCBzb3VsOiBudWxsfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAoa2V5ID09PSBudWxsKSB7XG4gICAgICAgICAgICBkb25lKG51bGwpXG4gICAgICAgICAgICByZXR1cm4gYXBpKGFwaS5jdHgpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gVG9wIGxldmVsIGtleXMgYXJlIGFkZGVkIHRvIGEgcm9vdCBub2RlIHNvIHRoZWlyIHZhbHVlcyBkb24ndCBuZWVkXG4gICAgICAgICAgLy8gdG8gYmUgb2JqZWN0cy5cbiAgICAgICAgICBhcGkuY3R4ID0gW3tpdGVtOiBrZXksIHNvdWw6IFwicm9vdFwifV1cbiAgICAgICAgfVxuICAgICAgICBpZiAoIWFwaS5jYikgcmV0dXJuIGFwaShhcGkuY3R4KVxuXG4gICAgICAgIC8vIFdoZW4gdGhlcmUncyBhIGNhbGxiYWNrIG5lZWQgdG8gcmVzb2x2ZSB0aGUgY29udGV4dCBmaXJzdC5cbiAgICAgICAgY29uc3Qge3Byb3BlcnR5LCBzb3VsfSA9IHJlc29sdmUoe2dldDogbGV4fSwgZG9uZSlcbiAgICAgICAgaWYgKCFzb3VsKSByZXR1cm4gYXBpKGFwaS5jdHgpXG5cbiAgICAgICAgd2lyZS5nZXQodXRpbHMub2JqLnB1dChsZXgsIFwiI1wiLCBzb3VsKSwgbXNnID0+IHtcbiAgICAgICAgICBpZiAobXNnLmVycikgY29uc29sZS5sb2cobXNnLmVycilcbiAgICAgICAgICBpZiAobXNnLnB1dCAmJiBtc2cucHV0W3NvdWxdKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG1zZy5wdXRbc291bF1bcHJvcGVydHldICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICAgIGRvbmUobXNnLnB1dFtzb3VsXVtwcm9wZXJ0eV0pXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBkZWxldGUgbXNnLnB1dFtzb3VsXS5fXG4gICAgICAgICAgICAgIGRvbmUobXNnLnB1dFtzb3VsXSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gTm8gZGF0YSBjYWxsYmFjay5cbiAgICAgICAgICAgIGRvbmUobnVsbClcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIHJldHVybiBhcGkoYXBpLmN0eClcbiAgICAgIH0sXG4gICAgICBwdXQ6IChkYXRhLCBjYikgPT4ge1xuICAgICAgICBpZiAoIWFwaS5jYikge1xuICAgICAgICAgIGlmICghY2IpIHJldHVyblxuXG4gICAgICAgICAgLy8gVGhpcyAoYW5kIGFjaykgYWxsb3dzIG5lc3RlZCBvYmplY3RzIHRvIGtlZXAgdGhlaXIgb3duIGNhbGxiYWNrcy5cbiAgICAgICAgICBhcGkuY2IgPSBjYlxuICAgICAgICAgIGNiID0gbnVsbFxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYWNrID0gZXJyID0+IHtcbiAgICAgICAgICBjYiA/IGNiKGVycikgOiBkb25lKGVycilcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghYXBpLmN0eCB8fCBhcGkuY3R4Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGFjayhcInBsZWFzZSBwcm92aWRlIGEga2V5IHVzaW5nIGdldChrZXkpIGJlZm9yZSBwdXRcIilcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGNoZWNrKGRhdGEpXG4gICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgLy8gQWxsIHN0cmluZ3MgcmV0dXJuZWQgZnJvbSBjaGVjayBhcmUgZXJyb3JzLCBjYW5ub3QgY29udGludWUuXG4gICAgICAgICAgYWNrKHJlc3VsdClcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlc29sdmUgdGhlIGN1cnJlbnQgY29udGV4dCBiZWZvcmUgcHV0dGluZyBkYXRhLlxuICAgICAgICBjb25zdCB7aXRlbSwgc291bH0gPSByZXNvbHZlKHtwdXQ6IGRhdGF9LCBhY2spXG4gICAgICAgIGlmICghc291bCkgcmV0dXJuXG5cbiAgICAgICAgaWYgKHJlc3VsdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgIC8vIFdoZW4gcmVzdWx0IGlzIHRydWUgZGF0YSBpcyBhIHByb3BlcnR5IHRvIHB1dCBvbiB0aGUgY3VycmVudCBzb3VsLlxuICAgICAgICAgIHdpcmUucHV0KGdyYXBoKHNvdWwsIHtbaXRlbV06IGRhdGF9KSwgYWNrKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3RoZXJ3aXNlIHB1dCB0aGUgZGF0YSB1c2luZyB0aGUga2V5cyByZXR1cm5lZCBpbiByZXN1bHQuXG4gICAgICAgIC8vIE5lZWQgdG8gY2hlY2sgaWYgYSByZWwgaGFzIGFscmVhZHkgYmVlbiBhZGRlZCBvbiB0aGUgY3VycmVudCBub2RlLlxuICAgICAgICB3aXJlLmdldCh7XCIjXCI6IHNvdWwsIFwiLlwiOiBpdGVtfSwgYXN5bmMgbXNnID0+IHtcbiAgICAgICAgICBpZiAobXNnLmVycikge1xuICAgICAgICAgICAgYWNrKGBlcnJvciBnZXR0aW5nICR7c291bH06ICR7bXNnLmVycn1gKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgY3VycmVudCA9IG1zZy5wdXQgJiYgbXNnLnB1dFtzb3VsXSAmJiBtc2cucHV0W3NvdWxdW2l0ZW1dXG4gICAgICAgICAgY29uc3QgaWQgPSB1dGlscy5yZWwuaXMoY3VycmVudClcbiAgICAgICAgICBpZiAoIWlkKSB7XG4gICAgICAgICAgICAvLyBUaGUgY3VycmVudCByZWwgZG9lc24ndCBleGlzdCwgc28gYWRkIGl0IGZpcnN0LlxuICAgICAgICAgICAgY29uc3QgcmVsID0ge1tpdGVtXTogdXRpbHMucmVsLmlmeSh1dGlscy50ZXh0LnJhbmRvbSgpKX1cbiAgICAgICAgICAgIHdpcmUucHV0KGdyYXBoKHNvdWwsIHJlbCksIGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBhY2soYGVycm9yIHB1dHRpbmcgJHtpdGVtfSBvbiAke3NvdWx9OiAke2Vycn1gKVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGFwaShhcGkuY3R4KS5wdXQoZGF0YSwgYWNrKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IHB1dCA9IGZhbHNlXG4gICAgICAgICAgY29uc3QgdXBkYXRlID0ge31cbiAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJlc3VsdC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gcmVzdWx0W2ldXG4gICAgICAgICAgICBjb25zdCBlcnIgPSBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICAgICAgaWYgKHV0aWxzLm9iai5pcyhkYXRhW2tleV0pKSB7XG4gICAgICAgICAgICAgICAgLy8gVXNlIHRoZSBjdXJyZW50IHJlbCBhcyB0aGUgY29udGV4dCBmb3IgbmVzdGVkIG9iamVjdHMuXG4gICAgICAgICAgICAgICAgYXBpKFt7aXRlbToga2V5LCBzb3VsOiBpZH1dKS5wdXQoZGF0YVtrZXldLCByZXNvbHZlKVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHB1dCA9IHRydWVcbiAgICAgICAgICAgICAgICAvLyBHcm91cCBvdGhlciBwcm9wZXJ0aWVzIGludG8gb25lIHVwZGF0ZS5cbiAgICAgICAgICAgICAgICB1cGRhdGVba2V5XSA9IGRhdGFba2V5XVxuICAgICAgICAgICAgICAgIHJlc29sdmUobnVsbClcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgYWNrKGVycilcbiAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChwdXQpIHdpcmUucHV0KGdyYXBoKGlkLCB1cGRhdGUpLCBhY2spXG4gICAgICAgICAgZWxzZSBhY2soKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIC8vIEFsbG93IHRoZSB3aXJlIHNwZWMgdG8gYmUgdXNlZCB2aWEgaG9sc3Rlci5cbiAgICAgIHdpcmU6IHdpcmUsXG4gICAgfVxuICB9XG4gIHJldHVybiBhcGkoKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEhvbHN0ZXJcbiIsImNvbnN0IFJhZGl4ID0gcmVxdWlyZShcIi4vcmFkaXhcIilcbmNvbnN0IHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIilcblxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciBlbmQgb2YgdGV4dC5cbmNvbnN0IGV0eCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMylcbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgZW5xdWlyeS5cbmNvbnN0IGVucSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoNSlcbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgdW5pdCBzZXBhcmF0b3IuXG5jb25zdCB1bml0ID0gU3RyaW5nLmZyb21DaGFyQ29kZSgzMSlcblxuLy8gUmFkaXNrIHByb3ZpZGVzIGFjY2VzcyB0byBhIHJhZGl4IHRyZWUgdGhhdCBpcyBzdG9yZWQgaW4gdGhlIHByb3ZpZGVkXG4vLyBvcHQuc3RvcmUgaW50ZXJmYWNlLlxuY29uc3QgUmFkaXNrID0gb3B0ID0+IHtcbiAgdmFyIHVcbiAgdmFyIGNhY2hlID0gbnVsbFxuXG4gIGlmICghb3B0KSBvcHQgPSB7fVxuICBpZiAoIW9wdC5sb2cpIG9wdC5sb2cgPSBjb25zb2xlLmxvZ1xuICBpZiAoIW9wdC5iYXRjaCkgb3B0LmJhdGNoID0gMTAgKiAxMDAwXG4gIGlmICghb3B0LndhaXQpIG9wdC53YWl0ID0gMVxuICBpZiAoIW9wdC5zaXplKSBvcHQuc2l6ZSA9IDEwMjQgKiAxMDI0IC8vIDFNQlxuICBpZiAoIW9wdC5zdG9yZSkge1xuICAgIG9wdC5sb2coXG4gICAgICBcIlJhZGlzayBuZWVkcyBgc3RvcmVgIGludGVyZmFjZSB3aXRoIGB7Z2V0OiBmbiwgcHV0OiBmbiwgbGlzdDogZm59YFwiLFxuICAgIClcbiAgICByZXR1cm5cbiAgfVxuICBpZiAoIW9wdC5zdG9yZS5nZXQpIHtcbiAgICBvcHQubG9nKFwiUmFkaXNrIG5lZWRzIGBzdG9yZS5nZXRgIGludGVyZmFjZSB3aXRoIGAoZmlsZSwgY2IpYFwiKVxuICAgIHJldHVyblxuICB9XG4gIGlmICghb3B0LnN0b3JlLnB1dCkge1xuICAgIG9wdC5sb2coXCJSYWRpc2sgbmVlZHMgYHN0b3JlLnB1dGAgaW50ZXJmYWNlIHdpdGggYChmaWxlLCBkYXRhLCBjYilgXCIpXG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKCFvcHQuc3RvcmUubGlzdCkge1xuICAgIG9wdC5sb2coXCJSYWRpc2sgbmVlZHMgYSBzdHJlYW1pbmcgYHN0b3JlLmxpc3RgIGludGVyZmFjZSB3aXRoIGAoY2IpYFwiKVxuICAgIHJldHVyblxuICB9XG5cbiAgLy8gQW55IGFuZCBhbGwgc3RvcmFnZSBhZGFwdGVycyBzaG91bGQ6XG4gIC8vIDEuIEJlY2F1c2Ugd3JpdGluZyB0byBkaXNrIHRha2VzIHRpbWUsIHdlIHNob3VsZCBiYXRjaCBkYXRhIHRvIGRpc2suXG4gIC8vICAgIFRoaXMgaW1wcm92ZXMgcGVyZm9ybWFuY2UsIGFuZCByZWR1Y2VzIHBvdGVudGlhbCBkaXNrIGNvcnJ1cHRpb24uXG4gIC8vIDIuIElmIGEgYmF0Y2ggZXhjZWVkcyBhIGNlcnRhaW4gbnVtYmVyIG9mIHdyaXRlcywgd2Ugc2hvdWxkIGltbWVkaWF0ZWx5XG4gIC8vICAgIHdyaXRlIHRvIGRpc2sgd2hlbiBwaHlzaWNhbGx5IHBvc3NpYmxlLiBUaGlzIGNhcHMgdG90YWwgcGVyZm9ybWFuY2UsXG4gIC8vICAgIGJ1dCByZWR1Y2VzIHBvdGVudGlhbCBsb3NzLlxuICBjb25zdCByYWRpc2sgPSAoa2V5LCB2YWx1ZSwgY2IpID0+IHtcbiAgICBrZXkgPSBcIlwiICsga2V5XG5cbiAgICAvLyBJZiBubyB2YWx1ZSBpcyBwcm92aWRlZCB0aGVuIHRoZSBzZWNvbmQgcGFyYW1ldGVyIGlzIHRoZSBjYWxsYmFja1xuICAgIC8vIGZ1bmN0aW9uLiBSZWFkIHZhbHVlIGZyb20gbWVtb3J5IG9yIGRpc2sgYW5kIGNhbGwgY2FsbGJhY2sgd2l0aCBpdC5cbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIGNiID0gdmFsdWVcbiAgICAgIHZhbHVlID0gcmFkaXNrLmJhdGNoKGtleSlcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgcmV0dXJuIGNiKHUsIHZhbHVlKVxuICAgICAgfVxuXG4gICAgICBpZiAocmFkaXNrLnRocmFzaC5hdCkge1xuICAgICAgICB2YWx1ZSA9IHJhZGlzay50aHJhc2guYXQoa2V5KVxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgcmV0dXJuIGNiKHUsIHZhbHVlKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByYWRpc2sucmVhZChrZXksIGNiKVxuICAgIH1cblxuICAgIC8vIE90aGVyd2lzZSBzdG9yZSB0aGUgdmFsdWUgcHJvdmlkZWQuXG4gICAgcmFkaXNrLmJhdGNoKGtleSwgdmFsdWUpXG4gICAgaWYgKGNiKSB7XG4gICAgICByYWRpc2suYmF0Y2guYWNrcy5wdXNoKGNiKVxuICAgIH1cbiAgICAvLyBEb24ndCB3YWl0IGlmIHdlIGhhdmUgYmF0Y2hlZCB0b28gbWFueS5cbiAgICBpZiAoKytyYWRpc2suYmF0Y2guZWQgPj0gb3B0LmJhdGNoKSB7XG4gICAgICByZXR1cm4gcmFkaXNrLnRocmFzaCgpXG4gICAgfVxuXG4gICAgLy8gT3RoZXJ3aXNlIHdhaXQgZm9yIG1vcmUgdXBkYXRlcyBiZWZvcmUgd3JpdGluZy5cbiAgICBjbGVhclRpbWVvdXQocmFkaXNrLmJhdGNoLnRpbWVvdXQpXG4gICAgcmFkaXNrLmJhdGNoLnRpbWVvdXQgPSBzZXRUaW1lb3V0KHJhZGlzay50aHJhc2gsIG9wdC53YWl0KVxuICB9XG5cbiAgcmFkaXNrLmJhdGNoID0gUmFkaXgoKVxuICByYWRpc2suYmF0Y2guYWNrcyA9IFtdXG4gIHJhZGlzay5iYXRjaC5lZCA9IDBcblxuICByYWRpc2sudGhyYXNoID0gKCkgPT4ge1xuICAgIGlmIChyYWRpc2sudGhyYXNoLmluZykge1xuICAgICAgcmV0dXJuIChyYWRpc2sudGhyYXNoLm1vcmUgPSB0cnVlKVxuICAgIH1cblxuICAgIGNsZWFyVGltZW91dChyYWRpc2suYmF0Y2gudGltZW91dClcbiAgICByYWRpc2sudGhyYXNoLm1vcmUgPSBmYWxzZVxuICAgIHJhZGlzay50aHJhc2guaW5nID0gdHJ1ZVxuICAgIHZhciBiYXRjaCA9IChyYWRpc2sudGhyYXNoLmF0ID0gcmFkaXNrLmJhdGNoKVxuICAgIHJhZGlzay5iYXRjaCA9IG51bGxcbiAgICByYWRpc2suYmF0Y2ggPSBSYWRpeCgpXG4gICAgcmFkaXNrLmJhdGNoLmFja3MgPSBbXVxuICAgIHJhZGlzay5iYXRjaC5lZCA9IDBcbiAgICBsZXQgaSA9IDBcbiAgICByYWRpc2suc2F2ZShiYXRjaCwgZXJyID0+IHtcbiAgICAgIC8vIFRoaXMgaXMgdG8gaWdub3JlIG11bHRpcGxlIGNhbGxiYWNrcyBmcm9tIHJhZGlzay5zYXZlIGNhbGxpbmdcbiAgICAgIC8vIHJhZGlzay53cml0ZT8gSXQgbG9va3MgbGlrZSBtdWx0aXBsZSBjYWxsYmFja3Mgd2lsbCBiZSBtYWRlIGlmIGFcbiAgICAgIC8vIGZpbGUgbmVlZHMgdG8gYmUgc3BsaXQuXG4gICAgICBpZiAoKytpID4gMSkgcmV0dXJuXG5cbiAgICAgIGlmIChlcnIpIG9wdC5sb2coZXJyKVxuICAgICAgYmF0Y2guYWNrcy5mb3JFYWNoKGNiID0+IGNiKGVycikpXG4gICAgICByYWRpc2sudGhyYXNoLmF0ID0gbnVsbFxuICAgICAgcmFkaXNrLnRocmFzaC5pbmcgPSBmYWxzZVxuICAgICAgaWYgKHJhZGlzay50aHJhc2gubW9yZSkgcmFkaXNrLnRocmFzaCgpXG4gICAgfSlcbiAgfVxuXG4gIC8vIDEuIEZpbmQgdGhlIGZpcnN0IHJhZGl4IGl0ZW0gaW4gbWVtb3J5XG4gIC8vIDIuIFVzZSB0aGF0IGFzIHRoZSBzdGFydGluZyBpbmRleCBpbiB0aGUgZGlyZWN0b3J5IG9mIGZpbGVzXG4gIC8vIDMuIEZpbmQgdGhlIGZpcnN0IGZpbGUgdGhhdCBpcyBsZXhpY2FsbHkgbGFyZ2VyIHRoYW4gaXRcbiAgLy8gNC4gUmVhZCB0aGUgcHJldmlvdXMgZmlsZSBpbnRvIG1lbW9yeVxuICAvLyA1LiBTY2FuIHRocm91Z2ggaW4gbWVtb3J5IHJhZGl4IGZvciBhbGwgdmFsdWVzIGxleGljYWxseSBsZXNzIHRoYW4gbGltaXRcbiAgLy8gNi4gTWVyZ2UgYW5kIHdyaXRlIGFsbCBvZiB0aG9zZSB0byB0aGUgaW4tbWVtb3J5IGZpbGUgYW5kIGJhY2sgdG8gZGlza1xuICAvLyA3LiBJZiBmaWxlIGlzIHRvIGxhcmdlIHRoZW4gc3BsaXQuIE1vcmUgZGV0YWlscyBuZWVkZWQgaGVyZVxuICByYWRpc2suc2F2ZSA9IChyYWQsIGNiKSA9PiB7XG4gICAgY29uc3Qgc2F2ZSA9IHtcbiAgICAgIGZpbmQ6ICh0cmVlLCBrZXkpID0+IHtcbiAgICAgICAgLy8gVGhpcyBpcyBmYWxzZSBmb3IgYW55IGtleSB1bnRpbCBzYXZlLnN0YXJ0IGlzIHNldCB0byBhbiBpbml0aWFsIGtleS5cbiAgICAgICAgaWYgKGtleSA8IHNhdmUuc3RhcnQpIHJldHVyblxuXG4gICAgICAgIHNhdmUuc3RhcnQgPSBrZXlcbiAgICAgICAgb3B0LnN0b3JlLmxpc3Qoc2F2ZS5sZXgpXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9LFxuICAgICAgbGV4OiBmaWxlID0+IHtcbiAgICAgICAgaWYgKCFmaWxlIHx8IGZpbGUgPiBzYXZlLnN0YXJ0KSB7XG4gICAgICAgICAgc2F2ZS5lbmQgPSBmaWxlXG4gICAgICAgICAgLy8gISBpcyB1c2VkIGFzIHRoZSBmaXJzdCBmaWxlIG5hbWUgYXMgaXQncyB0aGUgZmlyc3QgcHJpbnRhYmxlXG4gICAgICAgICAgLy8gY2hhcmFjdGVyLCBzbyBhbHdheXMgbWF0Y2hlcyBhcyBsZXhpY2FsbHkgbGVzcyB0aGFuIGFueSBub2RlLlxuICAgICAgICAgIHNhdmUubWl4KHNhdmUuZmlsZSB8fCBcIiFcIiwgc2F2ZS5zdGFydCwgc2F2ZS5lbmQpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHNhdmUuZmlsZSA9IGZpbGVcbiAgICAgIH0sXG4gICAgICBtaXg6IChmaWxlLCBzdGFydCwgZW5kKSA9PiB7XG4gICAgICAgIHNhdmUuc3RhcnQgPSBzYXZlLmVuZCA9IHNhdmUuZmlsZSA9IHVcbiAgICAgICAgcmFkaXNrLnBhcnNlKGZpbGUsIChlcnIsIGRpc2spID0+IHtcbiAgICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuXG4gICAgICAgICAgUmFkaXgubWFwKHJhZCwgKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgIGlmIChrZXkgPCBzdGFydCkgcmV0dXJuXG5cbiAgICAgICAgICAgIGlmIChlbmQgJiYgZW5kIDwga2V5KSB7XG4gICAgICAgICAgICAgIHNhdmUuc3RhcnQgPSBrZXlcbiAgICAgICAgICAgICAgcmV0dXJuIHNhdmUuc3RhcnRcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZGlzayhrZXksIHZhbHVlKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgcmFkaXNrLndyaXRlKGZpbGUsIGRpc2ssIHNhdmUubmV4dClcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBuZXh0OiBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuXG4gICAgICAgIGlmIChzYXZlLnN0YXJ0KSByZXR1cm4gUmFkaXgubWFwKHJhZCwgc2F2ZS5maW5kKVxuXG4gICAgICAgIGNiKGVycilcbiAgICAgIH0sXG4gICAgfVxuICAgIFJhZGl4Lm1hcChyYWQsIHNhdmUuZmluZClcbiAgfVxuXG4gIHJhZGlzay53cml0ZSA9IChmaWxlLCByYWQsIGNiKSA9PiB7XG4gICAgLy8gSW52YWxpZGF0ZSBjYWNoZSBvbiB3cml0ZS5cbiAgICBjYWNoZSA9IG51bGxcbiAgICBjb25zdCB3cml0ZSA9IHtcbiAgICAgIHRleHQ6IFwiXCIsXG4gICAgICBjb3VudDogMCxcbiAgICAgIGZpbGU6IGZpbGUsXG4gICAgICBlYWNoOiAodmFsdWUsIGtleSwgaywgcHJlKSA9PiB7XG4gICAgICAgIHdyaXRlLmNvdW50KytcbiAgICAgICAgdmFyIGVuYyA9XG4gICAgICAgICAgUmFkaXNrLmVuY29kZShwcmUubGVuZ3RoKSArXG4gICAgICAgICAgXCIjXCIgK1xuICAgICAgICAgIFJhZGlzay5lbmNvZGUoaykgK1xuICAgICAgICAgICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIgPyBcIlwiIDogXCI9XCIgKyBSYWRpc2suZW5jb2RlKHZhbHVlKSkgK1xuICAgICAgICAgIFwiXFxuXCJcbiAgICAgICAgLy8gQ2Fubm90IHNwbGl0IHRoZSBmaWxlIGlmIG9ubHkgaGF2ZSBvbmUgZW50cnkgdG8gd3JpdGUuXG4gICAgICAgIGlmICh3cml0ZS5jb3VudCA+IDEgJiYgd3JpdGUudGV4dC5sZW5ndGggKyBlbmMubGVuZ3RoID4gb3B0LnNpemUpIHtcbiAgICAgICAgICB3cml0ZS50ZXh0ID0gXCJcIlxuICAgICAgICAgIC8vIE90aGVyd2lzZSBzcGxpdCB0aGUgZW50cmllcyBpbiBoYWxmLlxuICAgICAgICAgIHdyaXRlLmxpbWl0ID0gTWF0aC5jZWlsKHdyaXRlLmNvdW50IC8gMilcbiAgICAgICAgICB3cml0ZS5jb3VudCA9IDBcbiAgICAgICAgICB3cml0ZS5zdWIgPSBSYWRpeCgpXG4gICAgICAgICAgUmFkaXgubWFwKHJhZCwgd3JpdGUuc2xpY2UpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHdyaXRlLnRleHQgKz0gZW5jXG4gICAgICB9LFxuICAgICAgcHV0OiAoKSA9PiB7XG4gICAgICAgIG9wdC5zdG9yZS5wdXQoZmlsZSwgd3JpdGUudGV4dCwgY2IpXG4gICAgICB9LFxuICAgICAgc2xpY2U6ICh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPCB3cml0ZS5maWxlKSByZXR1cm5cblxuICAgICAgICBpZiAoKyt3cml0ZS5jb3VudCA+IHdyaXRlLmxpbWl0KSB7XG4gICAgICAgICAgdmFyIG5hbWUgPSB3cml0ZS5maWxlXG4gICAgICAgICAgLy8gVXNlIG9ubHkgdGhlIHNvdWwgb2YgdGhlIGtleSBhcyB0aGUgZmlsZW5hbWUgc28gdGhhdCBhbGxcbiAgICAgICAgICAvLyBwcm9wZXJ0aWVzIG9mIGEgc291bCBhcmUgd3JpdHRlbiB0byB0aGUgc2FtZSBmaWxlLlxuICAgICAgICAgIGxldCBlbmQgPSBrZXkuaW5kZXhPZihlbnEpXG4gICAgICAgICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgICAgICAgIHdyaXRlLmZpbGUgPSBrZXlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgd3JpdGUuZmlsZSA9IGtleS5zdWJzdHJpbmcoMCwgZW5kKVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyB3cml0ZS5saW1pdCBjYW4gYmUgcmVhY2hlZCBhZnRlciBhbHJlYWR5IHdyaXRpbmcgcHJvcGVydGllcyBvZlxuICAgICAgICAgIC8vIHRoZSBjdXJyZW50IG5vZGUsIHNvIHJlbW92ZSBpdCBmcm9tIHdyaXRlLnN1YiBiZWZvcmUgd3JpdGluZyB0b1xuICAgICAgICAgIC8vIGRpc2sgc28gdGhhdCBpdCdzIG5vdCBkdXBsaWNhdGVkIGFjcm9zcyBmaWxlcy5cbiAgICAgICAgICB3cml0ZS5zdWIod3JpdGUuZmlsZSwgbnVsbClcbiAgICAgICAgICB3cml0ZS5jb3VudCA9IDBcbiAgICAgICAgICByYWRpc2sud3JpdGUobmFtZSwgd3JpdGUuc3ViLCB3cml0ZS5uZXh0KVxuICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH1cblxuICAgICAgICB3cml0ZS5zdWIoa2V5LCB2YWx1ZSlcbiAgICAgIH0sXG4gICAgICBuZXh0OiBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuXG4gICAgICAgIHdyaXRlLnN1YiA9IFJhZGl4KClcbiAgICAgICAgaWYgKCFSYWRpeC5tYXAocmFkLCB3cml0ZS5zbGljZSkpIHtcbiAgICAgICAgICByYWRpc2sud3JpdGUod3JpdGUuZmlsZSwgd3JpdGUuc3ViLCBjYilcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9XG4gICAgLy8gSWYgUmFkaXgubWFwIGRvZXNuJ3QgcmV0dXJuIHRydWUgd2hlbiBjYWxsZWQgd2l0aCB3cml0ZS5lYWNoIGFzIGFcbiAgICAvLyBjYWxsYmFjayB0aGVuIGRpZG4ndCBuZWVkIHRvIHNwbGl0IHRoZSBkYXRhLiBUaGUgYWNjdW11bGF0ZWQgd3JpdGUudGV4dFxuICAgIC8vIGNhbiB0aGVuIGJlIHN0b3JlZCB3aXRoIHdyaXRlLnB1dCgpLlxuICAgIGlmICghUmFkaXgubWFwKHJhZCwgd3JpdGUuZWFjaCwgdHJ1ZSkpIHdyaXRlLnB1dCgpXG4gIH1cblxuICByYWRpc2sucmVhZCA9IChrZXksIGNiKSA9PiB7XG4gICAgaWYgKGNhY2hlKSB7XG4gICAgICBsZXQgdmFsdWUgPSBjYWNoZShrZXkpXG4gICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gY2IodSwgdmFsdWUpXG4gICAgfVxuICAgIC8vIE9ubHkgdGhlIHNvdWwgb2YgdGhlIGtleSBpcyBjb21wYXJlZCB0byBmaWxlbmFtZXMgKHNlZSByYWRpc2sud3JpdGUpLlxuICAgIGxldCBzb3VsID0ga2V5XG4gICAgbGV0IGVuZCA9IGtleS5pbmRleE9mKGVucSlcbiAgICBpZiAoZW5kICE9PSAtMSkge1xuICAgICAgc291bCA9IGtleS5zdWJzdHJpbmcoMCwgZW5kKVxuICAgIH1cblxuICAgIGNvbnN0IHJlYWQgPSB7XG4gICAgICBsZXg6IGZpbGUgPT4ge1xuICAgICAgICAvLyBzdG9yZS5saXN0IHNob3VsZCBjYWxsIGxleCB3aXRob3V0IGEgZmlsZSBsYXN0LCB3aGljaCBtZWFucyBhbGwgZmlsZVxuICAgICAgICAvLyBuYW1lcyB3ZXJlIGNvbXBhcmVkIHRvIHNvdWwsIHNvIHRoZSBjdXJyZW50IHJlYWQuZmlsZSBpcyBvayB0byB1c2UuXG4gICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgIGlmICghcmVhZC5maWxlKSB7XG4gICAgICAgICAgICBjYihcIm5vIGZpbGUgZm91bmRcIiwgdSlcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIHJhZGlzay5wYXJzZShyZWFkLmZpbGUsIHJlYWQuaXQpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBXYW50IHRoZSBmaWxlbmFtZSBjbG9zZXN0IHRvIHNvdWwuXG4gICAgICAgIGlmIChmaWxlID4gc291bCB8fCBmaWxlIDwgcmVhZC5maWxlKSByZXR1cm5cblxuICAgICAgICByZWFkLmZpbGUgPSBmaWxlXG4gICAgICB9LFxuICAgICAgaXQ6IChlcnIsIGRpc2spID0+IHtcbiAgICAgICAgaWYgKGVycikgb3B0LmxvZyhlcnIpXG4gICAgICAgIGlmIChkaXNrKSB7XG4gICAgICAgICAgY2FjaGUgPSBkaXNrXG4gICAgICAgICAgcmVhZC52YWx1ZSA9IGRpc2soa2V5KVxuICAgICAgICB9XG4gICAgICAgIGNiKGVyciwgcmVhZC52YWx1ZSlcbiAgICAgIH0sXG4gICAgfVxuICAgIG9wdC5zdG9yZS5saXN0KHJlYWQubGV4KVxuICB9XG5cbiAgLy8gTGV0IHVzIHN0YXJ0IGJ5IGFzc3VtaW5nIHdlIGFyZSB0aGUgb25seSBwcm9jZXNzIHRoYXQgaXNcbiAgLy8gY2hhbmdpbmcgdGhlIGRpcmVjdG9yeSBvciBidWNrZXQuIE5vdCBiZWNhdXNlIHdlIGRvIG5vdCB3YW50XG4gIC8vIHRvIGJlIG11bHRpLXByb2Nlc3MvbWFjaGluZSwgYnV0IGJlY2F1c2Ugd2Ugd2FudCB0byBleHBlcmltZW50XG4gIC8vIHdpdGggaG93IG11Y2ggcGVyZm9ybWFuY2UgYW5kIHNjYWxlIHdlIGNhbiBnZXQgb3V0IG9mIG9ubHkgb25lLlxuICAvLyBUaGVuIHdlIGNhbiB3b3JrIG9uIHRoZSBoYXJkZXIgcHJvYmxlbSBvZiBiZWluZyBtdWx0aS1wcm9jZXNzLlxuICByYWRpc2sucGFyc2UgPSAoZmlsZSwgY2IpID0+IHtcbiAgICBjb25zdCBwYXJzZSA9IHtcbiAgICAgIGRpc2s6IFJhZGl4KCksXG4gICAgICByZWFkOiAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgICAgaWYgKCFkYXRhKSByZXR1cm4gY2IodSwgcGFyc2UuZGlzaylcblxuICAgICAgICBsZXQgcHJlID0gW11cbiAgICAgICAgLy8gV29yayB0aG91Z2ggZGF0YSBieSBzcGxpdHRpbmcgaW50byAzIHZhbHVlcy4gVGhlIGZpcnN0IHZhbHVlIHNheXNcbiAgICAgICAgLy8gaWYgdGhlIHNlY29uZCB2YWx1ZSBpcyBvbmUgb2Y6IHRoZSByYWRpeCBsZXZlbCBmb3IgYSBrZXksIHRoZSBrZXlcbiAgICAgICAgLy8gaXRlc2VsZiwgb3IgYSB2YWx1ZS4gVGhlIHRoaXJkIGlzIHRoZSByZXN0IG9mIHRoZSBkYXRhIHRvIHdvcmsgd2l0aC5cbiAgICAgICAgbGV0IHRtcCA9IHBhcnNlLnNwbGl0KGRhdGEpXG4gICAgICAgIHdoaWxlICh0bXApIHtcbiAgICAgICAgICBsZXQga2V5XG4gICAgICAgICAgbGV0IHZhbHVlXG4gICAgICAgICAgbGV0IGkgPSB0bXBbMV1cbiAgICAgICAgICB0bXAgPSBwYXJzZS5zcGxpdCh0bXBbMl0pIHx8IFwiXCJcbiAgICAgICAgICBpZiAodG1wWzBdID09PSBcIiNcIikge1xuICAgICAgICAgICAga2V5ID0gdG1wWzFdXG4gICAgICAgICAgICBwcmUgPSBwcmUuc2xpY2UoMCwgaSlcbiAgICAgICAgICAgIGlmIChpIDw9IHByZS5sZW5ndGgpIHByZS5wdXNoKGtleSlcbiAgICAgICAgICB9XG4gICAgICAgICAgdG1wID0gcGFyc2Uuc3BsaXQodG1wWzJdKSB8fCBcIlwiXG4gICAgICAgICAgaWYgKHRtcFswXSA9PT0gXCJcXG5cIikgY29udGludWVcblxuICAgICAgICAgIGlmICh0bXBbMF0gPT09IFwiPVwiKSB2YWx1ZSA9IHRtcFsxXVxuICAgICAgICAgIGlmICh0eXBlb2Yga2V5ICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiB2YWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgcGFyc2UuZGlzayhwcmUuam9pbihcIlwiKSwgdmFsdWUpXG4gICAgICAgICAgfVxuICAgICAgICAgIHRtcCA9IHBhcnNlLnNwbGl0KHRtcFsyXSlcbiAgICAgICAgfVxuICAgICAgICBjYih1LCBwYXJzZS5kaXNrKVxuICAgICAgfSxcbiAgICAgIHNwbGl0OiBkYXRhID0+IHtcbiAgICAgICAgaWYgKCFkYXRhKSByZXR1cm5cblxuICAgICAgICBsZXQgaSA9IC0xXG4gICAgICAgIGxldCBhID0gXCJcIlxuICAgICAgICBsZXQgYyA9IG51bGxcbiAgICAgICAgd2hpbGUgKChjID0gZGF0YVsrK2ldKSkge1xuICAgICAgICAgIGlmIChjID09PSB1bml0KSBicmVha1xuXG4gICAgICAgICAgYSArPSBjXG4gICAgICAgIH1cbiAgICAgICAgbGV0IG8gPSB7fVxuICAgICAgICBpZiAoYykge1xuICAgICAgICAgIHJldHVybiBbYSwgUmFkaXNrLmRlY29kZShkYXRhLnNsaWNlKGkpLCBvKSwgZGF0YS5zbGljZShpICsgby5pKV1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9XG4gICAgb3B0LnN0b3JlLmdldChmaWxlLCBwYXJzZS5yZWFkKVxuICB9XG5cbiAgcmV0dXJuIHJhZGlza1xufVxuXG5SYWRpc2suZW5jb2RlID0gZGF0YSA9PiB7XG4gIC8vIEEga2V5IHNob3VsZCBiZSBwYXNzZWQgaW4gYXMgYSBzdHJpbmcgdG8gZW5jb2RlLCBhIHZhbHVlIGNhbiBvcHRpb25hbGx5IGJlXG4gIC8vIGFuIGFycmF5IG9mIDIgaXRlbXMgdG8gaW5jbHVkZSB0aGUgdmFsdWUncyBzdGF0ZSwgYXMgaXMgZG9uZSBieSBzdG9yZS5qcy5cbiAgbGV0IHN0YXRlID0gXCJcIlxuICBpZiAoZGF0YSBpbnN0YW5jZW9mIEFycmF5ICYmIGRhdGEubGVuZ3RoID09PSAyKSB7XG4gICAgc3RhdGUgPSBldHggKyBkYXRhWzFdXG4gICAgZGF0YSA9IGRhdGFbMF1cbiAgfVxuXG4gIGlmICh0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIikge1xuICAgIGxldCBpID0gMFxuICAgIGxldCBjdXJyZW50ID0gbnVsbFxuICAgIGxldCB0ZXh0ID0gdW5pdFxuICAgIHdoaWxlICgoY3VycmVudCA9IGRhdGFbaSsrXSkpIHtcbiAgICAgIGlmIChjdXJyZW50ID09PSB1bml0KSB0ZXh0ICs9IHVuaXRcbiAgICB9XG4gICAgcmV0dXJuIHRleHQgKyAnXCInICsgZGF0YSArIHN0YXRlICsgdW5pdFxuICB9XG5cbiAgY29uc3QgcmVsID0gdXRpbHMucmVsLmlzKGRhdGEpXG4gIGlmIChyZWwpIHJldHVybiB1bml0ICsgXCIjXCIgKyByZWwgKyBzdGF0ZSArIHVuaXRcblxuICBpZiAodXRpbHMubnVtLmlzKGRhdGEpKSByZXR1cm4gdW5pdCArIFwiK1wiICsgKGRhdGEgfHwgMCkgKyBzdGF0ZSArIHVuaXRcblxuICBpZiAoZGF0YSA9PT0gdHJ1ZSkgcmV0dXJuIHVuaXQgKyBcIitcIiArIHN0YXRlICsgdW5pdFxuXG4gIGlmIChkYXRhID09PSBmYWxzZSkgcmV0dXJuIHVuaXQgKyBcIi1cIiArIHN0YXRlICsgdW5pdFxuXG4gIGlmIChkYXRhID09PSBudWxsKSByZXR1cm4gdW5pdCArIFwiIFwiICsgc3RhdGUgKyB1bml0XG59XG5cblJhZGlzay5kZWNvZGUgPSAoZGF0YSwgb2JqKSA9PiB7XG4gIHZhciB0ZXh0ID0gXCJcIlxuICB2YXIgaSA9IC0xXG4gIHZhciBuID0gMFxuICB2YXIgY3VycmVudCA9IG51bGxcbiAgdmFyIHByZXZpb3VzID0gbnVsbFxuICBpZiAoZGF0YVswXSAhPT0gdW5pdCkgcmV0dXJuXG5cbiAgLy8gRmluZCBhIGNvbnRyb2wgY2hhcmFjdGVyIHByZXZpb3VzIHRvIHRoZSB0ZXh0IHdlIHdhbnQsIHNraXBwaW5nXG4gIC8vIGNvbnNlY3V0aXZlIHVuaXQgc2VwYXJhdG9yIGNoYXJhY3RlcnMgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgZGF0YS5cbiAgd2hpbGUgKChjdXJyZW50ID0gZGF0YVsrK2ldKSkge1xuICAgIGlmIChwcmV2aW91cykge1xuICAgICAgaWYgKGN1cnJlbnQgPT09IHVuaXQpIHtcbiAgICAgICAgaWYgKC0tbiA8PSAwKSBicmVha1xuICAgICAgfVxuICAgICAgdGV4dCArPSBjdXJyZW50XG4gICAgfSBlbHNlIGlmIChjdXJyZW50ID09PSB1bml0KSB7XG4gICAgICBuKytcbiAgICB9IGVsc2Uge1xuICAgICAgcHJldmlvdXMgPSBjdXJyZW50IHx8IHRydWVcbiAgICB9XG4gIH1cblxuICBpZiAob2JqKSBvYmouaSA9IGkgKyAxXG5cbiAgbGV0IFt2YWx1ZSwgc3RhdGVdID0gdGV4dC5zcGxpdChldHgpXG4gIGlmICghc3RhdGUpIHtcbiAgICBpZiAocHJldmlvdXMgPT09ICdcIicpIHJldHVybiB0ZXh0XG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiI1wiKSByZXR1cm4gdXRpbHMucmVsLmlmeSh0ZXh0KVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIitcIikge1xuICAgICAgaWYgKHRleHQubGVuZ3RoID09PSAwKSByZXR1cm4gdHJ1ZVxuXG4gICAgICByZXR1cm4gcGFyc2VGbG9hdCh0ZXh0KVxuICAgIH1cblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCItXCIpIHJldHVybiBmYWxzZVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIiBcIikgcmV0dXJuIG51bGxcbiAgfSBlbHNlIHtcbiAgICBzdGF0ZSA9IHBhcnNlRmxvYXQoc3RhdGUpXG4gICAgLy8gSWYgc3RhdGUgd2FzIGZvdW5kIHRoZW4gcmV0dXJuIGFuIGFycmF5LlxuICAgIGlmIChwcmV2aW91cyA9PT0gJ1wiJykgcmV0dXJuIFt2YWx1ZSwgc3RhdGVdXG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiI1wiKSByZXR1cm4gW3V0aWxzLnJlbC5pZnkodmFsdWUpLCBzdGF0ZV1cblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCIrXCIpIHtcbiAgICAgIGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHJldHVybiBbdHJ1ZSwgc3RhdGVdXG5cbiAgICAgIHJldHVybiBbcGFyc2VGbG9hdCh2YWx1ZSksIHN0YXRlXVxuICAgIH1cblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCItXCIpIHJldHVybiBbZmFsc2UsIHN0YXRlXVxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIiBcIikgcmV0dXJuIFtudWxsLCBzdGF0ZV1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFJhZGlza1xuIiwiY29uc3QgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKVxuXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIGdyb3VwIHNlcGFyYXRvci5cbmNvbnN0IGdyb3VwID0gU3RyaW5nLmZyb21DaGFyQ29kZSgyOSlcbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgcmVjb3JkIHNlcGFyYXRvci5cbmNvbnN0IHJlY29yZCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMzApXG5cbmNvbnN0IFJhZGl4ID0gKCkgPT4ge1xuICBjb25zdCByYWRpeCA9IChrZXlzLCB2YWx1ZSwgdHJlZSkgPT4ge1xuICAgIGlmICghdHJlZSkge1xuICAgICAgaWYgKCFyYWRpeFtncm91cF0pIHJhZGl4W2dyb3VwXSA9IHt9XG4gICAgICB0cmVlID0gcmFkaXhbZ3JvdXBdXG4gICAgfVxuICAgIGlmICgha2V5cykgcmV0dXJuIHRyZWVcblxuICAgIGxldCBpID0gMFxuICAgIGxldCB0bXAgPSB7fVxuICAgIGxldCBrZXkgPSBrZXlzW2ldXG4gICAgY29uc3QgbWF4ID0ga2V5cy5sZW5ndGggLSAxXG4gICAgY29uc3Qgbm9WYWx1ZSA9IHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIlxuICAgIC8vIEZpbmQgYSBtYXRjaGluZyB2YWx1ZSB1c2luZyB0aGUgc2hvcnRlc3Qgc3RyaW5nIGZyb20ga2V5cy5cbiAgICBsZXQgZm91bmQgPSB0cmVlW2tleV1cbiAgICB3aGlsZSAoIWZvdW5kICYmIGkgPCBtYXgpIHtcbiAgICAgIGtleSArPSBrZXlzWysraV1cbiAgICAgIGZvdW5kID0gdHJlZVtrZXldXG4gICAgfVxuXG4gICAgaWYgKCFmb3VuZCkge1xuICAgICAgLy8gSWYgbm90IGZvdW5kIGZyb20gdGhlIHByb3ZpZGVkIGtleXMgdHJ5IG1hdGNoaW5nIHdpdGggYW4gZXhpc3Rpbmcga2V5LlxuICAgICAgY29uc3QgcmVzdWx0ID0gdXRpbHMub2JqLm1hcCh0cmVlLCAoaGFzVmFsdWUsIGhhc0tleSkgPT4ge1xuICAgICAgICBsZXQgaiA9IDBcbiAgICAgICAgbGV0IG1hdGNoaW5nS2V5ID0gXCJcIlxuICAgICAgICB3aGlsZSAoaGFzS2V5W2pdID09PSBrZXlzW2pdKSB7XG4gICAgICAgICAgbWF0Y2hpbmdLZXkgKz0gaGFzS2V5W2orK11cbiAgICAgICAgfVxuICAgICAgICBpZiAobWF0Y2hpbmdLZXkpIHtcbiAgICAgICAgICBpZiAobm9WYWx1ZSkge1xuICAgICAgICAgICAgLy8gbWF0Y2hpbmdLZXkgaGFzIHRvIGJlIGFzIGxvbmcgYXMgdGhlIG9yaWdpbmFsIGtleXMgd2hlbiByZWFkaW5nLlxuICAgICAgICAgICAgaWYgKGogPD0gbWF4KSByZXR1cm5cblxuICAgICAgICAgICAgdG1wW2hhc0tleS5zbGljZShqKV0gPSBoYXNWYWx1ZVxuICAgICAgICAgICAgcmV0dXJuIGhhc1ZhbHVlXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IHJlcGxhY2UgPSB7XG4gICAgICAgICAgICBbaGFzS2V5LnNsaWNlKGopXTogaGFzVmFsdWUsXG4gICAgICAgICAgICBba2V5cy5zbGljZShqKV06IHtbcmVjb3JkXTogdmFsdWV9LFxuICAgICAgICAgIH1cbiAgICAgICAgICB0cmVlW21hdGNoaW5nS2V5XSA9IHtbZ3JvdXBdOiByZXBsYWNlfVxuICAgICAgICAgIGRlbGV0ZSB0cmVlW2hhc0tleV1cbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgaWYgKG5vVmFsdWUpIHJldHVyblxuXG4gICAgICAgIGlmICghdHJlZVtrZXldKSB0cmVlW2tleV0gPSB7fVxuICAgICAgICB0cmVlW2tleV1bcmVjb3JkXSA9IHZhbHVlXG4gICAgICB9IGVsc2UgaWYgKG5vVmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHRtcFxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaSA9PT0gbWF4KSB7XG4gICAgICAvLyBJZiBubyB2YWx1ZSB1c2UgdGhlIGtleSBwcm92aWRlZCB0byByZXR1cm4gYSB3aG9sZSBncm91cCBvciByZWNvcmQuXG4gICAgICBpZiAobm9WYWx1ZSkge1xuICAgICAgICAvLyBJZiBhbiBpbmRpdmlkdWFsIHJlY29yZCBpc24ndCBmb3VuZCB0aGVuIHJldHVybiB0aGUgd2hvbGUgZ3JvdXAuXG4gICAgICAgIHJldHVybiB0eXBlb2YgZm91bmRbcmVjb3JkXSA9PT0gXCJ1bmRlZmluZWRcIlxuICAgICAgICAgID8gZm91bmRbZ3JvdXBdXG4gICAgICAgICAgOiBmb3VuZFtyZWNvcmRdXG4gICAgICB9XG4gICAgICAvLyBPdGhlcndpc2UgY3JlYXRlIGEgbmV3IHJlY29yZCBhdCB0aGUgcHJvdmlkZWQga2V5IGZvciB2YWx1ZS5cbiAgICAgIGZvdW5kW3JlY29yZF0gPSB2YWx1ZVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGb3VuZCBhdCBhIHNob3J0ZXIga2V5LCB0cnkgYWdhaW4uXG4gICAgICBpZiAoIWZvdW5kW2dyb3VwXSAmJiAhbm9WYWx1ZSkgZm91bmRbZ3JvdXBdID0ge31cbiAgICAgIHJldHVybiByYWRpeChrZXlzLnNsaWNlKCsraSksIHZhbHVlLCBmb3VuZFtncm91cF0pXG4gICAgfVxuICB9XG4gIHJldHVybiByYWRpeFxufVxuXG5SYWRpeC5tYXAgPSBmdW5jdGlvbiBtYXAocmFkaXgsIGNiLCBvcHQsIHByZSkge1xuICBpZiAoIXByZSkgcHJlID0gW11cbiAgdmFyIHRyZWUgPSByYWRpeFtncm91cF0gfHwgcmFkaXhcbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh0cmVlKS5zb3J0KClcbiAgdmFyIHVcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICBsZXQga2V5ID0ga2V5c1tpXVxuICAgIGxldCBmb3VuZCA9IHRyZWVba2V5XVxuICAgIGxldCB0bXAgPSBmb3VuZFtyZWNvcmRdXG4gICAgaWYgKHR5cGVvZiB0bXAgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHRtcCA9IGNiKHRtcCwgcHJlLmpvaW4oXCJcIikgKyBrZXksIGtleSwgcHJlKVxuICAgICAgaWYgKHR5cGVvZiB0bXAgIT09IFwidW5kZWZpbmVkXCIpIHJldHVybiB0bXBcbiAgICB9IGVsc2UgaWYgKG9wdCkge1xuICAgICAgY2IodSwgcHJlLmpvaW4oXCJcIiksIGtleSwgcHJlKVxuICAgIH1cbiAgICBpZiAoZm91bmRbZ3JvdXBdKSB7XG4gICAgICBwcmUucHVzaChrZXkpXG4gICAgICB0bXAgPSBtYXAoZm91bmRbZ3JvdXBdLCBjYiwgb3B0LCBwcmUpXG4gICAgICBpZiAodHlwZW9mIHRtcCAhPT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIHRtcFxuICAgICAgcHJlLnBvcCgpXG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmFkaXhcbiIsImNvbnN0IGpzRW52ID0gcmVxdWlyZShcImJyb3dzZXItb3Itbm9kZVwiKVxuY29uc3QgUmFkaXNrID0gcmVxdWlyZShcIi4vcmFkaXNrXCIpXG5jb25zdCBSYWRpeCA9IHJlcXVpcmUoXCIuL3JhZGl4XCIpXG5jb25zdCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpXG5cbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgZW5xdWlyeS5cbmNvbnN0IGVucSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoNSlcbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgdW5pdCBzZXBhcmF0b3IuXG5jb25zdCB1bml0ID0gU3RyaW5nLmZyb21DaGFyQ29kZSgzMSlcblxuY29uc3QgZmlsZVN5c3RlbSA9IGRpciA9PiB7XG4gIGlmIChqc0Vudi5pc05vZGUpIHtcbiAgICBjb25zdCBmcyA9IHJlcXVpcmUoXCJmc1wiKVxuICAgIGlmICghZnMuZXhpc3RzU3luYyhkaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoZGlyKVxuICAgIH1cbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZGlyICsgXCIvIVwiKSkge1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhcbiAgICAgICAgZGlyICsgXCIvIVwiLFxuICAgICAgICB1bml0ICsgXCIrMFwiICsgdW5pdCArIFwiI1wiICsgdW5pdCArICdcInJvb3QnICsgdW5pdCxcbiAgICAgIClcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0OiAoZmlsZSwgY2IpID0+IHtcbiAgICAgICAgZnMucmVhZEZpbGUoZGlyICsgXCIvXCIgKyBmaWxlLCAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgaWYgKGVyci5jb2RlID09PSBcIkVOT0VOVFwiKSB7XG4gICAgICAgICAgICAgIGNiKClcbiAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiZmlsZXN5c3RlbSBlcnJvcjpcIiwgZXJyKVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZGF0YSkgZGF0YSA9IGRhdGEudG9TdHJpbmcoKVxuICAgICAgICAgIGNiKGVyciwgZGF0YSlcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBwdXQ6IChmaWxlLCBkYXRhLCBjYikgPT4ge1xuICAgICAgICB2YXIgcmFuZG9tID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoLTkpXG4gICAgICAgIC8vIERvbid0IHB1dCB0bXAgZmlsZXMgdW5kZXIgZGlyIHNvIHRoYXQgdGhleSdyZSBub3QgbGlzdGVkLlxuICAgICAgICB2YXIgdG1wID0gZmlsZSArIFwiLlwiICsgcmFuZG9tICsgXCIudG1wXCJcbiAgICAgICAgZnMud3JpdGVGaWxlKHRtcCwgZGF0YSwgZXJyID0+IHtcbiAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICBjYihlcnIpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBmcy5yZW5hbWUodG1wLCBkaXIgKyBcIi9cIiArIGZpbGUsIGNiKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIGxpc3Q6IGNiID0+IHtcbiAgICAgICAgZnMucmVhZGRpcihkaXIsIChlcnIsIGZpbGVzKSA9PiB7XG4gICAgICAgICAgZmlsZXMuZm9yRWFjaChjYilcbiAgICAgICAgICBjYigpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBpbmRleGVkREJcbiAgcmV0dXJuIHtcbiAgICBnZXQ6IChmaWxlLCBjYikgPT4ge1xuICAgICAgY2IobnVsbCwgdW5pdCArIFwiKzBcIiArIHVuaXQgKyBcIiNcIiArIHVuaXQgKyAnXCJyb290JyArIHVuaXQpXG4gICAgfSxcbiAgICBwdXQ6IChmaWxlLCBkYXRhLCBjYikgPT4ge1xuICAgICAgY2IobnVsbClcbiAgICB9LFxuICAgIGxpc3Q6IGNiID0+IHtcbiAgICAgIGNiKFwiIVwiKVxuICAgICAgY2IoKVxuICAgIH0sXG4gIH1cbn1cblxuLy8gU3RvcmUgcHJvdmlkZXMgZ2V0IGFuZCBwdXQgbWV0aG9kcyB0aGF0IGNhbiBhY2Nlc3MgcmFkaXNrLlxuY29uc3QgU3RvcmUgPSBvcHQgPT4ge1xuICBpZiAoIXV0aWxzLm9iai5pcyhvcHQpKSBvcHQgPSB7fVxuICBvcHQuZmlsZSA9IFN0cmluZyhvcHQuZmlsZSB8fCBcInJhZGF0YVwiKVxuICBpZiAoIW9wdC5zdG9yZSkgb3B0LnN0b3JlID0gZmlsZVN5c3RlbShvcHQuZmlsZSlcbiAgY29uc3QgcmFkaXNrID0gUmFkaXNrKG9wdClcblxuICByZXR1cm4ge1xuICAgIGdldDogKGxleCwgY2IpID0+IHtcbiAgICAgIGlmICghbGV4KSB7XG4gICAgICAgIGNiKFwibGV4IHJlcXVpcmVkXCIpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB2YXIgc291bCA9IGxleFtcIiNcIl1cbiAgICAgIHZhciBrZXkgPSBsZXhbXCIuXCJdIHx8IFwiXCJcbiAgICAgIHZhciBub2RlXG4gICAgICBjb25zdCBlYWNoID0gKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKCFub2RlKSBub2RlID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgbm9kZVtrZXldID0gdmFsdWVbMF1cbiAgICAgICAgbm9kZS5fW1wiPlwiXVtrZXldID0gdmFsdWVbMV1cbiAgICAgIH1cblxuICAgICAgcmFkaXNrKHNvdWwgKyBlbnEgKyBrZXksIChlcnIsIHZhbHVlKSA9PiB7XG4gICAgICAgIGxldCBncmFwaFxuICAgICAgICBpZiAodXRpbHMub2JqLmlzKHZhbHVlKSkge1xuICAgICAgICAgIFJhZGl4Lm1hcCh2YWx1ZSwgZWFjaClcbiAgICAgICAgICBpZiAoIW5vZGUpIGVhY2godmFsdWUsIGtleSlcbiAgICAgICAgICBncmFwaCA9IHtbc291bF06IG5vZGV9XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWUpIHtcbiAgICAgICAgICBlYWNoKHZhbHVlLCBrZXkpXG4gICAgICAgICAgZ3JhcGggPSB7W3NvdWxdOiBub2RlfVxuICAgICAgICB9XG4gICAgICAgIGNiKGVyciwgZ3JhcGgpXG4gICAgICB9KVxuICAgIH0sXG4gICAgcHV0OiAoZ3JhcGgsIGNiKSA9PiB7XG4gICAgICBpZiAoIWdyYXBoKSB7XG4gICAgICAgIGNiKFwiZ3JhcGggcmVxdWlyZWRcIilcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZhciBjb3VudCA9IDBcbiAgICAgIGNvbnN0IGFjayA9IGVyciA9PiB7XG4gICAgICAgIGNvdW50LS1cbiAgICAgICAgaWYgKGFjay5lcnIpIHJldHVyblxuXG4gICAgICAgIGFjay5lcnIgPSBlcnJcbiAgICAgICAgaWYgKGFjay5lcnIpIHtcbiAgICAgICAgICBjYihhY2suZXJyKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNvdW50ID09PSAwKSBjYihudWxsKVxuICAgICAgfVxuXG4gICAgICBPYmplY3Qua2V5cyhncmFwaCkuZm9yRWFjaChzb3VsID0+IHtcbiAgICAgICAgdmFyIG5vZGUgPSBncmFwaFtzb3VsXVxuICAgICAgICBPYmplY3Qua2V5cyhub2RlKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICAgICAgaWYgKGtleSA9PT0gXCJfXCIpIHJldHVyblxuXG4gICAgICAgICAgY291bnQrK1xuICAgICAgICAgIGxldCB2YWx1ZSA9IG5vZGVba2V5XVxuICAgICAgICAgIGxldCBzdGF0ZSA9IG5vZGUuX1tcIj5cIl1ba2V5XVxuICAgICAgICAgIHJhZGlzayhzb3VsICsgZW5xICsga2V5LCBbdmFsdWUsIHN0YXRlXSwgYWNrKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9LFxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gU3RvcmVcbiIsImNvbnN0IG51bSA9IHtcbiAgaXM6IG4gPT5cbiAgICAhKG4gaW5zdGFuY2VvZiBBcnJheSkgJiZcbiAgICAobiAtIHBhcnNlRmxvYXQobikgKyAxID49IDAgfHwgSW5maW5pdHkgPT09IG4gfHwgLUluZmluaXR5ID09PSBuKSxcbn1cblxuY29uc3Qgb2JqID0ge1xuICBpczogbyA9PiB7XG4gICAgaWYgKCFvKSByZXR1cm4gZmFsc2VcblxuICAgIHJldHVybiAoXG4gICAgICAobyBpbnN0YW5jZW9mIE9iamVjdCAmJiBvLmNvbnN0cnVjdG9yID09PSBPYmplY3QpIHx8XG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobykubWF0Y2goL15cXFtvYmplY3QgKFxcdyspXFxdJC8pWzFdID09PVxuICAgICAgICBcIk9iamVjdFwiXG4gICAgKVxuICB9LFxuICBtYXA6IChsaXN0LCBjYiwgbykgPT4ge1xuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMobGlzdClcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGxldCByZXN1bHQgPSBjYihsaXN0W2tleXNbaV1dLCBrZXlzW2ldLCBvKVxuICAgICAgaWYgKHR5cGVvZiByZXN1bHQgIT09IFwidW5kZWZpbmVkXCIpIHJldHVybiByZXN1bHRcbiAgICB9XG4gIH0sXG4gIHB1dDogKG8sIGtleSwgdmFsdWUpID0+IHtcbiAgICBpZiAoIW8pIG8gPSB7fVxuICAgIG9ba2V5XSA9IHZhbHVlXG4gICAgcmV0dXJuIG9cbiAgfSxcbiAgZGVsOiAobywga2V5KSA9PiB7XG4gICAgaWYgKCFvKSByZXR1cm5cblxuICAgIG9ba2V5XSA9IG51bGxcbiAgICBkZWxldGUgb1trZXldXG4gICAgcmV0dXJuIG9cbiAgfSxcbn1cblxuY29uc3QgbWFwX3NvdWwgPSAoc291bCwga2V5LCBvKSA9PiB7XG4gIC8vIElmIGlkIGlzIGFscmVhZHkgZGVmaW5lZCBBTkQgd2UncmUgc3RpbGwgbG9vcGluZyB0aHJvdWdoIHRoZSBvYmplY3QsXG4gIC8vIHRoZW4gaXQgaXMgY29uc2lkZXJlZCBpbnZhbGlkLlxuICBpZiAoby5pZCkge1xuICAgIG8uaWQgPSBmYWxzZVxuICAgIHJldHVyblxuICB9XG5cbiAgaWYgKGtleSA9PT0gXCIjXCIgJiYgdHlwZW9mIHNvdWwgPT09IFwic3RyaW5nXCIpIHtcbiAgICBvLmlkID0gc291bFxuICAgIHJldHVyblxuICB9XG5cbiAgLy8gSWYgdGhlcmUgZXhpc3RzIGFueXRoaW5nIGVsc2Ugb24gdGhlIG9iamVjdCB0aGF0IGlzbid0IHRoZSBzb3VsLFxuICAvLyB0aGVuIGl0IGlzIGNvbnNpZGVyZWQgaW52YWxpZC5cbiAgby5pZCA9IGZhbHNlXG59XG5cbi8vIENoZWNrIGlmIGFuIG9iamVjdCBpcyBhIHNvdWwgcmVsYXRpb24sIGllIHsnIyc6ICdVVUlEJ31cbmNvbnN0IHJlbCA9IHtcbiAgaXM6IHZhbHVlID0+IHtcbiAgICBpZiAodmFsdWUgJiYgdmFsdWVbXCIjXCJdICYmICF2YWx1ZS5fICYmIG9iai5pcyh2YWx1ZSkpIHtcbiAgICAgIGxldCBvID0ge31cbiAgICAgIG9iai5tYXAodmFsdWUsIG1hcF9zb3VsLCBvKVxuICAgICAgaWYgKG8uaWQpIHJldHVybiBvLmlkXG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlXG4gIH0sXG4gIC8vIENvbnZlcnQgYSBzb3VsIGludG8gYSByZWxhdGlvbiBhbmQgcmV0dXJuIGl0LlxuICBpZnk6IHNvdWwgPT4gb2JqLnB1dCh7fSwgXCIjXCIsIHNvdWwpLFxufVxuXG5jb25zdCB0ZXh0ID0ge1xuICByYW5kb206IGxlbmd0aCA9PiB7XG4gICAgdmFyIHMgPSBcIlwiXG4gICAgY29uc3QgYyA9IFwiMDEyMzQ1Njc4OUFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5elwiXG4gICAgaWYgKCFsZW5ndGgpIGxlbmd0aCA9IDI0XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgcyArPSBjLmNoYXJBdChNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBjLmxlbmd0aCkpXG4gICAgfVxuICAgIHJldHVybiBzXG4gIH0sXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge251bSwgb2JqLCByZWwsIHRleHR9XG4iLCJjb25zdCBqc0VudiA9IHJlcXVpcmUoXCJicm93c2VyLW9yLW5vZGVcIilcbmNvbnN0IER1cCA9IHJlcXVpcmUoXCIuL2R1cFwiKVxuY29uc3QgR2V0ID0gcmVxdWlyZShcIi4vZ2V0XCIpXG5jb25zdCBIYW0gPSByZXF1aXJlKFwiLi9oYW1cIilcbmNvbnN0IFN0b3JlID0gcmVxdWlyZShcIi4vc3RvcmVcIilcbmNvbnN0IHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIilcblxuLy8gV2lyZSBzdGFydHMgYSB3ZWJzb2NrZXQgY2xpZW50IG9yIHNlcnZlciBhbmQgcmV0dXJucyBnZXQgYW5kIHB1dCBtZXRob2RzXG4vLyBmb3IgYWNjZXNzIHRvIHRoZSB3aXJlIHNwZWMgYW5kIHN0b3JhZ2UuXG5jb25zdCBXaXJlID0gb3B0ID0+IHtcbiAgaWYgKCF1dGlscy5vYmouaXMob3B0KSkgb3B0ID0ge31cblxuICBjb25zdCBkdXAgPSBEdXAob3B0Lm1heEFnZSlcbiAgY29uc3Qgc3RvcmUgPSBTdG9yZShvcHQpXG4gIHZhciBncmFwaCA9IHt9XG4gIHZhciBxdWV1ZSA9IHt9XG5cbiAgY29uc3QgZ2V0ID0gKG1zZywgc2VuZCkgPT4ge1xuICAgIGNvbnN0IGFjayA9IEdldChtc2cuZ2V0LCBncmFwaClcbiAgICBpZiAoYWNrKSB7XG4gICAgICBzZW5kKFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgXCIjXCI6IGR1cC50cmFjayh1dGlscy50ZXh0LnJhbmRvbSg5KSksXG4gICAgICAgICAgXCJAXCI6IG1zZ1tcIiNcIl0sXG4gICAgICAgICAgcHV0OiBhY2ssXG4gICAgICAgIH0pLFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICBzdG9yZS5nZXQobXNnLmdldCwgKGVyciwgYWNrKSA9PiB7XG4gICAgICAgIHNlbmQoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgXCIjXCI6IGR1cC50cmFjayh1dGlscy50ZXh0LnJhbmRvbSg5KSksXG4gICAgICAgICAgICBcIkBcIjogbXNnW1wiI1wiXSxcbiAgICAgICAgICAgIHB1dDogYWNrLFxuICAgICAgICAgICAgZXJyOiBlcnIsXG4gICAgICAgICAgfSksXG4gICAgICAgIClcbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgY29uc3QgcHV0ID0gKG1zZywgc2VuZCkgPT4ge1xuICAgIC8vIFN0b3JlIHVwZGF0ZXMgcmV0dXJuZWQgZnJvbSBIYW0ubWl4IGFuZCBkZWZlciB1cGRhdGVzIGlmIHJlcXVpcmVkLlxuICAgIGNvbnN0IHVwZGF0ZSA9IEhhbS5taXgobXNnLnB1dCwgZ3JhcGgpXG4gICAgc3RvcmUucHV0KHVwZGF0ZS5ub3csIGVyciA9PiB7XG4gICAgICBzZW5kKFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgXCIjXCI6IGR1cC50cmFjayh1dGlscy50ZXh0LnJhbmRvbSg5KSksXG4gICAgICAgICAgXCJAXCI6IG1zZ1tcIiNcIl0sXG4gICAgICAgICAgZXJyOiBlcnIsXG4gICAgICAgIH0pLFxuICAgICAgKVxuICAgIH0pXG4gICAgaWYgKHVwZGF0ZS53YWl0ICE9PSAwKSB7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHB1dCh7cHV0OiB1cGRhdGUuZGVmZXJ9LCBzZW5kKSwgdXBkYXRlLndhaXQpXG4gICAgfVxuICB9XG5cbiAgY29uc3QgYXBpID0gc2VuZCA9PiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGdldDogKGxleCwgY2IsIG9wdCkgPT4ge1xuICAgICAgICBpZiAoIWNiKSByZXR1cm5cblxuICAgICAgICBpZiAoIXV0aWxzLm9iai5pcyhvcHQpKSBvcHQgPSB7fVxuICAgICAgICBjb25zdCBhY2sgPSBHZXQobGV4LCBncmFwaClcbiAgICAgICAgaWYgKGFjaykge1xuICAgICAgICAgIGNiKHtwdXQ6IGFja30pXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBzdG9yZS5nZXQobGV4LCAoZXJyLCBhY2spID0+IHtcbiAgICAgICAgICBpZiAoYWNrKSB7XG4gICAgICAgICAgICBjYih7cHV0OiBhY2ssIGVycjogZXJyfSlcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChlcnIpIGNvbnNvbGUubG9nKGVycilcblxuICAgICAgICAgIGNvbnN0IHRyYWNrID0gdXRpbHMudGV4dC5yYW5kb20oOSlcbiAgICAgICAgICBxdWV1ZVt0cmFja10gPSBjYlxuICAgICAgICAgIHNlbmQoXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgIFwiI1wiOiBkdXAudHJhY2sodHJhY2spLFxuICAgICAgICAgICAgICBnZXQ6IGxleCxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIClcbiAgICAgICAgICAvLyBSZXNwb25kIHRvIGNhbGxiYWNrIHdpdGggbnVsbCBpZiBubyByZXNwb25zZS5cbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNiID0gcXVldWVbdHJhY2tdXG4gICAgICAgICAgICBpZiAoY2IpIHtcbiAgICAgICAgICAgICAgY29uc3QgaWQgPSBsZXhbXCIjXCJdXG4gICAgICAgICAgICAgIGNvbnN0IGFjayA9IHtbaWRdOiBudWxsfVxuICAgICAgICAgICAgICBpZiAobGV4W1wiLlwiXSkgYWNrW2lkXSA9IHtbbGV4W1wiLlwiXV06IG51bGx9XG4gICAgICAgICAgICAgIGNiKHtwdXQ6IGFja30pXG4gICAgICAgICAgICAgIGRlbGV0ZSBxdWV1ZVt0cmFja11cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LCBvcHQud2FpdCB8fCAxMDApXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcHV0OiAoZGF0YSwgY2IpID0+IHtcbiAgICAgICAgLy8gRGVmZXJyZWQgdXBkYXRlcyBhcmUgb25seSBzdG9yZWQgdXNpbmcgd2lyZSBzcGVjLCB0aGV5J3JlIGlnbm9yZWRcbiAgICAgICAgLy8gaGVyZSB1c2luZyB0aGUgYXBpLiBUaGlzIGlzIG9rIGJlY2F1c2UgY29ycmVjdCB0aW1lc3RhbXBzIHNob3VsZCBiZVxuICAgICAgICAvLyB1c2VkIHdoZXJlYXMgd2lyZSBzcGVjIG5lZWRzIHRvIGhhbmRsZSBjbG9jayBza2V3LlxuICAgICAgICBjb25zdCB1cGRhdGUgPSBIYW0ubWl4KGRhdGEsIGdyYXBoKVxuICAgICAgICBzdG9yZS5wdXQodXBkYXRlLm5vdywgY2IpXG4gICAgICAgIC8vIEFsc28gcHV0IGRhdGEgb24gdGhlIHdpcmUgc3BlYy5cbiAgICAgICAgLy8gVE9ETzogTm90ZSB0aGF0IHRoaXMgbWVhbnMgYWxsIGNsaWVudHMgbm93IHJlY2VpdmUgYWxsIHVwZGF0ZXMsIHNvXG4gICAgICAgIC8vIG5lZWQgdG8gZmlsdGVyIHdoYXQgc2hvdWxkIGJlIHN0b3JlZCwgYm90aCBpbiBncmFwaCBhbmQgb24gZGlzay5cbiAgICAgICAgc2VuZChcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKHV0aWxzLnRleHQucmFuZG9tKDkpKSxcbiAgICAgICAgICAgIHB1dDogZGF0YSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKVxuICAgICAgfSxcbiAgICB9XG4gIH1cblxuICBpZiAoanNFbnYuaXNOb2RlKSB7XG4gICAgY29uc3QgV2ViU29ja2V0ID0gcmVxdWlyZShcIndzXCIpXG4gICAgbGV0IHdzcyA9IG9wdC53c3NcbiAgICAvLyBOb2RlJ3Mgd2Vic29ja2V0IHNlcnZlciBwcm92aWRlcyBjbGllbnRzIGFzIGFuIGFycmF5LCB3aGVyZWFzXG4gICAgLy8gbW9jay1zb2NrZXRzIHByb3ZpZGVzIGNsaWVudHMgYXMgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gYXJyYXkuXG4gICAgbGV0IGNsaWVudHMgPSAoKSA9PiB3c3MuY2xpZW50cygpXG4gICAgaWYgKCF3c3MpIHtcbiAgICAgIHdzcyA9IG5ldyBXZWJTb2NrZXQuU2VydmVyKHtwb3J0OiA4MDgwfSlcbiAgICAgIGNsaWVudHMgPSAoKSA9PiB3c3MuY2xpZW50c1xuICAgIH1cblxuICAgIGNvbnN0IHNlbmQgPSAoZGF0YSwgaXNCaW5hcnkpID0+IHtcbiAgICAgIGNsaWVudHMoKS5mb3JFYWNoKGNsaWVudCA9PiB7XG4gICAgICAgIGlmIChjbGllbnQucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4pIHtcbiAgICAgICAgICBjbGllbnQuc2VuZChkYXRhLCB7YmluYXJ5OiBpc0JpbmFyeX0pXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICAgIHdzcy5vbihcImNvbm5lY3Rpb25cIiwgd3MgPT4ge1xuICAgICAgd3Mub24oXCJlcnJvclwiLCBjb25zb2xlLmVycm9yKVxuXG4gICAgICB3cy5vbihcIm1lc3NhZ2VcIiwgKGRhdGEsIGlzQmluYXJ5KSA9PiB7XG4gICAgICAgIGNvbnN0IG1zZyA9IEpTT04ucGFyc2UoZGF0YSlcbiAgICAgICAgaWYgKGR1cC5jaGVjayhtc2dbXCIjXCJdKSkgcmV0dXJuXG5cbiAgICAgICAgZHVwLnRyYWNrKG1zZ1tcIiNcIl0pXG4gICAgICAgIGlmIChtc2cuZ2V0KSBnZXQobXNnLCBzZW5kKVxuICAgICAgICBpZiAobXNnLnB1dCkgcHV0KG1zZywgc2VuZClcbiAgICAgICAgc2VuZChkYXRhLCBpc0JpbmFyeSlcblxuICAgICAgICBjb25zdCBpZCA9IG1zZ1tcIkBcIl1cbiAgICAgICAgY29uc3QgY2IgPSBxdWV1ZVtpZF1cbiAgICAgICAgaWYgKGNiKSB7XG4gICAgICAgICAgZGVsZXRlIG1zZ1tcIiNcIl1cbiAgICAgICAgICBkZWxldGUgbXNnW1wiQFwiXVxuICAgICAgICAgIGNiKG1zZylcblxuICAgICAgICAgIGRlbGV0ZSBxdWV1ZVtpZF1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KVxuICAgIHJldHVybiBhcGkoc2VuZClcbiAgfVxuXG4gIGxldCB3cyA9IG5ldyBXZWJTb2NrZXQoXCJ3czovL2xvY2FsaG9zdDo4MDgwXCIpXG4gIGNvbnN0IHNlbmQgPSBkYXRhID0+IHtcbiAgICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSB7XG4gICAgICBjb25zb2xlLmxvZyhcIndlYnNvY2tldCBub3QgYXZhaWxhYmxlXCIpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB3cy5zZW5kKGRhdGEpXG4gIH1cbiAgY29uc3Qgc3RhcnQgPSAoKSA9PiB7XG4gICAgaWYgKCF3cykgd3MgPSBuZXcgV2ViU29ja2V0KFwid3M6Ly9sb2NhbGhvc3Q6ODA4MFwiKVxuICAgIHdzLm9uY2xvc2UgPSBjID0+IHtcbiAgICAgIHdzID0gbnVsbFxuICAgICAgc2V0VGltZW91dChzdGFydCwgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogNTAwMCkpXG4gICAgfVxuICAgIHdzLm9uZXJyb3IgPSBlID0+IHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSlcbiAgICB9XG4gICAgd3Mub25tZXNzYWdlID0gbSA9PiB7XG4gICAgICBjb25zdCBtc2cgPSBKU09OLnBhcnNlKG0uZGF0YSlcbiAgICAgIGlmIChkdXAuY2hlY2sobXNnW1wiI1wiXSkpIHJldHVyblxuXG4gICAgICBkdXAudHJhY2sobXNnW1wiI1wiXSlcbiAgICAgIGlmIChtc2cuZ2V0KSBnZXQobXNnLCBzZW5kKVxuICAgICAgaWYgKG1zZy5wdXQpIHB1dChtc2csIHNlbmQpXG4gICAgICBzZW5kKG0uZGF0YSlcblxuICAgICAgY29uc3QgaWQgPSBtc2dbXCJAXCJdXG4gICAgICBjb25zdCBjYiA9IHF1ZXVlW2lkXVxuICAgICAgaWYgKGNiKSB7XG4gICAgICAgIGRlbGV0ZSBtc2dbXCIjXCJdXG4gICAgICAgIGRlbGV0ZSBtc2dbXCJAXCJdXG4gICAgICAgIGNiKG1zZylcblxuICAgICAgICBkZWxldGUgcXVldWVbaWRdXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhcnQoKVxuICByZXR1cm4gYXBpKHNlbmQpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gV2lyZVxuIiwiLyogKGlnbm9yZWQpICovIiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXShtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIiIsIi8vIHN0YXJ0dXBcbi8vIExvYWQgZW50cnkgbW9kdWxlIGFuZCByZXR1cm4gZXhwb3J0c1xuLy8gVGhpcyBlbnRyeSBtb2R1bGUgaXMgcmVmZXJlbmNlZCBieSBvdGhlciBtb2R1bGVzIHNvIGl0IGNhbid0IGJlIGlubGluZWRcbnZhciBfX3dlYnBhY2tfZXhwb3J0c19fID0gX193ZWJwYWNrX3JlcXVpcmVfXyhcIi4vc3JjL2hvbHN0ZXIuanNcIik7XG4iLCIiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=
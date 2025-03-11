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

const Dup = () => {
  const maxAge = 9000
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

Dup.random = () => {
  return Math.random().toString(36).slice(-9)
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

const jsEnv = __webpack_require__(/*! browser-or-node */ "./node_modules/browser-or-node/dist/index.js")
const Dup = __webpack_require__(/*! ./dup */ "./src/dup.js")
const Get = __webpack_require__(/*! ./get */ "./src/get.js")
const Ham = __webpack_require__(/*! ./ham */ "./src/ham.js")
const Store = __webpack_require__(/*! ./store */ "./src/store.js")

const Holster = opt => {
  const dup = Dup()
  const store = Store(opt)
  var graph = {}
  var queue = {}

  const get = (msg, send) => {
    const ack = Get(msg.get, graph)
    if (ack) {
      send(
        JSON.stringify({
          "#": dup.track(Dup.random()),
          "@": msg["#"],
          put: ack,
        }),
      )
    } else {
      store.get(msg.get, (err, ack) => {
        send(
          JSON.stringify({
            "#": dup.track(Dup.random()),
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
    store.put(update.now, (err, ok) => {
      send(
        JSON.stringify({
          "#": dup.track(Dup.random()),
          "@": msg["#"],
          err: err,
          ok: ok,
        }),
      )
    })
    if (update.wait !== 0) {
      setTimeout(() => put(update.defer, send), update.wait)
    }
  }

  const api = send => {
    return {
      get: (lex, cb) => {
        const ack = Get(lex, graph)
        if (ack) {
          cb(null, ack)
          return
        }

        store.get(lex, (err, ack) => {
          if (ack) {
            cb(null, ack)
            return
          }

          const track = Dup.random()
          queue[track] = cb
          send(
            JSON.stringify({
              "#": dup.track(track),
              get: lex,
            }),
          )
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
            "#": dup.track(Dup.random()),
            put: data,
          }),
        )
      },
    }
  }

  if (jsEnv.isNode) {
    const WebSocket = __webpack_require__(/*! ws */ "./node_modules/ws/browser.js")
    const wss = new WebSocket.Server({port: 8080})
    const send = (data, isBinary) => {
      wss.clients.forEach(client => {
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
        if ((cb = queue[msg["@"]])) {
          cb(null, msg)
          delete queue[msg["@"]]
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
      if ((cb = queue[msg["@"]])) {
        cb(null, msg)
        delete queue[msg["@"]]
      }
      send(m.data)
    }
  }

  start()
  return api(send)
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

// ASCII character for unit separator.
const unit = String.fromCharCode(31)
// ASCII character for end of text.
const etx = String.fromCharCode(3)

const Radisk = opt => {
  var u
  var cache = null

  if (!opt) opt = {}
  if (!opt.log) opt.log = console.log
  if (!opt.batch) opt.batch = 10 * 1000
  if (!opt.wait) opt.wait = 1
  if (!opt.size) opt.size = 1024 * 1024 // 1MB
  if (!opt.code) opt.code = "!" // The first printable character
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

  /*
		Any and all storage adapters should...
		1. Because writing to disk takes time, we should batch data to disk.
       This improves performance, and reduces potential disk corruption.
		2. If a batch exceeds a certain number of writes, we should immediately
       write to disk when physically possible. This caps total performance,
       but reduces potential loss.
	*/
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
    radisk.save(batch, (err, ok) => {
      // This is to ignore multiple callbacks from radisk.save calling
      // radisk.write? It looks like multiple callbacks will be made if a
      // file needs to be split.
      if (++i > 1) return

      if (err) opt.log(err)
      batch.acks.forEach(cb => cb(err, ok))
      radisk.thrash.at = null
      radisk.thrash.ing = false
      if (radisk.thrash.more) radisk.thrash()
    })
  }

  /*
		1. Find the first radix item in memory
		2. Use that as the starting index in the directory of files
		3. Find the first file that is lexically larger than it
		4. Read the previous file into memory
		5. Scan through in memory radix for all values lexically less than the limit
		6. Merge and write all of those to the in-memory file and back to disk
		7. If file is to large then split. More details needed here
	*/
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
          save.mix(save.file || opt.code, save.start, save.end)
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
      next: (err, ok) => {
        if (err) return cb(err)

        if (save.start) return Radix.map(rad, save.find)

        cb(err, ok)
      },
    }
    Radix.map(rad, save.find)
  }

  /*
		Any storage engine at some point will have to do a read in order to write.
		This is true of even systems that use an append only log, if they support
    updates. Therefore it is unavoidable that a read will have to happen, the
		question is just how long you delay it.
	*/
  radisk.write = (file, rad, cb) => {
    // Invalidate cache on write.
    cache = null
    const write = {
      text: "",
      count: 0,
      file: file,
      each: (value, key, k, pre) => {
        // Remove values that have been set to null from the file.
        if (value === null) return

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
          let end = key.indexOf(".")
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
    let end = key.indexOf(".")
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

  /*
		Let us start by assuming we are the only process that is
		changing the directory or bucket. Not because we do not want
		to be multi-process/machine, but because we want to experiment
		with how much performance and scale we can get out of only one.
		Then we can work on the harder problem of being multi-process.
	*/
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

  let tmp = null
  if ((tmp = utils.rel.is(data))) {
    return unit + "#" + tmp + state + unit
  }

  if (utils.num.is(data)) return unit + "+" + (data || 0) + state + unit

  if (data === true) return unit + "+" + state + unit

  if (data === false) return unit + "-" + state + unit
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

const fileSystem = dir => {
  if (jsEnv.isNode) {
    const fs = __webpack_require__(/*! fs */ "?569f")
    if (!fs.existsSync(dir)) fs.mkdirSync(dir)

    return {
      get: (file, cb) => {
        fs.readFile(dir + "/" + file, (err, data) => {
          if (err) {
            if (err.code === "ENOENT") {
              cb()
              return
            }

            console.log("ERROR:", err)
          }
          if (data) data = data.toString()
          cb(err, data)
        })
      },
      put: (file, data, cb) => {
        var random = Math.random().toString(36).slice(-9)
        // Don't put tmp files under dir so that they're not listed.
        var tmp = file + "." + random + ".tmp"
        fs.writeFile(tmp, data, (err, ok) => {
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
    get: (file, cb) => cb(),
    put: (file, data, cb) => cb(),
    list: cb => cb(),
  }
}

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

      radisk(soul + "." + key, (err, value) => {
        let graph
        if (value) {
          Radix.map(value, each)
          if (!node) each(value, key)
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
      const ack = (err, ok) => {
        count--
        if (ack.err) return

        if ((ack.err = err)) {
          cb(err || "ERROR!")
          return
        }

        if (count > 0) return

        cb(ack.err, 1)
      }

      Object.keys(graph).forEach(soul => {
        var node = graph[soul]
        Object.keys(node).forEach(key => {
          if ("_" === key) return

          count++
          let value = node[key]
          let state = node._[">"][key]
          radisk(soul + "." + key, [value, state], ack)
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

module.exports = {num, obj, rel}


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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QUFDTDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLFdBQVc7QUFDWDtBQUNBLFNBQVM7QUFDVCxPQUFPO0FBQ1A7QUFDQTs7QUFFQTs7QUFFQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxZQUFZO0FBQ1o7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTTtBQUNOO0FBQ0EsTUFBTTtBQUNOO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0EsSUFBSTtBQUNKO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBOzs7Ozs7Ozs7OztBQzNiQSxjQUFjLG1CQUFPLENBQUMsK0JBQVM7O0FBRS9CO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0EsOEJBQThCLGdCQUFnQjtBQUM5QztBQUNBLCtCQUErQjtBQUMvQjtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTs7QUFFQTtBQUNBO0FBQ0EsUUFBUTtBQUNSO0FBQ0E7QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTTtBQUNOO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsa0JBQWtCLGlCQUFpQjtBQUNuQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7Ozs7Ozs7Ozs7O0FDekdBLGNBQWMsbUJBQU8sQ0FBQyxxRUFBaUI7QUFDdkMsZUFBZSxtQkFBTyxDQUFDLGlDQUFVO0FBQ2pDLGNBQWMsbUJBQU8sQ0FBQywrQkFBUztBQUMvQixjQUFjLG1CQUFPLENBQUMsK0JBQVM7O0FBRS9CO0FBQ0E7QUFDQSxlQUFlLG1CQUFPLENBQUMsaUJBQUk7QUFDM0I7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVM7QUFDVCxPQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsU0FBUztBQUNULE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVM7QUFDVCxPQUFPO0FBQ1A7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLDJCQUEyQixJQUFJO0FBQy9CO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsbUJBQW1CO0FBQ25CO0FBQ0E7QUFDQSxPQUFPO0FBQ1AsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVM7QUFDVCxPQUFPO0FBQ1AsS0FBSztBQUNMO0FBQ0E7O0FBRUE7Ozs7Ozs7Ozs7O0FDM0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxHQUFHO0FBQ0g7QUFDQTtBQUNBLG9CQUFvQixpQkFBaUI7QUFDckM7QUFDQTtBQUNBO0FBQ0EsR0FBRztBQUNIO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsR0FBRztBQUNIO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsR0FBRztBQUNIOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLDhDQUE4QztBQUM5QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLEdBQUc7QUFDSDtBQUNBLHlCQUF5QjtBQUN6Qjs7QUFFQSxrQkFBa0I7Ozs7Ozs7Ozs7O0FDdEVsQjs7Ozs7O1VDQUE7VUFDQTs7VUFFQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTs7VUFFQTtVQUNBOztVQUVBO1VBQ0E7VUFDQTs7OztVRXRCQTtVQUNBO1VBQ0E7VUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL0hvbHN0ZXIvLi9ub2RlX21vZHVsZXMvYnJvd3Nlci1vci1ub2RlL2Rpc3QvaW5kZXguanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL25vZGVfbW9kdWxlcy93cy9icm93c2VyLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvZHVwLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvZ2V0LmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvaGFtLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvaG9sc3Rlci5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL3JhZGlzay5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL3JhZGl4LmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvc3RvcmUuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy91dGlscy5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyL2lnbm9yZWR8L2hvbWUvbWFsL3dvcmsvaG9sc3Rlci9zcmN8ZnMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly9Ib2xzdGVyL3dlYnBhY2svYmVmb3JlLXN0YXJ0dXAiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL3N0YXJ0dXAiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL2FmdGVyLXN0YXJ0dXAiXSwic291cmNlc0NvbnRlbnQiOlsidmFyIF9fZGVmUHJvcCA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbnZhciBfX2dldE93blByb3BEZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcjtcbnZhciBfX2dldE93blByb3BOYW1lcyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzO1xudmFyIF9faGFzT3duUHJvcCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG52YXIgX19leHBvcnQgPSAodGFyZ2V0LCBhbGwpID0+IHtcbiAgZm9yICh2YXIgbmFtZSBpbiBhbGwpXG4gICAgX19kZWZQcm9wKHRhcmdldCwgbmFtZSwgeyBnZXQ6IGFsbFtuYW1lXSwgZW51bWVyYWJsZTogdHJ1ZSB9KTtcbn07XG52YXIgX19jb3B5UHJvcHMgPSAodG8sIGZyb20sIGV4Y2VwdCwgZGVzYykgPT4ge1xuICBpZiAoZnJvbSAmJiB0eXBlb2YgZnJvbSA9PT0gXCJvYmplY3RcIiB8fCB0eXBlb2YgZnJvbSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgZm9yIChsZXQga2V5IG9mIF9fZ2V0T3duUHJvcE5hbWVzKGZyb20pKVxuICAgICAgaWYgKCFfX2hhc093blByb3AuY2FsbCh0bywga2V5KSAmJiBrZXkgIT09IGV4Y2VwdClcbiAgICAgICAgX19kZWZQcm9wKHRvLCBrZXksIHsgZ2V0OiAoKSA9PiBmcm9tW2tleV0sIGVudW1lcmFibGU6ICEoZGVzYyA9IF9fZ2V0T3duUHJvcERlc2MoZnJvbSwga2V5KSkgfHwgZGVzYy5lbnVtZXJhYmxlIH0pO1xuICB9XG4gIHJldHVybiB0bztcbn07XG52YXIgX190b0NvbW1vbkpTID0gKG1vZCkgPT4gX19jb3B5UHJvcHMoX19kZWZQcm9wKHt9LCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KSwgbW9kKTtcblxuLy8gc3JjL2luZGV4LnRzXG52YXIgc3JjX2V4cG9ydHMgPSB7fTtcbl9fZXhwb3J0KHNyY19leHBvcnRzLCB7XG4gIGlzQnJvd3NlcjogKCkgPT4gaXNCcm93c2VyLFxuICBpc0J1bjogKCkgPT4gaXNCdW4sXG4gIGlzRGVubzogKCkgPT4gaXNEZW5vLFxuICBpc0pzRG9tOiAoKSA9PiBpc0pzRG9tLFxuICBpc05vZGU6ICgpID0+IGlzTm9kZSxcbiAgaXNXZWJXb3JrZXI6ICgpID0+IGlzV2ViV29ya2VyXG59KTtcbm1vZHVsZS5leHBvcnRzID0gX190b0NvbW1vbkpTKHNyY19leHBvcnRzKTtcbnZhciBpc0Jyb3dzZXIgPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiB3aW5kb3cuZG9jdW1lbnQgIT09IFwidW5kZWZpbmVkXCI7XG52YXIgaXNOb2RlID0gKFxuICAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgcHJvY2Vzcy52ZXJzaW9ucyAhPSBudWxsICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgcHJvY2Vzcy52ZXJzaW9ucy5ub2RlICE9IG51bGxcbik7XG52YXIgaXNXZWJXb3JrZXIgPSB0eXBlb2Ygc2VsZiA9PT0gXCJvYmplY3RcIiAmJiBzZWxmLmNvbnN0cnVjdG9yICYmIHNlbGYuY29uc3RydWN0b3IubmFtZSA9PT0gXCJEZWRpY2F0ZWRXb3JrZXJHbG9iYWxTY29wZVwiO1xudmFyIGlzSnNEb20gPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIHdpbmRvdy5uYW1lID09PSBcIm5vZGVqc1wiIHx8IHR5cGVvZiBuYXZpZ2F0b3IgIT09IFwidW5kZWZpbmVkXCIgJiYgXCJ1c2VyQWdlbnRcIiBpbiBuYXZpZ2F0b3IgJiYgdHlwZW9mIG5hdmlnYXRvci51c2VyQWdlbnQgPT09IFwic3RyaW5nXCIgJiYgKG5hdmlnYXRvci51c2VyQWdlbnQuaW5jbHVkZXMoXCJOb2RlLmpzXCIpIHx8IG5hdmlnYXRvci51c2VyQWdlbnQuaW5jbHVkZXMoXCJqc2RvbVwiKSk7XG52YXIgaXNEZW5vID0gKFxuICAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBEZW5vICE9PSBcInVuZGVmaW5lZFwiICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgdHlwZW9mIERlbm8udmVyc2lvbiAhPT0gXCJ1bmRlZmluZWRcIiAmJiAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBEZW5vLnZlcnNpb24uZGVubyAhPT0gXCJ1bmRlZmluZWRcIlxuKTtcbnZhciBpc0J1biA9IHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIHByb2Nlc3MudmVyc2lvbnMgIT0gbnVsbCAmJiBwcm9jZXNzLnZlcnNpb25zLmJ1biAhPSBudWxsO1xuLy8gQW5ub3RhdGUgdGhlIENvbW1vbkpTIGV4cG9ydCBuYW1lcyBmb3IgRVNNIGltcG9ydCBpbiBub2RlOlxuMCAmJiAobW9kdWxlLmV4cG9ydHMgPSB7XG4gIGlzQnJvd3NlcixcbiAgaXNCdW4sXG4gIGlzRGVubyxcbiAgaXNKc0RvbSxcbiAgaXNOb2RlLFxuICBpc1dlYldvcmtlclxufSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ3dzIGRvZXMgbm90IHdvcmsgaW4gdGhlIGJyb3dzZXIuIEJyb3dzZXIgY2xpZW50cyBtdXN0IHVzZSB0aGUgbmF0aXZlICcgK1xuICAgICAgJ1dlYlNvY2tldCBvYmplY3QnXG4gICk7XG59O1xuIiwiY29uc3QgRHVwID0gKCkgPT4ge1xuICBjb25zdCBtYXhBZ2UgPSA5MDAwXG4gIGNvbnN0IGR1cCA9IHtzdG9yZToge319XG4gIGR1cC5jaGVjayA9IGlkID0+IChkdXAuc3RvcmVbaWRdID8gZHVwLnRyYWNrKGlkKSA6IGZhbHNlKVxuICBkdXAudHJhY2sgPSBpZCA9PiB7XG4gICAgLy8gS2VlcCB0aGUgbGl2ZWxpbmVzcyBvZiB0aGUgbWVzc2FnZSB1cCB3aGlsZSBpdCBpcyBiZWluZyByZWNlaXZlZC5cbiAgICBkdXAuc3RvcmVbaWRdID0gRGF0ZS5ub3coKVxuICAgIGlmICghZHVwLmV4cGlyeSkge1xuICAgICAgZHVwLmV4cGlyeSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpXG4gICAgICAgIE9iamVjdC5rZXlzKGR1cC5zdG9yZSkuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgaWYgKG5vdyAtIGR1cC5zdG9yZVtpZF0gPiBtYXhBZ2UpIGRlbGV0ZSBkdXAuc3RvcmVbaWRdXG4gICAgICAgIH0pXG4gICAgICAgIGR1cC5leHBpcnkgPSBudWxsXG4gICAgICB9LCBtYXhBZ2UpXG4gICAgfVxuICAgIHJldHVybiBpZFxuICB9XG4gIHJldHVybiBkdXBcbn1cblxuRHVwLnJhbmRvbSA9ICgpID0+IHtcbiAgcmV0dXJuIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKC05KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IER1cFxuIiwiY29uc3QgR2V0ID0gKGxleCwgZ3JhcGgpID0+IHtcbiAgY29uc3Qgc291bCA9IGxleFtcIiNcIl1cbiAgY29uc3Qga2V5ID0gbGV4W1wiLlwiXVxuICB2YXIgbm9kZSA9IGdyYXBoW3NvdWxdXG5cbiAgLy8gQ2FuIG9ubHkgcmV0dXJuIGEgbm9kZSBpZiBhIGtleSBpcyBwcm92aWRlZCwgYmVjYXVzZSB0aGUgZ3JhcGggbWF5IG5vdFxuICAvLyBoYXZlIGFsbCB0aGUga2V5cyBwb3B1bGF0ZWQgZm9yIGEgZ2l2ZW4gc291bC4gVGhpcyBpcyBiZWNhdXNlIEhhbS5taXhcbiAgLy8gb25seSBhZGRzIGluY29taW5nIGNoYW5nZXMgdG8gdGhlIGdyYXBoLlxuICBpZiAoIW5vZGUgfHwgIWtleSkgcmV0dXJuXG5cbiAgbGV0IHZhbHVlID0gbm9kZVtrZXldXG4gIGlmICghdmFsdWUpIHJldHVyblxuXG4gIG5vZGUgPSB7Xzogbm9kZS5fLCBba2V5XTogdmFsdWV9XG4gIG5vZGUuX1tcIj5cIl0gPSB7W2tleV06IG5vZGUuX1tcIj5cIl1ba2V5XX1cbiAgcmV0dXJuIHtbc291bF06IG5vZGV9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gR2V0XG4iLCIvLyBzdGF0ZSBhbmQgdmFsdWUgYXJlIHRoZSBpbmNvbWluZyBjaGFuZ2VzLlxuLy8gY3VycmVudFN0YXRlIGFuZCBjdXJyZW50VmFsdWUgYXJlIHRoZSBjdXJyZW50IGdyYXBoIGRhdGEuXG5jb25zdCBIYW0gPSAoc3RhdGUsIGN1cnJlbnRTdGF0ZSwgdmFsdWUsIGN1cnJlbnRWYWx1ZSkgPT4ge1xuICBpZiAoc3RhdGUgPCBjdXJyZW50U3RhdGUpIHJldHVybiB7aGlzdG9yaWNhbDogdHJ1ZX1cblxuICBpZiAoc3RhdGUgPiBjdXJyZW50U3RhdGUpIHJldHVybiB7aW5jb21pbmc6IHRydWV9XG5cbiAgLy8gc3RhdGUgaXMgZXF1YWwgdG8gY3VycmVudFN0YXRlLCBsZXhpY2FsbHkgY29tcGFyZSB0byByZXNvbHZlIGNvbmZsaWN0LlxuICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInN0cmluZ1wiKSB7XG4gICAgdmFsdWUgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSkgfHwgXCJcIlxuICB9XG4gIGlmICh0eXBlb2YgY3VycmVudFZhbHVlICE9PSBcInN0cmluZ1wiKSB7XG4gICAgY3VycmVudFZhbHVlID0gSlNPTi5zdHJpbmdpZnkoY3VycmVudFZhbHVlKSB8fCBcIlwiXG4gIH1cbiAgLy8gTm8gdXBkYXRlIHJlcXVpcmVkLlxuICBpZiAodmFsdWUgPT09IGN1cnJlbnRWYWx1ZSkgcmV0dXJuIHtzdGF0ZTogdHJ1ZX1cblxuICAvLyBLZWVwIHRoZSBjdXJyZW50IHZhbHVlLlxuICBpZiAodmFsdWUgPCBjdXJyZW50VmFsdWUpIHJldHVybiB7Y3VycmVudDogdHJ1ZX1cblxuICAvLyBPdGhlcndpc2UgdXBkYXRlIHVzaW5nIHRoZSBpbmNvbWluZyB2YWx1ZS5cbiAgcmV0dXJuIHtpbmNvbWluZzogdHJ1ZX1cbn1cblxuSGFtLm1peCA9IChjaGFuZ2UsIGdyYXBoKSA9PiB7XG4gIHZhciBtYWNoaW5lID0gRGF0ZS5ub3coKVxuICB2YXIgdXBkYXRlID0ge31cbiAgdmFyIGRlZmVyID0ge31cbiAgbGV0IHdhaXQgPSAwXG5cbiAgT2JqZWN0LmtleXMoY2hhbmdlKS5mb3JFYWNoKHNvdWwgPT4ge1xuICAgIGNvbnN0IG5vZGUgPSBjaGFuZ2Vbc291bF1cbiAgICBPYmplY3Qua2V5cyhub2RlKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09PSBcIl9cIikgcmV0dXJuXG5cbiAgICAgIGNvbnN0IHZhbHVlID0gbm9kZVtrZXldXG4gICAgICBjb25zdCBzdGF0ZSA9IG5vZGUuX1tcIj5cIl1ba2V5XVxuICAgICAgY29uc3QgY3VycmVudFZhbHVlID0gKGdyYXBoW3NvdWxdIHx8IHt9KVtrZXldXG4gICAgICBjb25zdCBjdXJyZW50U3RhdGUgPSAoZ3JhcGhbc291bF0gfHwge186IHtcIj5cIjoge319fSkuX1tcIj5cIl1ba2V5XSB8fCAwXG5cbiAgICAgIC8vIERlZmVyIHRoZSB1cGRhdGUgaWYgYWhlYWQgb2YgbWFjaGluZSB0aW1lLlxuICAgICAgY29uc3Qgc2tldyA9IHN0YXRlIC0gbWFjaGluZVxuICAgICAgaWYgKHNrZXcgPiAwKSB7XG4gICAgICAgIC8vIElnbm9yZSB1cGRhdGUgaWYgYWhlYWQgYnkgbW9yZSB0aGFuIDI0IGhvdXJzLlxuICAgICAgICBpZiAoc2tldyA+IDg2NDAwMDAwKSByZXR1cm5cblxuICAgICAgICAvLyBXYWl0IHRoZSBzaG9ydGVzdCBkaWZmZXJlbmNlIGJlZm9yZSB0cnlpbmcgdGhlIHVwZGF0ZXMgYWdhaW4uXG4gICAgICAgIGlmICh3YWl0ID09PSAwIHx8IHNrZXcgPCB3YWl0KSB3YWl0ID0gc2tld1xuICAgICAgICBpZiAoIWRlZmVyW3NvdWxdKSBkZWZlcltzb3VsXSA9IHtfOiB7XCIjXCI6IHNvdWwsIFwiPlwiOiB7fX19XG4gICAgICAgIGRlZmVyW3NvdWxdW2tleV0gPSB2YWx1ZVxuICAgICAgICBkZWZlcltzb3VsXS5fW1wiPlwiXVtrZXldID0gc3RhdGVcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IEhhbShzdGF0ZSwgY3VycmVudFN0YXRlLCB2YWx1ZSwgY3VycmVudFZhbHVlKVxuICAgICAgICBpZiAocmVzdWx0LmluY29taW5nKSB7XG4gICAgICAgICAgaWYgKCF1cGRhdGVbc291bF0pIHVwZGF0ZVtzb3VsXSA9IHtfOiB7XCIjXCI6IHNvdWwsIFwiPlwiOiB7fX19XG4gICAgICAgICAgLy8gVE9ETzogZ3JhcGggc2hvdWxkIG5vdCBqdXN0IGdyb3cgaW5kZWZpbnRpdGVseSBpbiBtZW1vcnkuXG4gICAgICAgICAgLy8gTmVlZCB0byBoYXZlIGEgbWF4IHNpemUgYWZ0ZXIgd2hpY2ggc3RhcnQgZHJvcHBpbmcgdGhlIG9sZGVzdCBzdGF0ZVxuICAgICAgICAgIC8vIERvIHNvbWV0aGluZyBzaW1pbGFyIHRvIER1cCB3aGljaCBjYW4gaGFuZGxlIGRlbGV0ZXM/XG4gICAgICAgICAgaWYgKCFncmFwaFtzb3VsXSkgZ3JhcGhbc291bF0gPSB7Xzoge1wiI1wiOiBzb3VsLCBcIj5cIjoge319fVxuICAgICAgICAgIGdyYXBoW3NvdWxdW2tleV0gPSB1cGRhdGVbc291bF1ba2V5XSA9IHZhbHVlXG4gICAgICAgICAgZ3JhcGhbc291bF0uX1tcIj5cIl1ba2V5XSA9IHVwZGF0ZVtzb3VsXS5fW1wiPlwiXVtrZXldID0gc3RhdGVcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gIH0pXG4gIHJldHVybiB7bm93OiB1cGRhdGUsIGRlZmVyOiBkZWZlciwgd2FpdDogd2FpdH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBIYW1cbiIsImNvbnN0IGpzRW52ID0gcmVxdWlyZShcImJyb3dzZXItb3Itbm9kZVwiKVxuY29uc3QgRHVwID0gcmVxdWlyZShcIi4vZHVwXCIpXG5jb25zdCBHZXQgPSByZXF1aXJlKFwiLi9nZXRcIilcbmNvbnN0IEhhbSA9IHJlcXVpcmUoXCIuL2hhbVwiKVxuY29uc3QgU3RvcmUgPSByZXF1aXJlKFwiLi9zdG9yZVwiKVxuXG5jb25zdCBIb2xzdGVyID0gb3B0ID0+IHtcbiAgY29uc3QgZHVwID0gRHVwKClcbiAgY29uc3Qgc3RvcmUgPSBTdG9yZShvcHQpXG4gIHZhciBncmFwaCA9IHt9XG4gIHZhciBxdWV1ZSA9IHt9XG5cbiAgY29uc3QgZ2V0ID0gKG1zZywgc2VuZCkgPT4ge1xuICAgIGNvbnN0IGFjayA9IEdldChtc2cuZ2V0LCBncmFwaClcbiAgICBpZiAoYWNrKSB7XG4gICAgICBzZW5kKFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgXCIjXCI6IGR1cC50cmFjayhEdXAucmFuZG9tKCkpLFxuICAgICAgICAgIFwiQFwiOiBtc2dbXCIjXCJdLFxuICAgICAgICAgIHB1dDogYWNrLFxuICAgICAgICB9KSxcbiAgICAgIClcbiAgICB9IGVsc2Uge1xuICAgICAgc3RvcmUuZ2V0KG1zZy5nZXQsIChlcnIsIGFjaykgPT4ge1xuICAgICAgICBzZW5kKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIFwiI1wiOiBkdXAudHJhY2soRHVwLnJhbmRvbSgpKSxcbiAgICAgICAgICAgIFwiQFwiOiBtc2dbXCIjXCJdLFxuICAgICAgICAgICAgcHV0OiBhY2ssXG4gICAgICAgICAgICBlcnI6IGVycixcbiAgICAgICAgICB9KSxcbiAgICAgICAgKVxuICAgICAgfSlcbiAgICB9XG4gIH1cblxuICBjb25zdCBwdXQgPSAobXNnLCBzZW5kKSA9PiB7XG4gICAgLy8gU3RvcmUgdXBkYXRlcyByZXR1cm5lZCBmcm9tIEhhbS5taXggYW5kIGRlZmVyIHVwZGF0ZXMgaWYgcmVxdWlyZWQuXG4gICAgY29uc3QgdXBkYXRlID0gSGFtLm1peChtc2cucHV0LCBncmFwaClcbiAgICBzdG9yZS5wdXQodXBkYXRlLm5vdywgKGVyciwgb2spID0+IHtcbiAgICAgIHNlbmQoXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKER1cC5yYW5kb20oKSksXG4gICAgICAgICAgXCJAXCI6IG1zZ1tcIiNcIl0sXG4gICAgICAgICAgZXJyOiBlcnIsXG4gICAgICAgICAgb2s6IG9rLFxuICAgICAgICB9KSxcbiAgICAgIClcbiAgICB9KVxuICAgIGlmICh1cGRhdGUud2FpdCAhPT0gMCkge1xuICAgICAgc2V0VGltZW91dCgoKSA9PiBwdXQodXBkYXRlLmRlZmVyLCBzZW5kKSwgdXBkYXRlLndhaXQpXG4gICAgfVxuICB9XG5cbiAgY29uc3QgYXBpID0gc2VuZCA9PiB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGdldDogKGxleCwgY2IpID0+IHtcbiAgICAgICAgY29uc3QgYWNrID0gR2V0KGxleCwgZ3JhcGgpXG4gICAgICAgIGlmIChhY2spIHtcbiAgICAgICAgICBjYihudWxsLCBhY2spXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICBzdG9yZS5nZXQobGV4LCAoZXJyLCBhY2spID0+IHtcbiAgICAgICAgICBpZiAoYWNrKSB7XG4gICAgICAgICAgICBjYihudWxsLCBhY2spXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCB0cmFjayA9IER1cC5yYW5kb20oKVxuICAgICAgICAgIHF1ZXVlW3RyYWNrXSA9IGNiXG4gICAgICAgICAgc2VuZChcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgXCIjXCI6IGR1cC50cmFjayh0cmFjayksXG4gICAgICAgICAgICAgIGdldDogbGV4LFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHB1dDogKGRhdGEsIGNiKSA9PiB7XG4gICAgICAgIC8vIERlZmVycmVkIHVwZGF0ZXMgYXJlIG9ubHkgc3RvcmVkIHVzaW5nIHdpcmUgc3BlYywgdGhleSdyZSBpZ25vcmVkXG4gICAgICAgIC8vIGhlcmUgdXNpbmcgdGhlIGFwaS4gVGhpcyBpcyBvayBiZWNhdXNlIGNvcnJlY3QgdGltZXN0YW1wcyBzaG91bGQgYmVcbiAgICAgICAgLy8gdXNlZCB3aGVyZWFzIHdpcmUgc3BlYyBuZWVkcyB0byBoYW5kbGUgY2xvY2sgc2tldy5cbiAgICAgICAgY29uc3QgdXBkYXRlID0gSGFtLm1peChkYXRhLCBncmFwaClcbiAgICAgICAgc3RvcmUucHV0KHVwZGF0ZS5ub3csIGNiKVxuICAgICAgICAvLyBBbHNvIHB1dCBkYXRhIG9uIHRoZSB3aXJlIHNwZWMuXG4gICAgICAgIC8vIFRPRE86IE5vdGUgdGhhdCB0aGlzIG1lYW5zIGFsbCBjbGllbnRzIG5vdyByZWNlaXZlIGFsbCB1cGRhdGVzLCBzb1xuICAgICAgICAvLyBuZWVkIHRvIGZpbHRlciB3aGF0IHNob3VsZCBiZSBzdG9yZWQsIGJvdGggaW4gZ3JhcGggYW5kIG9uIGRpc2suXG4gICAgICAgIHNlbmQoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgXCIjXCI6IGR1cC50cmFjayhEdXAucmFuZG9tKCkpLFxuICAgICAgICAgICAgcHV0OiBkYXRhLFxuICAgICAgICAgIH0pLFxuICAgICAgICApXG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIGlmIChqc0Vudi5pc05vZGUpIHtcbiAgICBjb25zdCBXZWJTb2NrZXQgPSByZXF1aXJlKFwid3NcIilcbiAgICBjb25zdCB3c3MgPSBuZXcgV2ViU29ja2V0LlNlcnZlcih7cG9ydDogODA4MH0pXG4gICAgY29uc3Qgc2VuZCA9IChkYXRhLCBpc0JpbmFyeSkgPT4ge1xuICAgICAgd3NzLmNsaWVudHMuZm9yRWFjaChjbGllbnQgPT4ge1xuICAgICAgICBpZiAoY2xpZW50LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG4gICAgICAgICAgY2xpZW50LnNlbmQoZGF0YSwge2JpbmFyeTogaXNCaW5hcnl9KVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cbiAgICB3c3Mub24oXCJjb25uZWN0aW9uXCIsIHdzID0+IHtcbiAgICAgIHdzLm9uKFwiZXJyb3JcIiwgY29uc29sZS5lcnJvcilcblxuICAgICAgd3Mub24oXCJtZXNzYWdlXCIsIChkYXRhLCBpc0JpbmFyeSkgPT4ge1xuICAgICAgICBjb25zdCBtc2cgPSBKU09OLnBhcnNlKGRhdGEpXG4gICAgICAgIGlmIChkdXAuY2hlY2sobXNnW1wiI1wiXSkpIHJldHVyblxuXG4gICAgICAgIGR1cC50cmFjayhtc2dbXCIjXCJdKVxuICAgICAgICBpZiAobXNnLmdldCkgZ2V0KG1zZywgc2VuZClcbiAgICAgICAgaWYgKG1zZy5wdXQpIHB1dChtc2csIHNlbmQpXG4gICAgICAgIHNlbmQoZGF0YSwgaXNCaW5hcnkpXG4gICAgICAgIGlmICgoY2IgPSBxdWV1ZVttc2dbXCJAXCJdXSkpIHtcbiAgICAgICAgICBjYihudWxsLCBtc2cpXG4gICAgICAgICAgZGVsZXRlIHF1ZXVlW21zZ1tcIkBcIl1dXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSlcbiAgICByZXR1cm4gYXBpKHNlbmQpXG4gIH1cblxuICBsZXQgd3MgPSBuZXcgV2ViU29ja2V0KFwid3M6Ly9sb2NhbGhvc3Q6ODA4MFwiKVxuICBjb25zdCBzZW5kID0gZGF0YSA9PiB7XG4gICAgaWYgKCF3cyB8fCB3cy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikge1xuICAgICAgY29uc29sZS5sb2coXCJ3ZWJzb2NrZXQgbm90IGF2YWlsYWJsZVwiKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgd3Muc2VuZChkYXRhKVxuICB9XG4gIGNvbnN0IHN0YXJ0ID0gKCkgPT4ge1xuICAgIGlmICghd3MpIHdzID0gbmV3IFdlYlNvY2tldChcIndzOi8vbG9jYWxob3N0OjgwODBcIilcbiAgICB3cy5vbmNsb3NlID0gYyA9PiB7XG4gICAgICB3cyA9IG51bGxcbiAgICAgIHNldFRpbWVvdXQoc3RhcnQsIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDUwMDApKVxuICAgIH1cbiAgICB3cy5vbmVycm9yID0gZSA9PiB7XG4gICAgICBjb25zb2xlLmVycm9yKGUpXG4gICAgfVxuICAgIHdzLm9ubWVzc2FnZSA9IG0gPT4ge1xuICAgICAgY29uc3QgbXNnID0gSlNPTi5wYXJzZShtLmRhdGEpXG4gICAgICBpZiAoZHVwLmNoZWNrKG1zZ1tcIiNcIl0pKSByZXR1cm5cblxuICAgICAgZHVwLnRyYWNrKG1zZ1tcIiNcIl0pXG4gICAgICBpZiAobXNnLmdldCkgZ2V0KG1zZywgc2VuZClcbiAgICAgIGlmIChtc2cucHV0KSBwdXQobXNnLCBzZW5kKVxuICAgICAgaWYgKChjYiA9IHF1ZXVlW21zZ1tcIkBcIl1dKSkge1xuICAgICAgICBjYihudWxsLCBtc2cpXG4gICAgICAgIGRlbGV0ZSBxdWV1ZVttc2dbXCJAXCJdXVxuICAgICAgfVxuICAgICAgc2VuZChtLmRhdGEpXG4gICAgfVxuICB9XG5cbiAgc3RhcnQoKVxuICByZXR1cm4gYXBpKHNlbmQpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gSG9sc3RlclxuIiwiY29uc3QgUmFkaXggPSByZXF1aXJlKFwiLi9yYWRpeFwiKVxuY29uc3QgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKVxuXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIHVuaXQgc2VwYXJhdG9yLlxuY29uc3QgdW5pdCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMzEpXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIGVuZCBvZiB0ZXh0LlxuY29uc3QgZXR4ID0gU3RyaW5nLmZyb21DaGFyQ29kZSgzKVxuXG5jb25zdCBSYWRpc2sgPSBvcHQgPT4ge1xuICB2YXIgdVxuICB2YXIgY2FjaGUgPSBudWxsXG5cbiAgaWYgKCFvcHQpIG9wdCA9IHt9XG4gIGlmICghb3B0LmxvZykgb3B0LmxvZyA9IGNvbnNvbGUubG9nXG4gIGlmICghb3B0LmJhdGNoKSBvcHQuYmF0Y2ggPSAxMCAqIDEwMDBcbiAgaWYgKCFvcHQud2FpdCkgb3B0LndhaXQgPSAxXG4gIGlmICghb3B0LnNpemUpIG9wdC5zaXplID0gMTAyNCAqIDEwMjQgLy8gMU1CXG4gIGlmICghb3B0LmNvZGUpIG9wdC5jb2RlID0gXCIhXCIgLy8gVGhlIGZpcnN0IHByaW50YWJsZSBjaGFyYWN0ZXJcbiAgaWYgKCFvcHQuc3RvcmUpIHtcbiAgICBvcHQubG9nKFxuICAgICAgXCJSYWRpc2sgbmVlZHMgYHN0b3JlYCBpbnRlcmZhY2Ugd2l0aCBge2dldDogZm4sIHB1dDogZm4sIGxpc3Q6IGZufWBcIixcbiAgICApXG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKCFvcHQuc3RvcmUuZ2V0KSB7XG4gICAgb3B0LmxvZyhcIlJhZGlzayBuZWVkcyBgc3RvcmUuZ2V0YCBpbnRlcmZhY2Ugd2l0aCBgKGZpbGUsIGNiKWBcIilcbiAgICByZXR1cm5cbiAgfVxuICBpZiAoIW9wdC5zdG9yZS5wdXQpIHtcbiAgICBvcHQubG9nKFwiUmFkaXNrIG5lZWRzIGBzdG9yZS5wdXRgIGludGVyZmFjZSB3aXRoIGAoZmlsZSwgZGF0YSwgY2IpYFwiKVxuICAgIHJldHVyblxuICB9XG4gIGlmICghb3B0LnN0b3JlLmxpc3QpIHtcbiAgICBvcHQubG9nKFwiUmFkaXNrIG5lZWRzIGEgc3RyZWFtaW5nIGBzdG9yZS5saXN0YCBpbnRlcmZhY2Ugd2l0aCBgKGNiKWBcIilcbiAgICByZXR1cm5cbiAgfVxuXG4gIC8qXG5cdFx0QW55IGFuZCBhbGwgc3RvcmFnZSBhZGFwdGVycyBzaG91bGQuLi5cblx0XHQxLiBCZWNhdXNlIHdyaXRpbmcgdG8gZGlzayB0YWtlcyB0aW1lLCB3ZSBzaG91bGQgYmF0Y2ggZGF0YSB0byBkaXNrLlxuICAgICAgIFRoaXMgaW1wcm92ZXMgcGVyZm9ybWFuY2UsIGFuZCByZWR1Y2VzIHBvdGVudGlhbCBkaXNrIGNvcnJ1cHRpb24uXG5cdFx0Mi4gSWYgYSBiYXRjaCBleGNlZWRzIGEgY2VydGFpbiBudW1iZXIgb2Ygd3JpdGVzLCB3ZSBzaG91bGQgaW1tZWRpYXRlbHlcbiAgICAgICB3cml0ZSB0byBkaXNrIHdoZW4gcGh5c2ljYWxseSBwb3NzaWJsZS4gVGhpcyBjYXBzIHRvdGFsIHBlcmZvcm1hbmNlLFxuICAgICAgIGJ1dCByZWR1Y2VzIHBvdGVudGlhbCBsb3NzLlxuXHQqL1xuICBjb25zdCByYWRpc2sgPSAoa2V5LCB2YWx1ZSwgY2IpID0+IHtcbiAgICBrZXkgPSBcIlwiICsga2V5XG5cbiAgICAvLyBJZiBubyB2YWx1ZSBpcyBwcm92aWRlZCB0aGVuIHRoZSBzZWNvbmQgcGFyYW1ldGVyIGlzIHRoZSBjYWxsYmFja1xuICAgIC8vIGZ1bmN0aW9uLiBSZWFkIHZhbHVlIGZyb20gbWVtb3J5IG9yIGRpc2sgYW5kIGNhbGwgY2FsbGJhY2sgd2l0aCBpdC5cbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIGNiID0gdmFsdWVcbiAgICAgIHZhbHVlID0gcmFkaXNrLmJhdGNoKGtleSlcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgcmV0dXJuIGNiKHUsIHZhbHVlKVxuICAgICAgfVxuXG4gICAgICBpZiAocmFkaXNrLnRocmFzaC5hdCkge1xuICAgICAgICB2YWx1ZSA9IHJhZGlzay50aHJhc2guYXQoa2V5KVxuICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgcmV0dXJuIGNiKHUsIHZhbHVlKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByYWRpc2sucmVhZChrZXksIGNiKVxuICAgIH1cblxuICAgIC8vIE90aGVyd2lzZSBzdG9yZSB0aGUgdmFsdWUgcHJvdmlkZWQuXG4gICAgcmFkaXNrLmJhdGNoKGtleSwgdmFsdWUpXG4gICAgaWYgKGNiKSB7XG4gICAgICByYWRpc2suYmF0Y2guYWNrcy5wdXNoKGNiKVxuICAgIH1cbiAgICAvLyBEb24ndCB3YWl0IGlmIHdlIGhhdmUgYmF0Y2hlZCB0b28gbWFueS5cbiAgICBpZiAoKytyYWRpc2suYmF0Y2guZWQgPj0gb3B0LmJhdGNoKSB7XG4gICAgICByZXR1cm4gcmFkaXNrLnRocmFzaCgpXG4gICAgfVxuXG4gICAgLy8gT3RoZXJ3aXNlIHdhaXQgZm9yIG1vcmUgdXBkYXRlcyBiZWZvcmUgd3JpdGluZy5cbiAgICBjbGVhclRpbWVvdXQocmFkaXNrLmJhdGNoLnRpbWVvdXQpXG4gICAgcmFkaXNrLmJhdGNoLnRpbWVvdXQgPSBzZXRUaW1lb3V0KHJhZGlzay50aHJhc2gsIG9wdC53YWl0KVxuICB9XG5cbiAgcmFkaXNrLmJhdGNoID0gUmFkaXgoKVxuICByYWRpc2suYmF0Y2guYWNrcyA9IFtdXG4gIHJhZGlzay5iYXRjaC5lZCA9IDBcblxuICByYWRpc2sudGhyYXNoID0gKCkgPT4ge1xuICAgIGlmIChyYWRpc2sudGhyYXNoLmluZykge1xuICAgICAgcmV0dXJuIChyYWRpc2sudGhyYXNoLm1vcmUgPSB0cnVlKVxuICAgIH1cblxuICAgIGNsZWFyVGltZW91dChyYWRpc2suYmF0Y2gudGltZW91dClcbiAgICByYWRpc2sudGhyYXNoLm1vcmUgPSBmYWxzZVxuICAgIHJhZGlzay50aHJhc2guaW5nID0gdHJ1ZVxuICAgIHZhciBiYXRjaCA9IChyYWRpc2sudGhyYXNoLmF0ID0gcmFkaXNrLmJhdGNoKVxuICAgIHJhZGlzay5iYXRjaCA9IG51bGxcbiAgICByYWRpc2suYmF0Y2ggPSBSYWRpeCgpXG4gICAgcmFkaXNrLmJhdGNoLmFja3MgPSBbXVxuICAgIHJhZGlzay5iYXRjaC5lZCA9IDBcbiAgICBsZXQgaSA9IDBcbiAgICByYWRpc2suc2F2ZShiYXRjaCwgKGVyciwgb2spID0+IHtcbiAgICAgIC8vIFRoaXMgaXMgdG8gaWdub3JlIG11bHRpcGxlIGNhbGxiYWNrcyBmcm9tIHJhZGlzay5zYXZlIGNhbGxpbmdcbiAgICAgIC8vIHJhZGlzay53cml0ZT8gSXQgbG9va3MgbGlrZSBtdWx0aXBsZSBjYWxsYmFja3Mgd2lsbCBiZSBtYWRlIGlmIGFcbiAgICAgIC8vIGZpbGUgbmVlZHMgdG8gYmUgc3BsaXQuXG4gICAgICBpZiAoKytpID4gMSkgcmV0dXJuXG5cbiAgICAgIGlmIChlcnIpIG9wdC5sb2coZXJyKVxuICAgICAgYmF0Y2guYWNrcy5mb3JFYWNoKGNiID0+IGNiKGVyciwgb2spKVxuICAgICAgcmFkaXNrLnRocmFzaC5hdCA9IG51bGxcbiAgICAgIHJhZGlzay50aHJhc2guaW5nID0gZmFsc2VcbiAgICAgIGlmIChyYWRpc2sudGhyYXNoLm1vcmUpIHJhZGlzay50aHJhc2goKVxuICAgIH0pXG4gIH1cblxuICAvKlxuXHRcdDEuIEZpbmQgdGhlIGZpcnN0IHJhZGl4IGl0ZW0gaW4gbWVtb3J5XG5cdFx0Mi4gVXNlIHRoYXQgYXMgdGhlIHN0YXJ0aW5nIGluZGV4IGluIHRoZSBkaXJlY3Rvcnkgb2YgZmlsZXNcblx0XHQzLiBGaW5kIHRoZSBmaXJzdCBmaWxlIHRoYXQgaXMgbGV4aWNhbGx5IGxhcmdlciB0aGFuIGl0XG5cdFx0NC4gUmVhZCB0aGUgcHJldmlvdXMgZmlsZSBpbnRvIG1lbW9yeVxuXHRcdDUuIFNjYW4gdGhyb3VnaCBpbiBtZW1vcnkgcmFkaXggZm9yIGFsbCB2YWx1ZXMgbGV4aWNhbGx5IGxlc3MgdGhhbiB0aGUgbGltaXRcblx0XHQ2LiBNZXJnZSBhbmQgd3JpdGUgYWxsIG9mIHRob3NlIHRvIHRoZSBpbi1tZW1vcnkgZmlsZSBhbmQgYmFjayB0byBkaXNrXG5cdFx0Ny4gSWYgZmlsZSBpcyB0byBsYXJnZSB0aGVuIHNwbGl0LiBNb3JlIGRldGFpbHMgbmVlZGVkIGhlcmVcblx0Ki9cbiAgcmFkaXNrLnNhdmUgPSAocmFkLCBjYikgPT4ge1xuICAgIGNvbnN0IHNhdmUgPSB7XG4gICAgICBmaW5kOiAodHJlZSwga2V5KSA9PiB7XG4gICAgICAgIC8vIFRoaXMgaXMgZmFsc2UgZm9yIGFueSBrZXkgdW50aWwgc2F2ZS5zdGFydCBpcyBzZXQgdG8gYW4gaW5pdGlhbCBrZXkuXG4gICAgICAgIGlmIChrZXkgPCBzYXZlLnN0YXJ0KSByZXR1cm5cblxuICAgICAgICBzYXZlLnN0YXJ0ID0ga2V5XG4gICAgICAgIG9wdC5zdG9yZS5saXN0KHNhdmUubGV4KVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfSxcbiAgICAgIGxleDogZmlsZSA9PiB7XG4gICAgICAgIGlmICghZmlsZSB8fCBmaWxlID4gc2F2ZS5zdGFydCkge1xuICAgICAgICAgIHNhdmUuZW5kID0gZmlsZVxuICAgICAgICAgIHNhdmUubWl4KHNhdmUuZmlsZSB8fCBvcHQuY29kZSwgc2F2ZS5zdGFydCwgc2F2ZS5lbmQpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHNhdmUuZmlsZSA9IGZpbGVcbiAgICAgIH0sXG4gICAgICBtaXg6IChmaWxlLCBzdGFydCwgZW5kKSA9PiB7XG4gICAgICAgIHNhdmUuc3RhcnQgPSBzYXZlLmVuZCA9IHNhdmUuZmlsZSA9IHVcbiAgICAgICAgcmFkaXNrLnBhcnNlKGZpbGUsIChlcnIsIGRpc2spID0+IHtcbiAgICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuXG4gICAgICAgICAgUmFkaXgubWFwKHJhZCwgKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgIGlmIChrZXkgPCBzdGFydCkgcmV0dXJuXG5cbiAgICAgICAgICAgIGlmIChlbmQgJiYgZW5kIDwga2V5KSB7XG4gICAgICAgICAgICAgIHNhdmUuc3RhcnQgPSBrZXlcbiAgICAgICAgICAgICAgcmV0dXJuIHNhdmUuc3RhcnRcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZGlzayhrZXksIHZhbHVlKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgcmFkaXNrLndyaXRlKGZpbGUsIGRpc2ssIHNhdmUubmV4dClcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBuZXh0OiAoZXJyLCBvaykgPT4ge1xuICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2IoZXJyKVxuXG4gICAgICAgIGlmIChzYXZlLnN0YXJ0KSByZXR1cm4gUmFkaXgubWFwKHJhZCwgc2F2ZS5maW5kKVxuXG4gICAgICAgIGNiKGVyciwgb2spXG4gICAgICB9LFxuICAgIH1cbiAgICBSYWRpeC5tYXAocmFkLCBzYXZlLmZpbmQpXG4gIH1cblxuICAvKlxuXHRcdEFueSBzdG9yYWdlIGVuZ2luZSBhdCBzb21lIHBvaW50IHdpbGwgaGF2ZSB0byBkbyBhIHJlYWQgaW4gb3JkZXIgdG8gd3JpdGUuXG5cdFx0VGhpcyBpcyB0cnVlIG9mIGV2ZW4gc3lzdGVtcyB0aGF0IHVzZSBhbiBhcHBlbmQgb25seSBsb2csIGlmIHRoZXkgc3VwcG9ydFxuICAgIHVwZGF0ZXMuIFRoZXJlZm9yZSBpdCBpcyB1bmF2b2lkYWJsZSB0aGF0IGEgcmVhZCB3aWxsIGhhdmUgdG8gaGFwcGVuLCB0aGVcblx0XHRxdWVzdGlvbiBpcyBqdXN0IGhvdyBsb25nIHlvdSBkZWxheSBpdC5cblx0Ki9cbiAgcmFkaXNrLndyaXRlID0gKGZpbGUsIHJhZCwgY2IpID0+IHtcbiAgICAvLyBJbnZhbGlkYXRlIGNhY2hlIG9uIHdyaXRlLlxuICAgIGNhY2hlID0gbnVsbFxuICAgIGNvbnN0IHdyaXRlID0ge1xuICAgICAgdGV4dDogXCJcIixcbiAgICAgIGNvdW50OiAwLFxuICAgICAgZmlsZTogZmlsZSxcbiAgICAgIGVhY2g6ICh2YWx1ZSwga2V5LCBrLCBwcmUpID0+IHtcbiAgICAgICAgLy8gUmVtb3ZlIHZhbHVlcyB0aGF0IGhhdmUgYmVlbiBzZXQgdG8gbnVsbCBmcm9tIHRoZSBmaWxlLlxuICAgICAgICBpZiAodmFsdWUgPT09IG51bGwpIHJldHVyblxuXG4gICAgICAgIHdyaXRlLmNvdW50KytcbiAgICAgICAgdmFyIGVuYyA9XG4gICAgICAgICAgUmFkaXNrLmVuY29kZShwcmUubGVuZ3RoKSArXG4gICAgICAgICAgXCIjXCIgK1xuICAgICAgICAgIFJhZGlzay5lbmNvZGUoaykgK1xuICAgICAgICAgICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIgPyBcIlwiIDogXCI9XCIgKyBSYWRpc2suZW5jb2RlKHZhbHVlKSkgK1xuICAgICAgICAgIFwiXFxuXCJcbiAgICAgICAgLy8gQ2Fubm90IHNwbGl0IHRoZSBmaWxlIGlmIG9ubHkgaGF2ZSBvbmUgZW50cnkgdG8gd3JpdGUuXG4gICAgICAgIGlmICh3cml0ZS5jb3VudCA+IDEgJiYgd3JpdGUudGV4dC5sZW5ndGggKyBlbmMubGVuZ3RoID4gb3B0LnNpemUpIHtcbiAgICAgICAgICB3cml0ZS50ZXh0ID0gXCJcIlxuICAgICAgICAgIC8vIE90aGVyd2lzZSBzcGxpdCB0aGUgZW50cmllcyBpbiBoYWxmLlxuICAgICAgICAgIHdyaXRlLmxpbWl0ID0gTWF0aC5jZWlsKHdyaXRlLmNvdW50IC8gMilcbiAgICAgICAgICB3cml0ZS5jb3VudCA9IDBcbiAgICAgICAgICB3cml0ZS5zdWIgPSBSYWRpeCgpXG4gICAgICAgICAgUmFkaXgubWFwKHJhZCwgd3JpdGUuc2xpY2UpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHdyaXRlLnRleHQgKz0gZW5jXG4gICAgICB9LFxuICAgICAgcHV0OiAoKSA9PiB7XG4gICAgICAgIG9wdC5zdG9yZS5wdXQoZmlsZSwgd3JpdGUudGV4dCwgY2IpXG4gICAgICB9LFxuICAgICAgc2xpY2U6ICh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPCB3cml0ZS5maWxlKSByZXR1cm5cblxuICAgICAgICBpZiAoKyt3cml0ZS5jb3VudCA+IHdyaXRlLmxpbWl0KSB7XG4gICAgICAgICAgdmFyIG5hbWUgPSB3cml0ZS5maWxlXG4gICAgICAgICAgLy8gVXNlIG9ubHkgdGhlIHNvdWwgb2YgdGhlIGtleSBhcyB0aGUgZmlsZW5hbWUgc28gdGhhdCBhbGxcbiAgICAgICAgICAvLyBwcm9wZXJ0aWVzIG9mIGEgc291bCBhcmUgd3JpdHRlbiB0byB0aGUgc2FtZSBmaWxlLlxuICAgICAgICAgIGxldCBlbmQgPSBrZXkuaW5kZXhPZihcIi5cIilcbiAgICAgICAgICBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICAgICAgd3JpdGUuZmlsZSA9IGtleVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3cml0ZS5maWxlID0ga2V5LnN1YnN0cmluZygwLCBlbmQpXG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIHdyaXRlLmxpbWl0IGNhbiBiZSByZWFjaGVkIGFmdGVyIGFscmVhZHkgd3JpdGluZyBwcm9wZXJ0aWVzIG9mXG4gICAgICAgICAgLy8gdGhlIGN1cnJlbnQgbm9kZSwgc28gcmVtb3ZlIGl0IGZyb20gd3JpdGUuc3ViIGJlZm9yZSB3cml0aW5nIHRvXG4gICAgICAgICAgLy8gZGlzayBzbyB0aGF0IGl0J3Mgbm90IGR1cGxpY2F0ZWQgYWNyb3NzIGZpbGVzLlxuICAgICAgICAgIHdyaXRlLnN1Yih3cml0ZS5maWxlLCBudWxsKVxuICAgICAgICAgIHdyaXRlLmNvdW50ID0gMFxuICAgICAgICAgIHJhZGlzay53cml0ZShuYW1lLCB3cml0ZS5zdWIsIHdyaXRlLm5leHQpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHdyaXRlLnN1YihrZXksIHZhbHVlKVxuICAgICAgfSxcbiAgICAgIG5leHQ6IGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgICAgd3JpdGUuc3ViID0gUmFkaXgoKVxuICAgICAgICBpZiAoIVJhZGl4Lm1hcChyYWQsIHdyaXRlLnNsaWNlKSkge1xuICAgICAgICAgIHJhZGlzay53cml0ZSh3cml0ZS5maWxlLCB3cml0ZS5zdWIsIGNiKVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH1cbiAgICAvLyBJZiBSYWRpeC5tYXAgZG9lc24ndCByZXR1cm4gdHJ1ZSB3aGVuIGNhbGxlZCB3aXRoIHdyaXRlLmVhY2ggYXMgYVxuICAgIC8vIGNhbGxiYWNrIHRoZW4gZGlkbid0IG5lZWQgdG8gc3BsaXQgdGhlIGRhdGEuIFRoZSBhY2N1bXVsYXRlZCB3cml0ZS50ZXh0XG4gICAgLy8gY2FuIHRoZW4gYmUgc3RvcmVkIHdpdGggd3JpdGUucHV0KCkuXG4gICAgaWYgKCFSYWRpeC5tYXAocmFkLCB3cml0ZS5lYWNoLCB0cnVlKSkgd3JpdGUucHV0KClcbiAgfVxuXG4gIHJhZGlzay5yZWFkID0gKGtleSwgY2IpID0+IHtcbiAgICBpZiAoY2FjaGUpIHtcbiAgICAgIGxldCB2YWx1ZSA9IGNhY2hlKGtleSlcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHJldHVybiBjYih1LCB2YWx1ZSlcbiAgICB9XG4gICAgLy8gT25seSB0aGUgc291bCBvZiB0aGUga2V5IGlzIGNvbXBhcmVkIHRvIGZpbGVuYW1lcyAoc2VlIHJhZGlzay53cml0ZSkuXG4gICAgbGV0IHNvdWwgPSBrZXlcbiAgICBsZXQgZW5kID0ga2V5LmluZGV4T2YoXCIuXCIpXG4gICAgaWYgKGVuZCAhPT0gLTEpIHtcbiAgICAgIHNvdWwgPSBrZXkuc3Vic3RyaW5nKDAsIGVuZClcbiAgICB9XG5cbiAgICBjb25zdCByZWFkID0ge1xuICAgICAgbGV4OiBmaWxlID0+IHtcbiAgICAgICAgLy8gc3RvcmUubGlzdCBzaG91bGQgY2FsbCBsZXggd2l0aG91dCBhIGZpbGUgbGFzdCwgd2hpY2ggbWVhbnMgYWxsIGZpbGVcbiAgICAgICAgLy8gbmFtZXMgd2VyZSBjb21wYXJlZCB0byBzb3VsLCBzbyB0aGUgY3VycmVudCByZWFkLmZpbGUgaXMgb2sgdG8gdXNlLlxuICAgICAgICBpZiAoIWZpbGUpIHtcbiAgICAgICAgICBpZiAoIXJlYWQuZmlsZSkge1xuICAgICAgICAgICAgY2IoXCJubyBmaWxlIGZvdW5kXCIsIHUpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICByYWRpc2sucGFyc2UocmVhZC5maWxlLCByZWFkLml0KVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gV2FudCB0aGUgZmlsZW5hbWUgY2xvc2VzdCB0byBzb3VsLlxuICAgICAgICBpZiAoZmlsZSA+IHNvdWwgfHwgZmlsZSA8IHJlYWQuZmlsZSkgcmV0dXJuXG5cbiAgICAgICAgcmVhZC5maWxlID0gZmlsZVxuICAgICAgfSxcbiAgICAgIGl0OiAoZXJyLCBkaXNrKSA9PiB7XG4gICAgICAgIGlmIChlcnIpIG9wdC5sb2coZXJyKVxuICAgICAgICBpZiAoZGlzaykge1xuICAgICAgICAgIGNhY2hlID0gZGlza1xuICAgICAgICAgIHJlYWQudmFsdWUgPSBkaXNrKGtleSlcbiAgICAgICAgfVxuICAgICAgICBjYihlcnIsIHJlYWQudmFsdWUpXG4gICAgICB9LFxuICAgIH1cbiAgICBvcHQuc3RvcmUubGlzdChyZWFkLmxleClcbiAgfVxuXG4gIC8qXG5cdFx0TGV0IHVzIHN0YXJ0IGJ5IGFzc3VtaW5nIHdlIGFyZSB0aGUgb25seSBwcm9jZXNzIHRoYXQgaXNcblx0XHRjaGFuZ2luZyB0aGUgZGlyZWN0b3J5IG9yIGJ1Y2tldC4gTm90IGJlY2F1c2Ugd2UgZG8gbm90IHdhbnRcblx0XHR0byBiZSBtdWx0aS1wcm9jZXNzL21hY2hpbmUsIGJ1dCBiZWNhdXNlIHdlIHdhbnQgdG8gZXhwZXJpbWVudFxuXHRcdHdpdGggaG93IG11Y2ggcGVyZm9ybWFuY2UgYW5kIHNjYWxlIHdlIGNhbiBnZXQgb3V0IG9mIG9ubHkgb25lLlxuXHRcdFRoZW4gd2UgY2FuIHdvcmsgb24gdGhlIGhhcmRlciBwcm9ibGVtIG9mIGJlaW5nIG11bHRpLXByb2Nlc3MuXG5cdCovXG4gIHJhZGlzay5wYXJzZSA9IChmaWxlLCBjYikgPT4ge1xuICAgIGNvbnN0IHBhcnNlID0ge1xuICAgICAgZGlzazogUmFkaXgoKSxcbiAgICAgIHJlYWQ6IChlcnIsIGRhdGEpID0+IHtcbiAgICAgICAgaWYgKGVycikgcmV0dXJuIGNiKGVycilcblxuICAgICAgICBpZiAoIWRhdGEpIHJldHVybiBjYih1LCBwYXJzZS5kaXNrKVxuXG4gICAgICAgIGxldCBwcmUgPSBbXVxuICAgICAgICAvLyBXb3JrIHRob3VnaCBkYXRhIGJ5IHNwbGl0dGluZyBpbnRvIDMgdmFsdWVzLiBUaGUgZmlyc3QgdmFsdWUgc2F5c1xuICAgICAgICAvLyBpZiB0aGUgc2Vjb25kIHZhbHVlIGlzIG9uZSBvZjogdGhlIHJhZGl4IGxldmVsIGZvciBhIGtleSwgdGhlIGtleVxuICAgICAgICAvLyBpdGVzZWxmLCBvciBhIHZhbHVlLiBUaGUgdGhpcmQgaXMgdGhlIHJlc3Qgb2YgdGhlIGRhdGEgdG8gd29yayB3aXRoLlxuICAgICAgICBsZXQgdG1wID0gcGFyc2Uuc3BsaXQoZGF0YSlcbiAgICAgICAgd2hpbGUgKHRtcCkge1xuICAgICAgICAgIGxldCBrZXlcbiAgICAgICAgICBsZXQgdmFsdWVcbiAgICAgICAgICBsZXQgaSA9IHRtcFsxXVxuICAgICAgICAgIHRtcCA9IHBhcnNlLnNwbGl0KHRtcFsyXSkgfHwgXCJcIlxuICAgICAgICAgIGlmICh0bXBbMF0gPT09IFwiI1wiKSB7XG4gICAgICAgICAgICBrZXkgPSB0bXBbMV1cbiAgICAgICAgICAgIHByZSA9IHByZS5zbGljZSgwLCBpKVxuICAgICAgICAgICAgaWYgKGkgPD0gcHJlLmxlbmd0aCkgcHJlLnB1c2goa2V5KVxuICAgICAgICAgIH1cbiAgICAgICAgICB0bXAgPSBwYXJzZS5zcGxpdCh0bXBbMl0pIHx8IFwiXCJcbiAgICAgICAgICBpZiAodG1wWzBdID09PSBcIlxcblwiKSBjb250aW51ZVxuXG4gICAgICAgICAgaWYgKHRtcFswXSA9PT0gXCI9XCIpIHZhbHVlID0gdG1wWzFdXG4gICAgICAgICAgaWYgKHR5cGVvZiBrZXkgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHZhbHVlICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICBwYXJzZS5kaXNrKHByZS5qb2luKFwiXCIpLCB2YWx1ZSlcbiAgICAgICAgICB9XG4gICAgICAgICAgdG1wID0gcGFyc2Uuc3BsaXQodG1wWzJdKVxuICAgICAgICB9XG4gICAgICAgIGNiKHUsIHBhcnNlLmRpc2spXG4gICAgICB9LFxuICAgICAgc3BsaXQ6IGRhdGEgPT4ge1xuICAgICAgICBpZiAoIWRhdGEpIHJldHVyblxuXG4gICAgICAgIGxldCBpID0gLTFcbiAgICAgICAgbGV0IGEgPSBcIlwiXG4gICAgICAgIGxldCBjID0gbnVsbFxuICAgICAgICB3aGlsZSAoKGMgPSBkYXRhWysraV0pKSB7XG4gICAgICAgICAgaWYgKGMgPT09IHVuaXQpIGJyZWFrXG5cbiAgICAgICAgICBhICs9IGNcbiAgICAgICAgfVxuICAgICAgICBsZXQgbyA9IHt9XG4gICAgICAgIGlmIChjKSB7XG4gICAgICAgICAgcmV0dXJuIFthLCBSYWRpc2suZGVjb2RlKGRhdGEuc2xpY2UoaSksIG8pLCBkYXRhLnNsaWNlKGkgKyBvLmkpXVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH1cbiAgICBvcHQuc3RvcmUuZ2V0KGZpbGUsIHBhcnNlLnJlYWQpXG4gIH1cblxuICByZXR1cm4gcmFkaXNrXG59XG5cblJhZGlzay5lbmNvZGUgPSBkYXRhID0+IHtcbiAgLy8gQSBrZXkgc2hvdWxkIGJlIHBhc3NlZCBpbiBhcyBhIHN0cmluZyB0byBlbmNvZGUsIGEgdmFsdWUgY2FuIG9wdGlvbmFsbHkgYmVcbiAgLy8gYW4gYXJyYXkgb2YgMiBpdGVtcyB0byBpbmNsdWRlIHRoZSB2YWx1ZSdzIHN0YXRlLCBhcyBpcyBkb25lIGJ5IHN0b3JlLmpzLlxuICBsZXQgc3RhdGUgPSBcIlwiXG4gIGlmIChkYXRhIGluc3RhbmNlb2YgQXJyYXkgJiYgZGF0YS5sZW5ndGggPT09IDIpIHtcbiAgICBzdGF0ZSA9IGV0eCArIGRhdGFbMV1cbiAgICBkYXRhID0gZGF0YVswXVxuICB9XG5cbiAgaWYgKHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiKSB7XG4gICAgbGV0IGkgPSAwXG4gICAgbGV0IGN1cnJlbnQgPSBudWxsXG4gICAgbGV0IHRleHQgPSB1bml0XG4gICAgd2hpbGUgKChjdXJyZW50ID0gZGF0YVtpKytdKSkge1xuICAgICAgaWYgKGN1cnJlbnQgPT09IHVuaXQpIHRleHQgKz0gdW5pdFxuICAgIH1cbiAgICByZXR1cm4gdGV4dCArICdcIicgKyBkYXRhICsgc3RhdGUgKyB1bml0XG4gIH1cblxuICBsZXQgdG1wID0gbnVsbFxuICBpZiAoKHRtcCA9IHV0aWxzLnJlbC5pcyhkYXRhKSkpIHtcbiAgICByZXR1cm4gdW5pdCArIFwiI1wiICsgdG1wICsgc3RhdGUgKyB1bml0XG4gIH1cblxuICBpZiAodXRpbHMubnVtLmlzKGRhdGEpKSByZXR1cm4gdW5pdCArIFwiK1wiICsgKGRhdGEgfHwgMCkgKyBzdGF0ZSArIHVuaXRcblxuICBpZiAoZGF0YSA9PT0gdHJ1ZSkgcmV0dXJuIHVuaXQgKyBcIitcIiArIHN0YXRlICsgdW5pdFxuXG4gIGlmIChkYXRhID09PSBmYWxzZSkgcmV0dXJuIHVuaXQgKyBcIi1cIiArIHN0YXRlICsgdW5pdFxufVxuXG5SYWRpc2suZGVjb2RlID0gKGRhdGEsIG9iaikgPT4ge1xuICB2YXIgdGV4dCA9IFwiXCJcbiAgdmFyIGkgPSAtMVxuICB2YXIgbiA9IDBcbiAgdmFyIGN1cnJlbnQgPSBudWxsXG4gIHZhciBwcmV2aW91cyA9IG51bGxcbiAgaWYgKGRhdGFbMF0gIT09IHVuaXQpIHJldHVyblxuXG4gIC8vIEZpbmQgYSBjb250cm9sIGNoYXJhY3RlciBwcmV2aW91cyB0byB0aGUgdGV4dCB3ZSB3YW50LCBza2lwcGluZ1xuICAvLyBjb25zZWN1dGl2ZSB1bml0IHNlcGFyYXRvciBjaGFyYWN0ZXJzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGRhdGEuXG4gIHdoaWxlICgoY3VycmVudCA9IGRhdGFbKytpXSkpIHtcbiAgICBpZiAocHJldmlvdXMpIHtcbiAgICAgIGlmIChjdXJyZW50ID09PSB1bml0KSB7XG4gICAgICAgIGlmICgtLW4gPD0gMCkgYnJlYWtcbiAgICAgIH1cbiAgICAgIHRleHQgKz0gY3VycmVudFxuICAgIH0gZWxzZSBpZiAoY3VycmVudCA9PT0gdW5pdCkge1xuICAgICAgbisrXG4gICAgfSBlbHNlIHtcbiAgICAgIHByZXZpb3VzID0gY3VycmVudCB8fCB0cnVlXG4gICAgfVxuICB9XG5cbiAgaWYgKG9iaikgb2JqLmkgPSBpICsgMVxuXG4gIGxldCBbdmFsdWUsIHN0YXRlXSA9IHRleHQuc3BsaXQoZXR4KVxuICBpZiAoIXN0YXRlKSB7XG4gICAgaWYgKHByZXZpb3VzID09PSAnXCInKSByZXR1cm4gdGV4dFxuXG4gICAgaWYgKHByZXZpb3VzID09PSBcIiNcIikgcmV0dXJuIHV0aWxzLnJlbC5pZnkodGV4dClcblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCIrXCIpIHtcbiAgICAgIGlmICh0ZXh0Lmxlbmd0aCA9PT0gMCkgcmV0dXJuIHRydWVcblxuICAgICAgcmV0dXJuIHBhcnNlRmxvYXQodGV4dClcbiAgICB9XG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiLVwiKSByZXR1cm4gZmFsc2VcbiAgfSBlbHNlIHtcbiAgICBzdGF0ZSA9IHBhcnNlRmxvYXQoc3RhdGUpXG4gICAgLy8gSWYgc3RhdGUgd2FzIGZvdW5kIHRoZW4gcmV0dXJuIGFuIGFycmF5LlxuICAgIGlmIChwcmV2aW91cyA9PT0gJ1wiJykgcmV0dXJuIFt2YWx1ZSwgc3RhdGVdXG5cbiAgICBpZiAocHJldmlvdXMgPT09IFwiI1wiKSByZXR1cm4gW3V0aWxzLnJlbC5pZnkodmFsdWUpLCBzdGF0ZV1cblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCIrXCIpIHtcbiAgICAgIGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHJldHVybiBbdHJ1ZSwgc3RhdGVdXG5cbiAgICAgIHJldHVybiBbcGFyc2VGbG9hdCh2YWx1ZSksIHN0YXRlXVxuICAgIH1cblxuICAgIGlmIChwcmV2aW91cyA9PT0gXCItXCIpIHJldHVybiBbZmFsc2UsIHN0YXRlXVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmFkaXNrXG4iLCJjb25zdCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpXG5cbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgZ3JvdXAgc2VwYXJhdG9yLlxuY29uc3QgZ3JvdXAgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDI5KVxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciByZWNvcmQgc2VwYXJhdG9yLlxuY29uc3QgcmVjb3JkID0gU3RyaW5nLmZyb21DaGFyQ29kZSgzMClcblxuY29uc3QgUmFkaXggPSAoKSA9PiB7XG4gIGNvbnN0IHJhZGl4ID0gKGtleXMsIHZhbHVlLCB0cmVlKSA9PiB7XG4gICAgaWYgKCF0cmVlKSB7XG4gICAgICBpZiAoIXJhZGl4W2dyb3VwXSkgcmFkaXhbZ3JvdXBdID0ge31cbiAgICAgIHRyZWUgPSByYWRpeFtncm91cF1cbiAgICB9XG4gICAgaWYgKCFrZXlzKSByZXR1cm4gdHJlZVxuXG4gICAgbGV0IGkgPSAwXG4gICAgbGV0IHRtcCA9IHt9XG4gICAgbGV0IGtleSA9IGtleXNbaV1cbiAgICBjb25zdCBtYXggPSBrZXlzLmxlbmd0aCAtIDFcbiAgICBjb25zdCBub1ZhbHVlID0gdHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiXG4gICAgLy8gRmluZCBhIG1hdGNoaW5nIHZhbHVlIHVzaW5nIHRoZSBzaG9ydGVzdCBzdHJpbmcgZnJvbSBrZXlzLlxuICAgIGxldCBmb3VuZCA9IHRyZWVba2V5XVxuICAgIHdoaWxlICghZm91bmQgJiYgaSA8IG1heCkge1xuICAgICAga2V5ICs9IGtleXNbKytpXVxuICAgICAgZm91bmQgPSB0cmVlW2tleV1cbiAgICB9XG5cbiAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAvLyBJZiBub3QgZm91bmQgZnJvbSB0aGUgcHJvdmlkZWQga2V5cyB0cnkgbWF0Y2hpbmcgd2l0aCBhbiBleGlzdGluZyBrZXkuXG4gICAgICBjb25zdCByZXN1bHQgPSB1dGlscy5vYmoubWFwKHRyZWUsIChoYXNWYWx1ZSwgaGFzS2V5KSA9PiB7XG4gICAgICAgIGxldCBqID0gMFxuICAgICAgICBsZXQgbWF0Y2hpbmdLZXkgPSBcIlwiXG4gICAgICAgIHdoaWxlIChoYXNLZXlbal0gPT09IGtleXNbal0pIHtcbiAgICAgICAgICBtYXRjaGluZ0tleSArPSBoYXNLZXlbaisrXVxuICAgICAgICB9XG4gICAgICAgIGlmIChtYXRjaGluZ0tleSkge1xuICAgICAgICAgIGlmIChub1ZhbHVlKSB7XG4gICAgICAgICAgICAvLyBtYXRjaGluZ0tleSBoYXMgdG8gYmUgYXMgbG9uZyBhcyB0aGUgb3JpZ2luYWwga2V5cyB3aGVuIHJlYWRpbmcuXG4gICAgICAgICAgICBpZiAoaiA8PSBtYXgpIHJldHVyblxuXG4gICAgICAgICAgICB0bXBbaGFzS2V5LnNsaWNlKGopXSA9IGhhc1ZhbHVlXG4gICAgICAgICAgICByZXR1cm4gaGFzVmFsdWVcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsZXQgcmVwbGFjZSA9IHtcbiAgICAgICAgICAgIFtoYXNLZXkuc2xpY2UoaildOiBoYXNWYWx1ZSxcbiAgICAgICAgICAgIFtrZXlzLnNsaWNlKGopXToge1tyZWNvcmRdOiB2YWx1ZX0sXG4gICAgICAgICAgfVxuICAgICAgICAgIHRyZWVbbWF0Y2hpbmdLZXldID0ge1tncm91cF06IHJlcGxhY2V9XG4gICAgICAgICAgZGVsZXRlIHRyZWVbaGFzS2V5XVxuICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICBpZiAobm9WYWx1ZSkgcmV0dXJuXG5cbiAgICAgICAgaWYgKCF0cmVlW2tleV0pIHRyZWVba2V5XSA9IHt9XG4gICAgICAgIHRyZWVba2V5XVtyZWNvcmRdID0gdmFsdWVcbiAgICAgIH0gZWxzZSBpZiAobm9WYWx1ZSkge1xuICAgICAgICByZXR1cm4gdG1wXG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChpID09PSBtYXgpIHtcbiAgICAgIC8vIElmIG5vIHZhbHVlIHVzZSB0aGUga2V5IHByb3ZpZGVkIHRvIHJldHVybiBhIHdob2xlIGdyb3VwIG9yIHJlY29yZC5cbiAgICAgIGlmIChub1ZhbHVlKSB7XG4gICAgICAgIC8vIElmIGFuIGluZGl2aWR1YWwgcmVjb3JkIGlzbid0IGZvdW5kIHRoZW4gcmV0dXJuIHRoZSB3aG9sZSBncm91cC5cbiAgICAgICAgcmV0dXJuIHR5cGVvZiBmb3VuZFtyZWNvcmRdID09PSBcInVuZGVmaW5lZFwiXG4gICAgICAgICAgPyBmb3VuZFtncm91cF1cbiAgICAgICAgICA6IGZvdW5kW3JlY29yZF1cbiAgICAgIH1cbiAgICAgIC8vIE90aGVyd2lzZSBjcmVhdGUgYSBuZXcgcmVjb3JkIGF0IHRoZSBwcm92aWRlZCBrZXkgZm9yIHZhbHVlLlxuICAgICAgZm91bmRbcmVjb3JkXSA9IHZhbHVlXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEZvdW5kIGF0IGEgc2hvcnRlciBrZXksIHRyeSBhZ2Fpbi5cbiAgICAgIGlmICghZm91bmRbZ3JvdXBdICYmICFub1ZhbHVlKSBmb3VuZFtncm91cF0gPSB7fVxuICAgICAgcmV0dXJuIHJhZGl4KGtleXMuc2xpY2UoKytpKSwgdmFsdWUsIGZvdW5kW2dyb3VwXSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJhZGl4XG59XG5cblJhZGl4Lm1hcCA9IGZ1bmN0aW9uIG1hcChyYWRpeCwgY2IsIG9wdCwgcHJlKSB7XG4gIGlmICghcHJlKSBwcmUgPSBbXVxuICB2YXIgdHJlZSA9IHJhZGl4W2dyb3VwXSB8fCByYWRpeFxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHRyZWUpLnNvcnQoKVxuICB2YXIgdVxuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgIGxldCBrZXkgPSBrZXlzW2ldXG4gICAgbGV0IGZvdW5kID0gdHJlZVtrZXldXG4gICAgbGV0IHRtcCA9IGZvdW5kW3JlY29yZF1cbiAgICBpZiAodHlwZW9mIHRtcCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgdG1wID0gY2IodG1wLCBwcmUuam9pbihcIlwiKSArIGtleSwga2V5LCBwcmUpXG4gICAgICBpZiAodHlwZW9mIHRtcCAhPT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIHRtcFxuICAgIH0gZWxzZSBpZiAob3B0KSB7XG4gICAgICBjYih1LCBwcmUuam9pbihcIlwiKSwga2V5LCBwcmUpXG4gICAgfVxuICAgIGlmIChmb3VuZFtncm91cF0pIHtcbiAgICAgIHByZS5wdXNoKGtleSlcbiAgICAgIHRtcCA9IG1hcChmb3VuZFtncm91cF0sIGNiLCBvcHQsIHByZSlcbiAgICAgIGlmICh0eXBlb2YgdG1wICE9PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gdG1wXG4gICAgICBwcmUucG9wKClcbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSYWRpeFxuIiwiY29uc3QganNFbnYgPSByZXF1aXJlKFwiYnJvd3Nlci1vci1ub2RlXCIpXG5jb25zdCBSYWRpc2sgPSByZXF1aXJlKFwiLi9yYWRpc2tcIilcbmNvbnN0IFJhZGl4ID0gcmVxdWlyZShcIi4vcmFkaXhcIilcbmNvbnN0IHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIilcblxuY29uc3QgZmlsZVN5c3RlbSA9IGRpciA9PiB7XG4gIGlmIChqc0Vudi5pc05vZGUpIHtcbiAgICBjb25zdCBmcyA9IHJlcXVpcmUoXCJmc1wiKVxuICAgIGlmICghZnMuZXhpc3RzU3luYyhkaXIpKSBmcy5ta2RpclN5bmMoZGlyKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGdldDogKGZpbGUsIGNiKSA9PiB7XG4gICAgICAgIGZzLnJlYWRGaWxlKGRpciArIFwiL1wiICsgZmlsZSwgKGVyciwgZGF0YSkgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PT0gXCJFTk9FTlRcIikge1xuICAgICAgICAgICAgICBjYigpXG4gICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkVSUk9SOlwiLCBlcnIpXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChkYXRhKSBkYXRhID0gZGF0YS50b1N0cmluZygpXG4gICAgICAgICAgY2IoZXJyLCBkYXRhKVxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICAgIHB1dDogKGZpbGUsIGRhdGEsIGNiKSA9PiB7XG4gICAgICAgIHZhciByYW5kb20gPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgtOSlcbiAgICAgICAgLy8gRG9uJ3QgcHV0IHRtcCBmaWxlcyB1bmRlciBkaXIgc28gdGhhdCB0aGV5J3JlIG5vdCBsaXN0ZWQuXG4gICAgICAgIHZhciB0bXAgPSBmaWxlICsgXCIuXCIgKyByYW5kb20gKyBcIi50bXBcIlxuICAgICAgICBmcy53cml0ZUZpbGUodG1wLCBkYXRhLCAoZXJyLCBvaykgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIGNiKGVycilcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGZzLnJlbmFtZSh0bXAsIGRpciArIFwiL1wiICsgZmlsZSwgY2IpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgbGlzdDogY2IgPT4ge1xuICAgICAgICBmcy5yZWFkZGlyKGRpciwgKGVyciwgZmlsZXMpID0+IHtcbiAgICAgICAgICBmaWxlcy5mb3JFYWNoKGNiKVxuICAgICAgICAgIGNiKClcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgfVxuICB9XG5cbiAgLy8gVE9ETzogQWRkIGluZGV4ZWREQlxuICByZXR1cm4ge1xuICAgIGdldDogKGZpbGUsIGNiKSA9PiBjYigpLFxuICAgIHB1dDogKGZpbGUsIGRhdGEsIGNiKSA9PiBjYigpLFxuICAgIGxpc3Q6IGNiID0+IGNiKCksXG4gIH1cbn1cblxuY29uc3QgU3RvcmUgPSBvcHQgPT4ge1xuICBpZiAoIXV0aWxzLm9iai5pcyhvcHQpKSBvcHQgPSB7fVxuICBvcHQuZmlsZSA9IFN0cmluZyhvcHQuZmlsZSB8fCBcInJhZGF0YVwiKVxuICBpZiAoIW9wdC5zdG9yZSkgb3B0LnN0b3JlID0gZmlsZVN5c3RlbShvcHQuZmlsZSlcbiAgY29uc3QgcmFkaXNrID0gUmFkaXNrKG9wdClcblxuICByZXR1cm4ge1xuICAgIGdldDogKGxleCwgY2IpID0+IHtcbiAgICAgIGlmICghbGV4KSB7XG4gICAgICAgIGNiKFwibGV4IHJlcXVpcmVkXCIpXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB2YXIgc291bCA9IGxleFtcIiNcIl1cbiAgICAgIHZhciBrZXkgPSBsZXhbXCIuXCJdIHx8IFwiXCJcbiAgICAgIHZhciBub2RlXG4gICAgICBjb25zdCBlYWNoID0gKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKCFub2RlKSBub2RlID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgbm9kZVtrZXldID0gdmFsdWVbMF1cbiAgICAgICAgbm9kZS5fW1wiPlwiXVtrZXldID0gdmFsdWVbMV1cbiAgICAgIH1cblxuICAgICAgcmFkaXNrKHNvdWwgKyBcIi5cIiArIGtleSwgKGVyciwgdmFsdWUpID0+IHtcbiAgICAgICAgbGV0IGdyYXBoXG4gICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgIFJhZGl4Lm1hcCh2YWx1ZSwgZWFjaClcbiAgICAgICAgICBpZiAoIW5vZGUpIGVhY2godmFsdWUsIGtleSlcbiAgICAgICAgICBncmFwaCA9IHtbc291bF06IG5vZGV9XG4gICAgICAgIH1cbiAgICAgICAgY2IoZXJyLCBncmFwaClcbiAgICAgIH0pXG4gICAgfSxcbiAgICBwdXQ6IChncmFwaCwgY2IpID0+IHtcbiAgICAgIGlmICghZ3JhcGgpIHtcbiAgICAgICAgY2IoXCJncmFwaCByZXF1aXJlZFwiKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgdmFyIGNvdW50ID0gMFxuICAgICAgY29uc3QgYWNrID0gKGVyciwgb2spID0+IHtcbiAgICAgICAgY291bnQtLVxuICAgICAgICBpZiAoYWNrLmVycikgcmV0dXJuXG5cbiAgICAgICAgaWYgKChhY2suZXJyID0gZXJyKSkge1xuICAgICAgICAgIGNiKGVyciB8fCBcIkVSUk9SIVwiKVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNvdW50ID4gMCkgcmV0dXJuXG5cbiAgICAgICAgY2IoYWNrLmVyciwgMSlcbiAgICAgIH1cblxuICAgICAgT2JqZWN0LmtleXMoZ3JhcGgpLmZvckVhY2goc291bCA9PiB7XG4gICAgICAgIHZhciBub2RlID0gZ3JhcGhbc291bF1cbiAgICAgICAgT2JqZWN0LmtleXMobm9kZSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgIGlmIChcIl9cIiA9PT0ga2V5KSByZXR1cm5cblxuICAgICAgICAgIGNvdW50KytcbiAgICAgICAgICBsZXQgdmFsdWUgPSBub2RlW2tleV1cbiAgICAgICAgICBsZXQgc3RhdGUgPSBub2RlLl9bXCI+XCJdW2tleV1cbiAgICAgICAgICByYWRpc2soc291bCArIFwiLlwiICsga2V5LCBbdmFsdWUsIHN0YXRlXSwgYWNrKVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICB9LFxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gU3RvcmVcbiIsImNvbnN0IG51bSA9IHtcbiAgaXM6IG4gPT5cbiAgICAhKG4gaW5zdGFuY2VvZiBBcnJheSkgJiZcbiAgICAobiAtIHBhcnNlRmxvYXQobikgKyAxID49IDAgfHwgSW5maW5pdHkgPT09IG4gfHwgLUluZmluaXR5ID09PSBuKSxcbn1cblxuY29uc3Qgb2JqID0ge1xuICBpczogbyA9PiB7XG4gICAgaWYgKCFvKSByZXR1cm4gZmFsc2VcblxuICAgIHJldHVybiAoXG4gICAgICAobyBpbnN0YW5jZW9mIE9iamVjdCAmJiBvLmNvbnN0cnVjdG9yID09PSBPYmplY3QpIHx8XG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobykubWF0Y2goL15cXFtvYmplY3QgKFxcdyspXFxdJC8pWzFdID09PVxuICAgICAgICBcIk9iamVjdFwiXG4gICAgKVxuICB9LFxuICBtYXA6IChsaXN0LCBjYiwgbykgPT4ge1xuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMobGlzdClcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGxldCByZXN1bHQgPSBjYihsaXN0W2tleXNbaV1dLCBrZXlzW2ldLCBvKVxuICAgICAgaWYgKHR5cGVvZiByZXN1bHQgIT09IFwidW5kZWZpbmVkXCIpIHJldHVybiByZXN1bHRcbiAgICB9XG4gIH0sXG4gIHB1dDogKG8sIGtleSwgdmFsdWUpID0+IHtcbiAgICBpZiAoIW8pIG8gPSB7fVxuICAgIG9ba2V5XSA9IHZhbHVlXG4gICAgcmV0dXJuIG9cbiAgfSxcbiAgZGVsOiAobywga2V5KSA9PiB7XG4gICAgaWYgKCFvKSByZXR1cm5cblxuICAgIG9ba2V5XSA9IG51bGxcbiAgICBkZWxldGUgb1trZXldXG4gICAgcmV0dXJuIG9cbiAgfSxcbn1cblxuY29uc3QgbWFwX3NvdWwgPSAoc291bCwga2V5LCBvKSA9PiB7XG4gIC8vIElmIGlkIGlzIGFscmVhZHkgZGVmaW5lZCBBTkQgd2UncmUgc3RpbGwgbG9vcGluZyB0aHJvdWdoIHRoZSBvYmplY3QsXG4gIC8vIHRoZW4gaXQgaXMgY29uc2lkZXJlZCBpbnZhbGlkLlxuICBpZiAoby5pZCkge1xuICAgIG8uaWQgPSBmYWxzZVxuICAgIHJldHVyblxuICB9XG5cbiAgaWYgKGtleSA9PT0gXCIjXCIgJiYgdHlwZW9mIHNvdWwgPT09IFwic3RyaW5nXCIpIHtcbiAgICBvLmlkID0gc291bFxuICAgIHJldHVyblxuICB9XG5cbiAgLy8gSWYgdGhlcmUgZXhpc3RzIGFueXRoaW5nIGVsc2Ugb24gdGhlIG9iamVjdCB0aGF0IGlzbid0IHRoZSBzb3VsLFxuICAvLyB0aGVuIGl0IGlzIGNvbnNpZGVyZWQgaW52YWxpZC5cbiAgby5pZCA9IGZhbHNlXG59XG5cbi8vIENoZWNrIGlmIGFuIG9iamVjdCBpcyBhIHNvdWwgcmVsYXRpb24sIGllIHsnIyc6ICdVVUlEJ31cbmNvbnN0IHJlbCA9IHtcbiAgaXM6IHZhbHVlID0+IHtcbiAgICBpZiAodmFsdWUgJiYgdmFsdWVbXCIjXCJdICYmICF2YWx1ZS5fICYmIG9iai5pcyh2YWx1ZSkpIHtcbiAgICAgIGxldCBvID0ge31cbiAgICAgIG9iai5tYXAodmFsdWUsIG1hcF9zb3VsLCBvKVxuICAgICAgaWYgKG8uaWQpIHJldHVybiBvLmlkXG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlXG4gIH0sXG4gIC8vIENvbnZlcnQgYSBzb3VsIGludG8gYSByZWxhdGlvbiBhbmQgcmV0dXJuIGl0LlxuICBpZnk6IHNvdWwgPT4gb2JqLnB1dCh7fSwgXCIjXCIsIHNvdWwpLFxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtudW0sIG9iaiwgcmVsfVxuIiwiLyogKGlnbm9yZWQpICovIiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXShtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIiIsIi8vIHN0YXJ0dXBcbi8vIExvYWQgZW50cnkgbW9kdWxlIGFuZCByZXR1cm4gZXhwb3J0c1xuLy8gVGhpcyBlbnRyeSBtb2R1bGUgaXMgcmVmZXJlbmNlZCBieSBvdGhlciBtb2R1bGVzIHNvIGl0IGNhbid0IGJlIGlubGluZWRcbnZhciBfX3dlYnBhY2tfZXhwb3J0c19fID0gX193ZWJwYWNrX3JlcXVpcmVfXyhcIi4vc3JjL2hvbHN0ZXIuanNcIik7XG4iLCIiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=
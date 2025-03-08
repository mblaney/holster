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

    const read = {
      lex: file => {
        // store.list should call lex without a file last, which means no
        // file was found that was greater than key. That means the current
        // read.file is the right place to read the key.
        if (!file || file > key) {
          if (!read.file) {
            cb("no file found", u)
            return
          }

          if (read.ing) return

          read.ing = true
          radisk.parse(read.file, read.it)
          return
        }

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
  if (typeof data == "string") {
    let i = 0
    let current = null
    let text = unit
    while ((current = data[i++])) {
      if (current === unit) text += unit
    }
    return text + '"' + data + unit
  }

  let tmp = null
  if (data && data["#"] && (tmp = utils.rel.is(data)))
    return unit + "#" + tmp + unit

  if (utils.num.is(data)) return unit + "+" + (data || 0) + unit

  if (data === null) return unit + " " + unit

  if (data === true) return unit + "+" + unit

  if (data === false) return unit + "-" + unit
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

  if (previous === '"') return text

  if (previous === "#") return utils.rel.ify(text)

  if (previous === "+") {
    if (text.length === 0) return true

    return parseFloat(text)
  }

  if (previous === " ") return null

  if (previous === "-") return false
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
        fs.readdir(dir, (err, dir) => {
          dir.forEach(cb)
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
        var data = JSON.parse(value)
        if (!node) node = {_: {"#": soul, ">": {}}}
        node[key] = data[0]
        node._[">"][key] = data[1]
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
          radisk(soul + "." + key, JSON.stringify([value, state]), ack)
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
  is: obj => {
    if (!obj) return false

    return (
      (obj instanceof Object && obj.constructor === Object) ||
      Object.prototype.toString.call(obj).match(/^\[object (\w+)\]$/)[1] ===
        "Object"
    )
  },
  map: (list, cb, obj) => {
    var keys = Object.keys(list)
    for (let i = 0; i < keys.length; i++) {
      let result = cb(list[keys[i]], keys[i], obj)
      if (typeof result !== "undefined") return result
    }
  },
  put: (obj, key, value) => {
    if (!obj) obj = {}
    obj[key] = value
    return obj
  },
  del: (obj, key) => {
    if (!obj) return

    obj[key] = null
    delete obj[key]
    return obj
  },
}

const map_soul = (soul, key, obj) => {
  // If id is already defined AND we're still looping through the object,
  // then it is considered invalid.
  if (obj.id) {
    obj.id = false
    return
  }

  if (key === "#" && typeof soul === "string") {
    obj.id = soul
    return
  }

  // If there exists anything else on the object that isn't the soul,
  // then it is considered invalid.
  obj.id = false
}

// Check if an object is a soul relation, ie {'#': 'UUID'}
const rel = {
  is: value => {
    if (value && value["#"] && !value._ && obj_is(value)) {
      let obj = {}
      obj.map(value, map_soul, obj)
      if (obj.id) return o.id
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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Q0w7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxXQUFXO0FBQ1g7QUFDQSxTQUFTO0FBQ1QsT0FBTztBQUNQO0FBQ0E7O0FBRUE7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0EsT0FBTztBQUNQO0FBQ0E7QUFDQSxPQUFPO0FBQ1A7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFlBQVk7QUFDWjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxPQUFPO0FBQ1A7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBOztB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QUNBLFNBQVM7QUFDVCxPQUFPO0FBQ1AsS0FBSztBQUNMO0FBQ0E7O0FBRUE7Ozs7Ozs7Ozs7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxHQUFHO0FBQ0g7QUFDQTtBQUNBLG9CQUFvQixpQkFBaUI7QUFDckM7QUFDQTtBQUNBO0FBQ0EsR0FBRztBQUNIO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsR0FBRztBQUNIO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsR0FBRztBQUNIOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLDhDQUE4QztBQUM5QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLEdBQUc7QUFDSDtBQUNBLHlCQUF5QjtBQUN6Qjs7QUFFQSxrQkFBa0I7Ozs7Ozs7Ozs7O0FDdEVsQjs7Ozs7O1VDQUE7VUFDQTs7VUFFQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTs7VUFFQTtVQUNBOztVQUVBO1VBQ0E7VUFDQTs7OztVRXRCQTtVQUNBO1VBQ0E7VUFDQSIsInNvdXJjZXMiOlsid2VicGFjazovL0hvbHN0ZXIvLi9ub2RlX21vZHVsZXMvYnJvd3Nlci1vci1ub2RlL2Rpc3QvaW5kZXguanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL25vZGVfbW9kdWxlcy93cy9icm93c2VyLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvZHVwLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvZ2V0LmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvaGFtLmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvaG9sc3Rlci5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL3JhZGlzay5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyLy4vc3JjL3JhZGl4LmpzIiwid2VicGFjazovL0hvbHN0ZXIvLi9zcmMvc3RvcmUuanMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci8uL3NyYy91dGlscy5qcyIsIndlYnBhY2s6Ly9Ib2xzdGVyL2lnbm9yZWR8L2hvbWUvbWFsL3dvcmsvaG9sc3Rlci9zcmN8ZnMiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly9Ib2xzdGVyL3dlYnBhY2svYmVmb3JlLXN0YXJ0dXAiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL3N0YXJ0dXAiLCJ3ZWJwYWNrOi8vSG9sc3Rlci93ZWJwYWNrL2FmdGVyLXN0YXJ0dXAiXSwic291cmNlc0NvbnRlbnQiOlsidmFyIF9fZGVmUHJvcCA9IE9iamVjdC5kZWZpbmVQcm9wZXJ0eTtcbnZhciBfX2dldE93blByb3BEZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcjtcbnZhciBfX2dldE93blByb3BOYW1lcyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzO1xudmFyIF9faGFzT3duUHJvcCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG52YXIgX19leHBvcnQgPSAodGFyZ2V0LCBhbGwpID0+IHtcbiAgZm9yICh2YXIgbmFtZSBpbiBhbGwpXG4gICAgX19kZWZQcm9wKHRhcmdldCwgbmFtZSwgeyBnZXQ6IGFsbFtuYW1lXSwgZW51bWVyYWJsZTogdHJ1ZSB9KTtcbn07XG52YXIgX19jb3B5UHJvcHMgPSAodG8sIGZyb20sIGV4Y2VwdCwgZGVzYykgPT4ge1xuICBpZiAoZnJvbSAmJiB0eXBlb2YgZnJvbSA9PT0gXCJvYmplY3RcIiB8fCB0eXBlb2YgZnJvbSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgZm9yIChsZXQga2V5IG9mIF9fZ2V0T3duUHJvcE5hbWVzKGZyb20pKVxuICAgICAgaWYgKCFfX2hhc093blByb3AuY2FsbCh0bywga2V5KSAmJiBrZXkgIT09IGV4Y2VwdClcbiAgICAgICAgX19kZWZQcm9wKHRvLCBrZXksIHsgZ2V0OiAoKSA9PiBmcm9tW2tleV0sIGVudW1lcmFibGU6ICEoZGVzYyA9IF9fZ2V0T3duUHJvcERlc2MoZnJvbSwga2V5KSkgfHwgZGVzYy5lbnVtZXJhYmxlIH0pO1xuICB9XG4gIHJldHVybiB0bztcbn07XG52YXIgX190b0NvbW1vbkpTID0gKG1vZCkgPT4gX19jb3B5UHJvcHMoX19kZWZQcm9wKHt9LCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KSwgbW9kKTtcblxuLy8gc3JjL2luZGV4LnRzXG52YXIgc3JjX2V4cG9ydHMgPSB7fTtcbl9fZXhwb3J0KHNyY19leHBvcnRzLCB7XG4gIGlzQnJvd3NlcjogKCkgPT4gaXNCcm93c2VyLFxuICBpc0J1bjogKCkgPT4gaXNCdW4sXG4gIGlzRGVubzogKCkgPT4gaXNEZW5vLFxuICBpc0pzRG9tOiAoKSA9PiBpc0pzRG9tLFxuICBpc05vZGU6ICgpID0+IGlzTm9kZSxcbiAgaXNXZWJXb3JrZXI6ICgpID0+IGlzV2ViV29ya2VyXG59KTtcbm1vZHVsZS5leHBvcnRzID0gX190b0NvbW1vbkpTKHNyY19leHBvcnRzKTtcbnZhciBpc0Jyb3dzZXIgPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiB3aW5kb3cuZG9jdW1lbnQgIT09IFwidW5kZWZpbmVkXCI7XG52YXIgaXNOb2RlID0gKFxuICAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgcHJvY2Vzcy52ZXJzaW9ucyAhPSBudWxsICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgcHJvY2Vzcy52ZXJzaW9ucy5ub2RlICE9IG51bGxcbik7XG52YXIgaXNXZWJXb3JrZXIgPSB0eXBlb2Ygc2VsZiA9PT0gXCJvYmplY3RcIiAmJiBzZWxmLmNvbnN0cnVjdG9yICYmIHNlbGYuY29uc3RydWN0b3IubmFtZSA9PT0gXCJEZWRpY2F0ZWRXb3JrZXJHbG9iYWxTY29wZVwiO1xudmFyIGlzSnNEb20gPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiICYmIHdpbmRvdy5uYW1lID09PSBcIm5vZGVqc1wiIHx8IHR5cGVvZiBuYXZpZ2F0b3IgIT09IFwidW5kZWZpbmVkXCIgJiYgXCJ1c2VyQWdlbnRcIiBpbiBuYXZpZ2F0b3IgJiYgdHlwZW9mIG5hdmlnYXRvci51c2VyQWdlbnQgPT09IFwic3RyaW5nXCIgJiYgKG5hdmlnYXRvci51c2VyQWdlbnQuaW5jbHVkZXMoXCJOb2RlLmpzXCIpIHx8IG5hdmlnYXRvci51c2VyQWdlbnQuaW5jbHVkZXMoXCJqc2RvbVwiKSk7XG52YXIgaXNEZW5vID0gKFxuICAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBEZW5vICE9PSBcInVuZGVmaW5lZFwiICYmIC8vIEB0cy1leHBlY3QtZXJyb3JcbiAgdHlwZW9mIERlbm8udmVyc2lvbiAhPT0gXCJ1bmRlZmluZWRcIiAmJiAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHR5cGVvZiBEZW5vLnZlcnNpb24uZGVubyAhPT0gXCJ1bmRlZmluZWRcIlxuKTtcbnZhciBpc0J1biA9IHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIHByb2Nlc3MudmVyc2lvbnMgIT0gbnVsbCAmJiBwcm9jZXNzLnZlcnNpb25zLmJ1biAhPSBudWxsO1xuLy8gQW5ub3RhdGUgdGhlIENvbW1vbkpTIGV4cG9ydCBuYW1lcyBmb3IgRVNNIGltcG9ydCBpbiBub2RlOlxuMCAmJiAobW9kdWxlLmV4cG9ydHMgPSB7XG4gIGlzQnJvd3NlcixcbiAgaXNCdW4sXG4gIGlzRGVubyxcbiAgaXNKc0RvbSxcbiAgaXNOb2RlLFxuICBpc1dlYldvcmtlclxufSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ3dzIGRvZXMgbm90IHdvcmsgaW4gdGhlIGJyb3dzZXIuIEJyb3dzZXIgY2xpZW50cyBtdXN0IHVzZSB0aGUgbmF0aXZlICcgK1xuICAgICAgJ1dlYlNvY2tldCBvYmplY3QnXG4gICk7XG59O1xuIiwiY29uc3QgRHVwID0gKCkgPT4ge1xuICBjb25zdCBtYXhBZ2UgPSA5MDAwXG4gIGNvbnN0IGR1cCA9IHtzdG9yZToge319XG4gIGR1cC5jaGVjayA9IGlkID0+IChkdXAuc3RvcmVbaWRdID8gZHVwLnRyYWNrKGlkKSA6IGZhbHNlKVxuICBkdXAudHJhY2sgPSBpZCA9PiB7XG4gICAgLy8gS2VlcCB0aGUgbGl2ZWxpbmVzcyBvZiB0aGUgbWVzc2FnZSB1cCB3aGlsZSBpdCBpcyBiZWluZyByZWNlaXZlZC5cbiAgICBkdXAuc3RvcmVbaWRdID0gRGF0ZS5ub3coKVxuICAgIGlmICghZHVwLmV4cGlyeSkge1xuICAgICAgZHVwLmV4cGlyeSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpXG4gICAgICAgIE9iamVjdC5rZXlzKGR1cC5zdG9yZSkuZm9yRWFjaChpZCA9PiB7XG4gICAgICAgICAgaWYgKG5vdyAtIGR1cC5zdG9yZVtpZF0gPiBtYXhBZ2UpIGRlbGV0ZSBkdXAuc3RvcmVbaWRdXG4gICAgICAgIH0pXG4gICAgICAgIGR1cC5leHBpcnkgPSBudWxsXG4gICAgICB9LCBtYXhBZ2UpXG4gICAgfVxuICAgIHJldHVybiBpZFxuICB9XG4gIHJldHVybiBkdXBcbn1cblxuRHVwLnJhbmRvbSA9ICgpID0+IHtcbiAgcmV0dXJuIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKC05KVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IER1cFxuIiwiY29uc3QgR2V0ID0gKGxleCwgZ3JhcGgpID0+IHtcbiAgY29uc3Qgc291bCA9IGxleFtcIiNcIl1cbiAgY29uc3Qga2V5ID0gbGV4W1wiLlwiXVxuICB2YXIgbm9kZSA9IGdyYXBoW3NvdWxdXG5cbiAgLy8gQ2FuIG9ubHkgcmV0dXJuIGEgbm9kZSBpZiBhIGtleSBpcyBwcm92aWRlZCwgYmVjYXVzZSB0aGUgZ3JhcGggbWF5IG5vdFxuICAvLyBoYXZlIGFsbCB0aGUga2V5cyBwb3B1bGF0ZWQgZm9yIGEgZ2l2ZW4gc291bC4gVGhpcyBpcyBiZWNhdXNlIEhhbS5taXhcbiAgLy8gb25seSBhZGRzIGluY29taW5nIGNoYW5nZXMgdG8gdGhlIGdyYXBoLlxuICBpZiAoIW5vZGUgfHwgIWtleSkgcmV0dXJuXG5cbiAgbGV0IHZhbHVlID0gbm9kZVtrZXldXG4gIGlmICghdmFsdWUpIHJldHVyblxuXG4gIG5vZGUgPSB7Xzogbm9kZS5fLCBba2V5XTogdmFsdWV9XG4gIG5vZGUuX1tcIj5cIl0gPSB7W2tleV06IG5vZGUuX1tcIj5cIl1ba2V5XX1cbiAgcmV0dXJuIHtbc291bF06IG5vZGV9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gR2V0XG4iLCIvLyBzdGF0ZSBhbmQgdmFsdWUgYXJlIHRoZSBpbmNvbWluZyBjaGFuZ2VzLlxuLy8gY3VycmVudFN0YXRlIGFuZCBjdXJyZW50VmFsdWUgYXJlIHRoZSBjdXJyZW50IGdyYXBoIGRhdGEuXG5jb25zdCBIYW0gPSAoc3RhdGUsIGN1cnJlbnRTdGF0ZSwgdmFsdWUsIGN1cnJlbnRWYWx1ZSkgPT4ge1xuICBpZiAoc3RhdGUgPCBjdXJyZW50U3RhdGUpIHtcbiAgICByZXR1cm4ge2hpc3RvcmljYWw6IHRydWV9XG4gIH1cblxuICBpZiAoc3RhdGUgPiBjdXJyZW50U3RhdGUpIHtcbiAgICByZXR1cm4ge2luY29taW5nOiB0cnVlfVxuICB9XG5cbiAgLy8gc3RhdGUgaXMgZXF1YWwgdG8gY3VycmVudFN0YXRlLCBsZXhpY2FsbHkgY29tcGFyZSB0byByZXNvbHZlIGNvbmZsaWN0LlxuICB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKSB8fCBcIlwiXG4gIGN1cnJlbnRWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KGN1cnJlbnRWYWx1ZSkgfHwgXCJcIlxuICAvLyBObyB1cGRhdGUgcmVxdWlyZWQuXG4gIGlmICh2YWx1ZSA9PT0gY3VycmVudFZhbHVlKSB7XG4gICAgcmV0dXJuIHtzdGF0ZTogdHJ1ZX1cbiAgfVxuXG4gIC8vIEtlZXAgdGhlIGN1cnJlbnQgdmFsdWUuXG4gIGlmICh2YWx1ZSA8IGN1cnJlbnRWYWx1ZSkge1xuICAgIHJldHVybiB7Y3VycmVudDogdHJ1ZX1cbiAgfVxuXG4gIC8vIE90aGVyd2lzZSB1cGRhdGUgdXNpbmcgdGhlIGluY29taW5nIHZhbHVlLlxuICByZXR1cm4ge2luY29taW5nOiB0cnVlfVxufVxuXG5IYW0ubWl4ID0gKGNoYW5nZSwgZ3JhcGgpID0+IHtcbiAgdmFyIG1hY2hpbmUgPSBEYXRlLm5vdygpXG4gIHZhciB1cGRhdGUgPSB7fVxuICB2YXIgZGVmZXIgPSB7fVxuICBsZXQgd2FpdCA9IDBcblxuICBPYmplY3Qua2V5cyhjaGFuZ2UpLmZvckVhY2goc291bCA9PiB7XG4gICAgY29uc3Qgbm9kZSA9IGNoYW5nZVtzb3VsXVxuICAgIE9iamVjdC5rZXlzKG5vZGUpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT09IFwiX1wiKSByZXR1cm5cblxuICAgICAgY29uc3QgdmFsdWUgPSBub2RlW2tleV1cbiAgICAgIGNvbnN0IHN0YXRlID0gbm9kZS5fW1wiPlwiXVtrZXldXG4gICAgICBjb25zdCBjdXJyZW50VmFsdWUgPSAoZ3JhcGhbc291bF0gfHwge30pW2tleV1cbiAgICAgIGNvbnN0IGN1cnJlbnRTdGF0ZSA9IChncmFwaFtzb3VsXSB8fCB7Xzoge1wiPlwiOiB7fX19KS5fW1wiPlwiXVtrZXldIHx8IDBcblxuICAgICAgLy8gRGVmZXIgdGhlIHVwZGF0ZSBpZiBhaGVhZCBvZiBtYWNoaW5lIHRpbWUuXG4gICAgICBjb25zdCBza2V3ID0gc3RhdGUgLSBtYWNoaW5lXG4gICAgICBpZiAoc2tldyA+IDApIHtcbiAgICAgICAgLy8gSWdub3JlIHVwZGF0ZSBpZiBhaGVhZCBieSBtb3JlIHRoYW4gMjQgaG91cnMuXG4gICAgICAgIGlmIChza2V3ID4gODY0MDAwMDApIHJldHVyblxuXG4gICAgICAgIC8vIFdhaXQgdGhlIHNob3J0ZXN0IGRpZmZlcmVuY2UgYmVmb3JlIHRyeWluZyB0aGUgdXBkYXRlcyBhZ2Fpbi5cbiAgICAgICAgaWYgKHdhaXQgPT09IDAgfHwgc2tldyA8IHdhaXQpIHdhaXQgPSBza2V3XG4gICAgICAgIGlmICghZGVmZXJbc291bF0pIGRlZmVyW3NvdWxdID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgZGVmZXJbc291bF1ba2V5XSA9IHZhbHVlXG4gICAgICAgIGRlZmVyW3NvdWxdLl9bXCI+XCJdW2tleV0gPSBzdGF0ZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gSGFtKHN0YXRlLCBjdXJyZW50U3RhdGUsIHZhbHVlLCBjdXJyZW50VmFsdWUpXG4gICAgICAgIGlmIChyZXN1bHQuaW5jb21pbmcpIHtcbiAgICAgICAgICBpZiAoIXVwZGF0ZVtzb3VsXSkgdXBkYXRlW3NvdWxdID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgICAvLyBUT0RPOiBncmFwaCBzaG91bGQgbm90IGp1c3QgZ3JvdyBpbmRlZmludGl0ZWx5IGluIG1lbW9yeS5cbiAgICAgICAgICAvLyBOZWVkIHRvIGhhdmUgYSBtYXggc2l6ZSBhZnRlciB3aGljaCBzdGFydCBkcm9wcGluZyB0aGUgb2xkZXN0IHN0YXRlXG4gICAgICAgICAgLy8gRG8gc29tZXRoaW5nIHNpbWlsYXIgdG8gRHVwIHdoaWNoIGNhbiBoYW5kbGUgZGVsZXRlcz9cbiAgICAgICAgICBpZiAoIWdyYXBoW3NvdWxdKSBncmFwaFtzb3VsXSA9IHtfOiB7XCIjXCI6IHNvdWwsIFwiPlwiOiB7fX19XG4gICAgICAgICAgZ3JhcGhbc291bF1ba2V5XSA9IHVwZGF0ZVtzb3VsXVtrZXldID0gdmFsdWVcbiAgICAgICAgICBncmFwaFtzb3VsXS5fW1wiPlwiXVtrZXldID0gdXBkYXRlW3NvdWxdLl9bXCI+XCJdW2tleV0gPSBzdGF0ZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgfSlcbiAgcmV0dXJuIHtub3c6IHVwZGF0ZSwgZGVmZXI6IGRlZmVyLCB3YWl0OiB3YWl0fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEhhbVxuIiwiY29uc3QganNFbnYgPSByZXF1aXJlKFwiYnJvd3Nlci1vci1ub2RlXCIpXG5jb25zdCBEdXAgPSByZXF1aXJlKFwiLi9kdXBcIilcbmNvbnN0IEdldCA9IHJlcXVpcmUoXCIuL2dldFwiKVxuY29uc3QgSGFtID0gcmVxdWlyZShcIi4vaGFtXCIpXG5jb25zdCBTdG9yZSA9IHJlcXVpcmUoXCIuL3N0b3JlXCIpXG5cbmNvbnN0IEhvbHN0ZXIgPSBvcHQgPT4ge1xuICBjb25zdCBkdXAgPSBEdXAoKVxuICBjb25zdCBzdG9yZSA9IFN0b3JlKG9wdClcbiAgdmFyIGdyYXBoID0ge31cbiAgdmFyIHF1ZXVlID0ge31cblxuICBjb25zdCBnZXQgPSAobXNnLCBzZW5kKSA9PiB7XG4gICAgY29uc3QgYWNrID0gR2V0KG1zZy5nZXQsIGdyYXBoKVxuICAgIGlmIChhY2spIHtcbiAgICAgIHNlbmQoXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKER1cC5yYW5kb20oKSksXG4gICAgICAgICAgXCJAXCI6IG1zZ1tcIiNcIl0sXG4gICAgICAgICAgcHV0OiBhY2ssXG4gICAgICAgIH0pLFxuICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICBzdG9yZS5nZXQobXNnLmdldCwgKGVyciwgYWNrKSA9PiB7XG4gICAgICAgIHNlbmQoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgXCIjXCI6IGR1cC50cmFjayhEdXAucmFuZG9tKCkpLFxuICAgICAgICAgICAgXCJAXCI6IG1zZ1tcIiNcIl0sXG4gICAgICAgICAgICBwdXQ6IGFjayxcbiAgICAgICAgICAgIGVycjogZXJyLFxuICAgICAgICAgIH0pLFxuICAgICAgICApXG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHB1dCA9IChtc2csIHNlbmQpID0+IHtcbiAgICAvLyBTdG9yZSB1cGRhdGVzIHJldHVybmVkIGZyb20gSGFtLm1peCBhbmQgZGVmZXIgdXBkYXRlcyBpZiByZXF1aXJlZC5cbiAgICBjb25zdCB1cGRhdGUgPSBIYW0ubWl4KG1zZy5wdXQsIGdyYXBoKVxuICAgIHN0b3JlLnB1dCh1cGRhdGUubm93LCAoZXJyLCBvaykgPT4ge1xuICAgICAgc2VuZChcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIFwiI1wiOiBkdXAudHJhY2soRHVwLnJhbmRvbSgpKSxcbiAgICAgICAgICBcIkBcIjogbXNnW1wiI1wiXSxcbiAgICAgICAgICBlcnI6IGVycixcbiAgICAgICAgICBvazogb2ssXG4gICAgICAgIH0pLFxuICAgICAgKVxuICAgIH0pXG4gICAgaWYgKHVwZGF0ZS53YWl0ICE9PSAwKSB7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHB1dCh1cGRhdGUuZGVmZXIsIHNlbmQpLCB1cGRhdGUud2FpdClcbiAgICB9XG4gIH1cblxuICBjb25zdCBhcGkgPSBzZW5kID0+IHtcbiAgICByZXR1cm4ge1xuICAgICAgZ2V0OiAobGV4LCBjYikgPT4ge1xuICAgICAgICBjb25zdCBhY2sgPSBHZXQobGV4LCBncmFwaClcbiAgICAgICAgaWYgKGFjaykge1xuICAgICAgICAgIGNiKG51bGwsIGFjaylcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIHN0b3JlLmdldChsZXgsIChlcnIsIGFjaykgPT4ge1xuICAgICAgICAgIGlmIChhY2spIHtcbiAgICAgICAgICAgIGNiKG51bGwsIGFjaylcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHRyYWNrID0gRHVwLnJhbmRvbSgpXG4gICAgICAgICAgcXVldWVbdHJhY2tdID0gY2JcbiAgICAgICAgICBzZW5kKFxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKHRyYWNrKSxcbiAgICAgICAgICAgICAgZ2V0OiBsZXgsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICApXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcHV0OiAoZGF0YSwgY2IpID0+IHtcbiAgICAgICAgLy8gRGVmZXJyZWQgdXBkYXRlcyBhcmUgb25seSBzdG9yZWQgdXNpbmcgd2lyZSBzcGVjLCB0aGV5J3JlIGlnbm9yZWRcbiAgICAgICAgLy8gaGVyZSB1c2luZyB0aGUgYXBpLiBUaGlzIGlzIG9rIGJlY2F1c2UgY29ycmVjdCB0aW1lc3RhbXBzIHNob3VsZCBiZVxuICAgICAgICAvLyB1c2VkIHdoZXJlYXMgd2lyZSBzcGVjIG5lZWRzIHRvIGhhbmRsZSBjbG9jayBza2V3LlxuICAgICAgICBjb25zdCB1cGRhdGUgPSBIYW0ubWl4KGRhdGEsIGdyYXBoKVxuICAgICAgICBzdG9yZS5wdXQodXBkYXRlLm5vdywgY2IpXG4gICAgICAgIC8vIEFsc28gcHV0IGRhdGEgb24gdGhlIHdpcmUgc3BlYy5cbiAgICAgICAgLy8gVE9ETzogTm90ZSB0aGF0IHRoaXMgbWVhbnMgYWxsIGNsaWVudHMgbm93IHJlY2VpdmUgYWxsIHVwZGF0ZXMsIHNvXG4gICAgICAgIC8vIG5lZWQgdG8gZmlsdGVyIHdoYXQgc2hvdWxkIGJlIHN0b3JlZCwgYm90aCBpbiBncmFwaCBhbmQgb24gZGlzay5cbiAgICAgICAgc2VuZChcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBcIiNcIjogZHVwLnRyYWNrKER1cC5yYW5kb20oKSksXG4gICAgICAgICAgICBwdXQ6IGRhdGEsXG4gICAgICAgICAgfSksXG4gICAgICAgIClcbiAgICAgIH0sXG4gICAgfVxuICB9XG5cbiAgaWYgKGpzRW52LmlzTm9kZSkge1xuICAgIGNvbnN0IFdlYlNvY2tldCA9IHJlcXVpcmUoXCJ3c1wiKVxuICAgIGNvbnN0IHdzcyA9IG5ldyBXZWJTb2NrZXQuU2VydmVyKHtwb3J0OiA4MDgwfSlcbiAgICBjb25zdCBzZW5kID0gKGRhdGEsIGlzQmluYXJ5KSA9PiB7XG4gICAgICB3c3MuY2xpZW50cy5mb3JFYWNoKGNsaWVudCA9PiB7XG4gICAgICAgIGlmIChjbGllbnQucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4pIHtcbiAgICAgICAgICBjbGllbnQuc2VuZChkYXRhLCB7YmluYXJ5OiBpc0JpbmFyeX0pXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfVxuICAgIHdzcy5vbihcImNvbm5lY3Rpb25cIiwgd3MgPT4ge1xuICAgICAgd3Mub24oXCJlcnJvclwiLCBjb25zb2xlLmVycm9yKVxuXG4gICAgICB3cy5vbihcIm1lc3NhZ2VcIiwgKGRhdGEsIGlzQmluYXJ5KSA9PiB7XG4gICAgICAgIGNvbnN0IG1zZyA9IEpTT04ucGFyc2UoZGF0YSlcbiAgICAgICAgaWYgKGR1cC5jaGVjayhtc2dbXCIjXCJdKSkgcmV0dXJuXG5cbiAgICAgICAgZHVwLnRyYWNrKG1zZ1tcIiNcIl0pXG4gICAgICAgIGlmIChtc2cuZ2V0KSBnZXQobXNnLCBzZW5kKVxuICAgICAgICBpZiAobXNnLnB1dCkgcHV0KG1zZywgc2VuZClcbiAgICAgICAgc2VuZChkYXRhLCBpc0JpbmFyeSlcbiAgICAgICAgaWYgKChjYiA9IHF1ZXVlW21zZ1tcIkBcIl1dKSkge1xuICAgICAgICAgIGNiKG51bGwsIG1zZylcbiAgICAgICAgICBkZWxldGUgcXVldWVbbXNnW1wiQFwiXV1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9KVxuICAgIHJldHVybiBhcGkoc2VuZClcbiAgfVxuXG4gIGxldCB3cyA9IG5ldyBXZWJTb2NrZXQoXCJ3czovL2xvY2FsaG9zdDo4MDgwXCIpXG4gIGNvbnN0IHNlbmQgPSBkYXRhID0+IHtcbiAgICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSB7XG4gICAgICBjb25zb2xlLmxvZyhcIndlYnNvY2tldCBub3QgYXZhaWxhYmxlXCIpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB3cy5zZW5kKGRhdGEpXG4gIH1cbiAgY29uc3Qgc3RhcnQgPSAoKSA9PiB7XG4gICAgaWYgKCF3cykgd3MgPSBuZXcgV2ViU29ja2V0KFwid3M6Ly9sb2NhbGhvc3Q6ODA4MFwiKVxuICAgIHdzLm9uY2xvc2UgPSBjID0+IHtcbiAgICAgIHdzID0gbnVsbFxuICAgICAgc2V0VGltZW91dChzdGFydCwgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogNTAwMCkpXG4gICAgfVxuICAgIHdzLm9uZXJyb3IgPSBlID0+IHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSlcbiAgICB9XG4gICAgd3Mub25tZXNzYWdlID0gbSA9PiB7XG4gICAgICBjb25zdCBtc2cgPSBKU09OLnBhcnNlKG0uZGF0YSlcbiAgICAgIGlmIChkdXAuY2hlY2sobXNnW1wiI1wiXSkpIHJldHVyblxuXG4gICAgICBkdXAudHJhY2sobXNnW1wiI1wiXSlcbiAgICAgIGlmIChtc2cuZ2V0KSBnZXQobXNnLCBzZW5kKVxuICAgICAgaWYgKG1zZy5wdXQpIHB1dChtc2csIHNlbmQpXG4gICAgICBpZiAoKGNiID0gcXVldWVbbXNnW1wiQFwiXV0pKSB7XG4gICAgICAgIGNiKG51bGwsIG1zZylcbiAgICAgICAgZGVsZXRlIHF1ZXVlW21zZ1tcIkBcIl1dXG4gICAgICB9XG4gICAgICBzZW5kKG0uZGF0YSlcbiAgICB9XG4gIH1cblxuICBzdGFydCgpXG4gIHJldHVybiBhcGkoc2VuZClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBIb2xzdGVyXG4iLCJjb25zdCBSYWRpeCA9IHJlcXVpcmUoXCIuL3JhZGl4XCIpXG5jb25zdCB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpXG5cbi8vIEFTQ0lJIGNoYXJhY3RlciBmb3IgdW5pdCBzZXBhcmF0b3IuXG5jb25zdCB1bml0ID0gU3RyaW5nLmZyb21DaGFyQ29kZSgzMSlcblxuY29uc3QgUmFkaXNrID0gb3B0ID0+IHtcbiAgdmFyIHVcbiAgdmFyIGNhY2hlID0gbnVsbFxuXG4gIGlmICghb3B0KSBvcHQgPSB7fVxuICBpZiAoIW9wdC5sb2cpIG9wdC5sb2cgPSBjb25zb2xlLmxvZ1xuICBpZiAoIW9wdC5iYXRjaCkgb3B0LmJhdGNoID0gMTAgKiAxMDAwXG4gIGlmICghb3B0LndhaXQpIG9wdC53YWl0ID0gMVxuICBpZiAoIW9wdC5zaXplKSBvcHQuc2l6ZSA9IDEwMjQgKiAxMDI0IC8vIDFNQlxuICBpZiAoIW9wdC5jb2RlKSBvcHQuY29kZSA9IFwiIVwiIC8vIFRoZSBmaXJzdCBwcmludGFibGUgY2hhcmFjdGVyXG4gIGlmICghb3B0LnN0b3JlKSB7XG4gICAgb3B0LmxvZyhcbiAgICAgIFwiUmFkaXNrIG5lZWRzIGBzdG9yZWAgaW50ZXJmYWNlIHdpdGggYHtnZXQ6IGZuLCBwdXQ6IGZuLCBsaXN0OiBmbn1gXCIsXG4gICAgKVxuICAgIHJldHVyblxuICB9XG4gIGlmICghb3B0LnN0b3JlLmdldCkge1xuICAgIG9wdC5sb2coXCJSYWRpc2sgbmVlZHMgYHN0b3JlLmdldGAgaW50ZXJmYWNlIHdpdGggYChmaWxlLCBjYilgXCIpXG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKCFvcHQuc3RvcmUucHV0KSB7XG4gICAgb3B0LmxvZyhcIlJhZGlzayBuZWVkcyBgc3RvcmUucHV0YCBpbnRlcmZhY2Ugd2l0aCBgKGZpbGUsIGRhdGEsIGNiKWBcIilcbiAgICByZXR1cm5cbiAgfVxuICBpZiAoIW9wdC5zdG9yZS5saXN0KSB7XG4gICAgb3B0LmxvZyhcIlJhZGlzayBuZWVkcyBhIHN0cmVhbWluZyBgc3RvcmUubGlzdGAgaW50ZXJmYWNlIHdpdGggYChjYilgXCIpXG4gICAgcmV0dXJuXG4gIH1cblxuICAvKlxuXHRcdEFueSBhbmQgYWxsIHN0b3JhZ2UgYWRhcHRlcnMgc2hvdWxkLi4uXG5cdFx0MS4gQmVjYXVzZSB3cml0aW5nIHRvIGRpc2sgdGFrZXMgdGltZSwgd2Ugc2hvdWxkIGJhdGNoIGRhdGEgdG8gZGlzay5cbiAgICAgICBUaGlzIGltcHJvdmVzIHBlcmZvcm1hbmNlLCBhbmQgcmVkdWNlcyBwb3RlbnRpYWwgZGlzayBjb3JydXB0aW9uLlxuXHRcdDIuIElmIGEgYmF0Y2ggZXhjZWVkcyBhIGNlcnRhaW4gbnVtYmVyIG9mIHdyaXRlcywgd2Ugc2hvdWxkIGltbWVkaWF0ZWx5XG4gICAgICAgd3JpdGUgdG8gZGlzayB3aGVuIHBoeXNpY2FsbHkgcG9zc2libGUuIFRoaXMgY2FwcyB0b3RhbCBwZXJmb3JtYW5jZSxcbiAgICAgICBidXQgcmVkdWNlcyBwb3RlbnRpYWwgbG9zcy5cblx0Ki9cbiAgY29uc3QgcmFkaXNrID0gKGtleSwgdmFsdWUsIGNiKSA9PiB7XG4gICAga2V5ID0gXCJcIiArIGtleVxuXG4gICAgLy8gSWYgbm8gdmFsdWUgaXMgcHJvdmlkZWQgdGhlbiB0aGUgc2Vjb25kIHBhcmFtZXRlciBpcyB0aGUgY2FsbGJhY2tcbiAgICAvLyBmdW5jdGlvbi4gUmVhZCB2YWx1ZSBmcm9tIG1lbW9yeSBvciBkaXNrIGFuZCBjYWxsIGNhbGxiYWNrIHdpdGggaXQuXG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICBjYiA9IHZhbHVlXG4gICAgICB2YWx1ZSA9IHJhZGlzay5iYXRjaChrZXkpXG4gICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIHJldHVybiBjYih1LCB2YWx1ZSlcbiAgICAgIH1cblxuICAgICAgaWYgKHJhZGlzay50aHJhc2guYXQpIHtcbiAgICAgICAgdmFsdWUgPSByYWRpc2sudGhyYXNoLmF0KGtleSlcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgIHJldHVybiBjYih1LCB2YWx1ZSlcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmFkaXNrLnJlYWQoa2V5LCBjYilcbiAgICB9XG5cbiAgICAvLyBPdGhlcndpc2Ugc3RvcmUgdGhlIHZhbHVlIHByb3ZpZGVkLlxuICAgIHJhZGlzay5iYXRjaChrZXksIHZhbHVlKVxuICAgIGlmIChjYikge1xuICAgICAgcmFkaXNrLmJhdGNoLmFja3MucHVzaChjYilcbiAgICB9XG4gICAgLy8gRG9uJ3Qgd2FpdCBpZiB3ZSBoYXZlIGJhdGNoZWQgdG9vIG1hbnkuXG4gICAgaWYgKCsrcmFkaXNrLmJhdGNoLmVkID49IG9wdC5iYXRjaCkge1xuICAgICAgcmV0dXJuIHJhZGlzay50aHJhc2goKVxuICAgIH1cblxuICAgIC8vIE90aGVyd2lzZSB3YWl0IGZvciBtb3JlIHVwZGF0ZXMgYmVmb3JlIHdyaXRpbmcuXG4gICAgY2xlYXJUaW1lb3V0KHJhZGlzay5iYXRjaC50aW1lb3V0KVxuICAgIHJhZGlzay5iYXRjaC50aW1lb3V0ID0gc2V0VGltZW91dChyYWRpc2sudGhyYXNoLCBvcHQud2FpdClcbiAgfVxuXG4gIHJhZGlzay5iYXRjaCA9IFJhZGl4KClcbiAgcmFkaXNrLmJhdGNoLmFja3MgPSBbXVxuICByYWRpc2suYmF0Y2guZWQgPSAwXG5cbiAgcmFkaXNrLnRocmFzaCA9ICgpID0+IHtcbiAgICBpZiAocmFkaXNrLnRocmFzaC5pbmcpIHtcbiAgICAgIHJldHVybiAocmFkaXNrLnRocmFzaC5tb3JlID0gdHJ1ZSlcbiAgICB9XG5cbiAgICBjbGVhclRpbWVvdXQocmFkaXNrLmJhdGNoLnRpbWVvdXQpXG4gICAgcmFkaXNrLnRocmFzaC5tb3JlID0gZmFsc2VcbiAgICByYWRpc2sudGhyYXNoLmluZyA9IHRydWVcbiAgICB2YXIgYmF0Y2ggPSAocmFkaXNrLnRocmFzaC5hdCA9IHJhZGlzay5iYXRjaClcbiAgICByYWRpc2suYmF0Y2ggPSBudWxsXG4gICAgcmFkaXNrLmJhdGNoID0gUmFkaXgoKVxuICAgIHJhZGlzay5iYXRjaC5hY2tzID0gW11cbiAgICByYWRpc2suYmF0Y2guZWQgPSAwXG4gICAgbGV0IGkgPSAwXG4gICAgcmFkaXNrLnNhdmUoYmF0Y2gsIChlcnIsIG9rKSA9PiB7XG4gICAgICAvLyBUaGlzIGlzIHRvIGlnbm9yZSBtdWx0aXBsZSBjYWxsYmFja3MgZnJvbSByYWRpc2suc2F2ZSBjYWxsaW5nXG4gICAgICAvLyByYWRpc2sud3JpdGU/IEl0IGxvb2tzIGxpa2UgbXVsdGlwbGUgY2FsbGJhY2tzIHdpbGwgYmUgbWFkZSBpZiBhXG4gICAgICAvLyBmaWxlIG5lZWRzIHRvIGJlIHNwbGl0LlxuICAgICAgaWYgKCsraSA+IDEpIHJldHVyblxuXG4gICAgICBpZiAoZXJyKSBvcHQubG9nKGVycilcbiAgICAgIGJhdGNoLmFja3MuZm9yRWFjaChjYiA9PiBjYihlcnIsIG9rKSlcbiAgICAgIHJhZGlzay50aHJhc2guYXQgPSBudWxsXG4gICAgICByYWRpc2sudGhyYXNoLmluZyA9IGZhbHNlXG4gICAgICBpZiAocmFkaXNrLnRocmFzaC5tb3JlKSByYWRpc2sudGhyYXNoKClcbiAgICB9KVxuICB9XG5cbiAgLypcblx0XHQxLiBGaW5kIHRoZSBmaXJzdCByYWRpeCBpdGVtIGluIG1lbW9yeVxuXHRcdDIuIFVzZSB0aGF0IGFzIHRoZSBzdGFydGluZyBpbmRleCBpbiB0aGUgZGlyZWN0b3J5IG9mIGZpbGVzXG5cdFx0My4gRmluZCB0aGUgZmlyc3QgZmlsZSB0aGF0IGlzIGxleGljYWxseSBsYXJnZXIgdGhhbiBpdFxuXHRcdDQuIFJlYWQgdGhlIHByZXZpb3VzIGZpbGUgaW50byBtZW1vcnlcblx0XHQ1LiBTY2FuIHRocm91Z2ggaW4gbWVtb3J5IHJhZGl4IGZvciBhbGwgdmFsdWVzIGxleGljYWxseSBsZXNzIHRoYW4gdGhlIGxpbWl0XG5cdFx0Ni4gTWVyZ2UgYW5kIHdyaXRlIGFsbCBvZiB0aG9zZSB0byB0aGUgaW4tbWVtb3J5IGZpbGUgYW5kIGJhY2sgdG8gZGlza1xuXHRcdDcuIElmIGZpbGUgaXMgdG8gbGFyZ2UgdGhlbiBzcGxpdC4gTW9yZSBkZXRhaWxzIG5lZWRlZCBoZXJlXG5cdCovXG4gIHJhZGlzay5zYXZlID0gKHJhZCwgY2IpID0+IHtcbiAgICBjb25zdCBzYXZlID0ge1xuICAgICAgZmluZDogKHRyZWUsIGtleSkgPT4ge1xuICAgICAgICAvLyBUaGlzIGlzIGZhbHNlIGZvciBhbnkga2V5IHVudGlsIHNhdmUuc3RhcnQgaXMgc2V0IHRvIGFuIGluaXRpYWwga2V5LlxuICAgICAgICBpZiAoa2V5IDwgc2F2ZS5zdGFydCkgcmV0dXJuXG5cbiAgICAgICAgc2F2ZS5zdGFydCA9IGtleVxuICAgICAgICBvcHQuc3RvcmUubGlzdChzYXZlLmxleClcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH0sXG4gICAgICBsZXg6IGZpbGUgPT4ge1xuICAgICAgICBpZiAoIWZpbGUgfHwgZmlsZSA+IHNhdmUuc3RhcnQpIHtcbiAgICAgICAgICBzYXZlLmVuZCA9IGZpbGVcbiAgICAgICAgICBzYXZlLm1peChzYXZlLmZpbGUgfHwgb3B0LmNvZGUsIHNhdmUuc3RhcnQsIHNhdmUuZW5kKVxuICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH1cblxuICAgICAgICBzYXZlLmZpbGUgPSBmaWxlXG4gICAgICB9LFxuICAgICAgbWl4OiAoZmlsZSwgc3RhcnQsIGVuZCkgPT4ge1xuICAgICAgICBzYXZlLnN0YXJ0ID0gc2F2ZS5lbmQgPSBzYXZlLmZpbGUgPSB1XG4gICAgICAgIHJhZGlzay5wYXJzZShmaWxlLCAoZXJyLCBkaXNrKSA9PiB7XG4gICAgICAgICAgaWYgKGVycikgcmV0dXJuIGNiKGVycilcblxuICAgICAgICAgIFJhZGl4Lm1hcChyYWQsICh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgICAgICBpZiAoa2V5IDwgc3RhcnQpIHJldHVyblxuXG4gICAgICAgICAgICBpZiAoZW5kICYmIGVuZCA8IGtleSkge1xuICAgICAgICAgICAgICBzYXZlLnN0YXJ0ID0ga2V5XG4gICAgICAgICAgICAgIHJldHVybiBzYXZlLnN0YXJ0XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRpc2soa2V5LCB2YWx1ZSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJhZGlzay53cml0ZShmaWxlLCBkaXNrLCBzYXZlLm5leHQpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgbmV4dDogKGVyciwgb2spID0+IHtcbiAgICAgICAgaWYgKGVycikgcmV0dXJuIGNiKGVycilcblxuICAgICAgICBpZiAoc2F2ZS5zdGFydCkgcmV0dXJuIFJhZGl4Lm1hcChyYWQsIHNhdmUuZmluZClcblxuICAgICAgICBjYihlcnIsIG9rKVxuICAgICAgfSxcbiAgICB9XG4gICAgUmFkaXgubWFwKHJhZCwgc2F2ZS5maW5kKVxuICB9XG5cbiAgLypcblx0XHRBbnkgc3RvcmFnZSBlbmdpbmUgYXQgc29tZSBwb2ludCB3aWxsIGhhdmUgdG8gZG8gYSByZWFkIGluIG9yZGVyIHRvIHdyaXRlLlxuXHRcdFRoaXMgaXMgdHJ1ZSBvZiBldmVuIHN5c3RlbXMgdGhhdCB1c2UgYW4gYXBwZW5kIG9ubHkgbG9nLCBpZiB0aGV5IHN1cHBvcnRcbiAgICB1cGRhdGVzLiBUaGVyZWZvcmUgaXQgaXMgdW5hdm9pZGFibGUgdGhhdCBhIHJlYWQgd2lsbCBoYXZlIHRvIGhhcHBlbiwgdGhlXG5cdFx0cXVlc3Rpb24gaXMganVzdCBob3cgbG9uZyB5b3UgZGVsYXkgaXQuXG5cdCovXG4gIHJhZGlzay53cml0ZSA9IChmaWxlLCByYWQsIGNiKSA9PiB7XG4gICAgLy8gSW52YWxpZGF0ZSBjYWNoZSBvbiB3cml0ZS5cbiAgICBjYWNoZSA9IG51bGxcbiAgICBjb25zdCB3cml0ZSA9IHtcbiAgICAgIHRleHQ6IFwiXCIsXG4gICAgICBjb3VudDogMCxcbiAgICAgIGZpbGU6IGZpbGUsXG4gICAgICBlYWNoOiAodmFsdWUsIGtleSwgaywgcHJlKSA9PiB7XG4gICAgICAgIHdyaXRlLmNvdW50KytcbiAgICAgICAgdmFyIGVuYyA9XG4gICAgICAgICAgUmFkaXNrLmVuY29kZShwcmUubGVuZ3RoKSArXG4gICAgICAgICAgXCIjXCIgK1xuICAgICAgICAgIFJhZGlzay5lbmNvZGUoaykgK1xuICAgICAgICAgICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIgPyBcIlwiIDogXCI9XCIgKyBSYWRpc2suZW5jb2RlKHZhbHVlKSkgK1xuICAgICAgICAgIFwiXFxuXCJcbiAgICAgICAgLy8gQ2Fubm90IHNwbGl0IHRoZSBmaWxlIGlmIG9ubHkgaGF2ZSBvbmUgZW50cnkgdG8gd3JpdGUuXG4gICAgICAgIGlmICh3cml0ZS5jb3VudCA+IDEgJiYgd3JpdGUudGV4dC5sZW5ndGggKyBlbmMubGVuZ3RoID4gb3B0LnNpemUpIHtcbiAgICAgICAgICB3cml0ZS50ZXh0ID0gXCJcIlxuICAgICAgICAgIC8vIE90aGVyd2lzZSBzcGxpdCB0aGUgZW50cmllcyBpbiBoYWxmLlxuICAgICAgICAgIHdyaXRlLmxpbWl0ID0gTWF0aC5jZWlsKHdyaXRlLmNvdW50IC8gMilcbiAgICAgICAgICB3cml0ZS5jb3VudCA9IDBcbiAgICAgICAgICB3cml0ZS5zdWIgPSBSYWRpeCgpXG4gICAgICAgICAgUmFkaXgubWFwKHJhZCwgd3JpdGUuc2xpY2UpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHdyaXRlLnRleHQgKz0gZW5jXG4gICAgICB9LFxuICAgICAgcHV0OiAoKSA9PiB7XG4gICAgICAgIG9wdC5zdG9yZS5wdXQoZmlsZSwgd3JpdGUudGV4dCwgY2IpXG4gICAgICB9LFxuICAgICAgc2xpY2U6ICh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPCB3cml0ZS5maWxlKSByZXR1cm5cblxuICAgICAgICBpZiAoKyt3cml0ZS5jb3VudCA+IHdyaXRlLmxpbWl0KSB7XG4gICAgICAgICAgdmFyIG5hbWUgPSB3cml0ZS5maWxlXG4gICAgICAgICAgLy8gVXNlIG9ubHkgdGhlIHNvdWwgb2YgdGhlIGtleSBhcyB0aGUgZmlsZW5hbWUgc28gdGhhdCBhbGxcbiAgICAgICAgICAvLyBwcm9wZXJ0aWVzIG9mIGEgc291bCBhcmUgd3JpdHRlbiB0byB0aGUgc2FtZSBmaWxlLlxuICAgICAgICAgIGxldCBlbmQgPSBrZXkuaW5kZXhPZihcIi5cIilcbiAgICAgICAgICBpZiAoZW5kID09PSAtMSkge1xuICAgICAgICAgICAgd3JpdGUuZmlsZSA9IGtleVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3cml0ZS5maWxlID0ga2V5LnN1YnN0cmluZygwLCBlbmQpXG4gICAgICAgICAgfVxuICAgICAgICAgIHdyaXRlLmNvdW50ID0gMFxuICAgICAgICAgIHJhZGlzay53cml0ZShuYW1lLCB3cml0ZS5zdWIsIHdyaXRlLm5leHQpXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuXG4gICAgICAgIHdyaXRlLnN1YihrZXksIHZhbHVlKVxuICAgICAgfSxcbiAgICAgIG5leHQ6IGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgICAgd3JpdGUuc3ViID0gUmFkaXgoKVxuICAgICAgICBpZiAoIVJhZGl4Lm1hcChyYWQsIHdyaXRlLnNsaWNlKSkge1xuICAgICAgICAgIHJhZGlzay53cml0ZSh3cml0ZS5maWxlLCB3cml0ZS5zdWIsIGNiKVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH1cbiAgICAvLyBJZiBSYWRpeC5tYXAgZG9lc24ndCByZXR1cm4gdHJ1ZSB3aGVuIGNhbGxlZCB3aXRoIHdyaXRlLmVhY2ggYXMgYVxuICAgIC8vIGNhbGxiYWNrIHRoZW4gZGlkbid0IG5lZWQgdG8gc3BsaXQgdGhlIGRhdGEuIFRoZSBhY2N1bXVsYXRlZCB3cml0ZS50ZXh0XG4gICAgLy8gY2FuIHRoZW4gYmUgc3RvcmVkIHdpdGggd3JpdGUucHV0KCkuXG4gICAgaWYgKCFSYWRpeC5tYXAocmFkLCB3cml0ZS5lYWNoLCB0cnVlKSkgd3JpdGUucHV0KClcbiAgfVxuXG4gIHJhZGlzay5yZWFkID0gKGtleSwgY2IpID0+IHtcbiAgICBpZiAoY2FjaGUpIHtcbiAgICAgIGxldCB2YWx1ZSA9IGNhY2hlKGtleSlcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09IFwidW5kZWZpbmVkXCIpIHJldHVybiBjYih1LCB2YWx1ZSlcbiAgICB9XG5cbiAgICBjb25zdCByZWFkID0ge1xuICAgICAgbGV4OiBmaWxlID0+IHtcbiAgICAgICAgLy8gc3RvcmUubGlzdCBzaG91bGQgY2FsbCBsZXggd2l0aG91dCBhIGZpbGUgbGFzdCwgd2hpY2ggbWVhbnMgbm9cbiAgICAgICAgLy8gZmlsZSB3YXMgZm91bmQgdGhhdCB3YXMgZ3JlYXRlciB0aGFuIGtleS4gVGhhdCBtZWFucyB0aGUgY3VycmVudFxuICAgICAgICAvLyByZWFkLmZpbGUgaXMgdGhlIHJpZ2h0IHBsYWNlIHRvIHJlYWQgdGhlIGtleS5cbiAgICAgICAgaWYgKCFmaWxlIHx8IGZpbGUgPiBrZXkpIHtcbiAgICAgICAgICBpZiAoIXJlYWQuZmlsZSkge1xuICAgICAgICAgICAgY2IoXCJubyBmaWxlIGZvdW5kXCIsIHUpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAocmVhZC5pbmcpIHJldHVyblxuXG4gICAgICAgICAgcmVhZC5pbmcgPSB0cnVlXG4gICAgICAgICAgcmFkaXNrLnBhcnNlKHJlYWQuZmlsZSwgcmVhZC5pdClcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIHJlYWQuZmlsZSA9IGZpbGVcbiAgICAgIH0sXG4gICAgICBpdDogKGVyciwgZGlzaykgPT4ge1xuICAgICAgICBpZiAoZXJyKSBvcHQubG9nKGVycilcbiAgICAgICAgaWYgKGRpc2spIHtcbiAgICAgICAgICBjYWNoZSA9IGRpc2tcbiAgICAgICAgICByZWFkLnZhbHVlID0gZGlzayhrZXkpXG4gICAgICAgIH1cbiAgICAgICAgY2IoZXJyLCByZWFkLnZhbHVlKVxuICAgICAgfSxcbiAgICB9XG4gICAgb3B0LnN0b3JlLmxpc3QocmVhZC5sZXgpXG4gIH1cblxuICAvKlxuXHRcdExldCB1cyBzdGFydCBieSBhc3N1bWluZyB3ZSBhcmUgdGhlIG9ubHkgcHJvY2VzcyB0aGF0IGlzXG5cdFx0Y2hhbmdpbmcgdGhlIGRpcmVjdG9yeSBvciBidWNrZXQuIE5vdCBiZWNhdXNlIHdlIGRvIG5vdCB3YW50XG5cdFx0dG8gYmUgbXVsdGktcHJvY2Vzcy9tYWNoaW5lLCBidXQgYmVjYXVzZSB3ZSB3YW50IHRvIGV4cGVyaW1lbnRcblx0XHR3aXRoIGhvdyBtdWNoIHBlcmZvcm1hbmNlIGFuZCBzY2FsZSB3ZSBjYW4gZ2V0IG91dCBvZiBvbmx5IG9uZS5cblx0XHRUaGVuIHdlIGNhbiB3b3JrIG9uIHRoZSBoYXJkZXIgcHJvYmxlbSBvZiBiZWluZyBtdWx0aS1wcm9jZXNzLlxuXHQqL1xuICByYWRpc2sucGFyc2UgPSAoZmlsZSwgY2IpID0+IHtcbiAgICBjb25zdCBwYXJzZSA9IHtcbiAgICAgIGRpc2s6IFJhZGl4KCksXG4gICAgICByZWFkOiAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgIGlmIChlcnIpIHJldHVybiBjYihlcnIpXG5cbiAgICAgICAgaWYgKCFkYXRhKSByZXR1cm4gY2IodSwgcGFyc2UuZGlzaylcblxuICAgICAgICBsZXQgcHJlID0gW11cbiAgICAgICAgbGV0IHRtcCA9IHBhcnNlLnNwbGl0KGRhdGEpXG4gICAgICAgIHdoaWxlICh0bXApIHtcbiAgICAgICAgICBsZXQga2V5XG4gICAgICAgICAgbGV0IHZhbHVlXG4gICAgICAgICAgbGV0IGkgPSB0bXBbMV1cbiAgICAgICAgICB0bXAgPSBwYXJzZS5zcGxpdCh0bXBbMl0pIHx8IFwiXCJcbiAgICAgICAgICBpZiAodG1wWzBdID09PSBcIiNcIikge1xuICAgICAgICAgICAga2V5ID0gdG1wWzFdXG4gICAgICAgICAgICBwcmUgPSBwcmUuc2xpY2UoMCwgaSlcbiAgICAgICAgICAgIGlmIChpIDw9IHByZS5sZW5ndGgpIHByZS5wdXNoKGtleSlcbiAgICAgICAgICB9XG4gICAgICAgICAgdG1wID0gcGFyc2Uuc3BsaXQodG1wWzJdKSB8fCBcIlwiXG4gICAgICAgICAgaWYgKHRtcFswXSA9PT0gXCJcXG5cIikgY29udGludWVcblxuICAgICAgICAgIGlmICh0bXBbMF0gPT09IFwiPVwiKSB2YWx1ZSA9IHRtcFsxXVxuICAgICAgICAgIGlmICh0eXBlb2Yga2V5ICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiB2YWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgcGFyc2UuZGlzayhwcmUuam9pbihcIlwiKSwgdmFsdWUpXG4gICAgICAgICAgfVxuICAgICAgICAgIHRtcCA9IHBhcnNlLnNwbGl0KHRtcFsyXSlcbiAgICAgICAgfVxuICAgICAgICBjYih1LCBwYXJzZS5kaXNrKVxuICAgICAgfSxcbiAgICAgIHNwbGl0OiBkYXRhID0+IHtcbiAgICAgICAgaWYgKCFkYXRhKSByZXR1cm5cblxuICAgICAgICBsZXQgaSA9IC0xXG4gICAgICAgIGxldCBhID0gXCJcIlxuICAgICAgICBsZXQgYyA9IG51bGxcbiAgICAgICAgd2hpbGUgKChjID0gZGF0YVsrK2ldKSkge1xuICAgICAgICAgIGlmIChjID09PSB1bml0KSBicmVha1xuXG4gICAgICAgICAgYSArPSBjXG4gICAgICAgIH1cbiAgICAgICAgbGV0IG8gPSB7fVxuICAgICAgICBpZiAoYykge1xuICAgICAgICAgIHJldHVybiBbYSwgUmFkaXNrLmRlY29kZShkYXRhLnNsaWNlKGkpLCBvKSwgZGF0YS5zbGljZShpICsgby5pKV1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9XG4gICAgb3B0LnN0b3JlLmdldChmaWxlLCBwYXJzZS5yZWFkKVxuICB9XG5cbiAgcmV0dXJuIHJhZGlza1xufVxuXG5SYWRpc2suZW5jb2RlID0gZGF0YSA9PiB7XG4gIGlmICh0eXBlb2YgZGF0YSA9PSBcInN0cmluZ1wiKSB7XG4gICAgbGV0IGkgPSAwXG4gICAgbGV0IGN1cnJlbnQgPSBudWxsXG4gICAgbGV0IHRleHQgPSB1bml0XG4gICAgd2hpbGUgKChjdXJyZW50ID0gZGF0YVtpKytdKSkge1xuICAgICAgaWYgKGN1cnJlbnQgPT09IHVuaXQpIHRleHQgKz0gdW5pdFxuICAgIH1cbiAgICByZXR1cm4gdGV4dCArICdcIicgKyBkYXRhICsgdW5pdFxuICB9XG5cbiAgbGV0IHRtcCA9IG51bGxcbiAgaWYgKGRhdGEgJiYgZGF0YVtcIiNcIl0gJiYgKHRtcCA9IHV0aWxzLnJlbC5pcyhkYXRhKSkpXG4gICAgcmV0dXJuIHVuaXQgKyBcIiNcIiArIHRtcCArIHVuaXRcblxuICBpZiAodXRpbHMubnVtLmlzKGRhdGEpKSByZXR1cm4gdW5pdCArIFwiK1wiICsgKGRhdGEgfHwgMCkgKyB1bml0XG5cbiAgaWYgKGRhdGEgPT09IG51bGwpIHJldHVybiB1bml0ICsgXCIgXCIgKyB1bml0XG5cbiAgaWYgKGRhdGEgPT09IHRydWUpIHJldHVybiB1bml0ICsgXCIrXCIgKyB1bml0XG5cbiAgaWYgKGRhdGEgPT09IGZhbHNlKSByZXR1cm4gdW5pdCArIFwiLVwiICsgdW5pdFxufVxuXG5SYWRpc2suZGVjb2RlID0gKGRhdGEsIG9iaikgPT4ge1xuICB2YXIgdGV4dCA9IFwiXCJcbiAgdmFyIGkgPSAtMVxuICB2YXIgbiA9IDBcbiAgdmFyIGN1cnJlbnQgPSBudWxsXG4gIHZhciBwcmV2aW91cyA9IG51bGxcbiAgaWYgKGRhdGFbMF0gIT09IHVuaXQpIHJldHVyblxuXG4gIC8vIEZpbmQgYSBjb250cm9sIGNoYXJhY3RlciBwcmV2aW91cyB0byB0aGUgdGV4dCB3ZSB3YW50LCBza2lwcGluZ1xuICAvLyBjb25zZWN1dGl2ZSB1bml0IHNlcGFyYXRvciBjaGFyYWN0ZXJzIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGRhdGEuXG4gIHdoaWxlICgoY3VycmVudCA9IGRhdGFbKytpXSkpIHtcbiAgICBpZiAocHJldmlvdXMpIHtcbiAgICAgIGlmIChjdXJyZW50ID09PSB1bml0KSB7XG4gICAgICAgIGlmICgtLW4gPD0gMCkgYnJlYWtcbiAgICAgIH1cbiAgICAgIHRleHQgKz0gY3VycmVudFxuICAgIH0gZWxzZSBpZiAoY3VycmVudCA9PT0gdW5pdCkge1xuICAgICAgbisrXG4gICAgfSBlbHNlIHtcbiAgICAgIHByZXZpb3VzID0gY3VycmVudCB8fCB0cnVlXG4gICAgfVxuICB9XG5cbiAgaWYgKG9iaikgb2JqLmkgPSBpICsgMVxuXG4gIGlmIChwcmV2aW91cyA9PT0gJ1wiJykgcmV0dXJuIHRleHRcblxuICBpZiAocHJldmlvdXMgPT09IFwiI1wiKSByZXR1cm4gdXRpbHMucmVsLmlmeSh0ZXh0KVxuXG4gIGlmIChwcmV2aW91cyA9PT0gXCIrXCIpIHtcbiAgICBpZiAodGV4dC5sZW5ndGggPT09IDApIHJldHVybiB0cnVlXG5cbiAgICByZXR1cm4gcGFyc2VGbG9hdCh0ZXh0KVxuICB9XG5cbiAgaWYgKHByZXZpb3VzID09PSBcIiBcIikgcmV0dXJuIG51bGxcblxuICBpZiAocHJldmlvdXMgPT09IFwiLVwiKSByZXR1cm4gZmFsc2Vcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSYWRpc2tcbiIsImNvbnN0IHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIilcblxuLy8gQVNDSUkgY2hhcmFjdGVyIGZvciBncm91cCBzZXBhcmF0b3IuXG5jb25zdCBncm91cCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoMjkpXG4vLyBBU0NJSSBjaGFyYWN0ZXIgZm9yIHJlY29yZCBzZXBhcmF0b3IuXG5jb25zdCByZWNvcmQgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDMwKVxuXG5jb25zdCBSYWRpeCA9ICgpID0+IHtcbiAgY29uc3QgcmFkaXggPSAoa2V5cywgdmFsdWUsIHRyZWUpID0+IHtcbiAgICBpZiAoIXRyZWUpIHtcbiAgICAgIGlmICghcmFkaXhbZ3JvdXBdKSByYWRpeFtncm91cF0gPSB7fVxuICAgICAgdHJlZSA9IHJhZGl4W2dyb3VwXVxuICAgIH1cbiAgICBpZiAoIWtleXMpIHJldHVybiB0cmVlXG5cbiAgICBsZXQgaSA9IDBcbiAgICBsZXQgdG1wID0ge31cbiAgICBsZXQga2V5ID0ga2V5c1tpXVxuICAgIGNvbnN0IG1heCA9IGtleXMubGVuZ3RoIC0gMVxuICAgIGNvbnN0IG5vVmFsdWUgPSB0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCJcbiAgICAvLyBGaW5kIGEgbWF0Y2hpbmcgdmFsdWUgdXNpbmcgdGhlIHNob3J0ZXN0IHN0cmluZyBmcm9tIGtleXMuXG4gICAgbGV0IGZvdW5kID0gdHJlZVtrZXldXG4gICAgd2hpbGUgKCFmb3VuZCAmJiBpIDwgbWF4KSB7XG4gICAgICBrZXkgKz0ga2V5c1srK2ldXG4gICAgICBmb3VuZCA9IHRyZWVba2V5XVxuICAgIH1cblxuICAgIGlmICghZm91bmQpIHtcbiAgICAgIC8vIElmIG5vdCBmb3VuZCBmcm9tIHRoZSBwcm92aWRlZCBrZXlzIHRyeSBtYXRjaGluZyB3aXRoIGFuIGV4aXN0aW5nIGtleS5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IHV0aWxzLm9iai5tYXAodHJlZSwgKGhhc1ZhbHVlLCBoYXNLZXkpID0+IHtcbiAgICAgICAgbGV0IGogPSAwXG4gICAgICAgIGxldCBtYXRjaGluZ0tleSA9IFwiXCJcbiAgICAgICAgd2hpbGUgKGhhc0tleVtqXSA9PT0ga2V5c1tqXSkge1xuICAgICAgICAgIG1hdGNoaW5nS2V5ICs9IGhhc0tleVtqKytdXG4gICAgICAgIH1cbiAgICAgICAgaWYgKG1hdGNoaW5nS2V5KSB7XG4gICAgICAgICAgaWYgKG5vVmFsdWUpIHtcbiAgICAgICAgICAgIC8vIG1hdGNoaW5nS2V5IGhhcyB0byBiZSBhcyBsb25nIGFzIHRoZSBvcmlnaW5hbCBrZXlzIHdoZW4gcmVhZGluZy5cbiAgICAgICAgICAgIGlmIChqIDw9IG1heCkgcmV0dXJuXG5cbiAgICAgICAgICAgIHRtcFtoYXNLZXkuc2xpY2UoaildID0gaGFzVmFsdWVcbiAgICAgICAgICAgIHJldHVybiBoYXNWYWx1ZVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGxldCByZXBsYWNlID0ge1xuICAgICAgICAgICAgW2hhc0tleS5zbGljZShqKV06IGhhc1ZhbHVlLFxuICAgICAgICAgICAgW2tleXMuc2xpY2UoaildOiB7W3JlY29yZF06IHZhbHVlfSxcbiAgICAgICAgICB9XG4gICAgICAgICAgdHJlZVttYXRjaGluZ0tleV0gPSB7W2dyb3VwXTogcmVwbGFjZX1cbiAgICAgICAgICBkZWxldGUgdHJlZVtoYXNLZXldXG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIGlmICghcmVzdWx0KSB7XG4gICAgICAgIGlmIChub1ZhbHVlKSByZXR1cm5cblxuICAgICAgICBpZiAoIXRyZWVba2V5XSkgdHJlZVtrZXldID0ge31cbiAgICAgICAgdHJlZVtrZXldW3JlY29yZF0gPSB2YWx1ZVxuICAgICAgfSBlbHNlIGlmIChub1ZhbHVlKSB7XG4gICAgICAgIHJldHVybiB0bXBcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGkgPT09IG1heCkge1xuICAgICAgLy8gSWYgbm8gdmFsdWUgdXNlIHRoZSBrZXkgcHJvdmlkZWQgdG8gcmV0dXJuIGEgd2hvbGUgZ3JvdXAgb3IgcmVjb3JkLlxuICAgICAgaWYgKG5vVmFsdWUpIHtcbiAgICAgICAgLy8gSWYgYW4gaW5kaXZpZHVhbCByZWNvcmQgaXNuJ3QgZm91bmQgdGhlbiByZXR1cm4gdGhlIHdob2xlIGdyb3VwLlxuICAgICAgICByZXR1cm4gdHlwZW9mIGZvdW5kW3JlY29yZF0gPT09IFwidW5kZWZpbmVkXCJcbiAgICAgICAgICA/IGZvdW5kW2dyb3VwXVxuICAgICAgICAgIDogZm91bmRbcmVjb3JkXVxuICAgICAgfVxuICAgICAgLy8gT3RoZXJ3aXNlIGNyZWF0ZSBhIG5ldyByZWNvcmQgYXQgdGhlIHByb3ZpZGVkIGtleSBmb3IgdmFsdWUuXG4gICAgICBmb3VuZFtyZWNvcmRdID0gdmFsdWVcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRm91bmQgYXQgYSBzaG9ydGVyIGtleSwgdHJ5IGFnYWluLlxuICAgICAgaWYgKCFmb3VuZFtncm91cF0gJiYgIW5vVmFsdWUpIGZvdW5kW2dyb3VwXSA9IHt9XG4gICAgICByZXR1cm4gcmFkaXgoa2V5cy5zbGljZSgrK2kpLCB2YWx1ZSwgZm91bmRbZ3JvdXBdKVxuICAgIH1cbiAgfVxuICByZXR1cm4gcmFkaXhcbn1cblxuUmFkaXgubWFwID0gZnVuY3Rpb24gbWFwKHJhZGl4LCBjYiwgb3B0LCBwcmUpIHtcbiAgaWYgKCFwcmUpIHByZSA9IFtdXG4gIHZhciB0cmVlID0gcmFkaXhbZ3JvdXBdIHx8IHJhZGl4XG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModHJlZSkuc29ydCgpXG4gIHZhciB1XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgbGV0IGtleSA9IGtleXNbaV1cbiAgICBsZXQgZm91bmQgPSB0cmVlW2tleV1cbiAgICBsZXQgdG1wID0gZm91bmRbcmVjb3JkXVxuICAgIGlmICh0eXBlb2YgdG1wICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICB0bXAgPSBjYih0bXAsIHByZS5qb2luKFwiXCIpICsga2V5LCBrZXksIHByZSlcbiAgICAgIGlmICh0eXBlb2YgdG1wICE9PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gdG1wXG4gICAgfSBlbHNlIGlmIChvcHQpIHtcbiAgICAgIGNiKHUsIHByZS5qb2luKFwiXCIpLCBrZXksIHByZSlcbiAgICB9XG4gICAgaWYgKGZvdW5kW2dyb3VwXSkge1xuICAgICAgcHJlLnB1c2goa2V5KVxuICAgICAgdG1wID0gbWFwKGZvdW5kW2dyb3VwXSwgY2IsIG9wdCwgcHJlKVxuICAgICAgaWYgKHR5cGVvZiB0bXAgIT09IFwidW5kZWZpbmVkXCIpIHJldHVybiB0bXBcbiAgICAgIHByZS5wb3AoKVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFJhZGl4XG4iLCJjb25zdCBqc0VudiA9IHJlcXVpcmUoXCJicm93c2VyLW9yLW5vZGVcIilcbmNvbnN0IFJhZGlzayA9IHJlcXVpcmUoXCIuL3JhZGlza1wiKVxuY29uc3QgUmFkaXggPSByZXF1aXJlKFwiLi9yYWRpeFwiKVxuY29uc3QgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKVxuXG5jb25zdCBmaWxlU3lzdGVtID0gZGlyID0+IHtcbiAgaWYgKGpzRW52LmlzTm9kZSkge1xuICAgIGNvbnN0IGZzID0gcmVxdWlyZShcImZzXCIpXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGRpcikpIGZzLm1rZGlyU3luYyhkaXIpXG5cbiAgICByZXR1cm4ge1xuICAgICAgZ2V0OiAoZmlsZSwgY2IpID0+IHtcbiAgICAgICAgZnMucmVhZEZpbGUoZGlyICsgXCIvXCIgKyBmaWxlLCAoZXJyLCBkYXRhKSA9PiB7XG4gICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgaWYgKGVyci5jb2RlID09PSBcIkVOT0VOVFwiKSB7XG4gICAgICAgICAgICAgIGNiKClcbiAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRVJST1I6XCIsIGVycilcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGRhdGEpIGRhdGEgPSBkYXRhLnRvU3RyaW5nKClcbiAgICAgICAgICBjYihlcnIsIGRhdGEpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgICAgcHV0OiAoZmlsZSwgZGF0YSwgY2IpID0+IHtcbiAgICAgICAgdmFyIHJhbmRvbSA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKC05KVxuICAgICAgICAvLyBEb24ndCBwdXQgdG1wIGZpbGVzIHVuZGVyIGRpciBzbyB0aGF0IHRoZXkncmUgbm90IGxpc3RlZC5cbiAgICAgICAgdmFyIHRtcCA9IGZpbGUgKyBcIi5cIiArIHJhbmRvbSArIFwiLnRtcFwiXG4gICAgICAgIGZzLndyaXRlRmlsZSh0bXAsIGRhdGEsIChlcnIsIG9rKSA9PiB7XG4gICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgY2IoZXJyKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZnMucmVuYW1lKHRtcCwgZGlyICsgXCIvXCIgKyBmaWxlLCBjYilcbiAgICAgICAgfSlcbiAgICAgIH0sXG4gICAgICBsaXN0OiBjYiA9PiB7XG4gICAgICAgIGZzLnJlYWRkaXIoZGlyLCAoZXJyLCBkaXIpID0+IHtcbiAgICAgICAgICBkaXIuZm9yRWFjaChjYilcbiAgICAgICAgICBjYigpXG4gICAgICAgIH0pXG4gICAgICB9LFxuICAgIH1cbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBpbmRleGVkREJcbiAgcmV0dXJuIHtcbiAgICBnZXQ6IChmaWxlLCBjYikgPT4gY2IoKSxcbiAgICBwdXQ6IChmaWxlLCBkYXRhLCBjYikgPT4gY2IoKSxcbiAgICBsaXN0OiBjYiA9PiBjYigpLFxuICB9XG59XG5cbmNvbnN0IFN0b3JlID0gb3B0ID0+IHtcbiAgaWYgKCF1dGlscy5vYmouaXMob3B0KSkgb3B0ID0ge31cbiAgb3B0LmZpbGUgPSBTdHJpbmcob3B0LmZpbGUgfHwgXCJyYWRhdGFcIilcbiAgaWYgKCFvcHQuc3RvcmUpIG9wdC5zdG9yZSA9IGZpbGVTeXN0ZW0ob3B0LmZpbGUpXG4gIGNvbnN0IHJhZGlzayA9IFJhZGlzayhvcHQpXG5cbiAgcmV0dXJuIHtcbiAgICBnZXQ6IChsZXgsIGNiKSA9PiB7XG4gICAgICBpZiAoIWxleCkge1xuICAgICAgICBjYihcImxleCByZXF1aXJlZFwiKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgdmFyIHNvdWwgPSBsZXhbXCIjXCJdXG4gICAgICB2YXIga2V5ID0gbGV4W1wiLlwiXSB8fCBcIlwiXG4gICAgICB2YXIgbm9kZVxuICAgICAgY29uc3QgZWFjaCA9ICh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIHZhciBkYXRhID0gSlNPTi5wYXJzZSh2YWx1ZSlcbiAgICAgICAgaWYgKCFub2RlKSBub2RlID0ge186IHtcIiNcIjogc291bCwgXCI+XCI6IHt9fX1cbiAgICAgICAgbm9kZVtrZXldID0gZGF0YVswXVxuICAgICAgICBub2RlLl9bXCI+XCJdW2tleV0gPSBkYXRhWzFdXG4gICAgICB9XG5cbiAgICAgIHJhZGlzayhzb3VsICsgXCIuXCIgKyBrZXksIChlcnIsIHZhbHVlKSA9PiB7XG4gICAgICAgIGxldCBncmFwaFxuICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICBSYWRpeC5tYXAodmFsdWUsIGVhY2gpXG4gICAgICAgICAgaWYgKCFub2RlKSBlYWNoKHZhbHVlLCBrZXkpXG4gICAgICAgICAgZ3JhcGggPSB7W3NvdWxdOiBub2RlfVxuICAgICAgICB9XG4gICAgICAgIGNiKGVyciwgZ3JhcGgpXG4gICAgICB9KVxuICAgIH0sXG4gICAgcHV0OiAoZ3JhcGgsIGNiKSA9PiB7XG4gICAgICBpZiAoIWdyYXBoKSB7XG4gICAgICAgIGNiKFwiZ3JhcGggcmVxdWlyZWRcIilcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZhciBjb3VudCA9IDBcbiAgICAgIGNvbnN0IGFjayA9IChlcnIsIG9rKSA9PiB7XG4gICAgICAgIGNvdW50LS1cbiAgICAgICAgaWYgKGFjay5lcnIpIHJldHVyblxuXG4gICAgICAgIGlmICgoYWNrLmVyciA9IGVycikpIHtcbiAgICAgICAgICBjYihlcnIgfHwgXCJFUlJPUiFcIilcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjb3VudCA+IDApIHJldHVyblxuXG4gICAgICAgIGNiKGFjay5lcnIsIDEpXG4gICAgICB9XG5cbiAgICAgIE9iamVjdC5rZXlzKGdyYXBoKS5mb3JFYWNoKHNvdWwgPT4ge1xuICAgICAgICB2YXIgbm9kZSA9IGdyYXBoW3NvdWxdXG4gICAgICAgIE9iamVjdC5rZXlzKG5vZGUpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoXCJfXCIgPT09IGtleSkgcmV0dXJuXG5cbiAgICAgICAgICBjb3VudCsrXG4gICAgICAgICAgbGV0IHZhbHVlID0gbm9kZVtrZXldXG4gICAgICAgICAgbGV0IHN0YXRlID0gbm9kZS5fW1wiPlwiXVtrZXldXG4gICAgICAgICAgcmFkaXNrKHNvdWwgKyBcIi5cIiArIGtleSwgSlNPTi5zdHJpbmdpZnkoW3ZhbHVlLCBzdGF0ZV0pLCBhY2spXG4gICAgICAgIH0pXG4gICAgICB9KVxuICAgIH0sXG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBTdG9yZVxuIiwiY29uc3QgbnVtID0ge1xuICBpczogbiA9PlxuICAgICEobiBpbnN0YW5jZW9mIEFycmF5KSAmJlxuICAgIChuIC0gcGFyc2VGbG9hdChuKSArIDEgPj0gMCB8fCBJbmZpbml0eSA9PT0gbiB8fCAtSW5maW5pdHkgPT09IG4pLFxufVxuXG5jb25zdCBvYmogPSB7XG4gIGlzOiBvYmogPT4ge1xuICAgIGlmICghb2JqKSByZXR1cm4gZmFsc2VcblxuICAgIHJldHVybiAoXG4gICAgICAob2JqIGluc3RhbmNlb2YgT2JqZWN0ICYmIG9iai5jb25zdHJ1Y3RvciA9PT0gT2JqZWN0KSB8fFxuICAgICAgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iaikubWF0Y2goL15cXFtvYmplY3QgKFxcdyspXFxdJC8pWzFdID09PVxuICAgICAgICBcIk9iamVjdFwiXG4gICAgKVxuICB9LFxuICBtYXA6IChsaXN0LCBjYiwgb2JqKSA9PiB7XG4gICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhsaXN0KVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgbGV0IHJlc3VsdCA9IGNiKGxpc3Rba2V5c1tpXV0sIGtleXNbaV0sIG9iailcbiAgICAgIGlmICh0eXBlb2YgcmVzdWx0ICE9PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gcmVzdWx0XG4gICAgfVxuICB9LFxuICBwdXQ6IChvYmosIGtleSwgdmFsdWUpID0+IHtcbiAgICBpZiAoIW9iaikgb2JqID0ge31cbiAgICBvYmpba2V5XSA9IHZhbHVlXG4gICAgcmV0dXJuIG9ialxuICB9LFxuICBkZWw6IChvYmosIGtleSkgPT4ge1xuICAgIGlmICghb2JqKSByZXR1cm5cblxuICAgIG9ialtrZXldID0gbnVsbFxuICAgIGRlbGV0ZSBvYmpba2V5XVxuICAgIHJldHVybiBvYmpcbiAgfSxcbn1cblxuY29uc3QgbWFwX3NvdWwgPSAoc291bCwga2V5LCBvYmopID0+IHtcbiAgLy8gSWYgaWQgaXMgYWxyZWFkeSBkZWZpbmVkIEFORCB3ZSdyZSBzdGlsbCBsb29waW5nIHRocm91Z2ggdGhlIG9iamVjdCxcbiAgLy8gdGhlbiBpdCBpcyBjb25zaWRlcmVkIGludmFsaWQuXG4gIGlmIChvYmouaWQpIHtcbiAgICBvYmouaWQgPSBmYWxzZVxuICAgIHJldHVyblxuICB9XG5cbiAgaWYgKGtleSA9PT0gXCIjXCIgJiYgdHlwZW9mIHNvdWwgPT09IFwic3RyaW5nXCIpIHtcbiAgICBvYmouaWQgPSBzb3VsXG4gICAgcmV0dXJuXG4gIH1cblxuICAvLyBJZiB0aGVyZSBleGlzdHMgYW55dGhpbmcgZWxzZSBvbiB0aGUgb2JqZWN0IHRoYXQgaXNuJ3QgdGhlIHNvdWwsXG4gIC8vIHRoZW4gaXQgaXMgY29uc2lkZXJlZCBpbnZhbGlkLlxuICBvYmouaWQgPSBmYWxzZVxufVxuXG4vLyBDaGVjayBpZiBhbiBvYmplY3QgaXMgYSBzb3VsIHJlbGF0aW9uLCBpZSB7JyMnOiAnVVVJRCd9XG5jb25zdCByZWwgPSB7XG4gIGlzOiB2YWx1ZSA9PiB7XG4gICAgaWYgKHZhbHVlICYmIHZhbHVlW1wiI1wiXSAmJiAhdmFsdWUuXyAmJiBvYmpfaXModmFsdWUpKSB7XG4gICAgICBsZXQgb2JqID0ge31cbiAgICAgIG9iai5tYXAodmFsdWUsIG1hcF9zb3VsLCBvYmopXG4gICAgICBpZiAob2JqLmlkKSByZXR1cm4gby5pZFxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZVxuICB9LFxuICAvLyBDb252ZXJ0IGEgc291bCBpbnRvIGEgcmVsYXRpb24gYW5kIHJldHVybiBpdC5cbiAgaWZ5OiBzb3VsID0+IG9iai5wdXQoe30sIFwiI1wiLCBzb3VsKSxcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7bnVtLCBvYmosIHJlbH1cbiIsIi8qIChpZ25vcmVkKSAqLyIsIi8vIFRoZSBtb2R1bGUgY2FjaGVcbnZhciBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX18gPSB7fTtcblxuLy8gVGhlIHJlcXVpcmUgZnVuY3Rpb25cbmZ1bmN0aW9uIF9fd2VicGFja19yZXF1aXJlX18obW9kdWxlSWQpIHtcblx0Ly8gQ2hlY2sgaWYgbW9kdWxlIGlzIGluIGNhY2hlXG5cdHZhciBjYWNoZWRNb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdO1xuXHRpZiAoY2FjaGVkTW9kdWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY2FjaGVkTW9kdWxlLmV4cG9ydHM7XG5cdH1cblx0Ly8gQ3JlYXRlIGEgbmV3IG1vZHVsZSAoYW5kIHB1dCBpdCBpbnRvIHRoZSBjYWNoZSlcblx0dmFyIG1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF0gPSB7XG5cdFx0Ly8gbm8gbW9kdWxlLmlkIG5lZWRlZFxuXHRcdC8vIG5vIG1vZHVsZS5sb2FkZWQgbmVlZGVkXG5cdFx0ZXhwb3J0czoge31cblx0fTtcblxuXHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cblx0X193ZWJwYWNrX21vZHVsZXNfX1ttb2R1bGVJZF0obW9kdWxlLCBtb2R1bGUuZXhwb3J0cywgX193ZWJwYWNrX3JlcXVpcmVfXyk7XG5cblx0Ly8gUmV0dXJuIHRoZSBleHBvcnRzIG9mIHRoZSBtb2R1bGVcblx0cmV0dXJuIG1vZHVsZS5leHBvcnRzO1xufVxuXG4iLCIiLCIvLyBzdGFydHVwXG4vLyBMb2FkIGVudHJ5IG1vZHVsZSBhbmQgcmV0dXJuIGV4cG9ydHNcbi8vIFRoaXMgZW50cnkgbW9kdWxlIGlzIHJlZmVyZW5jZWQgYnkgb3RoZXIgbW9kdWxlcyBzbyBpdCBjYW4ndCBiZSBpbmxpbmVkXG52YXIgX193ZWJwYWNrX2V4cG9ydHNfXyA9IF9fd2VicGFja19yZXF1aXJlX18oXCIuL3NyYy9ob2xzdGVyLmpzXCIpO1xuIiwiIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9
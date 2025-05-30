import Dup from "./dup.js"
import Get from "./get.js"
import Ham from "./ham.js"
import Store from "./store.js"
import * as utils from "./utils.js"

const isNode = typeof document === "undefined"

const wsModule = isNode ? await import("ws") : undefined

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = wsModule?.WebSocket
}

// Wire starts a websocket client or server and returns get and put methods
// for access to the wire spec and storage.
const Wire = opt => {
  if (!utils.obj.is(opt)) opt = {}

  const dup = Dup(opt.maxAge)
  const store = Store(opt)
  const graph = {}
  const queue = {}
  const listen = {}

  // The check function is required because user data must provide a public key
  // so that it can be verified. The public key might verify the provided
  // signature but not actually match the user under which the data is being
  // stored. To avoid this, the current data on a soul needs to be checked to
  // make sure the stored public key matches the one provided with the update.
  const check = async (data, send, cb) => {
    for (const soul of Object.keys(data)) {
      const msg = await new Promise(res => {
        getWithCallback({"#": soul}, res, send)
      })
      if (msg.err) {
        if (cb) cb(msg.err)
        return false
      }

      const node = data[soul]
      const pub = node._ ? node._.p : undefined
      const key = utils.userPublicKey
      // If there is no current node then the data is ok to write without
      // matching public keys, as the provided soul also needs a rel on the
      // parent node which then also requires checking. Otherwise publc keys
      // need to match for existing data.
      if (!msg.put || !msg.put[soul] || msg.put[soul][key] === pub) {
        continue
      }

      // If a soul exists but does not have a public key, then one should not be
      // added because the node is not user data. The above check fails in this
      // case if a public key is provided. Note that this is only an error case
      // if called via the API, which is when a callback is provided here.
      // (The wire spec can fetch and put data on the wire without a signature
      // or public key and this can be ignored.)
      if (cb) {
        cb(`error in wire check public key does not match for soul: ${soul}`)
      }
      return false
    }

    return true
  }

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

  const put = async (msg, send) => {
    // Store updates returned from Ham.mix and defer updates if required.
    const update = await Ham.mix(msg.put, graph, opt.secure, listen)
    if (Object.keys(update.now).length) {
      if (!(await check(update.now, send))) return

      store.put(update.now, err => {
        send(
          JSON.stringify({
            "#": dup.track(utils.text.random(9)),
            "@": msg["#"],
            err: err,
          }),
        )
      })
    }
    if (Object.keys(update.defer).length) {
      setTimeout(() => put({put: update.defer}, send), update.wait)
    }
  }

  const getWithCallback = (lex, cb, send, opt) => {
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
          if (typeof lex["."] === "string") ack[id] = {[lex["."]]: null}
          cb({put: ack})
          delete queue[track]
        }
      }, opt.wait || 100)
    })
  }

  const api = send => {
    return {
      get: (lex, cb, opt) => {
        getWithCallback(lex, cb, send, opt)
      },
      put: async (data, cb) => {
        // Deferred updates are only stored using wire spec, they're ignored
        // here using the api. This is ok because correct timestamps should be
        // used whereas wire spec needs to handle clock skew for updates
        // across the network.
        const update = await Ham.mix(data, graph, opt.secure, listen)
        const none = Object.keys(update.now).length === 0
        if (none || !(await check(update.now, send, cb))) return

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
        const soul = lex && lex["#"]
        if (!soul || !cb) return

        if (listen[soul]) {
          listen[soul].push({".": lex["."], cb: cb})
        } else {
          listen[soul] = [{".": lex["."], cb: cb}]
        }
      },
      off: (lex, cb) => {
        const soul = lex && lex["#"]
        if (!soul || !listen[soul]) return

        if (cb) {
          const found = listen[soul].find(l => l.cb === cb)
          if (found) {
            listen[soul].splice(listen[soul].indexOf(found), 1)
          }
        } else {
          // Remove all callbacks when none provided.
          delete listen[soul]
        }
      },
    }
  }

  if (isNode) {
    let wss = opt.wss
    // Node's websocket server provides clients as an array, whereas
    // mock-sockets provides clients as a function that returns an array.
    let clients = () => wss.clients()
    if (!wss) {
      wss = new wsModule.WebSocketServer({port: 8080})
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

export default Wire

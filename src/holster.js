const jsEnv = require("browser-or-node")
const Dup = require("./dup")
const Get = require("./get")
const Ham = require("./ham")
const Store = require("./store")

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
    const WebSocket = require("ws")
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

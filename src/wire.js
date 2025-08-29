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

// Rate limiting with throttling
const createRateLimiter = opt => {
  const clients = new Map()
  const maxRequests = opt.maxRequestsPerMinute || 100
  const windowMs = opt.rateLimitWindow || 60000
  // Check if test environment (mock-socket usage)
  const isTestEnv = opt.wss && opt.wss.constructor.name === "Server"
  let cleanupInterval = null

  const cleanup = () => {
    const now = Date.now()
    for (const [clientId, data] of clients.entries()) {
      if (now - data.lastCleanup > windowMs) {
        data.requests = []
        data.lastCleanup = now
      }
      data.requests = data.requests.filter(time => now - time < windowMs)
    }
  }

  if (!isTestEnv) {
    cleanupInterval = setInterval(cleanup, windowMs / 4)
  }

  return {
    getDelay: clientId => {
      const now = Date.now()
      const client = clients.get(clientId) || {
        requests: [],
        lastCleanup: now,
      }

      // Filter old requests
      client.requests = client.requests.filter(time => now - time < windowMs)

      if (client.requests.length >= maxRequests) {
        // Calculate delay based on oldest request that will expire
        const oldestRequest = Math.min(...client.requests)
        const delay = windowMs - (now - oldestRequest)
        return Math.max(0, delay)
      }

      // No delay needed, track this request
      client.requests.push(now)
      clients.set(clientId, client)
      return 0
    },

    getRemainingRequests: clientId => {
      const client = clients.get(clientId)
      if (!client) return maxRequests

      const now = Date.now()
      const validRequests = client.requests.filter(
        time => now - time < windowMs,
      )
      return Math.max(0, maxRequests - validRequests.length)
    },

    destroy: () => {
      if (cleanupInterval) {
        clearInterval(cleanupInterval)
        cleanupInterval = null
      }
      clients.clear()
    },
  }
}

// Safe JSON parser with size limit
const safeJSONParse = (data, maxSize = 1024 * 1024) => {
  try {
    if (typeof data === "string" && data.length > maxSize) {
      throw new Error("Message too large")
    }
    return {success: true, data: JSON.parse(data)}
  } catch (error) {
    return {success: false, error: error.message}
  }
}

// Message size validator
const validateMessage = (data, maxSize = 1024 * 1024) => {
  // 1MB default
  if (typeof data === "string" && data.length > maxSize) {
    return {valid: false, error: "Message too large"}
  }
  if (Buffer.isBuffer(data) && data.length > maxSize) {
    return {valid: false, error: "Message too large"}
  }
  return {valid: true}
}

// Connection manager to limit concurrent connections
const createConnectionManager = (maxConnections = 1000) => {
  const connections = new Set()

  return {
    add: ws => {
      if (connections.size >= maxConnections) {
        return false
      }
      connections.add(ws)

      // Clean up on close
      const originalClose = ws.close
      ws.close = (...args) => {
        connections.delete(ws)
        return originalClose.apply(ws, args)
      }

      return true
    },

    remove: ws => {
      connections.delete(ws)
    },

    count: () => connections.size,

    isFull: () => connections.size >= maxConnections,
  }
}

// Enhanced retry mechanism with exponential backoff
const createRetryHandler = (maxRetries = 5) => {
  let retryCount = 0

  return {
    shouldRetry: () => retryCount < maxRetries,
    getDelay: () => Math.min(1000 * Math.pow(2, retryCount), 30000), // Max 30s
    increment: () => retryCount++,
    reset: () => (retryCount = 0),
  }
}

// Wire starts a websocket client or server and returns get and put methods
// for access to the wire spec and storage.
const Wire = opt => {
  const dup = Dup(opt.maxAge)
  const store = Store(opt)
  const graph = {}
  const queue = {}
  const listen = {}

  // Initialize rate limiting and connection management
  const rateLimiter = createRateLimiter(opt)
  const connectionManager = createConnectionManager(opt.maxConnections || 1000)

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
      const key = utils.userPublicKey
      // If there is no current node then the data is ok to write without
      // matching public keys, as the provided soul also needs a rel on the
      // parent node which then also requires checking. Otherwise publc keys
      // need to match for existing data.
      if (!msg.put || !msg.put[soul] || msg.put[soul][key] === node[key]) {
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

  const getWithCallback = (lex, cb, send, _opt) => {
    if (!cb) return

    if (!utils.obj.is(_opt)) _opt = {}

    const ack = Get(lex, graph)
    const track = utils.text.random(9)
    // Request the whole node in secure mode for verification.
    const request = JSON.stringify({
      "#": dup.track(track),
      get: opt.secure ? {"#": lex["#"]} : lex,
    })

    if (ack) {
      // Also send request on the wire to check for updates.
      send(request)
      cb({put: ack})
      return
    }

    store.get(lex, (err, ack) => {
      if (ack) {
        // Also send request on the wire to check for updates.
        send(request)
        cb({put: ack, err: err})
        return
      }

      if (err) console.log(err)

      queue[track] = cb
      send(request)
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
      }, _opt.wait || 100)
    })
  }

  const api = send => {
    return {
      get: (lex, cb, _opt) => {
        getWithCallback(lex, cb, send, _opt)
      },
      put: async (data, cb) => {
        // Deferred updates are only stored using wire spec, they're ignored
        // here using the api. This is ok because correct timestamps should be
        // used whereas wire spec needs to handle clock skew for updates
        // across the network.
        const update = await Ham.mix(data, graph, opt.secure, listen)
        const none = Object.keys(update.now).length === 0
        if (none) {
          // Nothing to do.
          cb(null)
          return
        }

        if (!(await check(update.now, send, cb))) return

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
      on: (lex, cb, _get, _opt) => {
        const soul = lex && lex["#"]
        if (!soul || !cb) return

        if (listen[soul]) {
          listen[soul].push({".": lex["."], cb: cb})
        } else {
          listen[soul] = [{".": lex["."], cb: cb}]
        }
        if (_get) getWithCallback(lex, cb, send, _opt)
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
      const config = opt.server
        ? {server: opt.server}
        : {port: opt.port || 8765}
      wss = new wsModule.WebSocketServer(config)
      clients = () => wss.clients
    }

    const send = (data, isBinary) => {
      clients().forEach(client => {
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(data, {binary: isBinary})
        } else {
          const retryHandler = client._retryHandler || createRetryHandler()
          client._retryHandler = retryHandler

          if (retryHandler.shouldRetry()) {
            const delay = retryHandler.getDelay()
            retryHandler.increment()

            setTimeout(() => {
              if (client && client.readyState === WebSocket.OPEN) {
                retryHandler.reset()
                client.send(data, {binary: isBinary})
              }
            }, delay)
          }
        }
      })
    }
    wss.on("connection", ws => {
      // Check connection limit
      if (!connectionManager.add(ws)) {
        console.log("Connection limit reached, rejecting connection")
        ws.close(1013, "Connection limit reached - try again later")
        return
      }

      // Generate unique client ID for rate limiting
      const clientId = utils.text.random(9)

      ws.on("error", error => {
        console.error("WebSocket error:", error)
        connectionManager.remove(ws)
      })

      ws.on("close", () => {
        connectionManager.remove(ws)
      })

      ws.on("message", (data, isBinary) => {
        // Validate message size
        const validation = validateMessage(data, opt.maxMessageSize)
        if (!validation.valid) {
          console.warn(`Invalid message: ${validation.error}`)
          ws.send(JSON.stringify({error: validation.error}))
          return
        }

        // Safe JSON parsing
        const parseResult = safeJSONParse(data, opt.maxMessageSize)
        if (!parseResult.success) {
          console.warn(`JSON parse error: ${parseResult.error}`)
          ws.send(JSON.stringify({error: "Invalid JSON"}))
          return
        }

        const msg = parseResult.data
        if (dup.check(msg["#"])) return

        // Check rate limit and get delay
        const delay = rateLimiter.getDelay(clientId)

        const processMessage = () => {
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
        }

        if (delay > 0) {
          // Throttle the client by delaying message processing
          setTimeout(processMessage, delay)
        } else {
          // Process immediately
          processMessage()
        }
      })
    })
    return api(send)
  }

  const peers = []
  const send = data => {
    peers.forEach(peer => {
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(data)
      } else {
        const retryHandler = peer._retryHandler || createRetryHandler()
        peer._retryHandler = retryHandler

        if (retryHandler.shouldRetry()) {
          const delay = retryHandler.getDelay()
          retryHandler.increment()

          setTimeout(() => {
            if (peer && peer.readyState === WebSocket.OPEN) {
              retryHandler.reset()
              peer.send(data)
            }
          }, delay)
        }
      }
    })
  }
  if (!(opt.peers instanceof Array)) {
    opt.peers = [`ws://localhost:${opt.port || 8765}`]
  }
  opt.peers.forEach(peer => {
    const start = () => {
      let ws = new WebSocket(peer)
      peers.push(ws)
      const retryHandler = createRetryHandler()

      ws.onclose = c => {
        if (peers.indexOf(ws) !== -1) {
          peers.splice(peers.indexOf(ws), 1)
        }
        ws = null

        if (retryHandler.shouldRetry()) {
          const delay = retryHandler.getDelay()
          retryHandler.increment()
          setTimeout(start, delay)
        }
      }

      ws.onopen = () => {
        retryHandler.reset()
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
  })

  return api(send)
}

export default Wire

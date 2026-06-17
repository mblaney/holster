import Dup from "./dup.js"
import Get from "./get.js"
import Ham from "./ham.js"
import Store from "./store.js"
import * as utils from "./utils.js"

const isNode = typeof process !== "undefined" && process.versions?.node != null

const wsModule = isNode ? await import("ws") : undefined
const fs = isNode ? await import(/*webpackIgnore: true*/ "node:fs") : undefined

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = wsModule?.WebSocket
}

// Rate limiting with throttling
const createRateLimiter = isTestEnv => {
  const clients = new Map()
  const maxRequests = 1500 // requests per minute
  const windowMs = 60000 // 1 minute window
  const disconnectThreshold = 10 // Disconnect after 10 violations
  let cleanupInterval = null

  const cleanup = () => {
    const now = Date.now()
    for (const [clientId, data] of clients.entries()) {
      if (now - data.lastCleanup > windowMs) {
        data.requests = []
        data.lastCleanup = now
      }
      data.requests = data.requests.filter(time => now - time < windowMs)
      // Reset throttle counts periodically
      if (now - data.lastCleanup > windowMs * 10) {
        data.throttleCount = 0
      }
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
        throttleCount: 0,
      }

      // Filter old requests
      client.requests = client.requests.filter(time => now - time < windowMs)

      if (client.requests.length >= maxRequests) {
        // Calculate delay based on oldest request that will expire
        const oldestRequest = Math.min(...client.requests)
        const delay = windowMs - (now - oldestRequest)
        // Increment throttle count and update client data
        client.throttleCount = (client.throttleCount || 0) + 1
        clients.set(clientId, client)
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

    getThrottleCount: clientId => {
      const client = clients.get(clientId)
      return client ? client.throttleCount || 0 : 0
    },

    shouldDisconnect: clientId => {
      const client = clients.get(clientId)
      if (!client) return false
      return client.throttleCount >= disconnectThreshold
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
  const dup = Dup()
  const store = Store(opt)
  const graph = {}
  const queue = {}
  const listen = {}
  // Tracks souls that have had a complete full-node store fetch, so subsequent
  // full-node requests can read directly from the in-memory graph without a
  // redundant store round-trip. Kept in sync with graph eviction via Ham.mix.
  const hasNode = new Set()

  // Track references we want but don't have yet
  const pendingReferences = new Set()

  // Debounce client-side wire update checks: skip if the same lex was checked
  // recently. Keyed by "soul" or "soul.property".
  const recentChecks = new Map()
  const recentCheckTTL = 10000 // 10 seconds

  // Track pending timeouts that should start when message is sent
  const pendingTimeouts = new Map()

  // Track offline null-response timeouts so they can be cancelled if the WS
  // connects before they fire. Keyed by the same trackId as pendingTimeouts.
  const offlineTimeouts = new Map()

  // Helper to check if we have a soul in memory or storage
  const hasSoul = async soul => {
    if (graph[soul]) return true
    return new Promise(resolve => {
      store.get({"#": soul}, (err, data) => {
        resolve(!err && data && data[soul])
      })
    })
  }

  // Initialize rate limiting and connection management
  // Check if test environment (mock-socket usage)
  const isTestEnv = isNode && globalThis.WebSocket !== wsModule?.WebSocket
  const rateLimiter = createRateLimiter(isTestEnv)
  const connectionManager = createConnectionManager(opt.maxConnections || 1000)

  // User storage limiting — server-side only, requires opt.userLimit: true.
  const DEFAULT_STORAGE_LIMIT = 1 // 1 MB
  const defaultLimit =
    (typeof opt.defaultLimit === "number"
      ? opt.defaultLimit
      : DEFAULT_STORAGE_LIMIT) * 1048576
  const userStorage = new Map() // Map<pubkey, totalBytes>
  const userLimits = new Map() // Map<pubkey, maxBytes> converted from MB in .user_limit.json
  let saveStorageTimer = null

  const loadUserStorage = cb => {
    fs.readFile(`${opt.file}/../.user_storage.json`, "utf8", (err, raw) => {
      if (err) {
        if (cb) cb()
        return
      }

      try {
        const data = JSON.parse(raw)
        userStorage.clear()
        for (const [pub, total] of Object.entries(data)) {
          if (typeof total === "number") userStorage.set(pub, total)
        }
      } catch {
        // Invalid JSON — start with empty map.
      }
      if (cb) cb()
    })
  }

  const saveUserStorage = () => {
    if (saveStorageTimer) return

    const t = setTimeout(() => {
      saveStorageTimer = null
      const data = {}
      for (const [pub, total] of userStorage) {
        data[pub] = total
      }
      fs.writeFile(
        `${opt.file}/../.user_storage.json`,
        JSON.stringify(data),
        err => {
          if (err) console.warn("saveUserStorage error:", err)
        },
      )
    }, 5000)
    if (t.unref) t.unref()
    saveStorageTimer = t
  }

  const loadUserLimits = cb => {
    fs.readFile(`${opt.file}/../.user_limit.json`, "utf8", (err, raw) => {
      if (err) {
        if (cb) cb()
        return
      }
      try {
        const data = JSON.parse(raw)
        userLimits.clear()
        for (const [pub, limit] of Object.entries(data)) {
          if (typeof limit === "number") userLimits.set(pub, limit * 1048576)
          // Non-numeric values ignored, falls back to defaultLimit.
        }
      } catch {
        // Invalid JSON — userLimits stays empty.
      }
      if (cb) cb()
    })
  }

  const formatBytes = bytes => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
    return `${(bytes / 1073741824).toFixed(1)} GB`
  }

  const logStorageSummary = () => {
    const userCount = userStorage.size
    const defLimitStr =
      defaultLimit === 0
        ? "0 B (unlisted users blocked)"
        : formatBytes(defaultLimit)
    console.log(
      `[HOLSTER] Per-user storage limits enabled (${userCount} user${userCount !== 1 ? "s" : ""}, default: ${defLimitStr})`,
    )
    const sorted = [...userStorage.entries()].sort(([, a], [, b]) => b - a)
    const formatUser = pub => {
      const total = userStorage.get(pub) ?? 0
      const limit = userLimits.get(pub) ?? defaultLimit
      const limitStr = limit === 0 ? "0 B (blocked)" : formatBytes(limit)
      return `  ${pub} — used: ${formatBytes(total)} / limit: ${limitStr}`
    }
    if (userCount <= 5) {
      sorted.forEach(([pub]) => console.log(formatUser(pub)))
    } else {
      console.log("  Top 5 by storage used:")
      sorted.slice(0, 5).forEach(([pub]) => console.log(formatUser(pub)))
      console.log(`  Run \`node examples/user-storage.js\` to view all users`)
    }
  }

  // The check function is required because user data must provide a public key
  // so that it can be verified. The public key might verify the provided
  // signature but not actually match the user under which the data is being
  // stored. To avoid this, the current data on a soul needs to be checked to
  // make sure the stored public key matches the one provided with the update.
  const check = async (data, send, cb) => {
    const key = utils.userPublicKey

    for (const soul of Object.keys(data)) {
      const node = data[soul]
      // If the incoming update doesn't include a userPublicKey property at all,
      // allow it - the update is not trying to change the public key.
      if (node[key] === undefined) continue

      const msg = await new Promise(res => {
        getWithCallback({"#": soul, ".": key}, res, send, {put: true})
      })
      if (msg.err) {
        if (cb) cb(msg.err)
        return false
      }

      // If there is no current node then the data is ok to write without
      // matching public keys, as the provided soul also needs a rel on the
      // parent node which then also requires checking. Otherwise public keys
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
    // Capture old graph sizes before Ham.mix updates graph in place.
    const oldGraphBytes = {}
    if (opt.userLimit) {
      for (const [soul, node] of Object.entries(msg.put)) {
        if (node && node[utils.userPublicKey] && graph[soul]) {
          oldGraphBytes[soul] = JSON.stringify(graph[soul]).length
        }
      }
    }

    // Store updates returned from Ham.mix and defer updates if required.
    const update = await Ham.mix(
      msg.put,
      graph,
      hasNode,
      opt.secure,
      listen,
      opt.maxGraphSize,
    )
    if (Object.keys(update.now).length === 0) {
      // No updates to store, check deferred.
      if (Object.keys(update.defer).length !== 0) {
        setTimeout(
          () => put({put: update.defer, "#": msg["#"]}, send),
          update.wait,
        )
      }
      return
    }

    if (!(await check(update.now, send))) return

    const finish = err => {
      if (err) console.warn("store.put", err)
      send(
        JSON.stringify({
          "#": dup.track(utils.text.random(9)),
          "@": msg["#"],
          err: err,
        }),
      )
      // Fire listeners after data is stored
      update.listeners.forEach(cb => cb())
    }

    if (!opt.userLimit) {
      store.put(update.now, finish)
    } else {
      const toStore = {}
      for (const [soul, node] of Object.entries(update.now)) {
        const pub = node[utils.userPublicKey]
        if (!pub) {
          toStore[soul] = node
          continue
        }
        const limit = userLimits.get(pub) ?? defaultLimit
        if ((userStorage.get(pub) ?? 0) >= limit) continue
        toStore[soul] = node
        const oldBytes = oldGraphBytes[soul] ?? 0
        const newBytes = JSON.stringify(node).length
        userStorage.set(
          pub,
          Math.max(0, (userStorage.get(pub) ?? 0) - oldBytes + newBytes),
        )
        saveUserStorage()
      }
      if (Object.keys(toStore).length > 0) {
        store.put(toStore, finish)
      } else {
        finish(null)
      }
    }

    if (Object.keys(update.defer).length !== 0) {
      setTimeout(
        () => put({put: update.defer, "#": msg["#"]}, send),
        update.wait,
      )
    }
  }

  const getWithCallback = (lex, cb, send, _opt) => {
    if (!cb) return

    if (!utils.obj.is(_opt)) _opt = {}

    // For full-node requests on souls that have been fully fetched from store,
    // treat the graph as authoritative — skip the redundant store round-trip.
    const fast = _opt.fast || (!lex["."] && hasNode.has(lex["#"]))
    const ack = Get(lex, graph, fast)
    const track = utils.text.random(9)
    const request = JSON.stringify({
      "#": dup.track(track),
      get: lex,
    })

    if (ack) {
      if (!isNode) {
        // Client: send request on the wire to check for updates,
        // since it may have missed puts while disconnected.
        // Skip if the same lex was checked recently to avoid flooding.
        if (!lex["."] || typeof lex["."] === "string") {
          const checkKey = lex["#"] + (lex["."] ? "." + lex["."] : "")
          const now = Date.now()
          const lastCheck = recentChecks.get(checkKey)
          if (!lastCheck || now - lastCheck > recentCheckTTL) {
            recentChecks.set(checkKey, now)
            const sendResult = send(request)
            if (sendResult && sendResult.err) {
              cb({err: sendResult.err})
              return
            }
          }
        } else {
          // Don't skip checks for other types of lex queries.
          const sendResult = send(request)
          if (sendResult && sendResult.err) {
            cb({err: sendResult.err})
            return
          }
        }
      }
      cb({put: ack})
      return
    }

    store.get(lex, (err, ack) => {
      if (ack) {
        // Populate in-memory graph from store data before sending the server
        // request, so stale server responses with older state are correctly
        // rejected by ham.mix.
        for (const [soul, node] of Object.entries(ack)) {
          if (!node) continue
          if (!graph[soul]) {
            graph[soul] = {...node}
            continue
          }
          // Merge properties absent from the current graph entry. Only add
          // missing keys — existing entries were set by ham.mix and represent
          // the authoritative merged state for those properties.
          for (const [key, value] of Object.entries(node)) {
            if (key === "_") continue
            if (typeof graph[soul][key] !== "undefined") continue
            graph[soul][key] = value
            if (
              node._ &&
              node._[">"] &&
              typeof node._[">"][key] !== "undefined"
            ) {
              const state = node._[">"][key]
              graph[soul]._[">"][key] = state
              if (node._["s"] && node._["s"][state]) {
                if (!graph[soul]._["s"]) graph[soul]._["s"] = {}
                graph[soul]._["s"][state] = node._["s"][state]
              }
            }
          }
        }
        // Full-node fetch: the graph is now complete for this soul.
        if (!lex["."] && ack[lex["#"]]) hasNode.add(lex["#"])
        // Only serve from store if the requested property is present.
        const node = ack[lex["#"]]
        const hasProperty =
          node &&
          Object.keys(node).some(
            key => key !== "_" && utils.match(lex["."], key),
          )
        if (hasProperty) {
          // Public keys are immutable once written — never need a wire check.
          if (!isNode && lex["."] !== utils.userPublicKey) {
            if (!lex["."] || typeof lex["."] === "string") {
              const checkKey = lex["#"] + (lex["."] ? "." + lex["."] : "")
              const now = Date.now()
              const lastCheck = recentChecks.get(checkKey)
              if (!lastCheck || now - lastCheck > recentCheckTTL) {
                recentChecks.set(checkKey, now)
                const sendResult = send(request)
                if (sendResult && sendResult.err) {
                  cb({err: sendResult.err})
                  return
                }
              }
            } else {
              const sendResult = send(request)
              if (sendResult && sendResult.err) {
                cb({err: sendResult.err})
                return
              }
            }
          }
          cb(err ? {put: ack, err: err} : {put: ack})
          return
        }
      }

      // Data wasn't found locally, log errors and call back after a timeout.
      if (err) console.log(err)

      // Put requests only need a local answer — skip the wire round-trip.
      if (_opt && _opt.put) {
        const id = lex["#"]
        const ack = {[id]: null}
        if (typeof lex["."] === "string") {
          ack[id] = {[lex["."]]: null}
        }
        cb({put: ack})
        return
      }

      queue[track] = cb

      // Store lex to construct the null ack when the timeout fires
      pendingTimeouts.set(track, lex)

      // Ensure the requested soul is stored when the response arrives.
      pendingReferences.add(lex["#"])

      const sendResult = send(request)
      if (sendResult && sendResult.err) {
        cb({err: sendResult.err})
        delete queue[track]
        pendingTimeouts.delete(track)
        return
      }
    })
  }

  const api = send => {
    return {
      get: (lex, cb, _opt) => {
        if (lex && typeof lex["."] === "number") {
          lex = {...lex, ".": String(lex["."])}
        }
        // Mark requested soul as something we want to store
        if (lex && lex["#"]) {
          pendingReferences.add(lex["#"])
        }
        getWithCallback(lex, cb, send, _opt)
      },
      put: async (data, cb) => {
        // Deferred updates are only stored using wire spec, they're ignored
        // here using the api. This is ok because correct timestamps should be
        // used whereas wire spec needs to handle clock skew for updates
        // across the network.
        const oldGraphBytes = {}
        if (opt.userLimit) {
          for (const [soul, node] of Object.entries(data)) {
            if (node && node[utils.userPublicKey] && graph[soul]) {
              oldGraphBytes[soul] = JSON.stringify(graph[soul]).length
            }
          }
        }
        const update = await Ham.mix(
          data,
          graph,
          hasNode,
          opt.secure,
          listen,
          opt.maxGraphSize,
        )
        if (Object.keys(update.now).length === 0) {
          // No updates, still respond to callback.
          if (cb) cb(null)
          return
        }

        if (!(await check(update.now, send, cb))) {
          return
        }

        if (opt.userLimit) {
          for (const [soul, node] of Object.entries(update.now)) {
            const pub = node[utils.userPublicKey]
            if (!pub) continue
            const limit = userLimits.get(pub) ?? defaultLimit
            const current = userStorage.get(pub) ?? 0
            if (current >= limit) {
              if (cb) cb("storage limit exceeded")
              return
            }

            const oldBytes = oldGraphBytes[soul] ?? 0
            const newBytes = JSON.stringify(node).length
            userStorage.set(pub, Math.max(0, current - oldBytes + newBytes))
            saveUserStorage()
          }
        }

        // Seed pendingReferences with any new references from API calls
        for (const [soul, node] of Object.entries(update.now)) {
          if (node && typeof node === "object") {
            for (const [key, value] of Object.entries(node)) {
              const soulId = utils.rel.is(value)
              if (soulId) {
                // Add referenced soul to pending list
                pendingReferences.add(soulId)
              }
            }
          }
        }

        store.put(update.now, err => {
          if (cb) cb(err)
          // Fire listeners after data is stored
          update.listeners.forEach(l => l())
        })

        // Always put data on the wire spec even if no local update needed
        const sendResult = send(
          JSON.stringify({
            "#": dup.track(utils.text.random(9)),
            put: data,
          }),
        )
        // Handle queue overflow error.
        if (sendResult && sendResult.err) {
          if (cb) cb(sendResult.err)
          return
        }
      },
      on: (lex, cb, _get, _opt) => {
        if (lex && typeof lex["."] === "number") {
          lex = {...lex, ".": String(lex["."])}
        }
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

  if (isNode && (opt.wss || opt.server || opt.port != null)) {
    let wss = opt.wss
    // Node's websocket server provides clients as an array, whereas
    // mock-sockets provides clients as a function that returns an array.
    let clients = () => wss.clients()
    if (!wss) {
      const config = opt.server ? {server: opt.server} : {port: opt.port}
      wss = new wsModule.WebSocketServer(config)
      clients = () => wss.clients
    }

    const send = (data, isBinary) => {
      // Start timeout for this message now that it's being sent
      const msg = JSON.parse(data)
      const trackId = msg["#"]
      if (trackId && pendingTimeouts.has(trackId)) {
        const lex = pendingTimeouts.get(trackId)
        pendingTimeouts.delete(trackId)

        setTimeout(
          () => {
            const cb = queue[trackId]
            if (cb) {
              const id = lex["#"]
              const ack = {[id]: null}
              if (typeof lex["."] === "string") {
                ack[id] = {[lex["."]]: null}
              }
              cb({put: ack})
              delete queue[trackId]
            }
          },
          isTestEnv ? 100 : 10000,
        )
      }

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
    if (opt.userLimit) {
      loadUserStorage(() => loadUserLimits(() => logStorageSummary()))
      setInterval(loadUserLimits, 60000).unref()
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
      console.log(`New WebSocket client connected: ${clientId}`)

      ws.on("error", error => {
        console.log("WebSocket error:", error)
        connectionManager.remove(ws)
      })

      ws.on("close", () => {
        console.log(`WebSocket client disconnected: ${clientId}`)
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
        // Log rate limiting activity and enforce stricter limits
        if (delay > 0) {
          const throttleCount = rateLimiter.getThrottleCount(clientId)
          console.log(
            `Client ${clientId}: rate limit exceeded, delay would be ${delay}ms, dropping message (throttle count: ${throttleCount})`,
          )
          // Check if we should disconnect the bad actor
          if (rateLimiter.shouldDisconnect(clientId)) {
            console.log(
              `Client ${clientId}: Disconnecting after ${throttleCount} throttle violations`,
            )
            ws.close(1008, "Rate limit violations")
            return
          }

          // Send throttle warning back to client instead of processing
          ws.send(
            JSON.stringify({
              "#": dup.track(utils.text.random(9)),
              "@": msg["#"],
              err: `Rate limit exceeded. Slow down requests. Wait ${Math.ceil(delay / 1000)}s`,
              throttle: delay,
            }),
          )
          return
        }

        const processMessage = async () => {
          dup.track(msg["#"])

          if (msg.get) get(msg, send)
          if (msg.put) await put(msg, send)
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

  // Browser logic.
  const peers = []
  // Client-side throttling state
  let clientThrottled = false
  let throttleUntil = 0
  let messageQueue = []
  let offlinePuts = []
  let queueProcessor = null
  const maxQueueLength = opt.maxQueueLength || 10000

  const startResponseTimeout = (
    trackId,
    lex,
    delay = isTestEnv ? 100 : 10000,
  ) => {
    return setTimeout(() => {
      offlineTimeouts.delete(trackId)
      pendingTimeouts.delete(trackId)
      const cb = queue[trackId]
      // No-op on successful send as callback is removed from the queue.
      if (cb) {
        const id = lex["#"]
        const ack = {[id]: null}
        if (typeof lex["."] === "string") {
          ack[id] = {[lex["."]]: null}
        }
        cb({put: ack})
        delete queue[trackId]
      }
    }, delay)
  }

  const processQueue = () => {
    if (messageQueue.length === 0) {
      queueProcessor = null
      return
    }

    const now = Date.now()
    if (clientThrottled && now < throttleUntil) {
      // Still throttled, schedule next queue check
      queueProcessor = setTimeout(
        processQueue,
        Math.min(1000, throttleUntil - now),
      )
      return
    }

    // Throttle period ended, resume processing
    if (clientThrottled && now >= throttleUntil) {
      console.log(`Throttle period ended, resuming queue processing`)
      clientThrottled = false
      throttleUntil = 0
    }

    // Process next message in queue
    const data = messageQueue[0]
    const sent = sendToPeers(data)

    const msg = JSON.parse(data)
    const trackId = msg["#"]

    // Drop GET messages with no pending callback — these were already served
    // from local store so no caller is waiting for the wire response.
    const isStaleCheckMessage =
      !sent && msg.get && !pendingTimeouts.has(trackId)

    if (sent || isStaleCheckMessage) {
      messageQueue.shift()
    } else if (!sent && msg.put) {
      // Hold offline PUTs separately so they don't block GET messages behind
      // them. They'll be flushed back to the front of the queue on reconnect.
      messageQueue.shift()
      offlinePuts.push(data)
    }

    if (trackId && pendingTimeouts.has(trackId)) {
      const lex = pendingTimeouts.get(trackId)
      if (sent) {
        if (offlineTimeouts.has(trackId)) {
          clearTimeout(offlineTimeouts.get(trackId))
          offlineTimeouts.delete(trackId)
        }
        startResponseTimeout(trackId, lex)
      } else if (!offlineTimeouts.has(trackId)) {
        offlineTimeouts.set(trackId, startResponseTimeout(trackId, lex, 0))
      }
    }

    // Schedule processing of next message if queue not empty
    if (messageQueue.length > 0) {
      // Add delay between messages to respect rate limit
      queueProcessor = setTimeout(processQueue, 50)
    } else {
      queueProcessor = null
    }
  }

  const sendToPeers = data => {
    let sentToAtLeastOne = false
    peers.forEach(peer => {
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(data)
        sentToAtLeastOne = true
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
    return sentToAtLeastOne
  }

  const send = data => {
    if (messageQueue.length >= maxQueueLength) {
      return {
        err: `Message queue exceeded maximum length (${maxQueueLength}). Update query logic to request less data.`,
        queueLength: messageQueue.length,
        maxQueueLength: maxQueueLength,
      }
    }

    messageQueue.push(data)
    // Start queue processor if not already running
    if (!queueProcessor) {
      queueProcessor = setTimeout(processQueue, 50)
    }
  }
  if (!(opt.peers instanceof Array) || opt.peers.length === 0) {
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
          const delay = isTestEnv ? 50 : retryHandler.getDelay()
          retryHandler.increment()
          const t = setTimeout(start, delay)
          if (t.unref) t.unref()
        }
      }

      ws.onopen = () => {
        retryHandler.reset()
        if (offlinePuts.length > 0) {
          messageQueue = offlinePuts.concat(messageQueue)
          offlinePuts = []
          if (!queueProcessor) {
            queueProcessor = setTimeout(processQueue, 50)
          }
        }
      }

      ws.onerror = e => {
        console.log(e)
      }
      ws.onmessage = async m => {
        const msg = JSON.parse(m.data)
        if (dup.check(msg["#"])) return

        // Handle throttle messages from server
        if (msg.throttle && msg.err) {
          console.log(`Server throttling: ${msg.err}`)
          clientThrottled = true
          throttleUntil = Date.now() + msg.throttle
          return
        }

        dup.track(msg["#"])
        if (msg.get) get(msg, send)
        if (msg.put) {
          // Pre-pass: expand pendingReferences to include rels of every soul
          // that will be stored in this batch. This handles the case where a
          // server batch contains both a parent soul (e.g. day_soul with item
          // rels) and its child souls (item_souls), in any order — without the
          // pre-pass, a child soul that appears before its parent in the batch
          // would be missed because pendingReferences hasn't been updated yet.
          const hasSoulMap = new Map()
          for (const [soul, node] of Object.entries(msg.put)) {
            const known = await hasSoul(soul)
            hasSoulMap.set(soul, known)
            if (
              (!known && !pendingReferences.has(soul)) ||
              !node ||
              typeof node !== "object"
            )
              continue
            for (const [, value] of Object.entries(node)) {
              const soulId = utils.rel.is(value)
              if (soulId) pendingReferences.add(soulId)
            }
          }

          // Main pass: filter using cached hasSoul results and the now-complete
          // pendingReferences set.
          const filteredPut = {}
          const pendingToDelete = []
          for (const [soul, node] of Object.entries(msg.put)) {
            let shouldStore = hasSoulMap.get(soul)
            if (pendingReferences.has(soul)) {
              shouldStore = true
              // Don't delete from pendingReferences yet — concurrent onmessage
              // handlers for the same soul may have yielded at await hasSoul()
              // before this pass ran. Deleting here would cause those handlers
              // to see shouldStore=false and skip storing the soul's data.
              // Instead, defer the delete until after put() updates the graph,
              // so any concurrent handler can find the soul via hasSoul(graph).
              pendingToDelete.push(soul)
            }
            if (shouldStore) filteredPut[soul] = node
          }

          // Store filtered data if any
          if (Object.keys(filteredPut).length > 0) {
            // Create filtered message for Ham.mix with original message ID
            const filteredMsg = {put: filteredPut, "#": msg["#"]}
            await put(filteredMsg, send)
          }

          // Safe to delete now — put() has run Ham.mix which updates graph
          // in-place, so hasSoul() will return true for these souls going
          // forward, making pendingReferences no longer needed for them.
          pendingToDelete.forEach(soul => pendingReferences.delete(soul))
        }

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

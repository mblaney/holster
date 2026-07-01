/**
 * Wire - WebSocket-based network protocol
 * Handles message routing, rate limiting, and graph synchronization
 */

import Dup from "./dup.ts"
import Get from "./get.ts"
import Ham from "./ham.ts"
import Store from "./store.ts"
import * as utils from "./utils.ts"
import type {
  Graph,
  GraphNode,
  WireMessage,
  WireOptions,
  Lex,
  ListenMap,
  HolsterOptions,
  GraphValue,
} from "./schemas.ts"

// Unified WebSocket type that works for both Node.js ws and browser WebSocket
type UnifiedWebSocket = WebSocket & {
  _retryHandler?: ReturnType<typeof createRetryHandler>
  on?: (event: string, cb: (...args: unknown[]) => void) => void
  send: (
    data: string | Buffer | ArrayBuffer | Uint8Array,
    options?: unknown,
    cb?: (err?: Error) => void,
  ) => void
}

const isNode = typeof process !== "undefined" && process.versions?.node != null

// Dynamic import for Node.js ws module - won't execute in browser/service worker
const wsModule = isNode ? await import("ws") : undefined
const fs = isNode ? await import(/*webpackIgnore: true*/ "node:fs") : undefined

if (typeof globalThis.WebSocket === "undefined" && wsModule) {
  globalThis.WebSocket = wsModule.WebSocket as unknown as typeof WebSocket
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimiterClient {
  requests: number[]
  lastCleanup: number
  throttleCount: number
}

const createRateLimiter = (isTestEnv: boolean) => {
  const clients = new Map<string, RateLimiterClient>()
  const maxRequests = 1500
  const windowMs = 60000
  const disconnectThreshold = 10
  let cleanupInterval: NodeJS.Timeout | null = null

  const cleanup = (): void => {
    const now = Date.now()
    for (const [_clientId, data] of Array.from(clients.entries())) {
      if (now - data.lastCleanup > windowMs) {
        data.requests = []
        data.lastCleanup = now
      }
      data.requests = data.requests.filter(time => now - time < windowMs)
      if (now - data.lastCleanup > windowMs * 10) {
        data.throttleCount = 0
      }
    }
  }

  if (!isTestEnv) {
    cleanupInterval = setInterval(cleanup, windowMs / 4)
  }

  return {
    getDelay: (clientId: string): number => {
      const now = Date.now()
      const client = clients.get(clientId) || {
        requests: [],
        lastCleanup: now,
        throttleCount: 0,
      }

      client.requests = client.requests.filter(time => now - time < windowMs)

      if (client.requests.length >= maxRequests) {
        const oldestRequest = Math.min(...client.requests)
        const delay = windowMs - (now - oldestRequest)
        client.throttleCount = (client.throttleCount || 0) + 1
        clients.set(clientId, client)
        return Math.max(0, delay)
      }

      client.requests.push(now)
      clients.set(clientId, client)
      return 0
    },

    getRemainingRequests: (clientId: string): number => {
      const client = clients.get(clientId)
      if (!client) return maxRequests

      const now = Date.now()
      const validRequests = client.requests.filter(
        time => now - time < windowMs,
      )
      return Math.max(0, maxRequests - validRequests.length)
    },

    getThrottleCount: (clientId: string): number => {
      const client = clients.get(clientId)
      return client ? client.throttleCount || 0 : 0
    },

    shouldDisconnect: (clientId: string): boolean => {
      const client = clients.get(clientId)
      if (!client) return false
      return client.throttleCount >= disconnectThreshold
    },

    destroy: (): void => {
      if (cleanupInterval) {
        clearInterval(cleanupInterval)
        cleanupInterval = null
      }
      clients.clear()
    },
  }
}

// ============================================================================
// Message Validation
// ============================================================================

const safeJSONParse = (
  data: string | Buffer,
  maxSize = 1024 * 1024,
): {success: boolean; data?: WireMessage; error?: string} => {
  try {
    if (typeof data === "string" && data.length > maxSize) {
      throw new Error("Message too large")
    }
    return {success: true, data: JSON.parse(data.toString())}
  } catch (error) {
    return {success: false, error: (error as Error).message}
  }
}

const validateMessage = (
  data: string | Buffer,
  maxSize = 1024 * 1024,
): {valid: boolean; error?: string} => {
  if (typeof data === "string" && data.length > maxSize) {
    return {valid: false, error: "Message too large"}
  }
  if (Buffer.isBuffer && Buffer.isBuffer(data) && data.length > maxSize) {
    return {valid: false, error: "Message too large"}
  }
  return {valid: true}
}

// ============================================================================
// Connection Management
// ============================================================================

const createConnectionManager = (maxConnections = 1000) => {
  const connections = new Set<WebSocket>()

  return {
    add: (ws: WebSocket): boolean => {
      if (connections.size >= maxConnections) {
        return false
      }
      connections.add(ws)

      const originalClose = ws.close.bind(ws)
      ws.close = ((...args: unknown[]) => {
        connections.delete(ws)
        return originalClose(...(args as [number?, string?]))
      }) as typeof ws.close

      return true
    },

    remove: (ws: WebSocket): void => {
      connections.delete(ws)
    },

    count: (): number => connections.size,

    isFull: (): boolean => connections.size >= maxConnections,
  }
}

// ============================================================================
// Retry Handler
// ============================================================================

const createRetryHandler = (maxRetries = 5) => {
  let retryCount = 0

  return {
    shouldRetry: (): boolean => retryCount < maxRetries,
    getDelay: (): number => Math.min(1000 * Math.pow(2, retryCount), 30000),
    increment: (): void => {
      retryCount++
    },
    reset: (): void => {
      retryCount = 0
    },
  }
}

// ============================================================================
// Wire Protocol
// ============================================================================

export interface WireAPI {
  get: (lex: Lex, cb: (msg: WireMessage) => void, _opt?: WireOptions) => void
  put: (data: Graph, cb?: (err?: string | null) => void) => Promise<void> | void
  on: (lex: Lex, cb: () => void, _get?: boolean, _opt?: WireOptions) => void
  off: (lex: Lex, cb: () => void) => void
}

const Wire = (opt: HolsterOptions): WireAPI => {
  const options = opt || {}
  const dup = Dup()
  const store = Store(options as never)
  const graph: Graph = {}
  const queue: Record<string, (msg: WireMessage) => void> = {}
  const listen: ListenMap = {}

  const pendingReferences = new Set<string>()
  const hasNode = new Set<string>()

  // Debounce client-side wire update checks: skip if the same lex was checked
  // recently. Keyed by "soul" or "soul.property".
  const recentChecks = new Map<string, number>()
  const recentCheckTTL = 10000 // 10 seconds

  const pendingTimeouts = new Map<string, Lex>()
  const offlineTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

  const hasSoul = async (soul: string): Promise<boolean> => {
    if (graph[soul]) return true
    return new Promise(resolve => {
      store.get({"#": soul}, (err, data) => {
        resolve(!err && !!data && !!data[soul])
      })
    })
  }

  const isTestEnv =
    isNode && (globalThis.WebSocket as unknown) !== wsModule?.WebSocket
  const rateLimiter = createRateLimiter(isTestEnv)
  const connectionManager = createConnectionManager(
    options.maxConnections || 1000,
  )

  // User storage limiting — server-side only, requires options.userLimit: true.
  const DEFAULT_STORAGE_LIMIT = 1 // 1 MB
  const defaultLimit =
    (typeof options.defaultLimit === "number"
      ? options.defaultLimit
      : DEFAULT_STORAGE_LIMIT) * 1048576
  const userStorage = new Map<string, number>() // Map<pubkey, totalBytes>
  const userLimits = new Map<string, number>() // Map<pubkey, maxBytes> converted from MB in .user_limit.json
  let saveStorageTimer: ReturnType<typeof setTimeout> | null = null

  const loadUserStorage = (cb?: () => void): void => {
    fs!.readFile(
      `${options.file}/../.user_storage.json`,
      "utf8",
      (err: NodeJS.ErrnoException | null, raw: string) => {
        if (err) {
          if (cb) cb()
          return
        }
        try {
          const data = JSON.parse(raw) as Record<string, unknown>
          userStorage.clear()
          for (const [pub, total] of Object.entries(data)) {
            if (typeof total === "number") userStorage.set(pub, total)
          }
        } catch {
          // Invalid JSON — start with empty map.
        }
        if (cb) cb()
      },
    )
  }

  const saveUserStorage = (): void => {
    if (saveStorageTimer) return
    const t = setTimeout(() => {
      saveStorageTimer = null
      const data: Record<string, number> = {}
      for (const [pub, total] of userStorage) {
        data[pub] = total
      }
      fs!.writeFile(
        `${options.file}/../.user_storage.json`,
        JSON.stringify(data),
        (err: NodeJS.ErrnoException | null) => {
          if (err) console.warn("saveUserStorage error:", err)
        },
      )
    }, 5000)
    if ((t as unknown as {unref?: () => void}).unref)
      (t as unknown as {unref: () => void}).unref()
    saveStorageTimer = t
  }

  const loadUserLimits = (cb?: () => void): void => {
    fs!.readFile(
      `${options.file}/../.user_limit.json`,
      "utf8",
      (err: NodeJS.ErrnoException | null, raw: string) => {
        if (err) {
          if (cb) cb()
          return
        }
        try {
          const data = JSON.parse(raw) as Record<string, unknown>
          userLimits.clear()
          for (const [pub, limit] of Object.entries(data)) {
            if (typeof limit === "number") userLimits.set(pub, limit * 1048576)
            // Non-numeric values silently ignored — fall back to defaultLimit at use time.
          }
        } catch {
          // Invalid JSON — userLimits stays empty.
        }
        if (cb) cb()
      },
    )
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
    return `${(bytes / 1073741824).toFixed(1)} GB`
  }

  const logStorageSummary = (): void => {
    const userCount = userStorage.size
    const defLimitStr =
      defaultLimit === 0 ? "unlisted users blocked" : formatBytes(defaultLimit)
    console.log(
      `[HOLSTER] Per-user storage limits enabled (${userCount} user${userCount !== 1 ? "s" : ""}, default: ${defLimitStr})`,
    )
    const sorted = [...userStorage.entries()].sort(([, a], [, b]) => b - a)
    const formatUser = (pub: string): string => {
      const total = userStorage.get(pub) ?? 0
      const limit = userLimits.get(pub) ?? defaultLimit
      const limitStr = limit === 0 ? "blocked" : formatBytes(limit)
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

  const check = async (
    data: Graph,
    send: (msg: string) => {err?: string} | void,
    cb?: (err?: string | null) => void,
  ): Promise<boolean> => {
    const key = utils.userPublicKey

    for (const soul of Object.keys(data)) {
      const node = data[soul]!
      // If the incoming update doesn't include a userPublicKey property at all,
      // allow it - the update is not trying to change the public key.
      if (node[key] === undefined) continue

      const msg = await new Promise<WireMessage>(res => {
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
      if (!msg.put || !msg.put[soul] || msg.put[soul]![key] === node[key]) {
        continue
      }

      if (cb) {
        cb(`error in wire check public key does not match for soul: ${soul}`)
      }
      return false
    }

    return true
  }

  const get = (
    msg: {get: Lex; "#": string},
    send: (msg: string) => void,
  ): void => {
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

  const put = async (
    msg: {put: Graph; "#": string},
    send: (msg: string) => void,
  ): Promise<void> => {
    // Capture old graph sizes for user souls before Ham.mix updates graph in place.
    const oldGraphBytes: Record<string, number> = {}
    if (options.userLimit) {
      for (const [soul, node] of Object.entries(msg.put)) {
        if (node && node[utils.userPublicKey] && graph[soul]) {
          oldGraphBytes[soul] = JSON.stringify(graph[soul]).length
        }
      }
    }

    const update = await Ham.mix(
      msg.put,
      graph,
      hasNode,
      options.secure || false,
      listen,
      options.maxGraphSize,
    )
    if (Object.keys(update.now).length === 0) {
      if (Object.keys(update.defer).length !== 0) {
        setTimeout(
          () => put({put: update.defer, "#": msg["#"]}, send),
          update.wait,
        )
      }
      return
    }

    if (!(await check(update.now, send as never))) return

    const finish = (err?: string | null): void => {
      if (err) console.warn("store.put", err)
      send(
        JSON.stringify({
          "#": dup.track(utils.text.random(9)),
          "@": msg["#"],
          err: err,
        }),
      )
      update.listeners.forEach(cb => cb())
    }

    if (!options.userLimit) {
      store.put(update.now, finish)
    } else {
      const toStore: Graph = {}
      for (const [soul, node] of Object.entries(update.now)) {
        const pub = node![utils.userPublicKey] as string | undefined
        if (!pub) {
          toStore[soul] = node
          continue
        }
        const limit = userLimits.get(pub) ?? defaultLimit
        if ((userStorage.get(pub) ?? 0) >= limit) continue
        toStore[soul] = node
        const oldBytes = oldGraphBytes[soul] ?? 0
        const newBytes = graph[soul] ? JSON.stringify(graph[soul]).length : 0
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

  const getWithCallback = (
    lex: Lex,
    cb: (msg: WireMessage) => void,
    send: (msg: string) => {err?: string} | void,
    _opt?: WireOptions,
  ): void => {
    if (!cb) return

    const opts = _opt || {}
    const fast = opts.fast || (!lex["."] && hasNode.has(lex["#"]))
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
            graph[soul] = {...node} as unknown as Graph[string]
            continue
          }
          for (const [key, value] of Object.entries(node)) {
            if (key === "_") continue
            const gNode = graph[soul] as unknown as Record<string, unknown>
            if (typeof gNode[key] !== "undefined") continue
            gNode[key] = value
            const meta = (node as unknown as GraphNode)._
            if (meta?.[">"] && typeof meta[">"][key] !== "undefined") {
              const state = meta[">"][key]
              const gMeta = (graph[soul] as unknown as GraphNode)._
              gMeta[">"][key] = state
              if (meta["s"]?.[state]) {
                if (!gMeta["s"]) gMeta["s"] = {}
                gMeta["s"]![state] = meta["s"][state]
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

      if (err) console.log(err)

      // Put requests only need a local answer — skip the wire round-trip.
      if (opts && opts.put) {
        const id = lex["#"]
        const ack: Record<string, null | Record<string, null>> = {[id]: null}
        if (typeof lex["."] === "string") {
          ack[id] = {[lex["."]]: null}
        }
        cb({put: ack as never})
        return
      }

      queue[track] = cb

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

  const api = (send: (msg: string) => {err?: string} | void): WireAPI => {
    return {
      get: (lex, cb, _opt) => {
        if (lex && typeof lex["."] === "number") {
          lex = {...lex, ".": String(lex["."])}
        }
        if (lex && lex["#"]) {
          pendingReferences.add(lex["#"])
        }
        getWithCallback(lex, cb, send, _opt)
      },
      put: async (data, cb) => {
        const oldGraphBytes: Record<string, number> = {}
        if (options.userLimit) {
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
          options.secure || false,
          listen,
          options.maxGraphSize,
        )
        if (Object.keys(update.now).length === 0) {
          if (cb) cb(null)
          return
        }

        if (!(await check(update.now, send as never, cb))) {
          return
        }

        if (options.userLimit) {
          for (const [soul, node] of Object.entries(update.now)) {
            const pub = node![utils.userPublicKey] as string | undefined
            if (!pub) continue
            const limit = userLimits.get(pub) ?? defaultLimit
            const current = userStorage.get(pub) ?? 0
            if (current >= limit) {
              if (cb) cb("storage limit exceeded")
              return
            }
            const oldBytes = oldGraphBytes[soul] ?? 0
            const newBytes = graph[soul]
              ? JSON.stringify(graph[soul]).length
              : 0
            userStorage.set(pub, Math.max(0, current - oldBytes + newBytes))
            saveUserStorage()
          }
        }

        for (const [_soul, node] of Object.entries(update.now)) {
          if (node && typeof node === "object") {
            for (const [_key, value] of Object.entries(node)) {
              const soulId = utils.rel.is(value as GraphValue)
              if (soulId) {
                pendingReferences.add(soulId)
              }
            }
          }
        }

        store.put(update.now, err => {
          if (cb) cb(err)
          update.listeners.forEach(l => l())
        })

        const sendResult = send(
          JSON.stringify({
            "#": dup.track(utils.text.random(9)),
            put: data,
          }),
        )
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
          listen[soul]!.push({".": lex["."], cb: cb as never})
        } else {
          listen[soul] = [{".": lex["."], cb: cb as never}]
        }
        if (_get) getWithCallback(lex, cb as never, send, _opt)
      },
      off: (lex, cb) => {
        const soul = lex && lex["#"]
        if (!soul || !listen[soul]) return

        if (cb) {
          const found = listen[soul]!.find(l => l.cb === (cb as never))
          if (found) {
            listen[soul]!.splice(listen[soul]!.indexOf(found), 1)
          }
        } else {
          delete listen[soul]
        }
      },
    }
  }

  if (isNode && (options.wss || options.server || options.port != null)) {
    let wss = options.wss
    let clients = (): WebSocket[] =>
      (wss as {clients?: () => WebSocket[]}).clients?.() || []
    if (!wss) {
      const config = options.server
        ? {server: options.server}
        : {port: options.port}
      wss = new wsModule!.WebSocketServer(config)
      clients = () =>
        Array.from((wss as {clients: Set<WebSocket>}).clients || [])
    }

    const send = (data: string, isBinary?: boolean): void => {
      const msg = JSON.parse(data) as WireMessage
      const trackId = msg["#"]
      if (trackId && pendingTimeouts.has(trackId)) {
        const lex = pendingTimeouts.get(trackId)!
        pendingTimeouts.delete(trackId)

        setTimeout(
          () => {
            const cb = queue[trackId]
            if (cb) {
              const id = lex["#"]
              const ack: Graph = {[id]: null as never}
              if (typeof lex["."] === "string") {
                ack[id] = {[lex["."]]: null} as never
              }
              cb({put: ack})
              delete queue[trackId]
            }
          },
          isTestEnv ? 100 : 10000,
        )
      }

      clients().forEach(client => {
        const ws = client as UnifiedWebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(data, {binary: isBinary})
        } else if (ws) {
          const retryHandler = ws._retryHandler || createRetryHandler()
          ws._retryHandler = retryHandler

          if (retryHandler.shouldRetry()) {
            const delay = retryHandler.getDelay()
            retryHandler.increment()

            setTimeout(() => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                retryHandler.reset()
                ws.send(data, {binary: isBinary})
              }
            }, delay)
          }
        }
      })
    }

    if (options.userLimit) {
      loadUserStorage(() => loadUserLimits(() => logStorageSummary()))
      setInterval(loadUserLimits, 60000).unref()
    }

    ;(
      wss as unknown as {
        on: (event: string, cb: (ws: UnifiedWebSocket) => void) => void
      }
    ).on("connection", (ws: UnifiedWebSocket) => {
      if (!connectionManager.add(ws)) {
        console.log("Connection limit reached, rejecting connection")
        ws.close(1013, "Connection limit reached - try again later")
        return
      }

      const clientId = utils.text.random(9)
      console.log(`New WebSocket client connected: ${clientId}`)

      ws.on?.("error", ((...args: unknown[]) => {
        const error = args[0] as Error
        console.log("WebSocket error:", error)
        connectionManager.remove(ws)
      }) as (...args: unknown[]) => void)

      ws.on?.("close", (() => {
        console.log(`WebSocket client disconnected: ${clientId}`)
        connectionManager.remove(ws)
      }) as (...args: unknown[]) => void)

      ws.on?.("message", ((...args: unknown[]) => {
        const data = args[0] as Buffer
        const isBinary = args[1] as boolean
        const validation = validateMessage(data, options.maxMessageSize)
        if (!validation.valid) {
          console.warn(`Invalid message: ${validation.error}`)
          ws.send(JSON.stringify({error: validation.error}))
          return
        }

        const parseResult = safeJSONParse(data, options.maxMessageSize)
        if (!parseResult.success) {
          console.warn(`JSON parse error: ${parseResult.error}`)
          ws.send(JSON.stringify({error: "Invalid JSON"}))
          return
        }

        const msg = parseResult.data!
        if (!msg["#"]) return // Incoming messages must have '#'
        if (dup.check(msg["#"])) return

        const delay = rateLimiter.getDelay(clientId)
        if (delay > 0) {
          const throttleCount = rateLimiter.getThrottleCount(clientId)
          console.log(
            `Client ${clientId}: rate limit exceeded, delay would be ${delay}ms, dropping message (throttle count: ${throttleCount})`,
          )
          if (rateLimiter.shouldDisconnect(clientId)) {
            console.log(
              `Client ${clientId}: Disconnecting after ${throttleCount} throttle violations`,
            )
            ws.close(1008, "Rate limit violations")
            return
          }

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

        const processMessage = async (): Promise<void> => {
          dup.track(msg["#"]!)

          if (msg.get) get(msg as never, send)
          if (msg.put) await put(msg as never, send)
          send(data.toString(), isBinary)

          const id = msg["@"]
          const cb = queue[id!]
          if (cb) {
            delete (msg as {"#"?: string})["#"]
            delete (msg as {"@"?: string})["@"]
            cb(msg)
            delete queue[id!]
          }
        }

        if (delay > 0) {
          setTimeout(processMessage, delay)
        } else {
          processMessage()
        }
      }) as (...args: unknown[]) => void)
    })
    return api(send)
  }

  // Browser logic
  const peers: WebSocket[] = []
  let clientThrottled = false
  let throttleUntil = 0
  let messageQueue: string[] = []
  let offlinePuts: string[] = []
  let queueProcessor: NodeJS.Timeout | null = null
  const maxQueueLength = options.maxQueueLength || 10000

  const startResponseTimeout = (
    trackId: string,
    lex: Lex,
    delay = isTestEnv ? 100 : 10000,
  ): ReturnType<typeof setTimeout> => {
    return setTimeout(() => {
      offlineTimeouts.delete(trackId)
      pendingTimeouts.delete(trackId)
      const cb = queue[trackId]
      if (cb) {
        const id = lex["#"]
        const ack: Graph = {[id]: null as never}
        if (typeof lex["."] === "string") {
          ack[id] = {[lex["."]]: null} as never
        }
        cb({put: ack})
        delete queue[trackId]
      }
    }, delay)
  }

  const processQueue = (): void => {
    if (messageQueue.length === 0) {
      queueProcessor = null
      return
    }

    const now = Date.now()
    if (clientThrottled && now < throttleUntil) {
      queueProcessor = setTimeout(
        processQueue,
        Math.min(1000, throttleUntil - now),
      )
      return
    }

    if (clientThrottled && now >= throttleUntil) {
      console.log(`Throttle period ended, resuming queue processing`)
      clientThrottled = false
      throttleUntil = 0
    }

    const data = messageQueue[0]!
    const sent = sendToPeers(data)

    const msg = JSON.parse(data) as WireMessage
    const trackId = msg["#"]

    // Drop GET messages with no pending callback — these were already served
    // from local store so no caller is waiting for the wire response.
    const isStaleCheckMessage =
      !sent && !!msg.get && !pendingTimeouts.has(trackId!)

    if (sent || isStaleCheckMessage) {
      messageQueue.shift()
    } else if (!sent && msg.put) {
      // Hold offline PUTs separately so they don't block GET messages behind
      // them. They'll be flushed back to the front of the queue on reconnect.
      messageQueue.shift()
      offlinePuts.push(data)
    }

    if (trackId && pendingTimeouts.has(trackId)) {
      const lex = pendingTimeouts.get(trackId)!
      if (sent) {
        if (offlineTimeouts.has(trackId)) {
          clearTimeout(offlineTimeouts.get(trackId)!)
          offlineTimeouts.delete(trackId)
        }
        startResponseTimeout(trackId, lex)
      } else if (!offlineTimeouts.has(trackId)) {
        offlineTimeouts.set(trackId, startResponseTimeout(trackId, lex, 0))
      }
    }

    if (messageQueue.length > 0) {
      queueProcessor = setTimeout(processQueue, 50)
    } else {
      queueProcessor = null
    }
  }

  const sendToPeers = (data: string): boolean => {
    let sentToAtLeastOne = false
    peers.forEach(peer => {
      const ws = peer as UnifiedWebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data)
        sentToAtLeastOne = true
      } else if (ws) {
        const retryHandler = ws._retryHandler || createRetryHandler()
        ws._retryHandler = retryHandler

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

  const send = (data: string): {err?: string} | void => {
    if (messageQueue.length >= maxQueueLength) {
      return {
        err: `Message queue exceeded maximum length (${maxQueueLength}). Update query logic to request less data.`,
      }
    }

    messageQueue.push(data)
    if (!queueProcessor) {
      queueProcessor = setTimeout(processQueue, 50)
    }
  }

  if (!(options.peers instanceof Array) || options.peers.length === 0) {
    options.peers = [`ws://localhost:${options.port || 8765}`]
  }

  options.peers.forEach((peer: string) => {
    const start = (): void => {
      let ws: WebSocket | null = new WebSocket(peer)
      peers.push(ws)
      const retryHandler = createRetryHandler()

      ws.onclose = () => {
        if (ws && peers.indexOf(ws) !== -1) {
          peers.splice(peers.indexOf(ws), 1)
        }
        ws = null

        if (retryHandler.shouldRetry()) {
          const delay = isTestEnv ? 50 : retryHandler.getDelay()
          retryHandler.increment()
          const t = setTimeout(start, delay)
          if ((t as unknown as {unref?: () => void}).unref)
            (t as unknown as {unref: () => void}).unref()
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

      ws.onerror = (e: Event) => {
        console.log(e)
      }

      ws.onmessage = async (m: MessageEvent) => {
        const msg = JSON.parse(m.data as string) as WireMessage
        if (!msg["#"]) return // Incoming messages must have '#'
        if (dup.check(msg["#"])) return

        if (msg.throttle && msg.err) {
          console.log(`Server throttling: ${msg.err}`)
          clientThrottled = true
          throttleUntil = Date.now() + msg.throttle
          return
        }

        dup.track(msg["#"]!)
        if (msg.get) get(msg as never, send as never)
        if (msg.put) {
          // Pre-pass: expand pendingReferences to include rels of every soul
          // that will be stored in this batch. This handles the case where a
          // server batch contains both a parent soul (e.g. day_soul with item
          // rels) and its child souls (item_souls), in any order — without the
          // pre-pass, a child soul that appears before its parent in the batch
          // would be missed because pendingReferences hasn't been updated yet.
          const hasSoulMap = new Map<string, boolean>()
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
              const soulId = utils.rel.is(value as GraphValue)
              if (soulId) pendingReferences.add(soulId)
            }
          }

          // Main pass: filter using cached hasSoul results and the now-complete
          // pendingReferences set.
          const filteredPut: Graph = {}
          const pendingToDelete: string[] = []
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
            const filteredMsg = {put: filteredPut, "#": msg["#"]!}
            await put(filteredMsg, send as never)
          }

          // Safe to delete now — put() has run Ham.mix which updates graph
          // in-place, so hasSoul() will return true for these souls going
          // forward, making pendingReferences no longer needed for them.
          pendingToDelete.forEach(soul => pendingReferences.delete(soul))
        }

        const id = msg["@"]
        const cb = queue[id!]
        if (cb) {
          delete (msg as {"#"?: string})["#"]
          delete (msg as {"@"?: string})["@"]
          cb(msg)
          delete queue[id!]
        }
      }
    }
    start()
  })

  return api(send)
}

export default Wire

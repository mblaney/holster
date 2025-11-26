/**
 * Wire - WebSocket-based network protocol
 * Handles message routing, rate limiting, and graph synchronization
 */

import Dup from "./dup.js"
import Get from "./get.js"
import Ham from "./ham.js"
import Store from "./store.js"
import * as utils from "./utils.js"
import type {
  Graph,
  WireMessage,
  WireOptions,
  Lex,
  ListenMap,
  HolsterOptions,
  GraphValue,
} from "./schemas.js"

// Unified WebSocket type that works for both Node.js ws and browser WebSocket
type UnifiedWebSocket = WebSocket & {
  _retryHandler?: ReturnType<typeof createRetryHandler>
  on?: (event: string, cb: (...args: unknown[]) => void) => void
  send: (data: string | Buffer | ArrayBuffer | Uint8Array, options?: unknown, cb?: (err?: Error) => void) => void
}

const isNode = typeof document === "undefined"

// Dynamic import for Node.js ws module - won't execute in browser/service worker
const wsModule = isNode ? await import("ws") : undefined

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
      const validRequests = client.requests.filter(time => now - time < windowMs)
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
  maxSize = 1024 * 1024
): { success: boolean; data?: WireMessage; error?: string } => {
  try {
    if (typeof data === "string" && data.length > maxSize) {
      throw new Error("Message too large")
    }
    return { success: true, data: JSON.parse(data.toString()) }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

const validateMessage = (
  data: string | Buffer,
  maxSize = 1024 * 1024
): { valid: boolean; error?: string } => {
  if (typeof data === "string" && data.length > maxSize) {
    return { valid: false, error: "Message too large" }
  }
  if (Buffer.isBuffer && Buffer.isBuffer(data) && data.length > maxSize) {
    return { valid: false, error: "Message too large" }
  }
  return { valid: true }
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
  const dup = Dup(options.maxAge)
  const store = Store(options as never)
  const graph: Graph = {}
  const queue: Record<string, (msg: WireMessage) => void> = {}
  const listen: ListenMap = {}

  const pendingReferences = new Set<string>()
  const pendingTimeouts = new Map<
    string,
    { lex: Lex; wait: number; timeoutId?: NodeJS.Timeout }
  >()

  const hasSoul = async (soul: string): Promise<boolean> => {
    if (graph[soul]) return true
    return new Promise(resolve => {
      store.get({ "#": soul }, (err, data) => {
        resolve(!err && !!data && !!data[soul])
      })
    })
  }

  const isTestEnv = options.wss && (options.wss as { constructor?: { name?: string } }).constructor?.name === "Server"
  const rateLimiter = createRateLimiter(isTestEnv)
  const connectionManager = createConnectionManager(options.maxConnections || 1000)

  const check = async (
    data: Graph,
    send: (msg: string) => { err?: string } | void,
    cb?: (err?: string | null) => void
  ): Promise<boolean> => {
    const key = utils.userPublicKey

    for (const soul of Object.keys(data)) {
      const msg = await new Promise<WireMessage>(res => {
        getWithCallback({ "#": soul, ".": key }, res, send)
      })
      if (msg.err) {
        if (cb) cb(msg.err)
        return false
      }

      const node = data[soul]!
      if (
        !msg.put ||
        !msg.put[soul] ||
        node[key] === undefined ||
        msg.put[soul]![key] === node[key]
      ) {
        continue
      }

      if (cb) {
        cb(`error in wire check public key does not match for soul: ${soul}`)
      }
      return false
    }

    return true
  }

  const get = (msg: { get: Lex; "#": string }, send: (msg: string) => void): void => {
    const ack = Get(msg.get, graph)
    if (ack) {
      send(
        JSON.stringify({
          "#": dup.track(utils.text.random(9)),
          "@": msg["#"],
          put: ack,
        })
      )
    } else {
      store.get(
        msg.get,
        (err, ack) => {
          send(
            JSON.stringify({
              "#": dup.track(utils.text.random(9)),
              "@": msg["#"],
              put: ack,
              err: err,
            })
          )
        },
        { secure: true }
      )
    }
  }

  const put = async (
    msg: { put: Graph; "#": string },
    send: (msg: string) => void
  ): Promise<void> => {
    const update = await Ham.mix(msg.put, graph, options.secure || false, listen)
    if (Object.keys(update.now).length === 0) {
      if (Object.keys(update.defer).length !== 0) {
        setTimeout(() => put({ put: update.defer, "#": msg["#"] }, send), update.wait)
      }
      return
    }

    if (!(await check(update.now, send as never))) return

    store.put(update.now, err => {
      send(
        JSON.stringify({
          "#": dup.track(utils.text.random(9)),
          "@": msg["#"],
          err: err,
        })
      )
      update.listeners.forEach(cb => cb())
    })

    if (Object.keys(update.defer).length !== 0) {
      setTimeout(() => put({ put: update.defer, "#": msg["#"] }, send), update.wait)
    }
  }

  const getWithCallback = (
    lex: Lex,
    cb: (msg: WireMessage) => void,
    send: (msg: string) => { err?: string } | void,
    _opt?: WireOptions
  ): void => {
    if (!cb) return

    const opts = _opt || {}
    const ack = Get(lex, graph, opts.fast)
    const track = utils.text.random(9)
    const request = JSON.stringify({
      "#": dup.track(track),
      get: lex,
    })

    if (ack) {
      const sendResult = send(request)
      if (sendResult && sendResult.err) {
        cb({ err: sendResult.err })
        return
      }
      cb({ put: ack })
      return
    }

    store.get(
      lex,
      (err, ack) => {
        if (ack) {
          const sendResult = send(request)
          if (sendResult && sendResult.err) {
            cb({ err: sendResult.err })
            return
          }
          cb({ put: ack, err: err || undefined })
          return
        }

        if (err) console.log(err)

        queue[track] = cb

        pendingTimeouts.set(track, {
          lex: lex,
          wait: opts.wait || 100,
        })

        const sendResult = send(request)
        if (sendResult && sendResult.err) {
          cb({ err: sendResult.err })
          delete queue[track]
          pendingTimeouts.delete(track)
          return
        }
      },
      opts
    )
  }

  const api = (send: (msg: string) => { err?: string } | void): WireAPI => {
    return {
      get: (lex, cb, _opt) => {
        if (lex && typeof lex["."] === "number") {
          lex = { ...lex, ".": String(lex["."]) }
        }
        if (lex && lex["#"]) {
          pendingReferences.add(lex["#"])
        }
        getWithCallback(lex, cb, send, _opt)
      },
      put: async (data, cb) => {
        const update = await Ham.mix(data, graph, options.secure || false, listen)
        if (Object.keys(update.now).length === 0) {
          if (cb) cb(null)
          return
        }

        if (!(await check(update.now, send as never, cb))) {
          return
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
          })
        )
        if (sendResult && sendResult.err) {
          if (cb) cb(sendResult.err)
          return
        }
      },
      on: (lex, cb, _get, _opt) => {
        if (lex && typeof lex["."] === "number") {
          lex = { ...lex, ".": String(lex["."]) }
        }
        const soul = lex && lex["#"]
        if (!soul || !cb) return

        if (listen[soul]) {
          listen[soul]!.push({ ".": lex["."], cb: cb as never })
        } else {
          listen[soul] = [{ ".": lex["."], cb: cb as never }]
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

  if (isNode) {
    let wss = options.wss
    let clients = (): WebSocket[] =>
      (wss as { clients?: () => WebSocket[] }).clients?.() || []
    if (!wss) {
      const config = options.server
        ? { server: options.server }
        : { port: options.port || 8765 }
      wss = new wsModule!.WebSocketServer(config)
      clients = () => Array.from((wss as { clients: Set<WebSocket> }).clients || [])
    }

    const send = (data: string, isBinary?: boolean): void => {
      const msg = JSON.parse(data) as WireMessage
      const trackId = msg["#"]
      if (trackId && pendingTimeouts.has(trackId)) {
        const timeoutConfig = pendingTimeouts.get(trackId)!
        pendingTimeouts.delete(trackId)

        timeoutConfig.timeoutId = setTimeout(() => {
          const cb = queue[trackId]
          if (cb) {
            const id = timeoutConfig.lex["#"]
            const ack: Graph = { [id]: null as never }
            if (typeof timeoutConfig.lex["."] === "string") {
              ack[id] = { [timeoutConfig.lex["."]]: null } as never
            }
            cb({ "#": trackId, put: ack })
            delete queue[trackId]
          }
        }, timeoutConfig.wait)
      }

      clients().forEach(client => {
        const ws = client as UnifiedWebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(data, { binary: isBinary })
        } else if (ws) {
          const retryHandler = ws._retryHandler || createRetryHandler()
          ws._retryHandler = retryHandler

          if (retryHandler.shouldRetry()) {
            const delay = retryHandler.getDelay()
            retryHandler.increment()

            setTimeout(() => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                retryHandler.reset()
                ws.send(data, { binary: isBinary })
              }
            }, delay)
          }
        }
      })
    }

    ;(wss as unknown as { on: (event: string, cb: (ws: UnifiedWebSocket) => void) => void }).on(
      "connection",
      (ws: UnifiedWebSocket) => {
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
            ws.send(JSON.stringify({ error: validation.error }))
            return
          }

          const parseResult = safeJSONParse(data, options.maxMessageSize)
          if (!parseResult.success) {
            console.warn(`JSON parse error: ${parseResult.error}`)
            ws.send(JSON.stringify({ error: "Invalid JSON" }))
            return
          }

          const msg = parseResult.data!
          if (!msg["#"]) return // Incoming messages must have '#'
          if (dup.check(msg["#"])) return

          const delay = rateLimiter.getDelay(clientId)
          if (delay > 0) {
            const throttleCount = rateLimiter.getThrottleCount(clientId)
            console.log(
              `Client ${clientId}: rate limit exceeded, delay would be ${delay}ms, dropping message (throttle count: ${throttleCount})`
            )
            if (rateLimiter.shouldDisconnect(clientId)) {
              console.log(
                `Client ${clientId}: Disconnecting after ${throttleCount} throttle violations`
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
              })
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
              delete (msg as { "#"?: string })["#"]
              delete (msg as { "@"?: string })["@"]
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
      }
    )
    return api(send)
  }

  // Browser logic
  const peers: WebSocket[] = []
  let clientThrottled = false
  let throttleUntil = 0
  let messageQueue: string[] = []
  let queueProcessor: NodeJS.Timeout | null = null
  const maxQueueLength = options.maxQueueLength || 10000

  const processQueue = (): void => {
    if (messageQueue.length === 0) {
      queueProcessor = null
      return
    }

    const now = Date.now()
    if (clientThrottled && now < throttleUntil) {
      queueProcessor = setTimeout(processQueue, Math.min(1000, throttleUntil - now))
      return
    }

    if (clientThrottled && now >= throttleUntil) {
      console.log(`Throttle period ended, resuming queue processing`)
      clientThrottled = false
      throttleUntil = 0
    }

    const data = messageQueue[0]!
    const sent = sendToPeers(data)

    if (sent) {
      messageQueue.shift()

      const msg = JSON.parse(data) as WireMessage
      const trackId = msg["#"]
      if (trackId && pendingTimeouts.has(trackId)) {
        const timeoutConfig = pendingTimeouts.get(trackId)!
        pendingTimeouts.delete(trackId)

        timeoutConfig.timeoutId = setTimeout(() => {
          const cb = queue[trackId]
          if (cb) {
            const id = timeoutConfig.lex["#"]
            const ack: Graph = { [id]: null as never }
            if (typeof timeoutConfig.lex["."] === "string") {
              ack[id] = { [timeoutConfig.lex["."]]: null } as never
            }
            cb({ "#": trackId, put: ack })
            delete queue[trackId]
          }
        }, timeoutConfig.wait)
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

  const send = (data: string): { err?: string } | void => {
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
          const delay = retryHandler.getDelay()
          retryHandler.increment()
          setTimeout(start, delay)
        }
      }

      ws.onopen = () => {
        retryHandler.reset()
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
          const filteredPut: Graph = {}
          for (const [soul, node] of Object.entries(msg.put)) {
            let shouldStore = false
            if (await hasSoul(soul)) {
              shouldStore = true
              if (node && typeof node === "object") {
                for (const [_key, value] of Object.entries(node)) {
                  const soulId = utils.rel.is(value as GraphValue)
                  if (soulId) {
                    pendingReferences.add(soulId)
                  }
                }
              }
            }
            if (pendingReferences.has(soul)) {
              shouldStore = true
              pendingReferences.delete(soul)
            }
            if (shouldStore) {
              filteredPut[soul] = node
            }
          }
          if (Object.keys(filteredPut).length > 0) {
            const filteredMsg = { put: filteredPut, "#": msg["#"]! }
            await put(filteredMsg, send as never)
          }
        }

        const id = msg["@"]
        const cb = queue[id!]
        if (cb) {
          delete (msg as { "#"?: string })["#"]
          delete (msg as { "@"?: string })["@"]
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


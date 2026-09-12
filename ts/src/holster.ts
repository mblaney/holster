/**
 * Holster - Main API for graph database operations
 * Provides chainable interface for get, put, on, off operations
 */

import * as utils from "./utils.ts"
import Wire, {type WireAPI} from "./wire.ts"
import User, {type UserInterface} from "./user.ts"
import SEA from "./sea.ts"
import {attachNested} from "./nested.ts"
import type {
  HolsterOptions,
  ChainItem,
  ApiContext,
  Graph,
  GraphValue,
  Lex,
  LexFilter,
  LexWithDot,
  UserIdentity,
  WireOptions,
} from "./schemas.ts"

/**
 * Holster API interface
 */
export interface HolsterAPI {
  get: {
    (
      key: string | null,
      lex?: LexWithDot,
      cb?: (data: unknown) => void,
      _opt?: WireOptions,
    ): HolsterAPI
    (
      key: string | null,
      cb?: (data: unknown) => void,
      _opt?: WireOptions,
    ): HolsterAPI
  }
  next: {
    (
      key: string | null,
      lex?: LexWithDot,
      cb?: (data: unknown) => void,
      _opt?: WireOptions,
    ): HolsterAPI
    (
      key: string | null,
      cb?: (data: unknown) => void,
      _opt?: WireOptions,
    ): HolsterAPI
  }
  put: (
    data: GraphValue | Record<string, GraphValue>,
    set?: boolean | ((data?: string | null) => void),
    cb?: (data?: string | null) => void,
  ) => HolsterAPI | void
  on: {
    (
      lex: LexWithDot,
      cb: (data: unknown) => void,
      _get?: boolean,
      _opt?: WireOptions,
    ): void
    (cb: (data: unknown) => void, _get?: boolean, _opt?: WireOptions): void
  }
  off: (cb?: (data: unknown) => void) => HolsterAPI | void
  user: () => UserInterface & HolsterAPI
  wire: WireAPI
  SEA: typeof SEA
}

const Holster = (opt?: HolsterOptions | string | string[]): HolsterAPI => {
  let options: HolsterOptions
  if (typeof opt === "string") options = {peers: [opt]}
  else if (opt instanceof Array) options = {peers: opt}
  else if (!utils.obj.is(opt)) options = {}
  else options = opt

  const wire = Wire(options)
  const user = User(options, wire as never)
  const map = new Map<(data: unknown) => void, () => void>()
  const allctx = new Map<string, ApiContext>()
  // Tracks on(..., {nested: true}) subscriptions, keyed by the caller's
  // own callback (the same reference off() will be called with) - see
  // attachNested in nested.ts. The actual top-level/child listeners it
  // creates use their own, separate contexts, so off() just needs to
  // call the detach function this stores to tear the whole thing down.
  const nested = new Map<(data: unknown) => void, () => void>()
  // Serializes concurrent creation of a missing rel for the same
  // soul+item, so only the first caller creates it and the rest reuse
  // its result rather than each minting a competing soul. Map<soul,
  // Map<item, promise resolving to the soul id>>.
  const pendingRel = new Map<string, Map<string, Promise<string>>>()

  const ok = (data: GraphValue): boolean => {
    return (
      data === null ||
      data === true ||
      data === false ||
      typeof data === "string" ||
      !!utils.rel.is(data) ||
      utils.num.is(data)
    )
  }

  const check = (
    data: GraphValue | Record<string, GraphValue>,
  ): true | string | string[] => {
    if (ok(data as GraphValue)) return true

    if (utils.obj.is(data)) {
      const keys: string[] = []
      for (const [key, value] of Object.entries(data)) {
        if (key === "_") {
          return "error underscore cannot be used as a property name"
        }
        if (utils.obj.is(value) || ok(value as GraphValue)) {
          keys.push(key)
          continue
        }
        if (typeof value === "undefined") {
          return `error undefined ${key} cannot be converted to a graph`
        }
        const error = JSON.stringify({[key]: value})
        return `error ${error} cannot be converted to a graph`
      }
      if (keys.length !== 0) return keys
    }
    const error = JSON.stringify(data)
    return `error ${error} cannot be converted to a graph`
  }

  // Reads the current data at a rel's target soul, retrying briefly since a
  // freshly created rel's target can still be mid-flight when first read.
  // Shared by a one-off get() resolving rels found on the returned node,
  // and by on()'s live retry when a watched property turns out to be a rel.
  const readRelTarget = async (
    id: string,
    ctxUser: UserIdentity | null | undefined,
    opt: WireOptions | undefined,
    retries = 0,
  ): Promise<unknown> => {
    const data = await new Promise<unknown>(res => {
      const _ctxid = utils.text.random()
      allctx.set(_ctxid, {chain: [{item: null, soul: id}], user: ctxUser})
      api(_ctxid).next(
        null as never,
        res as never,
        (retries === 0 ? utils.obj.put(opt, "fast", true) : opt) as never,
      )
    })
    if (data !== null || retries >= 5) return data
    await new Promise(resolve => setTimeout(resolve, 50))
    return readRelTarget(id, ctxUser, opt, retries + 1)
  }

  const api = (initCtxid?: string): HolsterAPI => {
    let ctxid = initCtxid
    const get = (
      lex: LexFilter,
      soul: string,
      ack: (data: unknown) => void,
      _opt?: WireOptions,
    ): void => {
      wire.get(
        utils.obj.put(lex as never, "#", soul) as Lex,
        async msg => {
          if (msg.err) console.log(msg.err)
          if (msg.put && msg.put[soul]) {
            delete (msg.put[soul] as {_?: unknown})._
            delete (msg.put[soul] as Record<string, unknown>)[
              utils.userPublicKey
            ]
            delete (msg.put[soul] as Record<string, unknown>)[
              utils.userSignature
            ]
            const node = msg.put[soul]!
            await Promise.all(
              Object.keys(node).map(async key => {
                const id = utils.rel.is(node[key] as GraphValue)
                if (!id) return
                const ctx = allctx.get(ctxid!)
                node[key] = (await readRelTarget(
                  id,
                  ctx ? ctx.user : null,
                  _opt,
                )) as GraphValue
              }),
            )
            ack(msg.put[soul])
          } else {
            ack(null)
          }
        },
        _opt,
      )
    }

    const graph = async (
      soul: string,
      data: Record<string, GraphValue>,
      userctx?: UserIdentity | null,
      cb?: (err?: string) => void,
    ): Promise<Graph | null> => {
      if (userctx) {
        const timestamp = Date.now()
        const sig = await SEA.signTimestamp(timestamp, userctx)
        return utils.graph(soul, data, sig!, userctx.pub, timestamp)
      }

      if (options.secure) {
        if (!cb) cb = console.log
        cb(`error putting data on ${soul}: user required in secure mode`)
        return null
      }

      return utils.graph(soul, data)
    }

    const done = (ctxid: string) => {
      return (data: unknown): void => {
        const ctx = allctx.get(ctxid)
        if (ctx && typeof ctx.cb !== "undefined") {
          setTimeout(() => ctx.cb!(data as never), 1)
        } else if (data) {
          console.log("error no callback for data", data, "ctx", ctx)
        }
        if (ctx && !ctx.on) allctx.delete(ctxid)
      }
    }

    const watchForRel = (
      soul: string,
      item: string,
      ctx: ApiContext,
      i: number,
      request: {
        on?: LexFilter
        get?: LexFilter
        _get?: boolean
        _opt?: WireOptions
      },
      cb: (data: unknown) => void,
      on = true,
    ): void => {
      let timer: ReturnType<typeof setTimeout> | null = null
      const handler = (): void => {
        // Bail out if the context was removed by off().
        if (!allctx.has(ctxid!)) {
          wire.off({"#": soul, ".": item}, handler)
          if (timer) clearTimeout(timer)
          return
        }
        wire.get(
          {"#": soul, ".": item},
          msg => {
            const node = msg.put && msg.put[soul]
            const id = utils.rel.is(node && (node[item] as GraphValue))
            if (!id) {
              // If it's a plain value (not a rel) and this is a get, deliver it.
              // node._ guards against timeout null-acks which lack metadata.
              if (!on && node && node._ && typeof node[item] !== "undefined") {
                if (timer) clearTimeout(timer)
                wire.off({"#": soul, ".": item}, handler)
                cb(node[item])
              }
              return
            }
            if (timer) clearTimeout(timer)
            wire.off({"#": soul, ".": item}, handler)
            ctx.chain[i]!.soul = id
            allctx.set(ctxid!, {...ctx})
            if (on) {
              api(ctxid).on(request.on!, cb, request._get, request._opt)
            } else {
              api(ctxid).next(
                null as never,
                request.get as never,
                cb as never,
                request._opt,
              )
            }
          },
          {
            ...request._opt,
            secure:
              (typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) ||
              options.secure,
          },
        )
      }
      wire.on({"#": soul, ".": item}, handler, false, request._opt)
      // Time out after the same total duration as the on() retry loop
      // (1+2+4+8+16 = 31s) so callers are not blocked forever if the node
      // genuinely doesn't exist.
      if (!on) {
        timer = setTimeout(() => {
          wire.off({"#": soul, ".": item}, handler)
          if (cb) cb(null)
        }, 31000)
      }
    }

    // Creates a rel for item on soul, or reuses one already being created
    // by a concurrent caller for the same soul+item (see pendingRel above).
    // Calls cb(err, id) with a ready-to-display err, already prefixed where
    // needed - callers should pass it straight through, not wrap it again.
    const createRel = (
      soul: string,
      item: string,
      node: Record<string, GraphValue>,
      user: UserIdentity | null | undefined,
      cb: (err?: string | null, id?: string) => void,
    ): void => {
      let bySoul = pendingRel.get(soul)
      const pending = bySoul && bySoul.get(item)
      if (pending) {
        pending.then(
          id => cb(undefined, id),
          err => cb(err as string),
        )
        return
      }

      const id = utils.text.random()
      node[item] = utils.rel.ify(id)
      let settle!: (id: string) => void
      let fail!: (err: unknown) => void
      const promise = new Promise<string>((res, rej) => {
        settle = res
        fail = rej
      })
      promise.catch(() => {})
      if (!bySoul) {
        bySoul = new Map()
        pendingRel.set(soul, bySoul)
      }
      bySoul.set(item, promise)
      const clear = () => {
        bySoul!.delete(item)
        if (bySoul!.size === 0) pendingRel.delete(soul)
      }

      void (async () => {
        // graph() itself calls cb with an already-formatted message when it
        // fails (secure mode, no user) - pass cb straight through rather
        // than wrapping, so that message isn't prefixed a second time.
        const g = await graph(soul, node, user, cb)
        if (g === null) {
          clear()
          fail(new Error("secure mode"))
          return
        }

        wire.put(g, err => {
          clear()
          if (err) {
            const message = `error putting ${item} on ${soul}: ${err}`
            fail(message)
            cb(message)
            return
          }

          settle(id)
          cb(undefined, id)
        })
      })()
    }

    const resolve = (
      request: {
        get?: LexFilter
        put?: GraphValue | Record<string, GraphValue>
        on?: LexFilter
        off?: boolean
        _opt?: WireOptions
        _get?: boolean
      },
      cb?: (data: unknown) => void,
    ): ChainItem | false => {
      if (!request) {
        console.log("error resolve request parameter required")
        return false
      }

      const get = typeof request.get !== "undefined"
      const put = typeof request.put !== "undefined"
      const on = typeof request.on !== "undefined"
      const off = typeof request.off !== "undefined"

      let found = false
      const ctx = allctx.get(ctxid!)
      if (!ctx) return {item: null, soul: null}
      for (let i = 1; i < ctx.chain.length; i++) {
        if (ctx.chain[i]!.soul !== null) continue
        found = true
        break
      }

      if (found) {
        let i = 1
        while (i < ctx.chain.length && ctx.chain[i]!.soul !== null) i++
        const {item, soul} = ctx.chain[i - 1]!
        wire.get(
          {"#": soul!, ".": item!},
          async msg => {
            if (msg.err) {
              console.log(`error getting ${item} on ${soul}: ${msg.err}`)
              if (cb) cb(null)
              return
            }

            let node = msg.put && msg.put[soul!]
            if (node && typeof node[item!] !== "undefined") {
              let id = utils.rel.is(node[item!] as GraphValue)
              if (id) {
                ctx.chain[i]!.soul = id
                allctx.set(ctxid!, {...ctx})
                if (get) {
                  api(ctxid).next(
                    null as never,
                    request.get as never,
                    cb as never,
                    request._opt,
                  )
                } else if (put) {
                  api(ctxid).put(request.put!, cb as never)
                } else if (on) {
                  api(ctxid).on(request.on!, cb!, request._get, request._opt)
                } else if (off) {
                  api(ctxid).off(cb as never)
                }
              } else if (get) {
                cb!(node[item!])
              } else if (put) {
                createRel(
                  soul!,
                  item!,
                  node as never,
                  ctx.user,
                  (err, relId) => {
                    if (err) {
                      ;(cb as (err: string) => void)(err)
                      return
                    }
                    ctx.chain[i]!.soul = relId!
                    api(ctxid).put(request.put!, cb as never)
                  },
                )
              } else if (on) {
                // Item is not a rel yet — watch the parent soul for when it
                // becomes one, then retry chain resolution.
                watchForRel(soul!, item!, ctx, i, request, cb!)
                if (request._get) cb!(null)
              } else if (off) {
                if (cb) cb(null)
              }
            } else if (put) {
              if (!node) node = {} as never
              createRel(soul!, item!, node as never, ctx.user, (err, relId) => {
                if (err) {
                  ;(cb as (err: string) => void)(err)
                  return
                }
                ctx.chain[i]!.soul = relId!
                api(ctxid).put(request.put!, cb as never)
              })
            } else {
              if (on) {
                // Node doesn't exist yet — watch for it to appear.
                watchForRel(soul!, item!, ctx, i, request, cb!)
                if (request._get) cb!(null)
              } else if (get && node) {
                const sv = (
                  node as Record<string, unknown> & {
                    _?: {">": Record<string, unknown>}
                  }
                )._?.[">"]
                if (
                  sv &&
                  Object.keys(sv).length > 0 &&
                  typeof sv[item!] === "undefined"
                ) {
                  // State vector has other properties but not this one — never written.
                  if (cb) cb(null)
                } else {
                  // Empty state vector or item is tracked — may arrive via push.
                  watchForRel(soul!, item!, ctx, i, request, cb!, false)
                }
              } else {
                // Soul doesn't exist or no get — return null.
                if (cb) cb(null)
              }
            }
          },
          {
            ...request._opt,
            secure:
              (typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) ||
              options.secure,
          },
        )
        return false
      }

      if (get && ctx.chain[ctx.chain.length - 1]!.item !== null) {
        ctx.chain.push({item: null, soul: null})
        api(ctxid).next(
          null as never,
          request.get as never,
          cb as never,
          request._opt,
        )
        return false
      }

      return ctx.chain[ctx.chain.length - 1]!
    }

    return {
      get: function (
        this: HolsterAPI,
        key: string | null,
        lex?: LexFilter | ((data: unknown) => void),
        cb?: ((data: unknown) => void) | WireOptions,
        _opt?: WireOptions,
      ): HolsterAPI {
        let lexFilter: LexFilter | null | undefined
        let callback: ((data: unknown) => void) | undefined
        let opts: WireOptions | undefined

        if (typeof lex === "function") {
          opts = cb as WireOptions
          callback = lex
          lexFilter = null
        } else {
          lexFilter = lex
          callback = cb as (data: unknown) => void
          opts = _opt
        }

        if (key === null || key === "" || key === "_") {
          console.log("error please provide a key")
          if (callback) callback(null)
          return this
        }

        if (lexFilter && typeof callback !== "function") {
          console.log("error lex requires a callback function")
          return this
        }

        ctxid = utils.text.random()
        allctx.set(ctxid, {
          chain: [{item: String(key), soul: "root"}],
          cb: callback,
        })
        if (!callback) return api(ctxid)

        const _done = done(ctxid)
        const result = resolve({get: lexFilter, _opt: opts}, _done)
        if (result) get(lexFilter as never, result.soul!, _done, opts)
        return this
      } as HolsterAPI["get"],

      next: function (
        this: HolsterAPI,
        key: string | null,
        lex?: LexFilter | ((data: unknown) => void),
        cb?: ((data: unknown) => void) | WireOptions,
        _opt?: WireOptions,
      ): HolsterAPI {
        let lexFilter: LexFilter | null | undefined
        let callback: ((data: unknown) => void) | undefined
        let opts: WireOptions | undefined

        if (typeof lex === "function") {
          opts = cb as WireOptions
          callback = lex
          lexFilter = null
        } else {
          lexFilter = lex
          callback = cb as (data: unknown) => void
          opts = _opt
        }

        const ack = (ctxid: string) => {
          return (data: unknown): void => {
            if (callback) {
              callback(data)
            } else {
              done(ctxid)(data)
            }
          }
        }

        if (!ctxid) {
          console.log("error please provide a key using get(key)")
          if (callback) callback(null)
          return this
        }

        const _ack = ack(ctxid)
        if (key === "" || key === "_") {
          _ack(null)
          return this
        }

        if (lexFilter && typeof callback !== "function") {
          console.log("error lex requires a callback function")
          return this
        }

        const ctx = allctx.get(ctxid)
        if (!ctx) return this

        if (callback && typeof ctx.cb === "undefined") {
          ctx.cb = callback
          callback = undefined
        }

        if (key !== null) ctx.chain.push({item: String(key), soul: null})
        if (!ctx.cb) return api(ctxid)

        const result = resolve({get: lexFilter, _opt: opts}, _ack)
        if (result) get(lexFilter as never, result.soul!, _ack, opts)
        return this
      } as HolsterAPI["next"],

      put: function (
        data: GraphValue | Record<string, GraphValue>,
        set?: boolean | ((data?: string | null) => void),
        cb?: (data?: string | null) => void,
      ): HolsterAPI | void {
        let isSet = false
        let callback: ((data?: string | null) => void) | undefined

        if (typeof set === "function") {
          callback = set
          isSet = false
        } else {
          isSet = set || false
          callback = cb
        }

        const ack = (ctxid: string) => {
          return (data?: string | null): void => {
            if (callback) {
              callback(data)
            } else {
              done(ctxid)(data)
            }
          }
        }

        if (!ctxid) {
          if (callback) callback("error please provide a key using get(key)")
          return
        }

        const ctx = allctx.get(ctxid!)
        if (!ctx) return

        if (!ctx.cb && callback) {
          ctx.cb = callback as never
          callback = undefined
        }

        if (isSet)
          data = {[utils.text.random()]: data} as Record<string, GraphValue>

        const _ack = ack(ctxid)
        const result = check(data)
        if (typeof result === "string") {
          _ack(result)
          return
        }

        const resolved = resolve({put: data, _opt: {put: true}}, _ack as never)
        if (!resolved) return

        const {item, soul} = resolved
        if (!soul) return

        if (result === true) {
          wire.get(
            {"#": soul, ".": item!},
            async msg => {
              if (msg.err) {
                _ack(`error getting ${soul}: ${msg.err}`)
                return
              }

              let node = msg.put && msg.put[soul]
              const current = node && node[item!]
              const id = utils.rel.is(current as GraphValue)
              if (!id) {
                if (!node) node = {} as never
                node[item!] = (isSet ? data : data) as GraphValue
                const g = await graph(
                  soul,
                  node as never,
                  ctx.user,
                  _ack as never,
                )
                if (g === null) return

                wire.put(g, _ack as never)
                return
              }

              wire.get({"#": id}, async msg => {
                if (msg.err) {
                  _ack(`error getting ${id}: ${msg.err}`)
                  return
                }

                if (!msg.put || !msg.put[id]) {
                  _ack(`error ${id} not found`)
                  return
                }

                for (const key of Object.keys(msg.put[id]!)) {
                  if (
                    key === "_" ||
                    key === utils.userPublicKey ||
                    key === utils.userSignature
                  ) {
                    continue
                  }

                  const err = await new Promise<string | null | undefined>(
                    res => {
                      const _ctxid = utils.text.random()
                      const chain: ChainItem[] = [{item: key, soul: id}]
                      allctx.set(_ctxid, {chain: chain, user: ctx.user})
                      api(_ctxid).put(null!, res as never)
                    },
                  )
                  if (err) {
                    _ack(err)
                    return
                  }
                }
                if (!node) node = {} as never
                node[item!] = data as GraphValue
                const g = await graph(
                  soul,
                  node as never,
                  ctx.user,
                  _ack as never,
                )
                if (g === null) return

                wire.put(g, _ack as never)
              })
            },
            {
              secure:
                (typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) ||
                options.secure,
              put: true,
            },
          )
          return
        }

        const attemptRead = (retries = 0): void => {
          wire.get(
            {"#": soul, ".": item!},
            async msg => {
              if (msg.err) {
                _ack(`error getting ${soul}.${item}: ${msg.err}`)
                return
              }

              let node = msg.put && msg.put[soul]
              const current = node && node[item!]

              if (!current && retries < 5) {
                await new Promise(r => setTimeout(r, 50))
                return attemptRead(retries + 1)
              }

              const id = utils.rel.is(current as GraphValue)
              if (!id) {
                if (!node) node = {} as never
                createRel(soul, item!, node as never, ctx.user, err => {
                  if (err) {
                    _ack(err)
                    return
                  }

                  const _ctxid = utils.text.random()
                  const chain: ChainItem[] = [{item: item!, soul: soul}]
                  allctx.set(_ctxid, {
                    chain: chain,
                    user: ctx.user,
                    cb: ctx.cb,
                  })
                  api(_ctxid).put(data)
                })
                return
              }

              const update: string[] = []
              for (const key of result as string[]) {
                const err = await new Promise<string | null | undefined>(
                  res => {
                    if (
                      utils.obj.is((data as Record<string, unknown>)[key]) &&
                      !utils.rel.is((data as Record<string, GraphValue>)[key])
                    ) {
                      const _ctxid = utils.text.random()
                      const chain: ChainItem[] = [{item: key, soul: id}]
                      allctx.set(_ctxid, {chain: chain, user: ctx.user})
                      api(_ctxid).put(
                        (data as Record<string, GraphValue>)[key]!,
                        res as never,
                      )
                    } else {
                      update.push(key)
                      res(null)
                    }
                  },
                )
                if (err) {
                  _ack(err)
                  return
                }
              }

              if (update.length === 0) {
                _ack(null)
                return
              }

              // Only write the primitive update keys. Rels created by the
              // recursive puts above are already in the in-memory graph.
              const updateNode: Record<string, GraphValue> = {}
              update.forEach(key => {
                updateNode[key] = (data as Record<string, GraphValue>)[key]!
              })
              const g = await graph(
                id,
                updateNode as never,
                ctx.user,
                _ack as never,
              )
              if (g === null) return

              wire.put(g, _ack as never)
            },
            {
              secure:
                (typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) ||
                options.secure,
              put: true,
            },
          )
        }
        attemptRead()
      },

      on: function (
        lex: LexWithDot | ((data: unknown) => void),
        cb?: ((data: unknown) => void) | boolean,
        _get?: boolean,
        _opt?: WireOptions,
      ): void {
        let lexFilter: LexFilter | undefined
        let callback: (data: unknown) => void
        let opts: WireOptions | undefined

        if (typeof lex === "function") {
          opts = _get as never
          _get = cb as never
          callback = lex
          lexFilter = null
        } else {
          lexFilter = lex as LexFilter
          callback = (typeof cb === "function" ? cb : undefined)!
          opts = _opt
        }

        if (typeof callback !== "function") {
          console.log("error on() requires a callback function")
          return
        }

        if (!ctxid) {
          console.log("error please provide a key using get(key)")
          callback(null)
          return
        }

        const resolved = resolve(
          {on: lexFilter, _get: _get, _opt: opts},
          callback,
        )
        if (!resolved) return

        const {item, soul} = resolved
        if (!soul) return

        const ctx = allctx.get(ctxid)

        if (opts && opts.nested) {
          // attachNested calls this once for the top level and again for
          // every discovered child, each needing its own independent
          // context - a single shared _ctxid would accumulate .next()
          // calls onto the same path instead of giving sibling paths.
          const factory = (): HolsterAPI => {
            const _ctxid = utils.text.random()
            allctx.set(_ctxid, {
              chain: [{item: item, soul: soul}],
              user: ctx ? ctx.user : null,
            })
            return api(_ctxid)
          }
          nested.set(callback, attachNested(factory, callback, _get, opts))
          return
        }

        allctx.set(ctxid, {
          chain: [{item: item, soul: soul}],
          on: true,
          user: ctx ? ctx.user : null,
        })

        // Shared retry state for this on() subscription.
        const maxRetries = 5
        const retryDelay = 1000
        let retryTimer: ReturnType<typeof setTimeout> | null = null
        // Which soul the persistent wire listener is currently attached to
        // - starts on the parent (soul/item), and moves to a rel's target
        // soul once item turns out to be one, since further updates land
        // on the target's own soul, not the parent's. Tracked (rather than
        // switching unconditionally) so the two places that can discover a
        // rel - the initial check below and a later resolveValue retry -
        // don't both re-register the same listener. Scoped to this one
        // on() call's closure, so concurrent subscriptions (even on the
        // same key) each track their own independently.
        let listenedSoul = soul

        map.set(callback, () => {
          // Bail out if off() has already cleaned up this context — the mapped
          // callback can fire twice (once from wire.on and once from the _get
          // immediate-read path) and the second call after async context cleanup
          // would crash in resolve(). Matches the guard in watchForRel.
          if (!allctx.has(ctxid!)) return
          // Cancel any pending retry — the persistent listener firing means we
          // have an update and should not call callback twice.
          clearTimeout(retryTimer!)
          retryTimer = null

          // Resolves {soul, item} to a genuine value, following a rel to its
          // target if the property turns out to be one - checked fresh on
          // every attempt, not just the first, since a property can still
          // be a plain undefined/null on an early check and only become a
          // rel once a later retry catches up (e.g. a nested rel-creating
          // put both adds "item" as a rel on this node AND populates its
          // target, and either half can still be mid-flight when the
          // listener first fires). wire.get() can't reliably tell
          // "genuinely null" apart from "hasn't landed yet" either - its
          // own internal timeout fallback explicitly answers null when
          // nothing comes back in time - so a null/missing value is
          // retried a few times before being trusted as final, the same
          // way the rel branch below already retries on a null target
          // read.
          const resolveValue = (
            retries: number,
            node: Record<string, GraphValue> | null | undefined,
            value: unknown,
          ): void => {
            const id = utils.rel.is(value as GraphValue)
            if (id) {
              if (listenedSoul !== id) {
                wire.off({"#": listenedSoul} as never, map.get(callback)!)
                wire.on(
                  {"#": id, ".": null} as never,
                  map.get(callback)!,
                  false,
                  opts,
                )
                listenedSoul = id
              }
              readRelTarget(id, ctx ? ctx.user : null, opts).then(data => {
                retryTimer = null
                callback(data)
              })
              return
            }

            if (value !== undefined && value !== null) {
              retryTimer = null
              callback(value)
              return
            }
            if (retries >= maxRetries) {
              retryTimer = null
              callback(value !== undefined ? value : null)
              return
            }
            // Fast once the parent node already exists (a value is likely
            // imminent); slow/exponential when it doesn't, since there's
            // no signal anything is coming soon and fast polling would
            // just waste requests.
            const delay = node
              ? 50
              : Math.min(retryDelay * Math.pow(2, retries), 30000)
            retryTimer = setTimeout(() => {
              wire.get(
                {"#": soul, ".": item!},
                retryMsg => {
                  const retryNode = retryMsg.put && retryMsg.put[soul]
                  resolveValue(
                    retries + 1,
                    retryNode,
                    retryNode && retryNode[item!],
                  )
                },
                {
                  ...opts,
                  secure: ctx
                    ? (typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) ||
                      options.secure
                    : options.secure,
                },
              )
            }, delay)
          }

          wire.get(
            {"#": soul, ".": item!},
            msg => {
              const node = msg.put && msg.put[soul]
              resolveValue(0, node, node && node[item!])
            },
            {
              ...opts,
              secure: ctx
                ? (typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) ||
                  options.secure
                : options.secure,
            },
          )
        })

        let initialLex: {"#": string; "."?: string | number} = lexFilter
          ? (utils.obj.put(lexFilter as never, "#", soul) as {
              "#": string
              "."?: string | number
            })
          : {"#": soul, ".": item!}
        if (initialLex["."] != null && typeof initialLex["."] === "number") {
          initialLex = {...initialLex, ".": String(initialLex["."])}
        }
        wire.on(initialLex as never, map.get(callback)!, false, opts)

        wire.get(
          {"#": soul, ".": item!},
          msg => {
            if (msg.err) {
              console.log(`error getting ${soul}.${item}: ${msg.err}`)
              return
            }

            const current = msg.put && msg.put[soul] && msg.put[soul]![item!]
            const id = utils.rel.is(current as GraphValue)
            if (id) {
              // It's a rel, need to switch listener to the related node -
              // unless resolveValue (triggered by the initial listener
              // firing) already beat this check to it.
              if (listenedSoul !== id) {
                wire.off({"#": listenedSoul} as never, map.get(callback)!)
                wire.on(
                  {"#": id, ".": null} as never,
                  map.get(callback)!,
                  false,
                  opts,
                )
                listenedSoul = id
              }
              if (_get) map.get(callback)!()
            } else if (_get) {
              // Not a rel, but _get was requested, so trigger callback.
              map.get(callback)!()
            }
          },
          {
            ...opts,
            secure: ctx
              ? (typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) ||
                options.secure
              : options.secure,
          },
        )
      } as HolsterAPI["on"],

      off: function (cb?: (data: unknown) => void): HolsterAPI | void {
        if (!ctxid) {
          console.log("error please provide a key using get(key)")
          if (cb) cb(null)
          return
        }

        if (cb && nested.has(cb)) {
          nested.get(cb)!()
          nested.delete(cb)
          return
        }

        const resolved = resolve({off: true}, cb)
        if (!resolved) return

        const {item, soul} = resolved
        if (!soul) return

        wire.off({"#": soul} as never, map.get(cb!)!)

        wire.get({"#": soul, ".": item!}, msg => {
          if (msg.err) {
            map.delete(cb!)
            allctx.delete(ctxid!)
            return
          }

          const current = msg.put && msg.put[soul] && msg.put[soul]![item!]
          const id = utils.rel.is(current as GraphValue)
          if (id) wire.off({"#": id} as never, map.get(cb!)!)
          map.delete(cb!)
          allctx.delete(ctxid!)
        })
      },

      user: () => {
        if (!(user as {get?: unknown}).get) {
          Object.assign(user, api())
          ;(user as UserInterface & HolsterAPI).get = function (
            this: HolsterAPI,
            keys: string | string[],
            lex?: LexFilter | ((data: unknown) => void),
            cb?: ((data: unknown) => void) | WireOptions,
            _opt?: WireOptions,
          ): HolsterAPI {
            let lexFilter: LexFilter | null | undefined
            let callback: ((data: unknown) => void) | undefined
            let opts: WireOptions | undefined

            if (typeof lex === "function") {
              opts = cb as WireOptions
              callback = lex
              lexFilter = null
            } else {
              lexFilter = lex
              callback = cb as (data: unknown) => void
              opts = _opt
            }

            let pub: string | null = null
            let key: string | null = null
            if (user.is) pub = user.is.pub
            if (typeof keys === "string") {
              key = keys
            } else if (keys instanceof Array) {
              if (keys.length === 2 && keys[0] && keys[1]) {
                pub = keys[0]
                key = keys[1]
              } else if (keys.length === 1 && keys[0]) {
                key = keys[0]
              }
            }
            if (!pub) {
              console.log("error please log in or provide a public key")
              if (callback) callback(null)
              return this
            }

            if (key === null || key === "" || key === "_") {
              console.log("error please provide a key")
              if (callback) callback(null)
              return this
            }

            if (lexFilter && !callback) {
              console.log("error lex requires a callback function")
              return this
            }

            ctxid = utils.text.random()
            const chain: ChainItem[] = [{item: String(key), soul: "~" + pub}]
            allctx.set(ctxid, {
              chain: chain,
              user: user.is,
              cb: callback as never,
            })
            if (!callback) return api(ctxid)

            const _done = done(ctxid)
            const resolved = resolve({get: lexFilter, _opt: opts}, _done)
            if (resolved) get(lexFilter as never, resolved.soul!, _done, opts)
            return this
          } as never
        }
        return user as UserInterface & HolsterAPI
      },

      wire: wire,
      SEA: SEA,
    }
  }
  return api()
}

export default Holster

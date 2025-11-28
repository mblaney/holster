/**
 * Holster - Main API for graph database operations
 * Provides chainable interface for get, put, on, off operations
 */

import * as utils from "./utils.ts"
import Wire, { type WireAPI } from "./wire.ts"
import User, { type UserInterface } from "./user.ts"
import SEA from "./sea.ts"
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
    (key: string | null, lex?: LexWithDot, cb?: (data: unknown) => void, _opt?: WireOptions): HolsterAPI
    (
      key: string | null,
      cb?: (data: unknown) => void,
      _opt?: WireOptions
    ): HolsterAPI
  }
  next: {
    (key: string | null, lex?: LexWithDot, cb?: (data: unknown) => void, _opt?: WireOptions): HolsterAPI
    (
      key: string | null,
      cb?: (data: unknown) => void,
      _opt?: WireOptions
    ): HolsterAPI
  }
  put: (
    data: GraphValue | Record<string, GraphValue>,
    set?: boolean | ((data?: string | null) => void),
    cb?: (data?: string | null) => void
  ) => HolsterAPI | void
  on: (
    lex: LexWithDot | ((data: unknown) => void),
    cb?: ((data: unknown) => void) | boolean,
    _get?: boolean,
    _opt?: WireOptions
  ) => void
  off: (cb?: (data: unknown) => void) => HolsterAPI | void
  user: () => UserInterface & HolsterAPI
  wire: WireAPI
  SEA: typeof SEA
}

const Holster = (opt?: HolsterOptions | string | string[]): HolsterAPI => {
  let options: HolsterOptions
  if (typeof opt === "string") options = { peers: [opt] }
  else if (opt instanceof Array) options = { peers: opt }
  else if (!utils.obj.is(opt)) options = {}
  else options = opt

  const wire = Wire(options)
  const user = User(options, wire as never)
  const map = new Map<(data: unknown) => void, () => void>()
  const allctx = new Map<string, ApiContext>()

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
    data: GraphValue | Record<string, GraphValue>
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
        const error = JSON.stringify({ [key]: value })
        return `error ${error} cannot be converted to a graph`
      }
      if (keys.length !== 0) return keys
    }
    const error = JSON.stringify(data)
    return `error ${error} cannot be converted to a graph`
  }

  const api = (initCtxid?: string): HolsterAPI => {
    let ctxid = initCtxid
    const get = (
      lex: LexFilter,
      soul: string,
      ack: (data: unknown) => void,
      _opt?: WireOptions
    ): void => {
      wire.get(
        utils.obj.put(lex as never, "#", soul) as Lex,
        async msg => {
          if (msg.err) console.log(msg.err)
          if (msg.put && msg.put[soul]) {
            delete (msg.put[soul] as { _?: unknown })._
            delete (msg.put[soul] as Record<string, unknown>)[utils.userPublicKey]
            delete (msg.put[soul] as Record<string, unknown>)[utils.userSignature]
            for (const key of Object.keys(msg.put[soul]!)) {
              const id = utils.rel.is(msg.put[soul]![key] as GraphValue)
              if (id) {
                const attemptRead = async (retries = 0): Promise<unknown> => {
                  const data = await new Promise<unknown>(res => {
                    const _ctxid = utils.text.random()
                    const ctx = allctx.get(ctxid!)
                    allctx.set(_ctxid, {
                      chain: [{ item: null, soul: id }],
                      user: ctx ? ctx.user : null,
                    })
                    api(_ctxid).next(null as never, res as never, _opt)
                  })
                  if (data !== null || retries >= 5) {
                    return data
                  }
                  await new Promise(resolve => setTimeout(resolve, 50))
                  return attemptRead(retries + 1)
                }
                msg.put[soul]![key] = (await attemptRead()) as GraphValue
              }
            }
            ack(msg.put[soul])
          } else {
            ack(null)
          }
        },
        _opt
      )
    }

    const graph = async (
      soul: string,
      data: Record<string, GraphValue>,
      userctx?: UserIdentity | null,
      cb?: (err?: string) => void
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

    const resolve = (
      request: {
        get?: LexFilter
        put?: GraphValue | Record<string, GraphValue>
        on?: LexFilter
        off?: boolean
        _opt?: WireOptions
        _get?: boolean
      },
      cb?: (data: unknown) => void
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
      const ctx = allctx.get(ctxid!)!
      for (let i = 1; i < ctx.chain.length; i++) {
        if (ctx.chain[i]!.soul !== null) continue
        found = true
        break
      }

      if (found) {
        let i = 1
        while (i < ctx.chain.length && ctx.chain[i]!.soul !== null) i++
        const { item, soul } = ctx.chain[i - 1]!
        wire.get(
          { "#": soul!, ".": item! },
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
                allctx.set(ctxid!, { ...ctx })
                if (get) {
                  api(ctxid).next(null as never, request.get as never, cb as never, request._opt)
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
                id = utils.text.random()
                node[item!] = utils.rel.ify(id)
                const g = await graph(soul!, node as never, ctx.user, cb as never)
                if (g === null) return

                wire.put(g, err => {
                  if (err) {
                    (cb as (err: string) => void)(`error putting ${item} on ${soul}: ${err}`)
                    return
                  }
                  if (id) {
                    ctx.chain[i]!.soul = id
                  }
                  api(ctxid).put(request.put!, cb as never)
                })
              } else if (on) {
                cb!(null)
              } else if (off) {
                if (cb) cb(null)
              }
            } else if (put) {
              const id = utils.text.random()
              if (!node) node = {} as never
              node[item!] = utils.rel.ify(id)
              const g = await graph(soul!, node as never, ctx.user, cb as never)
              if (g === null) return

              wire.put(g, err => {
                if (err) {
                  (cb as (err: string) => void)(`error putting ${item} on ${soul}: ${err}`)
                  return
                }
                ctx.chain[i]!.soul = id
                api(ctxid).put(request.put!, cb as never)
              })
            } else {
              if (cb) cb(null)
            }
          },
          { ...request._opt, secure: (typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) || options.secure }
        )
        return false
      }

      if (get && ctx.chain[ctx.chain.length - 1]!.item !== null) {
        ctx.chain.push({ item: null, soul: null })
        api(ctxid).next(null as never, request.get as never, cb as never, request._opt)
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
        _opt?: WireOptions
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
          chain: [{ item: String(key), soul: "root" }],
          cb: callback,
        })
        if (!callback) return api(ctxid)

        const _done = done(ctxid)
        const result = resolve({ get: lexFilter, _opt: opts }, _done)
        if (result) get(lexFilter as never, result.soul!, _done, opts)
        return this
      } as HolsterAPI["get"],

      next: function (
        this: HolsterAPI,
        key: string | null,
        lex?: LexFilter | ((data: unknown) => void),
        cb?: ((data: unknown) => void) | WireOptions,
        _opt?: WireOptions
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

        if (key !== null) ctx.chain.push({ item: String(key), soul: null })
        if (!ctx.cb) return api(ctxid)

        const result = resolve({ get: lexFilter, _opt: opts }, _ack)
        if (result) get(lexFilter as never, result.soul!, _ack, opts)
        return this
      } as HolsterAPI["next"],

      put: function (
        data: GraphValue | Record<string, GraphValue>,
        set?: boolean | ((data?: string | null) => void),
        cb?: (data?: string | null) => void
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

        if (!ctx.cb) {
          if (!callback) return
          ctx.cb = callback as never
          callback = undefined
        }

        if (isSet) data = { [utils.text.random()]: data } as Record<string, GraphValue>

        const _ack = ack(ctxid)
        const result = check(data)
        if (typeof result === "string") {
          _ack(result)
          return
        }

        const resolved = resolve({ put: data }, _ack as never)
        if (!resolved) return

        const { item, soul } = resolved
        if (!soul) return

        if (result === true) {
          wire.get(
            { "#": soul, ".": item! },
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
                const g = await graph(soul, node as never, ctx.user, _ack as never)
                if (g === null) return

                wire.put(g, _ack as never)
                return
              }

              wire.get({ "#": id }, async msg => {
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

                  const err = await new Promise<string | null | undefined>(res => {
                    const _ctxid = utils.text.random()
                    const chain: ChainItem[] = [{ item: key, soul: id }]
                    allctx.set(_ctxid, { chain: chain, user: ctx.user })
                    api(_ctxid).put(null!, res as never)
                  })
                  if (err) {
                    _ack(err)
                    return
                  }
                }
                if (!node) node = {} as never
                node[item!] = data as GraphValue
                const g = await graph(soul, node as never, ctx.user, _ack as never)
                if (g === null) return

                wire.put(g, _ack as never)
              })
            },
            { secure: (typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) || options.secure }
          )
          return
        }

        const attemptRead = (retries = 0): void => {
          wire.get(
            { "#": soul, ".": item! },
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
                node[item!] = utils.rel.ify(utils.text.random())
                const g = await graph(soul, node as never, ctx.user, _ack as never)
                if (g === null) return

                wire.put(g, err => {
                  if (err) {
                    _ack(`error putting ${item} on ${soul}: ${err}`)
                  } else {
                    const _ctxid = utils.text.random()
                    const chain: ChainItem[] = [{ item: item!, soul: soul }]
                    allctx.set(_ctxid, {
                      chain: chain,
                      user: ctx.user,
                      cb: ctx.cb,
                    })
                    api(_ctxid).put(data)
                  }
                })
                return
              }

              const update: string[] = []
              for (const key of result as string[]) {
                const err = await new Promise<string | null | undefined>(res => {
                  if (
                    utils.obj.is((data as Record<string, unknown>)[key]) &&
                    !utils.rel.is((data as Record<string, GraphValue>)[key])
                  ) {
                    const _ctxid = utils.text.random()
                    const chain: ChainItem[] = [{ item: key, soul: id }]
                    allctx.set(_ctxid, { chain: chain, user: ctx.user })
                    api(_ctxid).put((data as Record<string, GraphValue>)[key]!, res as never)
                  } else {
                    update.push(key)
                    res(null)
                  }
                })
                if (err) {
                  _ack(err)
                  return
                }
              }

              if (update.length === 0) {
                _ack(null)
                return
              }

              wire.get({ "#": id }, async msg => {
                if (msg.err) {
                  _ack(`error getting ${id}: ${msg.err}`)
                  return
                }

                let node = msg.put && msg.put[id]
                if (!node) node = {} as never
                update.forEach(key => {
                  node![key] = (data as Record<string, GraphValue>)[key]!
                })
                const g = await graph(id, node as never, ctx.user, _ack as never)
                if (g === null) return

                wire.put(g, _ack as never)
              })
            },
            { secure: (typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) || options.secure }
          )
        }
        attemptRead()
      },

      on: function (
        lex: LexWithDot | ((data: unknown) => void),
        cb?: ((data: unknown) => void) | boolean,
        _get?: boolean,
        _opt?: WireOptions
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

        const resolved = resolve({ on: lexFilter, _get: _get, _opt: opts }, callback)
        if (!resolved) return

        const { item, soul } = resolved
        if (!soul) return

        const ctx = allctx.get(ctxid)

        allctx.set(ctxid, {
          chain: [{ item: item, soul: soul }],
          on: true,
          user: ctx ? ctx.user : null,
        })

        map.set(callback, () => {
          wire.get(
            { "#": soul, ".": item! },
            msg => {
              const current = msg.put && msg.put[soul] && msg.put[soul]![item!]
              const id = utils.rel.is(current as GraphValue)
              if (id) {
                const attemptRead = async (retries = 0): Promise<void> => {
                  const data = await new Promise<unknown>(res => {
                    const _ctxid = utils.text.random()
                    allctx.set(_ctxid, {
                      chain: [{ item: null, soul: id }],
                      user: ctx ? ctx.user : null,
                    })
                    api(_ctxid).next(null as never, res as never, opts)
                  })
                  if (data !== null || retries >= 5) {
                    callback(data)
                  } else {
                    await new Promise(resolve => setTimeout(resolve, 50))
                    attemptRead(retries + 1)
                  }
                }
                attemptRead()
              } else {
                callback(current !== undefined ? current : null)
              }
            },
            { ...opts, secure: ctx ? ((typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) || options.secure) : options.secure }
          )
        })

        let initialLex: { "#": string; "."?: string | number } = lexFilter
          ? (utils.obj.put(lexFilter as never, "#", soul) as { "#": string; "."?: string | number })
          : { "#": soul, ".": item! }
        if (initialLex["."] != null && typeof initialLex["."] === "number") {
          initialLex = { ...initialLex, ".": String(initialLex["."]) }
        }
        wire.on(initialLex as never, map.get(callback)!, false, opts)

        wire.get(
          { "#": soul, ".": item! },
          msg => {
            if (msg.err) {
              console.log(`error getting ${soul}.${item}: ${msg.err}`)
              return
            }

            const current = msg.put && msg.put[soul] && msg.put[soul]![item!]
            const id = utils.rel.is(current as GraphValue)
            if (id) {
              wire.off(initialLex as never, map.get(callback)!)
              const relLex = (lexFilter
                ? utils.obj.put(initialLex as never, "#", id)
                : { "#": id, ".": null }) as Lex
              wire.on(relLex, map.get(callback)!, _get, opts)
            } else if (_get) {
              // Not a rel, but _get was requested, so trigger callback.
              map.get(callback)!()
            }
          },
          { ...opts, secure: ctx ? ((typeof ctx.user === "boolean" ? ctx.user : !!ctx.user) || options.secure) : options.secure }
        )
      },

      off: function (cb?: (data: unknown) => void): HolsterAPI | void {
        if (!ctxid) {
          console.log("error please provide a key using get(key)")
          if (cb) cb(null)
          return
        }

        const resolved = resolve({ off: true }, cb)
        if (!resolved) return

        const { item, soul } = resolved
        if (!soul) return

        wire.off({ "#": soul } as never, map.get(cb!)!)

        wire.get({ "#": soul, ".": item! }, msg => {
          if (msg.err) {
            map.delete(cb!)
            allctx.delete(ctxid!)
            return
          }

          const current = msg.put && msg.put[soul] && msg.put[soul]![item!]
          const id = utils.rel.is(current as GraphValue)
          if (id) wire.off({ "#": id } as never, map.get(cb!)!)
          map.delete(cb!)
          allctx.delete(ctxid!)
        })
      },

      user: () => {
        if (!(user as { get?: unknown }).get) {
          Object.assign(user, api())
          ;(user as UserInterface & HolsterAPI).get = function (
            this: HolsterAPI,
            keys: string | string[],
            lex?: LexFilter | ((data: unknown) => void),
            cb?: ((data: unknown) => void) | WireOptions,
            _opt?: WireOptions
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
            const chain: ChainItem[] = [{ item: String(key), soul: "~" + pub }]
            allctx.set(ctxid, { chain: chain, user: user.is, cb: callback as never })
            if (!callback) return api(ctxid)

            const _done = done(ctxid)
            const resolved = resolve({ get: lexFilter, _opt: opts }, _done)
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


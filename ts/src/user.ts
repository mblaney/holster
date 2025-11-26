/**
 * User - User authentication and management
 * Provides user creation, authentication, and password management
 */

import * as utils from "./utils.js"
import Wire from "./wire.js"
import SEA from "./sea.js"
import type { UserIdentity, HolsterOptions, LexFilter, WireOptions } from "./schemas.js"
import type { HolsterAPI } from "./holster.js"

type WireInterface = ReturnType<typeof Wire>

export interface UserInterface {
  is?: UserIdentity | null
  create: (username: string, password: string, cb?: (err?: string | null) => void) => void
  auth: (username: string, password: string, cb?: (err?: string | null) => void) => void
  change: (
    username: string,
    password: string,
    newPassword: string,
    cb?: (err?: string | null) => void
  ) => void
  store: (localStorage?: boolean) => void
  recall: () => void
  leave: () => void
  delete: (username: string, password: string, cb?: (err?: string | null) => void) => void
  get?(
    keys: string | string[],
    lex?: LexFilter | ((data: unknown) => void),
    cb?: ((data: unknown) => void) | WireOptions,
    _opt?: WireOptions
  ): HolsterAPI
}

/**
 * Create User management interface
 */
const User = (opt: HolsterOptions | undefined, wire?: WireInterface): UserInterface => {
  if (!wire) wire = Wire(opt as HolsterOptions)
  const wait = opt?.wait ?? 5000
  let pubs: string[] = []
  let creating = false
  let authing = false
  let retries = 0

  const auth = (
    username: string,
    password: string,
    newPassword: string,
    ack: (err?: string | null) => void
  ): void => {
    const retry = (username: string): void => {
      retries++
      auth(username, password, newPassword, ack)
    }
    const done = (err?: string | null): void => {
      pubs = []
      retries = 0
      authing = false
      ack(err)
    }
    const next = (): void => {
      if (pubs.length === 0) {
        done("Wrong username or password")
        return
      }

      const pub = pubs.shift()!
      wire.get(
        { "#": pub, ".": ["auth", "pub", "epub"] },
        async msg => {
          if (msg.err) {
            done(`error getting ${pub}: ${msg.err}`)
            return
          }

          const data = msg.put && msg.put[pub]
          if (!data || !data.auth) return next()

          const authData = JSON.parse(data.auth as string) as {
            enc: { ct: string; iv: string; s: string }
            salt: string
          }
          const work = await SEA.work(password, authData.salt)
          const dec = (await SEA.decrypt(authData.enc, work)) as
            | { priv: string; epriv: string }
            | null
          if (!dec) return next()

          user.is = {
            username: username,
            pub: data.pub as string,
            epub: data.epub as string,
            priv: dec.priv,
            epriv: dec.epriv,
          }
          if (newPassword !== "") {
            const salt = utils.text.random(64)
            const newWork = await SEA.work(newPassword, salt)
            const enc = await SEA.encrypt(dec, newWork)
            const update = {
              auth: JSON.stringify({ enc: enc, salt: salt }),
            }
            const timestamp = Date.now()
            const sig = await SEA.signTimestamp(timestamp, user.is)
            const graph = utils.graph(pub, update, sig!, data.pub as string, timestamp)
            wire.put(graph, err => {
              if (err) {
                done(`error putting ${JSON.stringify(update)} on ${pub}: ${err}`)
              } else {
                done(null)
              }
            })
            return
          }

          done(null)
        },
        { wait: wait }
      )
    }

    if (retries > 9) {
      done("Wrong username or password")
      return
    }

    const soul = "~@" + username
    wire.get(
      { "#": soul },
      async msg => {
        if (msg.err) {
          done(`error getting ${soul}: ${msg.err}`)
          return
        }

        const data = msg.put && msg.put[soul]
        if (!data) return retry(username)

        delete (data as { _?: unknown })._
        pubs = Object.keys(data)
        next()
      },
      { wait: wait }
    )
  }

  const user: UserInterface = {
    is: null,
    create: (username, password, cb) => {
      const ack = (err?: string | null): void => {
        if (cb) cb(err)
        else if (err) console.log(err)
      }

      if (creating) {
        ack("User is already being created")
        return
      }

      if (username === "") {
        ack("Please provide a username")
        return
      }

      if (password === "") {
        ack("Please provide a password")
        return
      }

      creating = true

      const soul = "~@" + username
      wire.get(
        { "#": soul },
        async msg => {
          if (msg.err) {
            creating = false
            ack(`error getting ${soul}: ${msg.err}`)
            return
          }

          if (msg.put && msg.put[soul]) {
            creating = false
            ack("Username already exists")
            return
          }

          const salt = utils.text.random(64)
          const work = await SEA.work(password, salt)
          const pair = await SEA.pair()
          const priv = { priv: pair.priv, epriv: pair.epriv }
          const enc = await SEA.encrypt(priv, work)
          const data = {
            username: username,
            pub: pair.pub,
            epub: pair.epub,
            auth: JSON.stringify({ enc: enc, salt: salt }),
          }

          const pub = "~" + pair.pub
          const timestamp = Date.now()
          const sig = await SEA.signTimestamp(timestamp, pair)
          const graph = utils.graph(pub, data, sig!, pair.pub, timestamp)
          wire.put(graph, err => {
            creating = false
            if (err) {
              ack(`error putting ${JSON.stringify(data)} on ${pub}: ${err}`)
              return
            }

            const rel = { [pub]: { "#": pub } }
            wire.put(utils.graph(soul, rel as never), err => {
              if (err) {
                ack(`error putting ${JSON.stringify(rel)} on ${soul}: ${err}`)
                return
              }

              if (cb) cb(null)
            })
          })
        },
        { wait: wait }
      )
    },
    auth: (username, password, cb) => {
      const ack = (err?: string | null): void => {
        if (cb) cb(err)
        else if (err) console.log(err)
      }

      if (authing) {
        ack("User is already authenticating")
        return
      }

      user.is = null

      if (username === "") {
        ack("Please provide a username")
        return
      }

      if (password === "") {
        ack("Please provide a password")
        return
      }

      authing = true
      auth(username, password, "", ack)
    },
    change: (username, password, newPassword, cb) => {
      const ack = (err?: string | null): void => {
        if (cb) cb(err)
        else if (err) console.log(err)
      }

      if (authing) {
        ack("User is already authenticating")
        return
      }

      user.is = null

      if (username === "") {
        ack("Please provide a username")
        return
      }

      if (password === "") {
        ack("Please provide a password")
        return
      }

      if (newPassword === "") {
        ack("Please provide a new password")
        return
      }

      authing = true
      auth(username, password, newPassword, ack)
    },
    store: (localStorage = false) => {
      if (!user.is) {
        console.log("Please authenticate before calling store")
        return
      }

      if (localStorage) {
        if (typeof globalThis.localStorage !== "undefined") {
          globalThis.localStorage.setItem("user.is", JSON.stringify(user.is))
        }
        if (typeof globalThis.sessionStorage !== "undefined") {
          globalThis.sessionStorage.removeItem("user.is")
        }
        return
      }

      if (typeof globalThis.sessionStorage !== "undefined") {
        globalThis.sessionStorage.setItem("user.is", JSON.stringify(user.is))
      }
      if (typeof globalThis.localStorage !== "undefined") {
        globalThis.localStorage.removeItem("user.is")
      }
    },
    recall: () => {
      if (typeof globalThis.localStorage !== "undefined") {
        const is = globalThis.localStorage.getItem("user.is")
        if (is) {
          user.is = JSON.parse(is)
          return
        }
      }

      if (typeof globalThis.sessionStorage !== "undefined") {
        const is = globalThis.sessionStorage.getItem("user.is")
        if (is) {
          user.is = JSON.parse(is)
        }
      }
    },
    leave: () => {
      user.is = null
      if (typeof globalThis.localStorage !== "undefined") {
        globalThis.localStorage.removeItem("user.is")
      }
      if (typeof globalThis.sessionStorage !== "undefined") {
        globalThis.sessionStorage.removeItem("user.is")
      }
    },
    delete: (username, password, cb) => {
      const ack = (err?: string | null): void => {
        if (cb) cb(err)
        else if (err) console.log(err)
      }

      if (authing) {
        ack("User is already authenticating")
        return
      }

      if (username === "") {
        ack("Please provide a username")
        return
      }

      if (password === "") {
        ack("Please provide a password")
        return
      }

      authing = true
      auth(username, password, "", async err => {
        if (err) {
          ack(err)
          return
        }

        const data = { username: null, pub: null, epub: null, auth: null }
        const timestamp = Date.now()
        const sig = await SEA.signTimestamp(timestamp, user.is!)
        const pub = "~" + user.is!.pub
        const graph = utils.graph(pub, data as never, sig!, user.is!.pub, timestamp)
        wire.put(graph, err => {
          if (err) {
            ack(`error putting null on ${pub}: ${err}`)
            return
          }

          user.is = null
          if (cb) cb(null)
        })
      })
    },
  }
  return user
}

export default User


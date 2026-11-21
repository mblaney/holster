import * as utils from "./utils.js"
import Wire from "./wire.js"
import SEA from "./sea.js"
import {userPublicKey, userSignature} from "./utils.js"

// PBKDF2 iterations for passwords, as OWASP recommends for SHA-256.
const passwordIterations = 600000
// Auth records without iter were encrypted with this many iterations.
const legacyIterations = 100000

const User = (opt, wire) => {
  if (!wire) wire = Wire(opt)
  let pubs = []
  let creating = false
  let authing = false
  let retries = 0
  // Souls being signed again, so a read while that happens doesn't repeat it.
  const resigning = new Set()

  // Signs the user's own data again when it's read with signatures from before
  // property signatures, which gives it a newer state as well.
  wire.legacy(async data => {
    for (const [soul, node] of Object.entries(data)) {
      if (!user.is || node[userPublicKey] !== user.is.pub) continue
      if (resigning.has(soul)) continue

      resigning.add(soul)
      const signed = await SEA.signProperties(soul, node, user.is)
      wire.put(signed, err => {
        resigning.delete(soul)
        if (err) console.log(`error signing ${soul} again: ${err}`)
      })
    }
  })

  const auth = (username, password, newPassword, ack) => {
    const retry = username => {
      retries++
      auth(username, password, newPassword, ack)
    }
    const done = err => {
      pubs = []
      retries = 0
      authing = false
      ack(err)
    }
    const next = () => {
      if (pubs.length === 0) {
        done("Wrong username or password")
        return
      }

      const pub = pubs.shift()
      wire.get({"#": pub, ".": ["auth", "pub", "epub"]}, async msg => {
        if (msg.err) {
          done(`error getting ${pub}: ${msg.err}`)
          return
        }

        const data = msg.put && msg.put[pub]
        if (!data || !data.auth) return next()

        const auth = JSON.parse(data.auth)
        const iter = auth.iter ?? legacyIterations
        const work = await SEA.work(password, auth.salt, iter)
        const dec = await SEA.decrypt(auth.enc, work)
        if (!dec) return next()

        user.is = {
          username: username,
          pub: data.pub,
          epub: data.epub,
          priv: dec.priv,
          epriv: dec.epriv,
        }
        // The private key is encrypted again for a new password, or when its
        // record is from before the iterations were stored.
        let updatePassword = newPassword
        if (updatePassword === "" && !auth.iter) updatePassword = password
        if (updatePassword !== "") {
          // Encrypt private key using the password and a new salt.
          const salt = utils.text.random(64)
          const work = await SEA.work(updatePassword, salt, passwordIterations)
          const enc = await SEA.encrypt(dec, work)
          // Only update the auth property with the new encryption.
          const update = {
            auth: JSON.stringify({
              enc: enc,
              salt: salt,
              iter: passwordIterations,
            }),
          }
          const graph = await SEA.signProperties(pub, update, user.is)
          wire.put(graph, err => {
            if (!err) {
              done(null)
            } else if (newPassword !== "") {
              done(`error putting ${update} on ${pub}: ${err}`)
            } else {
              // The old encryption still works, so the login does too.
              console.log(`error updating auth on ${pub}: ${err}`)
              done(null)
            }
          })
          return
        }

        done(null)
      })
    }

    if (retries > 9) {
      done("Wrong username or password")
      return
    }

    const soul = "~@" + username
    wire.get({"#": soul}, async msg => {
      if (msg.err) {
        done(`error getting ${soul}: ${msg.err}`)
        return
      }

      const data = msg.put && msg.put[soul]
      if (!data) return retry(username)

      delete msg.put[soul]._
      // Usernames aren't guaranteed to be unique, so store the list and then
      // try each of them until one is successful with the given password.
      pubs = Object.keys(data)
      next()
    })
  }

  const user = {
    create: (username, password, cb) => {
      const ack = err => {
        if (cb) cb(err)
        else console.log(err)
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
      wire.get({"#": soul}, async msg => {
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
        const work = await SEA.work(password, salt, passwordIterations)
        const pair = await SEA.pair()
        const priv = {priv: pair.priv, epriv: pair.epriv}
        const enc = await SEA.encrypt(priv, work)
        const data = {
          username: username,
          pub: pair.pub,
          epub: pair.epub,
          auth: JSON.stringify({
            enc: enc,
            salt: salt,
            iter: passwordIterations,
          }),
        }

        const pub = "~" + pair.pub
        const graph = await SEA.signProperties(pub, data, pair)
        wire.put(graph, err => {
          creating = false
          if (err) {
            ack(`error putting ${data} on ${pub}: ${err}`)
            return
          }

          const rel = {[pub]: {"#": pub}}
          wire.put(utils.graph(soul, rel), err => {
            if (err) {
              ack(`error putting ${rel} on ${soul}: ${err}`)
              return
            }

            // Return null on success.
            if (cb) cb(null)
          })
        })
      })
    },
    auth: (username, password, cb) => {
      const ack = err => {
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
      const ack = err => {
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
    store: localStorage => {
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
      const ack = err => {
        if (cb) cb(err)
        else console.log(err)
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

        const data = {username: null, pub: null, epub: null, auth: null}
        const pub = "~" + user.is.pub
        const graph = await SEA.signProperties(pub, data, user.is)
        wire.put(graph, err => {
          if (err) {
            ack(`error putting null on ${pub}: ${err}`)
            return
          }

          user.is = null
          // Return null on success. Note currently not updating ~@username,
          // not sure if allowing username re-user is a good idea anyway?
          if (cb) cb(null)
        })
      })
    },
  }
  return user
}

export default User

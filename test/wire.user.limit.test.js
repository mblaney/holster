import fs from "fs"
import {Server} from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Store from "../src/store.js"
import Wire from "../src/wire.js"

describe("wire.user.limit", () => {
  // defaultLimit:0 blocks all user data; non-user data still passes through.
  const wss1 = new Server("ws://localhost:1244")
  Wire({
    file: "test/user-limit-zero",
    wss: wss1,
    userLimit: true,
    defaultLimit: 0,
  })

  // Default 1MB limit — user data within limit is stored.
  const wss2 = new Server("ws://localhost:1245")
  Wire({file: "test/user-limit-allow", wss: wss2, userLimit: true})

  const pubKey = "_holster_user_public_key"

  // Send a put message to the server via WebSocket and wait for the ack.
  // Waits for the connection to be open if not already established.
  const sendPut = (ws, data) =>
    new Promise(resolve => {
      const msgId = "ultest_" + Math.random().toString(36).slice(2)
      const send = () => {
        ws.onmessage = m => {
          const msg = JSON.parse(m.data)
          if (msg["@"] === msgId) {
            ws.onmessage = null
            resolve(msg)
          }
        }
        ws.send(JSON.stringify({"#": msgId, put: data}))
      }
      if (ws.readyState === WebSocket.OPEN) {
        send()
      } else {
        ws.onopen = () => {
          ws.onopen = null
          send()
        }
      }
    })

  // Read a soul directly from disk via a fresh Store, bypassing Wire's graph.
  const readFromDisk = (file, soul) =>
    new Promise(resolve => {
      const store = Store({file})
      store.get({"#": soul}, (_err, data) => {
        resolve(data?.[soul] ?? null)
      })
    })

  const client1 = new WebSocket("ws://localhost:1244")
  const client2 = new WebSocket("ws://localhost:1245")

  test("non-user data stored when userLimit:true and defaultLimit:0", (t, done) => {
    const soul = "ul_no_pub"
    const ts = Date.now()
    sendPut(client1, {
      [soul]: {
        _: {"#": soul, ">": {x: ts}},
        x: "no pubkey",
      },
    }).then(ack => {
      assert.equal(ack.err, null)
      readFromDisk("test/user-limit-zero", soul).then(node => {
        assert.ok(node, "non-user node should be stored on disk")
        assert.equal(node.x, "no pubkey")
        done()
      })
    })
  })

  test("user data blocked when defaultLimit:0", (t, done) => {
    const soul = "ul_user_zero"
    const ts = Date.now()
    sendPut(client1, {
      [soul]: {
        _: {"#": soul, ">": {[pubKey]: ts, x: ts}},
        [pubKey]: "testPub",
        x: "user data",
      },
    }).then(ack => {
      assert.equal(ack.err, null)
      readFromDisk("test/user-limit-zero", soul).then(node => {
        assert.equal(
          node,
          null,
          "user node should not be stored when limit is 0",
        )
        done()
      })
    })
  })

  test("user data within limit is stored", (t, done) => {
    const soul = "ul_user_allow"
    const ts = Date.now()
    sendPut(client2, {
      [soul]: {
        _: {"#": soul, ">": {[pubKey]: ts, x: ts}},
        [pubKey]: "allowPub",
        x: "user data",
      },
    }).then(ack => {
      assert.equal(ack.err, null)
      readFromDisk("test/user-limit-allow", soul).then(node => {
        assert.ok(node, "user node should be stored when within limit")
        assert.equal(node.x, "user data")
        done()
      })
    })
  })

  test("cleanup", (t, done) => {
    setTimeout(() => {
      fs.rm("test/user-limit-zero", {recursive: true, force: true}, err => {
        assert.equal(err, null)
        fs.rm("test/user-limit-allow", {recursive: true, force: true}, err => {
          assert.equal(err, null)
          fs.rm("test/.user_storage.json", {force: true}, err => {
            assert.equal(err, null)
            fs.rm("test/.user_limit.json", {force: true}, err => {
              assert.equal(err, null)
              done()
            })
          })
        })
      })
    }, 100)
  })
})

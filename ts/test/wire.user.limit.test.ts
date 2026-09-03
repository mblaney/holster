import fs from "fs"
import {Server} from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Store from "../src/store.ts"
import Wire from "../src/wire.ts"

describe("wire.user.limit", () => {
  // defaultLimit:0 blocks all user data; non-user data still passes through.
  const wss1: Server = new Server("ws://localhost:1244")
  Wire({
    file: "test/user-limit-zero",
    wss: wss1,
    userLimit: true,
    defaultLimit: 0,
  })

  // Default 1MB limit — user data within limit is stored.
  const wss2: Server = new Server("ws://localhost:1245")
  Wire({file: "test/user-limit-allow", wss: wss2, userLimit: true})

  // A tiny limit makes it easy to push a user over quota with one write,
  // then check that a later, smaller write (e.g. a delete) still gets
  // through despite already being over.
  const wss3: Server = new Server("ws://localhost:1246")
  Wire({
    file: "test/user-limit-shrink",
    wss: wss3,
    userLimit: true,
    defaultLimit: 0.0001,
  })

  const pubKey = "_holster_user_public_key"

  // Send a put message to the server via WebSocket and wait for the ack.
  // Waits for the connection to be open if not already established.
  const sendPut = (
    ws: WebSocket,
    data: object,
  ): Promise<{err: string | null}> =>
    new Promise(resolve => {
      const msgId = "ultest_" + Math.random().toString(36).slice(2)
      const send = (): void => {
        ws.onmessage = (m: MessageEvent) => {
          const msg = JSON.parse(m.data as string) as {
            "@"?: string
            err: string | null
          }
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
  const readFromDisk = (
    file: string,
    soul: string,
  ): Promise<Record<string, unknown> | null> =>
    new Promise(resolve => {
      const store = Store({file} as never)
      store.get(
        {"#": soul},
        (_err: unknown, data: Record<string, unknown> | null | undefined) => {
          resolve((data?.[soul] as Record<string, unknown>) ?? null)
        },
      )
    })

  const client1: WebSocket = new WebSocket("ws://localhost:1244")
  const client2: WebSocket = new WebSocket("ws://localhost:1245")
  const client3: WebSocket = new WebSocket("ws://localhost:1246")

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
        assert.equal((node as {x?: string}).x, "no pubkey")
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
        assert.equal((node as {x?: string}).x, "user data")
        done()
      })
    })
  })

  test("a write that shrinks usage is stored even when already over the limit", (t, done) => {
    const soul = "ul_shrink"
    const ts1 = Date.now()
    sendPut(client3, {
      [soul]: {
        _: {"#": soul, ">": {[pubKey]: ts1, x: ts1}},
        [pubKey]: "shrinkPub",
        x: "a long enough string to push comfortably past the tiny limit",
      },
    }).then(ack1 => {
      assert.equal(ack1.err, null)
      const ts2 = ts1 + 1
      sendPut(client3, {
        [soul]: {
          _: {"#": soul, ">": {[pubKey]: ts2, x: ts2}},
          [pubKey]: "shrinkPub",
          x: null,
        },
      }).then(ack2 => {
        assert.equal(ack2.err, null)
        readFromDisk("test/user-limit-shrink", soul).then(node => {
          assert.equal(
            (node as {x?: string | null}).x,
            null,
            "a shrinking write should still be stored once already over the limit",
          )
          done()
        })
      })
    })
  })

  test("cleanup", (_t, done) => {
    setTimeout(() => {
      fs.rm("test/user-limit-zero", {recursive: true, force: true}, err => {
        assert.equal(err, null)
        fs.rm("test/user-limit-allow", {recursive: true, force: true}, err => {
          assert.equal(err, null)
          fs.rm(
            "test/user-limit-shrink",
            {recursive: true, force: true},
            err => {
              assert.equal(err, null)
              fs.rm("test/.user_storage.json", {force: true}, err => {
                assert.equal(err, null)
                fs.rm("test/.user_limit.json", {force: true}, err => {
                  assert.equal(err, null)
                  done()
                })
              })
            },
          )
        })
      })
    }, 100)
  })
})

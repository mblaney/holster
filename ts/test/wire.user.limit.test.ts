import fs from "fs"
import {Server} from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import SEA from "../src/sea.ts"
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

  test("user data blocked when defaultLimit:0", async () => {
    const soul = "ul_user_zero"
    const pair = await SEA.pair()
    const data = await SEA.signProperties(soul, {x: "user data"}, pair)
    const ack = await sendPut(client1, data)
    assert.equal(ack.err, null)
    const node = await readFromDisk("test/user-limit-zero", soul)
    assert.equal(node, null, "user node should not be stored when limit is 0")
  })

  test("user data within limit is stored", async () => {
    const soul = "ul_user_allow"
    const pair = await SEA.pair()
    const data = await SEA.signProperties(soul, {x: "user data"}, pair)
    const ack = await sendPut(client2, data)
    assert.equal(ack.err, null)
    const node = await readFromDisk("test/user-limit-allow", soul)
    assert.ok(node, "user node should be stored when within limit")
    assert.equal((node as {x?: string}).x, "user data")
  })

  test("a write that shrinks usage is stored even when already over the limit", async () => {
    const soul = "ul_shrink"
    const pair = await SEA.pair()
    const long = "a long enough string to push comfortably past the tiny limit"
    const first = await SEA.signProperties(soul, {x: long}, pair)
    const ack1 = await sendPut(client3, first)
    assert.equal(ack1.err, null)
    // The second write needs a later state than the first.
    await new Promise(res => setTimeout(res, 2))
    const second = await SEA.signProperties(soul, {x: null}, pair)
    const ack2 = await sendPut(client3, second)
    assert.equal(ack2.err, null)
    const node = await readFromDisk("test/user-limit-shrink", soul)
    assert.equal(
      (node as {x?: string | null}).x,
      null,
      "a shrinking write should still be stored once already over the limit",
    )
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

import fs from "fs"
import {Server} from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../src/holster.js"

// Unlike every other holster.on.*.test.js (all single-instance, writer and
// listener on the same holster), the bug this covers only reproduces
// across a real connection: a plain on() only resolves the node it's
// given, so a value-only change to a child whose own value is an object
// (and so has its own soul, unlike a plain scalar) never reaches a
// listener on the parent - nothing on the parent's own soul actually
// changed, only the child's did. A server holster (owns the data) and a
// separate connecting client holster (the listener) exercise the real
// cross-connection path this depends on.
describe("holster.on nested", () => {
  const wss = new Server("ws://localhost:1261")
  const server = Holster({wss, file: "test/holster.on.nested-server"})
  const serverUser = server.user()

  const client = Holster({
    peers: ["ws://localhost:1261"],
    file: "test/holster.on.nested-client",
  })
  const clientUser = client.user()

  let host

  test("setup", async () => {
    await new Promise((resolve, reject) => {
      serverUser.create("host", "password", err => {
        if (err && !err.includes("already exists")) reject(new Error(err))
        else resolve()
      })
    })
    await new Promise((resolve, reject) => {
      serverUser.auth("host", "password", err => {
        if (err) reject(new Error(err))
        else resolve()
      })
    })
    await new Promise((resolve, reject) => {
      clientUser.create("browseruser", "browserpassword", err => {
        if (err && !err.includes("already exists")) reject(new Error(err))
        else resolve()
      })
    })
    await new Promise((resolve, reject) => {
      clientUser.auth("browseruser", "browserpassword", err => {
        if (err) reject(new Error(err))
        else resolve()
      })
    })
    host = serverUser.is.pub
  })

  test("sees a value-only update to an already-known object-valued child", async () => {
    await new Promise(resolve => {
      serverUser.get("shared").next("nested1").next("a").put({ct: "1"}, resolve)
    })

    const events = []
    const cb = data => events.push(data)
    await new Promise(resolve => {
      clientUser
        .get([host, "shared"])
        .next("nested1")
        .on(
          data => {
            cb(data)
            if (events.length === 1) resolve()
          },
          true,
          {nested: true},
        )
    })

    await new Promise(r => setTimeout(r, 200))

    await new Promise(resolve => {
      serverUser.get("shared").next("nested1").next("a").put({ct: "2"}, resolve)
    })

    await new Promise(r => setTimeout(r, 300))

    const last = events[events.length - 1]
    assert.equal(last.a.ct, "2")

    clientUser.get([host, "shared"]).next("nested1").off(cb)
  })

  test("still fires for a newly added object-valued child", async t => {
    const events = []
    const cb = data => events.push(data)
    clientUser
      .get([host, "shared"])
      .next("nested2")
      .on(cb, true, {nested: true})

    t.after(() => {
      clientUser.get([host, "shared"]).next("nested2").off(cb)
    })

    await new Promise(r => setTimeout(r, 200))

    await new Promise(resolve => {
      serverUser
        .get("shared")
        .next("nested2")
        .next("first")
        .put({ct: "p1"}, resolve)
    })

    await new Promise(r => setTimeout(r, 300))

    const last = events[events.length - 1]
    assert.equal(last.first.ct, "p1")
  })

  test("off() stops both top-level and child updates", async () => {
    const events = []
    const cb = data => events.push(data)
    clientUser
      .get([host, "shared"])
      .next("nested3")
      .on(cb, true, {nested: true})

    await new Promise(resolve => {
      serverUser.get("shared").next("nested3").next("x").put({ct: "1"}, resolve)
    })
    await new Promise(r => setTimeout(r, 300))

    clientUser.get([host, "shared"]).next("nested3").off(cb)
    const countAfterOff = events.length

    await new Promise(resolve => {
      serverUser.get("shared").next("nested3").next("x").put({ct: "2"}, resolve)
    })
    await new Promise(resolve => {
      serverUser.get("shared").next("nested3").next("y").put({ct: "1"}, resolve)
    })
    await new Promise(r => setTimeout(r, 300))

    assert.equal(events.length, countAfterOff)
  })

  test("cleanup", (t, done) => {
    fs.rm(
      "test/holster.on.nested-server",
      {recursive: true, force: true},
      () => {
        fs.rm(
          "test/holster.on.nested-client",
          {recursive: true, force: true},
          () => {
            done()
          },
        )
      },
    )
  })
})

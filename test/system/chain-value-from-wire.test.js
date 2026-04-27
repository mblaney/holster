import fs from "fs"
import {Server} from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../../src/holster.js"

describe("system - never written property returns null immediately", () => {
  const wss = new Server("ws://localhost:9020")
  const holster = Holster({file: "test/system/chain-never-written", wss: wss})

  let ackId = 0
  const ws = new WebSocket("ws://localhost:9020")
  ws.onmessage = m => {
    const msg = JSON.parse(m.data)
    if (!msg.get) return
    const soul = msg.get["#"]
    const prop = msg.get["."]

    if (soul === "root" && prop === "parent") {
      ws.send(JSON.stringify({
        "#": `ack_${++ackId}`,
        "@": msg["#"],
        put: {
          root: {
            _: {"#": "root", ">": {parent: 1}},
            parent: {"#": "test_soul"},
          },
        },
      }))
    } else if (soul === "test_soul" && prop === "child") {
      // Soul exists with another property but "child" was never written —
      // non-empty state vector without the requested key.
      ws.send(JSON.stringify({
        "#": `ack_${++ackId}`,
        "@": msg["#"],
        put: {
          test_soul: {
            other: "stuff",
            _: {"#": "test_soul", ">": {other: 1}},
          },
        },
      }))
    } else {
      ws.send(JSON.stringify({"#": `ack_${++ackId}`, "@": msg["#"], put: null}))
    }
  }

  test("next() returns null when soul has other properties but not the requested one", (t, done) => {
    holster.get("parent").next("child", data => {
      assert.equal(data, null)
      done()
    })
  })

  test("cleanup", (t, done) => {
    fs.rm(
      "test/system/chain-never-written",
      {recursive: true, force: true},
      err => {
        assert.equal(err, null)
        done()
      },
    )
  })
})

describe("system - chained subscription receives plain value via push", () => {
  const wss = new Server("ws://localhost:9021")
  const holster = Holster({file: "test/system/chain-value-via-push", wss: wss})

  let ackId = 0
  let childPushSent = false
  const ws = new WebSocket("ws://localhost:9021")
  ws.onmessage = m => {
    const msg = JSON.parse(m.data)
    if (!msg.get) return
    const soul = msg.get["#"]
    const prop = msg.get["."]

    if (soul === "root" && prop === "parent") {
      ws.send(JSON.stringify({
        "#": `ack_${++ackId}`,
        "@": msg["#"],
        put: {
          root: {
            _: {"#": "root", ">": {parent: 1}},
            parent: {"#": "test_soul"},
          },
        },
      }))
    } else if (soul === "test_soul" && prop === "child" && !childPushSent) {
      childPushSent = true
      // Soul does not have child yet — respond null and push the value shortly after.
      ws.send(JSON.stringify({"#": `ack_${++ackId}`, "@": msg["#"], put: null}))
      setTimeout(() => {
        ws.send(JSON.stringify({
          "#": `push_${++ackId}`,
          put: {
            test_soul: {
              child: "the value",
              _: {"#": "test_soul", ">": {child: 1}},
            },
          },
        }))
      }, 200)
    } else {
      ws.send(JSON.stringify({"#": `ack_${++ackId}`, "@": msg["#"], put: null}))
    }
  }

  test("on() subscription receives plain value pushed after initial null response", (t, done) => {
    holster.get("parent").next("child").on(data => {
      assert.equal(data, "the value")
      done()
    })
  })

  test("cleanup", (t, done) => {
    fs.rm(
      "test/system/chain-value-via-push",
      {recursive: true, force: true},
      err => {
        assert.equal(err, null)
        done()
      },
    )
  })
})

import fs from "fs"
import { Server } from "mock-socket"
import { describe, test } from "node:test"
import assert from "node:assert/strict"
import Wire from "../src/wire.ts"
import type { WireInterface } from "../src/schemas.ts"

describe("wire", () => {
  // Need different websocket servers otherwise data on file will sync up.
  const wss1: Server = new Server("ws://localhost:1234")
  const kitty: WireInterface = Wire({ file: "test/kitty", wss: wss1 })

  const wss2: Server = new Server("ws://localhost:1235")
  const wire: WireInterface = Wire({ file: "test/wire", wss: wss2 })

  const ws: WebSocket = new WebSocket("ws://localhost:1235")

  const wss3: Server = new Server("ws://localhost:1236")
  const batchWire: WireInterface = Wire({ file: "test/batch-wire", wss: wss3 })

  // ws3 responds to a get for "batch_parent" with a put batch where
  // "batch_child" appears before "batch_parent" to exercise the pre-pass.
  // All other gets (e.g. check() public key lookups) receive an empty ack so
  // that check() completes before the 100ms timeout and processMessage fires
  // the queue callback with the full batch data.
  let ackId = 0
  const ws3: WebSocket = new WebSocket("ws://localhost:1236")
  ws3.onmessage = (m: MessageEvent) => {
    const msg = JSON.parse(m.data as string)
    if (!msg.get) return
    if (msg.get["#"] === "batch_parent" && !msg.get["."]) {
      ws3.send(
        JSON.stringify({
          "#": "batch_response",
          "@": msg["#"],
          put: {
            "batch_child": {
              _: {"#": "batch_child", ">": {data: 1}},
              data: "child value",
            },
            "batch_parent": {
              _: {"#": "batch_parent", ">": {child: 1}},
              child: {"#": "batch_child"},
            },
          },
        }),
      )
    } else {
      ws3.send(
        JSON.stringify({"#": `ack_${++ackId}`, "@": msg["#"], put: null}),
      )
    }
  }
  ws.onmessage = (m: MessageEvent) => {
    const msg = JSON.parse(m.data as string)
    if (msg.get) {
      const soul = msg.get["#"]
      const put = {
        [soul]: {
          _: {"#": soul, ">": {test: 1}},
          test: "property",
        },
      }
      let track = "item"
      if (!msg.get!["."]) {
        const node = put[soul]! as any
        node._[">"].other = 2
        node.other = "value"
        track = "node"
      }
      ws.send(
        JSON.stringify({
          "#": track,
          "@": msg["#"],
          put: put,
        }),
      )
    }
  }

  test("get node", (t, done) => {
    kitty.get({"#": "FDSA"}, msg => {
      assert.deepEqual(msg, {
        put: {
          FDSA: {
            _: {
              "#": "FDSA",
              ">": {
                color: 3,
                name: 2,
                slave: 2,
                species: 2,
              },
            },
            color: "ginger",
            name: "Fluffy",
            slave: {"#": "ASDF"},
            species: "felis silvestris",
          },
        },
      })
      done()
    })
  })

  test("get item", (t, done) => {
    kitty.get({"#": "FDSA", ".": "species"}, msg => {
      assert.deepEqual(msg, {
        put: {
          FDSA: {
            _: {
              "#": "FDSA",
              ">": {species: 2},
            },
            species: "felis silvestris",
          },
        },
      })
      done()
    })
  })

  test("get node from wire", (t, done) => {
    wire.get({"#": "not on disk"}, msg => {
      assert.deepEqual(msg, {
        put: {
          "not on disk": {
            _: {
              "#": "not on disk",
              ">": {test: 1, other: 2},
            },
            test: "property",
            other: "value",
          },
        },
      })
      done()
    })
  })

  test("get item from wire", (t, done) => {
    wire.get({"#": "not on disk", ".": "test"}, msg => {
      assert.deepEqual(msg, {
        put: {
          "not on disk": {
            _: {
              "#": "not on disk",
              ">": {test: 1},
            },
            test: "property",
          },
        },
      })
      done()
    })
  })

  test("child soul before parent in batch gets stored", (t, done) => {
    batchWire.get({"#": "batch_parent"}, msg => {
      assert.ok(msg.put?.["batch_child"])
      assert.equal((msg.put!["batch_child"] as any).data, "child value")
      done()
    })
  })

  test("put and get new node", (t, done) => {
    const update = {
      key: {
        _: {"#": "key", ">": {value: 1, otherValue: 1}},
        value: "wire test",
        otherValue: false,
      },
    }
    wire.put(update, err => {
      assert.deepEqual(err, null)

      wire.get({"#": "key", ".": "value"}, msg => {
        assert.deepEqual(msg, {
          put: {
            key: {
              _: {
                "#": "key",
                ">": {value: 1},
              },
              value: "wire test",
            },
          },
        })
        done()
      })
    })
  })

  test("cleanup", (t, done) => {
    // Timeout to let extra wire sends finish before tests end.
    setTimeout(() => {
      fs.rm("test/wire", {recursive: true, force: true}, err => {
        assert.equal(err, null)
        fs.rm("test/batch-wire", {recursive: true, force: true}, err => {
          assert.equal(err, null)
          done()
        })
      })
    }, 100)
  })
})

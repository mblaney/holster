const fs = require("fs")
const {Server} = require("mock-socket")
const {describe, test} = require("node:test")
const assert = require("node:assert/strict")
const Wire = require("../src/wire")

describe("wire", () => {
  // Need different websocket servers otherwise data on file will sync up.
  const wss1 = new Server("ws://localhost:1234")
  const kitty = Wire({file: "test/kitty", wss: wss1, maxAge: 10})

  const wss2 = new Server("ws://localhost:1235")
  const wire = Wire({file: "test/wire", wss: wss2, maxAge: 10})

  const ws = new WebSocket("ws://localhost:1235")
  ws.onmessage = m => {
    const msg = JSON.parse(m.data)
    if (msg.get) {
      let replied = true
      const soul = msg.get["#"]
      ws.send(
        JSON.stringify({
          "#": "test",
          "@": msg["#"],
          put: {
            [soul]: {
              _: {"#": soul, ">": {test: 1, other: 2}},
              test: "property",
              other: "value",
            },
          },
        }),
      )
    }
  }

  test("get node", (t, done) => {
    kitty.get({"#": "FDSA"}, msg => {
      assert.deepEqual(msg, {
        err: undefined,
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
        err: undefined,
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

        fs.rm("test/wire", {recursive: true, force: true}, err => {
          assert.equal(err, null)
          done()
          // Exit because wss2.stop() is not working?
          process.exit()
        })
      })
    })
  })
})

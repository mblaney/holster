const fs = require("fs")
const {Server} = require("mock-socket")
const {describe, test} = require("node:test")
const assert = require("node:assert/strict")
const Holster = require("../src/holster")

describe("holster", () => {
  const wss = new Server("ws://localhost:1234")
  const holster = Holster({file: "test/holster.off", wss: wss, maxAge: 100})

  test("calling off without get callback null", (t, done) => {
    holster.off(data => {
      assert.equal(data, null)
      done()
    })
  })

  test("off with cb for property on root then update - no event", (t, done) => {
    const cb = data => {
      console.log("should not be called for key:", data)
      done()
    }
    holster.get("key").on(cb)
    holster.get("key").off(cb)

    holster.get("key").put("value", err => {
      assert.equal(err, null)
      done()
    })
  })

  test("off no cb for property on root then update - no event", (t, done) => {
    holster.get("key1").on(data => {
      console.log("should not be called for key1:", data)
      done()
    })
    setTimeout(() => {
      holster.get("key1").off()

      holster.get("key1").put("value1", err => {
        assert.equal(err, null)
        done()
      })
    }, 10)
  })

  test("cleanup", (t, done) => {
    fs.rm("test/holster.off", {recursive: true, force: true}, err => {
      assert.equal(err, null)
      done()
    })
  })
})

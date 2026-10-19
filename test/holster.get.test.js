import fs from "fs"
import {Server} from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../src/holster.js"

describe("holster.get", () => {
  const wss = new Server("ws://localhost:1234")
  const holster = Holster({file: "test/holster.get", wss: wss})

  test("empty key callback null", (t, done) => {
    holster.get("", data => {
      assert.equal(data, null)
      done()
    })
  })

  test("null key callback null", (t, done) => {
    holster.get(null, data => {
      assert.equal(data, null)
      done()
    })
  })

  test("underscore as key callback null", (t, done) => {
    holster.get("_", data => {
      assert.equal(data, null)
      done()
    })
  })

  test("get unknown key callback null", (t, done) => {
    holster.get("unknown", data => {
      assert.equal(data, null)
      done()
    })
  })

  test("get unknown keys in for loop callbacks null", (t, done) => {
    let count = 0
    for (let i = 0; i < 5; i++) {
      holster.get("unknown" + i, data => {
        assert.equal(data, null)
        count++
      })
    }
    setTimeout(() => {
      if (count === 5) done()
    }, 200)
  })

  test("nested unknown keys both callbacks null", (t, done) => {
    holster.get("unknown", data => {
      assert.equal(data, null)

      holster.get("unknown", data => {
        assert.equal(data, null)
        done()
      })
    })
  })

  test("get already called callback null", (t, done) => {
    holster.get("chained").get("unknown", data => {
      assert.equal(data, null)
      done()
    })
  })

  test("next chained unknown keys callback null", (t, done) => {
    holster.get("chained").next("unknown", data => {
      assert.equal(data, null)
      done()
    })
  })

  test("nested next chained unknown keys callback null", (t, done) => {
    holster.get("chained").next("unknown", data => {
      assert.equal(data, null)

      holster.get("chained").next("unknown", data => {
        assert.equal(data, null)
        done()
      })
    })
  })

  test("get with no callback can be awaited, resolving to the same value a callback would receive", async () => {
    const data = await holster.get("unknown")
    assert.equal(data, null)
  })

  test("next with no callback can be awaited, resolving to the current chain's value", async () => {
    const data = await holster.get("chained").next("unknown")
    assert.equal(data, null)
  })

  test("put then awaiting get sees the put's own value, without either call passing a callback", async () => {
    await holster.get("awaited").put("value")
    const data = await holster.get("awaited")
    assert.equal(data, "value")
  })

  test("cleanup", (t, done) => {
    fs.rm("test/holster.get", {recursive: true, force: true}, err => {
      assert.equal(err, null)
      done()
    })
  })
})

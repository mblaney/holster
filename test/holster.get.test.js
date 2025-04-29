import fs from "fs"
import {Server} from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../src/holster.js"

describe("holster.get", () => {
  const wss = new Server("ws://localhost:1234")
  const holster = Holster({file: "test/holster.get", wss: wss, maxAge: 100})

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

  // Chaining get creates a new context for each call.
  test("get chained unknown keys callback null", (t, done) => {
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

  test("cleanup", (t, done) => {
    fs.rm("test/holster.get", {recursive: true, force: true}, err => {
      assert.equal(err, null)
      done()
    })
  })
})

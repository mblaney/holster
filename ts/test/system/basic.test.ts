import fs from "fs"
import { Server} from "mock-socket"
import { describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../../src/holster.js"
import type { HolsterAPI } from "../../src/holster.js"

describe("system - basic setup", () => {
  const wss: Server = new Server("ws://localhost:9001")
  const holster: HolsterAPI = Holster({file: "test/system/basic", wss: wss})

  test("put and get data", (t, done) => {
    holster.get("test").put({message: "hello"}, err => {
      assert.equal(err, null)

      holster.get("test", data => {
        assert.notEqual(data, null)
        assert.equal((data as { message: string }).message, "hello")
        done()
      })
    })
  })

  test("cleanup", (t, done) => {
    fs.rm("test/system/basic", {recursive: true, force: true}, err => {
      assert.equal(err, null)
      done()
    })
  })
})

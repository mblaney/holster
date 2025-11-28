import fs from "fs"
import { Server} from "mock-socket"
import { describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../../src/holster.ts"
import type { HolsterAPI } from "../../src/holster.ts"

describe("system - immediate read after write", () => {
  const wss: Server = new Server("ws://localhost:9008")
  const holster: HolsterAPI = Holster({file: "test/system/immediate-read", wss: wss})

  test("get immediately after put returns data despite queue delays", (t, done) => {
    holster.get("testkey").put({value: "test"}, err => {
      assert.equal(err, null)

      // Immediate get after put - validates retry logic handles queued writes
      holster.get("testkey", data => {
        assert.notEqual(data, null)
        assert.equal((data as { value: string }).value, "test")
        done()
      })
    })
  })

  test("cleanup", (t, done) => {
    fs.rm("test/system/immediate-read", {recursive: true, force: true}, err => {
      assert.equal(err, null)
      done()
    })
  })
})

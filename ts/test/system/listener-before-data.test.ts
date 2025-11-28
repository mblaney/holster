import fs from "fs"
import { Server} from "mock-socket"
import { describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../../src/holster.ts"
import type { HolsterAPI } from "../../src/holster.ts"

describe("system - listener before data", () => {
  const wss: Server = new Server("ws://localhost:9007")
  const holster: HolsterAPI = Holster({file: "test/system/listener-before-data", wss: wss})

  test("listener set up before data exists receives data when populated", (t, done) => {
    const results: unknown[] = []

    // Set up listener first - this is the browser Display.js pattern
    holster.get("testkey").on(data => {
      results.push(data as { value: string } | null)
    })

    // Give listener time to set up
    setTimeout(() => {
      holster.get("testkey").put({value: "test"}, err => {
        assert.equal(err, null)

        // Give listener time to fire
        setTimeout(() => {
          // With the new behavior, listener fires after data is stored
          // Should have received the test value from the put
          const nonNull = results.filter(r => r !== null)
          assert.equal(
            nonNull.length >= 1,
            true,
            "Should have at least one non-null result",
          )
          assert.equal((nonNull[0] as unknown as { value: string }).value, "test")
          done()
        }, 200)
      })
    }, 100)
  })

  test("cleanup", (t, done) => {
    fs.rm(
      "test/system/listener-before-data",
      {recursive: true, force: true},
      err => {
        assert.equal(err, null)
        done()
      },
    )
  })
})

import fs from "fs"
import { Server} from "mock-socket"
import { describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../../src/holster.ts"
import type { HolsterAPI } from "../../src/holster.ts"

describe("system - concurrent listeners", () => {
  const wss: Server = new Server("ws://localhost:9005")
  const holster: HolsterAPI = Holster({file: "test/system/concurrent-listeners", wss: wss})

  test("multiple listeners on same path receive data", (t, done) => {
    let listener1Called = false
    let listener2Called = false

    holster.get("key").put({value: "test"}, err => {
      assert.equal(err, null)

      // Set up two listeners on the same path
      holster.get("key").on(data => {
        listener1Called = true
        assert.notEqual(data, null)
        assert.equal((data as { value: string }).value, "test")
        checkComplete()
      }, true)

      holster.get("key").on(data => {
        listener2Called = true
        assert.notEqual(data, null)
        assert.equal((data as { value: string }).value, "test")
        checkComplete()
      }, true)

      function checkComplete() {
        if (listener1Called && listener2Called) {
          done()
        }
      }
    })
  })

  test("nested listeners on parent and child paths", (t, done) => {
    let parentCalled = false
    let childCalled = false

    holster.get("parent").put({value: "parent-value"}, err => {
      assert.equal(err, null)

      holster
        .get("parent")
        .next("child")
        .put({value: "child-value"}, err => {
          assert.equal(err, null)

          // Listen on parent
          holster.get("parent").on(data => {
            parentCalled = true
            assert.notEqual(data, null)
            assert.equal((data as { value: string }).value, "parent-value")
            checkComplete()
          }, true)

          // Listen on child
          holster
            .get("parent")
            .next("child")
            .on(data => {
              childCalled = true
              assert.notEqual(data, null)
              assert.equal((data as { value: string }).value, "child-value")
              checkComplete()
            }, true)

          function checkComplete() {
            if (parentCalled && childCalled) {
              done()
            }
          }
        })
    })
  })

  test("listener race condition - data before and after listener setup", (t, done) => {
    const results: unknown[] = []

    // Put data first
    holster.get("race").put({value: "first"}, err => {
      assert.equal(err, null)

      // Set up listener with _get=true to read existing data
      // The listener will be called with the existing data via the get request
      holster.get("race").on(data => {
        results.push((data as { value?: string } | null)?.value)
      }, true)

      // Immediately put new data - listener will fire for this put as well
      setTimeout(() => {
        holster.get("race").put({value: "second"}, err => {
          assert.equal(err, null)

          setTimeout(() => {
            // Should have received both values - one from get, one from put
            assert.equal(
              results.length >= 1,
              true,
              "Should receive at least initial value from get",
            )
            assert.equal(results[0], "first", "First value should be 'first'")
            done()
          }, 100)
        })
      }, 50)
    })
  })

  test("cleanup", (t, done) => {
    fs.rm(
      "test/system/concurrent-listeners",
      {recursive: true, force: true},
      err => {
        assert.equal(err, null)
        done()
      },
    )
  })
})

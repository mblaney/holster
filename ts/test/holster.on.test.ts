import fs from "fs"
import { Server } from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../src/holster.ts"
import type { HolsterAPI } from "../src/holster.ts"

describe("holster.on", () => {
  const wss: Server = new Server("ws://localhost:1234")
  const holster: HolsterAPI = Holster({file: "test/holster.on", wss: wss, maxAge: 100})

  test("calling on without get callback null", (t, done) => {
    holster.on(data => {
      assert.equal(data, null)
      done()
    })
  })

  test("on for property on root then update - event", (t, done) => {
    // Listener is now called for initial put and updates
    let callCount = 0
    holster.get("key").on(data => {
      callCount++
      if (callCount === 1) {
        assert.equal(data, "value")
      } else if (callCount === 2) {
        assert.equal(data, "update")
        done()
      }
    })

    holster.get("key").put("value", err => {
      assert.equal(err, null)

      holster.get("key").put("update", err => {
        assert.equal(err, null)
      })
    })
  })

  test("on for property then update - two listeners", (t, done) => {
    let done1 = false
    let done2 = false

    let callback1Count = 0
    const callback1 = data => {
      callback1Count++
      if (callback1Count === 2) {
        assert.equal(data, "update")
        holster.get("two").off(callback1)
        if (done2) done()
        else done1 = true
      }
    }
    holster.get("two").on(callback1)

    let callback2Count = 0
    const callback2 = data => {
      callback2Count++
      if (callback2Count === 2) {
        assert.equal(data, "update")
        holster.get("two").off(callback2)
        if (done1) done()
        else done2 = true
      }
    }
    holster.get("two").on(callback2)

    holster.get("two").put("value", err => {
      assert.equal(err, null)

      holster.get("two").put("update", err => {
        assert.equal(err, null)
      })
    })
  })

  test("on for different property on root - no event", (t, done) => {
    holster.get("key1").on(data => {
      console.log("should not be called for key1:", data)
      done() // This done is not called and test would fail if it was.
    })

    setTimeout(() => {
      holster.get("key2").put("value2", err => {
        assert.equal(err, null)
        done()
      })
    }, 100)
  })

  test("on for property on root two updates - two events", (t, done) => {
    holster.get("key3").put("value3", err => {
      assert.equal(err, null)

      let callCount = 0
      holster.get("key3").on(data => {
        callCount++
        if (callCount === 1) {
          assert.equal(data, "update1")
        } else if (callCount === 2) {
          assert.equal(data, "update2")
          done()
        }
      })

      holster.get("key3").put("update1", err => {
        assert.equal(err, null)
      })

      setTimeout(() => {
        holster.get("key3").put("update2", err => {
          assert.equal(err, null)
        })
      }, 200)
    })
  })

  test("on for properties on root in for loop", (t, done) => {
    for (let i = 0; i < 5; i++) {
      holster.get("for" + i).put(i, err => {
        assert.equal(err, null)
      })
    }

    // Need to wait until after all initial puts are done to set on listeners.
    setTimeout(() => {
      let completed = 0
      for (let i = 0; i < 5; i++) {
        const idx = i // Capture value
        holster.get("for" + idx).on(data => {
          // Listener fires for updates (initial puts already completed before listener setup)
          assert.equal(data, "update" + idx)
          completed++
          if (completed === 5) done()
        })
      }

      setTimeout(() => {
        for (let i = 0; i < 5; i++) {
          holster.get("for" + i).put("update" + i, err => {
            assert.equal(err, null)
          })
        }
      }, 100)
    }, 500)
  })

  test("on with get flag set - data returned", (t, done) => {
    holster.get("key4").put("value4", err => {
      assert.equal(err, null)

      setTimeout(() => {
        holster.get("key4").on(data => {
          assert.equal(data, "value4")
          done()
        }, true)
      }, 100)
    })
  })

  test("chained next before on", (t, done) => {
    // The node needs to exist before it can be listend to for updates.
    holster
      .get("hello")
      .next("world!")
      .put("ok", err => {
        assert.equal(err, null)

        holster
          .get("hello")
          .next("world!")
          .on(data => {
            // Listener fires for updates (initial put already completed before listener setup)
            assert.equal(data, "update")
            holster.get("hello").next("world!").off()
            done()
          })

        setTimeout(() => {
          holster
            .get("hello")
            .next("world!")
            .put("update", err => {
              assert.equal(err, null)
            })
        }, 10)
      })
  })

  test("on and put object on root in graph format", (t, done) => {
    const plain = {
      key: "plain value",
      number: 42,
    }
    holster.get("plain").put(plain, err => {
      assert.equal(err, null)

      const update = {
        key: "update",
        number: 42,
      }
      holster.get("plain").on(data => {
        // Listener fires for updates (initial put already completed before listener setup)
        assert.deepEqual(data, update)
        done()
      })

      setTimeout(() => {
        holster.get("plain").put(update, err => {
          assert.equal(err, null)
        })
      }, 10)
    })
  })

  test("on and put nested object", (t, done) => {
    const nested = {
      key: "nested key",
      child: {
        has: "child key",
      },
    }
    // The node needs to exist before it can be listend to for updates.
    holster.get("nested").put(nested, err => {
      assert.equal(err, null)

      const update = {
        child: {
          has: "child update",
        },
      }
      let parentFired = false
      holster.get("nested").on(data => {
        // Listener fires for updates (initial put already completed before listener setup)
        if (!parentFired) {
          parentFired = true
          assert.deepEqual(data, {key: nested.key, ...update})
        }
      })

      holster
        .get("nested")
        .next("child")
        .on(data => {
          // Listener fires for updates (initial put already completed before listener setup)
          assert.deepEqual(data, update.child)
          done()
        })

      setTimeout(() => {
        holster.get("nested").put(update, err => {
          assert.equal(err, null)
        })
      }, 10)
    })
  })

  test("cleanup", (t, done) => {
    fs.rm("test/holster.on", {recursive: true, force: true}, err => {
      assert.equal(err, null)
      done()
    })
  })
})

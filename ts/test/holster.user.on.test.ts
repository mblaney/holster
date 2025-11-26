import fs from "fs"
import { Server } from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../src/holster.js"
import type { HolsterAPI } from "../src/holster.js"

describe("holster.user.on", () => {
  const wss: Server = new Server("ws://localhost:1234")
  const holster: HolsterAPI = Holster({
    file: "test/holster.user.on",
    wss: wss,
    maxAge: 100,
    wait: 500,
  })
  const user = holster.user()

  test("user create", (t, done) => {
    user.create("alice", "password", err => {
      assert.equal(err, null)
      done()
    })
  })

  test("user auth", (t, done) => {
    user.auth("alice", "password", err => {
      assert.equal(err, null)
      done()
    })
  })

  test("calling on without get callback null", (t, done) => {
    user.on(data => {
      assert.equal(data, null)
      done()
    })
  })

  test("on for property then update - event", (t, done) => {
    // Listener is now called for initial put and updates
    let callCount = 0
    const callback = data => {
      callCount++
      if (callCount === 1) {
        assert.equal(data, "value")
      } else if (callCount === 2) {
        assert.equal(data, "update")
        user.get("key").off(callback)
        done()
      }
    }
    user.get("key").on(callback)

    user.get("key").put("value", err => {
      assert.equal(err, null)

      user.get("key").put("update", err => {
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
        user.get("two").off(callback1)
        if (done2) done()
        else done1 = true
      }
    }
    user.get("two").on(callback1)

    let callback2Count = 0
    const callback2 = data => {
      callback2Count++
      if (callback2Count === 2) {
        assert.equal(data, "update")
        user.get("two").off(callback2)
        if (done1) done()
        else done2 = true
      }
    }
    user.get("two").on(callback2)

    user.get("two").put("value", err => {
      assert.equal(err, null)
      user.get("two").put("update", err => {
        assert.equal(err, null)
      })
    })
  })

  test("on for different property - no event", (t, done) => {
    user.get("key1").on(data => {
      console.log("should not be called for key1:", data)
      done() // This done is not called and test would fail if it was.
    })

    user.get("key2").put("value2", err => {
      assert.equal(err, null)
      done()
    })
  })

  test("on for property two updates - two events", (t, done) => {
    user.get("key3").put("value3", err => {
      assert.equal(err, null)

      let callCount = 0
      const callback = data => {
        callCount++
        if (callCount === 1) {
          assert.equal(data, "update1")
        } else if (callCount === 2) {
          assert.equal(data, "update2")
          user.get("key3").off(callback)
          done()
        }
      }
      user.get("key3").on(callback)

      user.get("key3").put("update1", err => {
        assert.equal(err, null)
      })

      setTimeout(() => {
        user.get("key3").put("update2", err => {
          assert.equal(err, null)
        })
      }, 200)
    })
  })

  test("on for properties in for loop", (t, done) => {
    ;(async () => {
      for (let i = 0; i < 5; i++) {
        user.get("for" + i).put(i, err => {
          assert.equal(err, null)
        })
      }
    })()

    // Need to wait until after all initial puts are done to set on listeners.
    setTimeout(async () => {
      let count = 0
      for (let i = 0; i < 5; i++) {
        const idx = i // Capture value
        const callback = data => {
          // Listener fires for updates (initial puts already completed before listener setup)
          assert.equal(data, "update" + idx)
          user.get("for" + idx).off(callback)
          count++
        }
        user.get("for" + idx).on(callback)
      }

      setTimeout(async () => {
        for (let i = 0; i < 5; i++) {
          user.get("for" + i).put("update" + i, err => {
            assert.equal(err, null)
          })
        }
        setTimeout(() => {
          if (count === 5) done()
        }, 500)
      }, 500)
    }, 1000)
  })

  test("on with get flag set - data returned", (t, done) => {
    user.get("key4").put("value4", err => {
      assert.equal(err, null)

      setTimeout(() => {
        const callback = data => {
          assert.equal(data, "value4")
          user.get("key4").off(callback)
          done()
        }
        user.get("key4").on(callback, true)
      }, 100)
    })
  })

  test("chained next before on", (t, done) => {
    // The node needs to exist before it can be listend to for updates.
    user
      .get("hello")
      .next("world!")
      .put("ok", err => {
        assert.equal(err, null)

        const callback = data => {
          // Listener fires for updates (initial put already completed before listener setup)
          assert.equal(data, "update")
          user.get("hello").next("world!").off(callback)
          done()
        }
        user.get("hello").next("world!").on(callback)

        setTimeout(() => {
          user
            .get("hello")
            .next("world!")
            .put("update", err => {
              assert.equal(err, null)
            })
        }, 10)
      })
  })

  test("on and put object in graph format", (t, done) => {
    const plain = {
      key: "plain value",
      number: 42,
    }

    user.get("plain").put(plain, err => {
      assert.equal(err, null)

      const update = {
        key: "update",
        number: 42,
      }

      const callback = data => {
        // Listener fires for updates (initial put already completed before listener setup)
        assert.deepEqual(data, update)
        user.get("plain").off(callback)
        done()
      }
      user.get("plain").on(callback)

      setTimeout(() => {
        user.get("plain").put(update, err => {
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
    user.get("nested").put(nested, err => {
      assert.equal(err, null)

      const update = {
        key: "nested update",
        child: {
          has: "child update",
        },
      }

      let parentFired = false
      const parentCallback = data => {
        // Listener fires for updates (initial put already completed before listener setup)
        if (!parentFired) {
          parentFired = true
          assert.deepEqual(data, update)
        }
      }
      user.get("nested").on(parentCallback)

      const childCallback = data => {
        // Listener fires for updates (initial put already completed before listener setup)
        assert.deepEqual(data, update.child)
        user.get("nested").off(parentCallback)
        user.get("nested").next("child").off(childCallback)
        done()
      }
      user.get("nested").next("child").on(childCallback)

      setTimeout(() => {
        user.get("nested").put(update, err => {
          assert.equal(err, null)
        })
      }, 10)
    })
  })

  test("cleanup", (t, done) => {
    setTimeout(() => {
      fs.rm("test/holster.user.on", {recursive: true, force: true}, err => {
        assert.equal(err, null)
        done()
      })
    }, 100)
  })
})

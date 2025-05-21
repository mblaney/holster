import fs from "fs"
import {Server} from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../src/holster.js"

describe("holster.user.on", () => {
  const wss = new Server("ws://localhost:1234")
  const holster = Holster({file: "test/holster.user.on", wss: wss, maxAge: 100})
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
    // The property needs to exist before it can be listend to for updates.
    user.get("key").put("value", err => {
      assert.equal(err, null)

      user.get("key").on(data => {
        assert.equal(data, "update")
        user.get("key").off()
        done()
      })

      user.get("key").put("update", err => {
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

      let first = true
      user.get("key3").on(data => {
        if (first) {
          assert.equal(data, "update1")
        } else {
          assert.equal(data, "update2")
          done()
        }
      })

      user.get("key3").put("update1", err => {
        assert.equal(err, null)
      })

      setTimeout(() => {
        first = false
        user.get("key3").put("update2", err => {
          assert.equal(err, null)
        })
      }, 200)
    })
  })

  test("chained next before on", (t, done) => {
    // The node needs to exist before it can be listend to for updates.
    user
      .get("hello")
      .next("world!")
      .put("ok", err => {
        assert.equal(err, null)

        user
          .get("hello")
          .next("world!")
          .on(data => {
            assert.equal(data, "update")
            user.get("hello").next("world!").off()
            done()
          })

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
      user.get("plain").on(data => {
        assert.deepEqual(data, update)
        done()
      })

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
      user.get("nested").on(data => {
        assert.deepEqual(data, update)
      })

      user
        .get("nested")
        .next("child")
        .on(data => {
          assert.deepEqual(data, update.child)
          done()
        })

      setTimeout(() => {
        user.get("nested").put(update, err => {
          assert.equal(err, null)
        })
      }, 10)
    })
  })

  test("cleanup", (t, done) => {
    fs.rm("test/holster.user.on", {recursive: true, force: true}, err => {
      assert.equal(err, null)
      done()
    })
  })
})

const fs = require("fs")
const {Server} = require("mock-socket")
const {describe, test} = require("node:test")
const assert = require("node:assert/strict")
const Holster = require("../src/holster")

describe("holster", () => {
  const wss = new Server("ws://localhost:1234")
  const holster = Holster({file: "test/holster", wss: wss, maxAge: 100})

  test("empty key callback ok", (t, done) => {
    holster.get("", data => {
      assert.equal(data, null)
      done()
    })
  })

  test("null key callback ok", (t, done) => {
    holster.get(null, data => {
      assert.equal(data, null)
      done()
    })
  })

  test("underscore as key callback ok", (t, done) => {
    holster.get("_", data => {
      assert.equal(data, null)
      done()
    })
  })

  test("put and get string on root", (t, done) => {
    holster.get("key").put("value", err => {
      assert.equal(err, null)

      holster.get("key", data => {
        assert.equal(data, "value")
        done()
      })
    })
  })

  test("put value to null on root", (t, done) => {
    holster.get("key").put(null, err => {
      assert.equal(err, null)

      holster.get("key", data => {
        assert.equal(data, null)
        done()
      })
    })
  })

  test("put and get true on root", (t, done) => {
    holster.get("true").put(true, err => {
      assert.equal(err, null)

      holster.get("true", data => {
        assert.equal(data, true)
        done()
      })
    })
  })

  test("put and get false on root", (t, done) => {
    holster.get("false").put(false, err => {
      assert.equal(err, null)

      holster.get("false", data => {
        assert.equal(data, false)
        done()
      })
    })
  })

  test("put and get number on root", (t, done) => {
    holster.get("pi").put(3.14159, err => {
      assert.equal(err, null)

      holster.get("pi", data => {
        assert.equal(data, 3.14159)
        done()
      })
    })
  })

  test("put and get object on root in graph format", (t, done) => {
    const plain = {
      key: "plain value",
      true: true,
      false: false,
      number: 42,
    }
    holster.get("plain").put(plain, err => {
      assert.equal(err, null)

      holster.get("plain", data => {
        assert.deepEqual(data, plain)
        done()
      })
    })
  })

  // TODO: Putting null only updates the rel, probably should resolve the
  // key and remove the node as well.
  test("put object to null on root", (t, done) => {
    holster.get("plain").put(null, err => {
      assert.equal(err, null)

      holster.get("plain", data => {
        assert.equal(data, null)
        done()
      })
    })
  })

  test("put and get nested object", (t, done) => {
    const nested = {
      key: "nested value",
      child: {
        has: "child value",
      },
    }
    holster.get("nested").put(nested, err => {
      assert.equal(err, null)

      holster.get("nested").get("key", data => {
        assert.equal(data, "nested value")

        holster.get("nested").get("child", data => {
          assert.deepEqual(data, {has: "child value"})
          done()
        })
      })
    })
  })

  test("put and get two nested objects", (t, done) => {
    const two = {
      key: "two nested values",
      child1: {
        has: "child value 1",
      },
      child2: {
        has: "child value 2",
      },
    }
    holster.get("two").put(two, err => {
      assert.equal(err, null)

      holster.get("two").get("child1", data => {
        assert.deepEqual(data, {has: "child value 1"})

        holster.get("two").get("child2", data => {
          assert.deepEqual(data, {has: "child value 2"})
          done()
        })
      })
    })
  })

  test("put and get multiple nested object", (t, done) => {
    const multiple = {
      key: "multiple nested values",
      child: {
        has: "child value",
        grandchild: {
          has: "grandchild value",
          other: "(not returned)",
        },
      },
    }
    holster.get("multiple").put(multiple, err => {
      assert.equal(err, null)

      holster.get("multiple").get("child", {".": "has"}, data => {
        assert.deepEqual(data, {has: "child value"})

        holster
          .get("multiple")
          .get("child")
          .get("grandchild", {".": "has"}, data => {
            assert.deepEqual(data, {has: "grandchild value"})

            fs.rm("test/holster", {recursive: true, force: true}, err => {
              assert.equal(err, null)
              done()
            })
          })
      })
    })
  })
})

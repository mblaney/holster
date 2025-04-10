const fs = require("fs")
const {Server} = require("mock-socket")
const {describe, test} = require("node:test")
const assert = require("node:assert/strict")
const Holster = require("../src/holster")

describe("holster", () => {
  const wss = new Server("ws://localhost:1234")
  const holster = Holster({file: "test/holster", wss: wss, maxAge: 100})

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

  test("get chained unknown keys callback null", (t, done) => {
    holster.get("chained").get("unknown", data => {
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

  test("chained get before put", (t, done) => {
    holster
      .get("hello")
      .get("world!")
      .put("ok", err => {
        assert.equal(err, null)

        holster.get("hello").get("world!", data => {
          assert.equal(data, "ok")
          done()
        })
      })
  })

  test("more chained gets before put", (t, done) => {
    holster
      .get("1")
      .get("2")
      .get("3")
      .put("4", err => {
        assert.equal(err, null)

        holster
          .get("1")
          .get("2")
          .get("3", data => {
            assert.equal(data, "4")
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

  test("put object to null on root", (t, done) => {
    holster.get("plain").put(null, err => {
      assert.equal(err, null)

      holster.get("plain", data => {
        assert.equal(data, null)
        done()
      })
    })
  })

  test("chained get before put object in graph format", (t, done) => {
    const plain = {
      key: "hello plain value",
    }
    holster
      .get("hello")
      .get("plain")
      .put(plain, err => {
        assert.equal(err, null)

        holster.get("hello").get("plain", data => {
          assert.deepEqual(data, plain)
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

      // Getting a nested object requires waiting for radisk to write to disk,
      // as it will batch the writes. (Default wait is 1 millisecond.)
      setTimeout(() => {
        holster.get("nested", data => {
          assert.deepEqual(data, nested)

          holster.get("nested").get("key", data => {
            assert.equal(data, "nested value")

            holster.get("nested").get("child", data => {
              assert.deepEqual(data, {has: "child value"})
              done()
            })
          })
        })
      }, 2)
    })
  })

  test("chained get before put nested object", (t, done) => {
    const nested = {
      key: "hello nested value",
      child: {
        has: "hello child value",
      },
    }
    holster
      .get("hello")
      .get("nested")
      .put(nested, err => {
        assert.equal(err, null)

        setTimeout(() => {
          holster.get("hello").get("nested", data => {
            assert.deepEqual(data, nested)

            holster
              .get("hello")
              .get("nested")
              .get("key", data => {
                assert.equal(data, "hello nested value")

                holster
                  .get("hello")
                  .get("nested")
                  .get("child", data => {
                    assert.deepEqual(data, {has: "hello child value"})
                    done()
                  })
              })
          })
        }, 2)
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

      setTimeout(() => {
        holster.get("two", data => {
          assert.deepEqual(data, two)

          holster.get("two").get("child1", data => {
            assert.deepEqual(data, {has: "child value 1"})

            holster.get("two").get("child2", data => {
              assert.deepEqual(data, {has: "child value 2"})
              done()
            })
          })
        })
      }, 2)
    })
  })

  test("put and get multiple nested object", (t, done) => {
    const multiple = {
      key: "multiple nested values",
      child: {
        has: "child value",
        grandchild: {
          has: "grandchild value",
          other: "(not returned in lex query)",
        },
      },
    }
    holster.get("multiple").put(multiple, err => {
      assert.equal(err, null)

      setTimeout(() => {
        holster.get("multiple", data => {
          assert.deepEqual(data, multiple)

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
      }, 2)
    })
  })
})

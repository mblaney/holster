import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Radisk from "../src/radisk.js"
import Names from "./names.js"
const names = Names()

describe("radisk", () => {
  const puts = {}
  const opt = {
    write: 1,
    batch: 2,
    size: 100,
    store: {
      get: (file, cb) => {
        cb(null, puts[file])
      },
      put: (file, data, cb) => {
        puts[file] = data
        cb(null)
      },
      list: cb => {
        Object.keys(puts).sort().forEach(cb)
        cb(null)
      },
    },
  }
  const radisk = Radisk(opt)

  test("write and read from memory", (t, done) => {
    radisk("key", "value", () => {
      assert.deepEqual(puts, {"!": '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\x1F\n'})
    })

    // Reading after write means radisk.batch is still available.
    radisk("key", (err, value) => {
      assert.equal(value, "value")
      done()
    })
  })

  test("read from store", (t, done) => {
    // Waiting until after opt.write means radisk.batch has been reset, so a
    // call to radisk.read is required which means the file needs to be parsed.
    setTimeout(() => {
      radisk("key", (err, value) => {
        assert.equal(value, "value")
        done()
      })
    }, opt.write + 1)
  })

  test("write and read value with state", (t, done) => {
    radisk("key", ["value", 1234])
    setTimeout(() => {
      assert.deepEqual(puts, {
        "!": '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\x031234\x1F\n',
      })
      radisk("key", (err, value) => {
        assert.deepEqual(value, ["value", 1234])
        done()
      })
    }, 10)
  })

  test("write and read a plain object is undefined", (t, done) => {
    radisk("key", {object: true})
    setTimeout(() => {
      assert.deepEqual(puts, {
        "!": '\x1F+0\x1F#\x1F"key\x1F=undefined\n',
      })
      radisk("key", (err, value) => {
        assert.deepEqual(value, undefined)
        done()
      })
    }, 10)
  })

  test("write a plain object with state is also undefined", (t, done) => {
    radisk("key", [{object: true}, 1234])
    setTimeout(() => {
      assert.deepEqual(puts, {
        "!": '\x1F+0\x1F#\x1F"key\x1F=undefined\n',
      })
      radisk("key", (err, value) => {
        assert.deepEqual(value, undefined)
        done()
      })
    }, 10)
  })

  test("write and read a soul relation is ok", (t, done) => {
    const rel = {"#": "soul"}
    radisk("key", rel)
    setTimeout(() => {
      assert.deepEqual(puts, {
        "!": '\x1F+0\x1F#\x1F"key\x1F=\x1F#soul\x1F\n',
      })
      radisk("key", (err, value) => {
        assert.deepEqual(value, rel)
        done()
      })
    }, 10)
  })

  test("write and read a soul relation with state is ok", (t, done) => {
    const rel = [{"#": "soul"}, 1234]
    radisk("key", rel)
    setTimeout(() => {
      assert.deepEqual(puts, {
        "!": '\x1F+0\x1F#\x1F"key\x1F=\x1F#soul\x031234\x1F\n',
      })
      radisk("key", (err, value) => {
        assert.deepEqual(value, rel)
        done()
      })
    }, 10)
  })

  test("write and read value with newline", (t, done) => {
    radisk("key", "value\ncontinued")
    setTimeout(() => {
      assert.deepEqual(puts, {
        "!": '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x1F\n',
      })

      radisk("key", (err, value) => {
        assert.equal(value, "value\ncontinued")
        done()
      })
    }, 10)
  })

  test("write and read value with newline and state", (t, done) => {
    radisk("key", ["value\ncontinued", 12345])
    setTimeout(() => {
      assert.deepEqual(puts, {
        "!": '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x0312345\x1F\n',
      })

      radisk("key", (err, value) => {
        assert.deepEqual(value, ["value\ncontinued", 12345])
        done()
      })
    }, 10)
  })

  test("write more than batch size", (t, done) => {
    radisk("keyA", "valueA")
    radisk("keyB", "valueB")
    radisk("keyC", "valueC")
    setTimeout(() => {
      assert.deepEqual(puts, {
        "!":
          '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x0312345\x1F\n' +
          '\x1F+1\x1F#\x1F"A\x1F=\x1F"valueA\x1F\n' +
          '\x1F+1\x1F#\x1F"B\x1F=\x1F"valueB\x1F\n' +
          '\x1F+1\x1F#\x1F"C\x1F=\x1F"valueC\x1F\n',
      })
      radisk("keyA", (err, value) => {
        assert.equal(value, "valueA")
        done()
      })
    }, 10)
  })

  test("write and read value bigger than file size", (t, done) => {
    const big =
      "file size is only 100 bytes so writing this value requires calling slice"
    radisk("newFile", big)
    radisk("newFile", (err, value) => {
      assert.equal(value, big)
    })
    setTimeout(() => {
      assert.deepEqual(puts, {
        "!":
          '\x1F+0\x1F#\x1F"key\x1F=\x1F"value\ncontinued\x0312345\x1F\n' +
          '\x1F+1\x1F#\x1F"A\x1F=\x1F"valueA\x1F\n' +
          '\x1F+1\x1F#\x1F"B\x1F=\x1F"valueB\x1F\n' +
          '\x1F+1\x1F#\x1F"C\x1F=\x1F \x1F\n',
        keyC:
          '\x1F+0\x1F#\x1F"keyC\x1F=\x1F"valueC\x1F\n' +
          '\x1F+0\x1F#\x1F"newFile\x1F=\x1F \x1F\n',
        newFile: '\x1F+0\x1F#\x1F"newFile\x1F=\x1F"' + big + "\x1F\n",
      })
      radisk("newFile", (err, value) => {
        assert.equal(value, big)
        done()
      })
    }, 10)
  })
})

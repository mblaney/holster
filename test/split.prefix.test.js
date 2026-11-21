import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Radisk from "../src/radisk.js"
import Radix from "../src/radix.js"

// ASCII character for enquiry.
const enq = String.fromCharCode(5)

// Three souls all starting with "F" fill a single file. When "Fb\x05x" is
// added and the file overflows, the split must use the full key (pre + k) to
// find the enq boundary. The pre.length === 0 guard in the original code
// prevents the split from firing for these depth-1 entries.
describe("split file with shared prefix", () => {
  const puts = {}
  const opt = {
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
  // Fixed timestamp keeps expected output deterministic.
  const now = 1000
  // 36 chars — enough to push the file over 100 bytes when combined with
  // the depth-0 "F" prefix entry (10 bytes) and the first data entry (57 bytes).
  const long = "this value is long enough to trigger"

  // Entry byte counts (size: 100):
  //   depth-0 "F" prefix  (no value)           = 10 bytes
  //   depth-1 "a\x05x"    (long value + state)  = 57 bytes  cumulative: 67
  //   depth-1 "b\x05x"    (long value + state)  = 57 bytes  cumulative: 124 > 100 → split at "Fb"
  //   depth-1 "c\x05x"    ("short"  + state)    = 26 bytes  (goes into "Fb" file)
  test("overflowing file splits at the soul boundary", (t, done) => {
    radisk("Fa" + enq + "x", [long, now])
    radisk("Fb" + enq + "x", [long, now])
    radisk("Fc" + enq + "x", ["short", now])

    setTimeout(() => {
      assert.deepEqual(puts, {
        "!":
          '\x1F+0\x1F#\x1F"F\x1F\n' +
          '\x1F+1\x1F#\x1F"a\x05x\x1F=\x1F"' +
          long +
          "\x031000\x1F\n",
        Fb:
          '\x1F+0\x1F#\x1F"F\x1F\n' +
          '\x1F+1\x1F#\x1F"b\x05x\x1F=\x1F"' +
          long +
          "\x031000\x1F\n" +
          '\x1F+1\x1F#\x1F"c\x05x\x1F=\x1F"short\x031000\x1F\n',
      })
      done()
    }, 10)
  })

  test("reads back correctly after split", (t, done) => {
    let count = 0
    const check = () => {
      if (++count === 3) done()
    }
    radisk("Fa" + enq + "x", (err, value) => {
      assert.deepEqual(value, [long, now])
      check()
    })
    radisk("Fb" + enq + "x", (err, value) => {
      assert.deepEqual(value, [long, now])
      check()
    })
    radisk("Fc" + enq + "x", (err, value) => {
      assert.deepEqual(value, ["short", now])
      check()
    })
  })

  // A second write to the parent file range must not re-populate it with
  // entries that were moved to the sub-file. The stale in-memory cache was
  // the cause: save.mix mutates the cached radix tree in-place, so after a
  // split the cache still contains the sub-file's entries. cache.delete(file)
  // after each write prevents this.
  test("second write to parent file does not duplicate split entries", (t, done) => {
    radisk("Fa" + enq + "x", ["updated", now])

    setTimeout(() => {
      assert.ok(
        !puts["!"].includes("b" + enq),
        "parent file must not contain Fb entries after second write",
      )
      assert.ok(
        !puts["!"].includes("c" + enq),
        "parent file must not contain Fc entries after second write",
      )
      done()
    }, 10)
  })
})

// Souls such as item0 to item199 share a long prefix, so each one starts
// deep in the radix tree. Splits used to depend on that depth, so these
// never split and the file grew without limit.
describe("split souls that share a long prefix", () => {
  const memoryStore = puts => ({
    get: (file, cb) => cb(null, puts[file]),
    put: (file, data, cb) => {
      puts[file] = data
      cb(null)
    },
    list: cb => {
      Object.keys(puts).sort().forEach(cb)
      cb(null)
    },
  })
  const write = (radisk, key, value) =>
    new Promise(resolve => radisk(key, value, resolve))
  const read = (radisk, key) =>
    new Promise(resolve => radisk(key, (err, value) => resolve(value)))
  const props = ["title", "body", "n"]

  test("splits into files, keeping each soul's properties together", async () => {
    const puts = {}
    const radisk = Radisk({size: 2000, cache: false, store: memoryStore(puts)})
    const writes = []
    for (let i = 0; i < 200; i++) {
      for (const prop of props) {
        writes.push(write(radisk, `item${i}${enq}${prop}`, [`${prop} ${i}`, 1]))
      }
    }
    await Promise.all(writes)

    const files = Object.keys(puts)
    assert.ok(files.length > 5, `wrote ${files.length} files`)
    for (const file of files) {
      assert.ok(puts[file].length <= 2000, `${file} is ${puts[file].length}`)
    }
    // A soul's properties are never in two files. Files store keys as shared
    // prefixes, so each one is parsed to find the souls it holds.
    const fileOf = new Map()
    for (const file of files) {
      const disk = await new Promise(resolve =>
        radisk.parse(file, (err, disk) => resolve(disk)),
      )
      Radix.map(disk, (value, key) => {
        const soul = key.split(enq)[0]
        const owner = fileOf.get(soul)
        assert.ok(!owner || owner === file, `${soul} is in two files`)
        fileOf.set(soul, file)
      })
    }
    assert.equal(fileOf.size, 200)
    for (let i = 0; i < 200; i++) {
      for (const prop of props) {
        assert.deepEqual(await read(radisk, `item${i}${enq}${prop}`), [
          `${prop} ${i}`,
          1,
        ])
      }
    }
  })

  test("keeps one soul with many properties in one file", async () => {
    const puts = {}
    const radisk = Radisk({size: 2000, cache: false, store: memoryStore(puts)})
    const writes = []
    for (let i = 0; i < 200; i++) {
      writes.push(write(radisk, `item${enq}p${i}`, [`value ${i}`, 1]))
    }
    await Promise.all(writes)

    assert.deepEqual(Object.keys(puts), ["!"])
    assert.deepEqual(await read(radisk, `item${enq}p199`), ["value 199", 1])
  })
})

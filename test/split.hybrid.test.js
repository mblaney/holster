import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Radisk from "../src/radisk.js"

// ASCII character for enquiry.
const enq = String.fromCharCode(5)

// Verify the hybrid depth cap:
//   - When souls sharing a single-char prefix fill a file, the overflow split
//     fires at soul boundary via the pre.length===1 && k.includes(enq) path.
//   - The resulting per-soul file does NOT split further even when overflowed,
//     because write.limit === file for any key belonging to that soul.
//   - Binary search (findFile) returns data from the correct file after a split.
describe("hybrid split depth cap", () => {
  const puts = {}
  const opt = {
    size: 100,
    store: {
      get: (file, cb) => cb(null, puts[file]),
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
  const now = 1000
  // 36 chars — enough that two depth-1 entries exceed size:100 (same as split.prefix.test.js)
  const long = "this value is long enough to trigger"

  // "Fa" and "Fb" share the "F" prefix so they sit at depth 1 in the Radix
  // tree.  When "Fb\x05x" is added and the file overflows, the condition
  // pre.length===1 && k.includes(enq) fires and splits at the "Fb" soul
  // boundary: "!" keeps "Fa" data, new file "Fb" receives "Fb" data.
  test("splits at soul boundary when depth-1 entries overflow", (t, done) => {
    radisk("Fa" + enq + "x", [long, now])
    radisk("Fb" + enq + "x", [long, now])

    setTimeout(() => {
      assert.deepEqual(Object.keys(puts).sort(), ["!", "Fb"])
      assert.ok(
        !puts["!"].includes("b" + enq),
        "root file must not contain Fb entries",
      )
      assert.ok(
        puts["Fb"].includes("b" + enq),
        "Fb file must contain Fb entries",
      )
      done()
    }, 10)
  })

  // Binary search (findFile) must navigate to the correct file for each soul.
  test("reads from correct file after split", (t, done) => {
    let count = 0
    const check = () => {
      if (++count === 2) done()
    }
    radisk("Fa" + enq + "x", (err, value) => {
      assert.deepEqual(value, [long, now])
      check()
    })
    radisk("Fb" + enq + "x", (err, value) => {
      assert.deepEqual(value, [long, now])
      check()
    })
  })

  // Adding more data to the "Fb" soul overflows the "Fb" file, but
  // write.limit resolves to "Fb" which equals the current file name, so the
  // split guard fires and no deeper file is created.
  test("per-soul file does not split further when overflowed", (t, done) => {
    radisk("Fb" + enq + "y", [long, now])
    radisk("Fb" + enq + "z", [long, now])

    setTimeout(() => {
      const extra = Object.keys(puts).filter(f => f !== "!" && f !== "Fb")
      assert.deepEqual(
        extra,
        [],
        "no files deeper than the per-soul file must be created",
      )
      done()
    }, 10)
  })

  // Reads from the overflowed-but-unsplit per-soul file must still work.
  test("reads all properties from the unsplit per-soul file", (t, done) => {
    let count = 0
    const check = () => {
      if (++count === 3) done()
    }
    for (const prop of ["x", "y", "z"]) {
      radisk("Fb" + enq + prop, (err, value) => {
        assert.deepEqual(value, [long, now])
        check()
      })
    }
  })
})

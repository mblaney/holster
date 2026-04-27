import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Radisk from "../src/radisk.ts"
import type {RadiskInterface, RadiskOptions, EncodedValue} from "../src/schemas.ts"

// ASCII character for enquiry.
const enq = String.fromCharCode(5)

// Verify the balanced split: when a file overflows, the split fires at the
// ~options.size/2 mark (halfKey) rather than at the overflow tail, so both
// halves end up near options.size/2 instead of the original file staying full
// with a tiny new file containing only the overflow entry.
//
// With size:200 and entries ~55 bytes each (same value length as
// split.hybrid.test.ts), four souls fit across three entries (165 < 200) but
// not four (220 > 200), and two entries exceed options.size/2 (110 > 100) so
// halfKey is set at the third entry — giving a balanced A+B / C+D split
// rather than the unbalanced A+B+C / D split that the naive tail-split would
// produce.
describe("balanced split", () => {
  const puts: Record<string, string> = {}
  const opt: RadiskOptions = {
    size: 200,
    store: {
      get: (file: string, cb: (err?: string, data?: EncodedValue) => void) => {
        cb(undefined, puts[file] as unknown as EncodedValue | undefined)
      },
      put: (
        file: string,
        data: string | EncodedValue | Record<string, unknown>,
        cb: (err?: string) => void,
      ) => {
        puts[file] = data as unknown as string
        cb(undefined)
      },
      list: (cb: (file?: string) => void) => {
        Object.keys(puts).sort().forEach(cb)
        cb()
      },
    },
  }
  const radisk: RadiskInterface = Radisk(opt)
  const now = 1000
  // 36 chars — same value as split.hybrid.test.ts; ~55 bytes per encoded entry.
  const long = "this value is long enough to trigger"

  // Write four souls A–D. The overflow fires when D is added (A+B+C+D > 200).
  // halfKey was recorded at C (when write.text = A+B > 100 = options.size/2),
  // so the split point is "C": "!" keeps A+B and new file "C" receives C+D.
  test("split fires at halfway mark, not at overflow tail", (t, done) => {
    radisk("A" + enq + "x", [long, now])
    radisk("B" + enq + "x", [long, now])
    radisk("C" + enq + "x", [long, now])
    radisk("D" + enq + "x", [long, now])

    setTimeout(() => {
      assert.deepEqual(Object.keys(puts).sort(), ["!", "C"])
      assert.ok(
        puts["!"]!.includes("A" + enq),
        "root file must contain A entries",
      )
      assert.ok(
        puts["!"]!.includes("B" + enq),
        "root file must contain B entries",
      )
      assert.ok(
        !puts["!"]!.includes("C" + enq),
        "root file must not contain C entries",
      )
      assert.ok(
        puts["C"]!.includes("C" + enq),
        "new file must contain C entries",
      )
      assert.ok(
        puts["C"]!.includes("D" + enq),
        "new file must contain D entries",
      )
      done()
    }, 10)
  })

  // Reads from both halves must work after the balanced split.
  test("reads from correct file after balanced split", (t, done) => {
    let count = 0
    const check = () => {
      if (++count === 4) done()
    }
    for (const soul of ["A", "B", "C", "D"]) {
      radisk(soul + enq + "x", (err?: string | null, value?: unknown) => {
        assert.deepEqual(value, [long, now])
        check()
      })
    }
  })

  // Adding a fifth soul after the split must not create a tiny tail file —
  // file "C" has ~110 bytes after the split, well under options.size:200, so
  // it absorbs the new soul without splitting again.
  test("second half absorbs further writes without splitting", (t, done) => {
    radisk("E" + enq + "x", [long, now])

    setTimeout(() => {
      assert.deepEqual(Object.keys(puts).sort(), ["!", "C"])
      assert.ok(
        puts["C"]!.includes("E" + enq),
        "new file must absorb E without splitting",
      )
      done()
    }, 10)
  })
})

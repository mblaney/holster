import fs from "fs"
import {describe, test, after} from "node:test"
import assert from "node:assert/strict"
import Store, {fileSystem} from "../src/store.ts"
import Radisk from "../src/radisk.ts"
import * as utils from "../src/utils.ts"
import type {
  StoreInterface,
  StoreOptions,
  RadiskOptions,
  Graph,
} from "../src/schemas.ts"

// These specifically exercise real, concurrent async I/O timing - unlike
// every other radisk/store test, which uses a fully synchronous in-memory
// store (get/put/list all call back immediately). The bugs these guard
// against only manifest when multiple writes are genuinely in flight at
// once, competing for the same shared batch/thrash cycle and the same
// underlying files - a synchronous store can never create that window.
describe("radisk concurrency", () => {
  const dataDir = "test/radisk.concurrency-data-ts"
  const saveTestDir = "test/radisk.concurrency-save-data-ts"
  after(() => {
    fs.rmSync(dataDir, {recursive: true, force: true})
    fs.rmSync(saveTestDir, {recursive: true, force: true})
  })

  // A small file size forces many souls to share - and split across - the
  // same underlying files after only a handful of writes, which is what
  // actually exposes the multi-file-per-batch bug (radisk's default 1MB
  // size would take many thousands of writes to do the same).
  const store: StoreInterface = Store({file: dataDir, size: 2000} as any)

  test("every concurrent write survives - none are silently lost or left partial", async () => {
    const CONCURRENCY = 40
    const ROUNDS = 1000
    let failures = 0
    const failureDetails: Array<{soul: string; data: unknown}> = []

    const oneRound = async (): Promise<void> => {
      const soul = utils.text.random(24)
      const graph = utils.graph(soul, {name: "x", type: "file"})

      await new Promise<void>((resolve, reject) =>
        store.put(graph as Graph, err =>
          err ? reject(new Error(err)) : resolve(),
        ),
      )

      const data = await new Promise<unknown>(resolve =>
        store.get({"#": soul}, (err, ack) =>
          resolve(ack && (ack as Record<string, unknown>)[soul]),
        ),
      )

      const node = data as {name?: string; type?: string} | undefined
      if (!node || node.name !== "x" || node.type !== "file") {
        failures++
        if (failureDetails.length < 5) {
          failureDetails.push({soul, data})
        }
      }
    }

    const worker = async (): Promise<void> => {
      for (let i = 0; i < ROUNDS / CONCURRENCY; i++) {
        await oneRound()
      }
    }

    await Promise.all(Array.from({length: CONCURRENCY}, () => worker()))

    assert.equal(
      failures,
      0,
      `${failures}/${ROUNDS} writes were lost or left partial, e.g. ${JSON.stringify(failureDetails)}`,
    )
  })

  test("radisk.save's own completion callback fires exactly once per thrash cycle", async () => {
    // A direct regression test for the underlying mechanism (rather than
    // just the end-to-end symptom above): radisk.thrash's completion
    // handler used to be reachable multiple times for a single batch
    // (visible via its own "if (++i > 1) return" guard, added as a
    // symptom-level workaround rather than a fix) - whichever call
    // happened to land first would resolve every pending write's own
    // callback, even while other files in the same batch were still being
    // written. Reuses the real fileSystem store adapter (the same one
    // Store() itself uses internally, proven reliable in the test above)
    // rather than a hand-rolled mock, whose own timing doesn't
    // necessarily match real fs semantics closely enough to trust for
    // something this timing-sensitive. A Radisk instance is built
    // directly (rather than going through Store) since Store doesn't
    // expose its own underlying radisk, and this test needs to wrap
    // radisk.save itself.
    const fsOpt: StoreOptions = {file: saveTestDir, size: 2000} as any
    const saveOpt: RadiskOptions = {size: 2000, store: fileSystem(fsOpt)}
    const radisk = Radisk(saveOpt)

    const extraCallCounts: number[] = []
    const originalSave = radisk.save
    radisk.save = (rad, cb) => {
      let calls = 0
      originalSave(rad, err => {
        calls++
        if (calls > 1) extraCallCounts.push(calls)
        cb(err)
      })
    }

    const KEYS = 60
    const keys = Array.from(
      {length: KEYS},
      () => utils.text.random(24) + "\x05v",
    )
    await Promise.all(
      keys.map(
        (key, i) =>
          new Promise<void>(resolve =>
            radisk(key, `value${i}`, () => resolve()),
          ),
      ),
    )

    // Give any stray, uncoordinated completions a chance to surface.
    await new Promise(resolve => setTimeout(resolve, 50))

    assert.deepEqual(
      extraCallCounts,
      [],
      "radisk.save's own completion callback fired more than once for a single batch",
    )
  })
})

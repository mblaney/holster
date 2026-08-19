import fs from "fs"
import {Server} from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../src/holster.ts"
import type {HolsterAPI} from "../src/holster.ts"
import * as utils from "../src/utils.ts"

describe("holster concurrency", () => {
  const dataDir = "test/holster.concurrency-ts"
  const wss: Server = new Server("ws://localhost:1261")
  const holster: HolsterAPI = Holster({
    file: dataDir,
    wss: wss,
    size: 2000,
  } as any)
  const user = holster.user()

  test("user create", (t, done) => {
    user.create("stress", "password", err => {
      assert.equal(err, null)
      done()
    })
  })

  test("user auth", (t, done) => {
    user.auth("stress", "password", err => {
      assert.equal(err, null)
      done()
    })
  })

  // Many concurrent chains that all need to create the same missing rel
  // (here, the shared "directories" key, not yet created by any of them)
  // used to each independently decide "it doesn't exist, create it",
  // writing competing souls for the same soul.item - Ham's per-property
  // conflict resolution then kept only one, silently orphaning everything
  // already written under the others. createRel in holster.ts now
  // serializes concurrent creators of the same soul.item.
  test("concurrent chains through a shared, not-yet-created parent all survive", async () => {
    const CONCURRENCY = 40
    const ROUNDS = 400
    let failures = 0
    const failureDetails: Array<{
      containerId: string
      fileId: string
      data: unknown
    }> = []

    const oneRound = async (): Promise<void> => {
      const containerId = utils.text.random(24)
      const fileId = utils.text.random(24)

      await new Promise<void>((resolve, reject) =>
        user
          .get("directories")
          .next(containerId)
          .next("children")
          .next(fileId)
          .put({name: "x", type: "file"}, err =>
            err ? reject(new Error(err)) : resolve(),
          ),
      )

      const data = await new Promise<unknown>(resolve =>
        user.get("directories").next(containerId).next("children", resolve),
      )

      const node = data as Record<string, unknown> | undefined
      if (!node || !node[fileId]) {
        failures++
        if (failureDetails.length < 5) {
          failureDetails.push({containerId, fileId, data})
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
      `${failures}/${ROUNDS} writes were lost, e.g. ${JSON.stringify(failureDetails)}`,
    )
  })

  test("cleanup", (t, done) => {
    setTimeout(() => {
      fs.rm(dataDir, {recursive: true, force: true}, err => {
        assert.equal(err, null)
        done()
      })
    }, 100)
  })
})

import fs from "fs"
import {Server} from "mock-socket"
import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../src/holster.ts"
import type {HolsterAPI} from "../src/holster.ts"
import type {GraphValue} from "../src/schemas.ts"

// Keys named after properties every object inherits, which used to match
// those inherited properties instead of being stored. __proto__ is rejected
// instead, since a plain object can't hold it as its own property.
const names = ["constructor", "toString", "valueOf", "hasOwnProperty"]

describe("holster keys named after Object.prototype properties", () => {
  const wss: Server = new Server("ws://localhost:9030")
  const holster: HolsterAPI = Holster({
    file: "test/holster.prototype",
    wss: wss,
  })
  const prototypeNames = Object.getOwnPropertyNames(Object.prototype)

  test("put and get them as top level keys", async () => {
    for (const name of names) {
      await holster.get(name).put({name})
      assert.deepEqual(await holster.get(name), {name}, name)
    }
  })

  test("put and get them as properties", async () => {
    const data = Object.fromEntries(names.map(name => [name, `${name} value`]))
    await holster.get("properties").put(data)
    assert.deepEqual(await holster.get("properties"), data)
    for (const name of names) {
      assert.equal(
        await holster.get("properties").next(name),
        `${name} value`,
        name,
      )
    }
  })

  test("put and get them as nested objects", async () => {
    for (const name of names) {
      await holster.get("nested").next(name).put({inner: name})
      assert.deepEqual(
        await holster.get("nested").next(name),
        {inner: name},
        name,
      )
    }
  })

  test("__proto__ is rejected as a key", async () => {
    assert.equal(await new Promise(res => holster.get("__proto__", res)), null)
    assert.equal(
      await new Promise(res => holster.get("nested").next("__proto__", res)),
      null,
    )
    // An object literal would set the prototype, so the data is parsed the
    // way it would arrive in a message.
    const data = JSON.parse('{"__proto__": "value"}') as Record<
      string,
      GraphValue
    >
    await assert.rejects(() => holster.get("rejected").put(data), {
      message: "error __proto__ cannot be used as a property name",
    })
  })

  test("Object.prototype is unchanged", () => {
    assert.deepEqual(
      Object.getOwnPropertyNames(Object.prototype),
      prototypeNames,
    )
    assert.equal(Object.getPrototypeOf({}), Object.prototype)
  })

  test("cleanup", (t, done) => {
    fs.rm("test/holster.prototype", {recursive: true, force: true}, err => {
      assert.equal(err, null)
      done()
    })
  })
})

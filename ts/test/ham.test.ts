import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Ham from "../src/ham.ts"
import type {Graph} from "../src/schemas.ts"

// A change setting one property on soul, with a state in the past so it's
// applied rather than deferred.
const change = (soul: string, age: number): Graph => ({
  [soul]: {_: {"#": soul, ">": {value: Date.now() - age}}, value: soul},
})

describe("Ham.mix graph limit", () => {
  test("removes the oldest souls once over the limit", async () => {
    const graph: Graph = {}
    const hasNode = new Set<string>()
    for (let i = 0; i < 150; i++) {
      hasNode.add(`soul${i}`)
      await Ham.mix(
        change(`soul${i}`, 1000 - i),
        graph,
        hasNode,
        false,
        {},
        100,
      )
    }

    const size = Object.keys(graph).length
    assert.ok(size >= 90 && size <= 100, `graph has ${size} souls`)
    assert.ok(graph.soul149, "the newest soul is kept")
    assert.equal(graph.soul0, undefined, "the oldest soul is removed")
    assert.equal(hasNode.has("soul0"), false)
    assert.equal(hasNode.has("soul149"), true)
  })

  test("limits souls added to the graph outside Ham.mix", async () => {
    // Like souls wire.ts adds from store reads, which Ham.mix doesn't count
    // until it next counts the whole graph.
    const graph: Graph = {}
    for (let i = 0; i < 200; i++) {
      graph[`read${i}`] = {
        _: {"#": `read${i}`, ">": {value: i}},
        value: i,
      }
    }
    for (let i = 0; i < 1000; i++) {
      await Ham.mix(change("written", 0), graph, undefined, false, {}, 100)
    }
    assert.ok(Object.keys(graph).length <= 100)
    assert.ok(graph.written, "the newest soul is kept")
  })
})

describe("Ham.mix souls and keys named after Object.prototype properties", () => {
  // Parsed the way a peer's message arrives, since an object literal would
  // set the prototype rather than add a __proto__ property.
  const message = (state: number): Graph =>
    JSON.parse(`{
      "__proto__": {
        "_": {"#": "__proto__", ">": {"x": ${state}}},
        "x": "dropped"
      },
      "constructor": {
        "_": {"#": "constructor", ">": {"toString": ${state}}},
        "toString": "kept"
      },
      "node": {
        "_": {
          "#": "node",
          ">": {"constructor": ${state}, "valueOf": ${state}, "__proto__": ${state}}
        },
        "constructor": "kept",
        "valueOf": "kept",
        "__proto__": "dropped"
      }
    }`)

  test("stores them, and drops __proto__ without changing Object.prototype", async () => {
    const graph: Graph = Object.create(null)
    const before = Object.getOwnPropertyNames(Object.prototype)
    const change = message(Date.now() - 1000)
    assert.ok(Object.hasOwn(change, "__proto__"), "the message has the soul")
    await Ham.mix(change, graph, undefined, false, Object.create(null))
    assert.equal(graph.constructor!.toString, "kept")
    assert.equal(graph.node!.constructor, "kept")
    assert.equal(graph.node!.valueOf, "kept")
    assert.ok(!Object.hasOwn(graph, "__proto__"))
    assert.ok(!Object.hasOwn(graph.node!, "__proto__"))
    assert.deepEqual(Object.getOwnPropertyNames(Object.prototype), before)
    assert.equal(({} as Record<string, unknown>).x, undefined)
  })
})

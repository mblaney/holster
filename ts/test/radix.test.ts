import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Radix from "../src/radix.ts"
import type {RadixFunction, EncodedValue} from "../src/schemas.ts"
import Names from "./names.ts"

const names: string[] = Names()

// ASCII character for group separator.
const group = String.fromCharCode(29)
// ASCII character for record separator.
const record = String.fromCharCode(30)

// Trees have no prototype, so they're copied to plain objects to compare.
const plain = (tree: unknown): unknown => JSON.parse(JSON.stringify(tree))

describe("radix", () => {
  const radix: RadixFunction = Radix()

  test("unit", () => {
    radix("asdf.pub", "yum")
    radix("ablah", "cool")
    radix("abc", {yes: 1})
    radix("node/circle.bob", "awesome")

    assert.deepEqual(plain(radix("asdf.")), {pub: {[record]: "yum"}})
    assert.equal(radix("nv/foo.bar"), undefined)
    assert.equal(radix("ablah"), "cool")
    assert.deepEqual(radix("abc"), {yes: 1})
    assert.equal(radix("abcd"), undefined)
    assert.deepEqual(plain(radix()), {
      a: {
        [group]: {
          "sdf.pub": {[record]: "yum"},
          b: {
            [group]: {
              c: {
                [record]: {
                  yes: 1,
                },
              },
              lah: {
                [record]: "cool",
              },
            },
          },
        },
      },
      "node/circle.bob": {[record]: "awesome"},
    })
  })

  test("replace", () => {
    radix("asdf.pub", "yuck")
    radix("ablah", "cool!")
    radix("abc", {yes: 2})
    radix("node/circle.bob", "awe")
    radix("abcd", true)

    assert.deepEqual(plain(radix("asdf.")), {pub: {[record]: "yuck"}})
    assert.equal(radix("ablah"), "cool!")
    assert.equal(radix("nv/foo.bar"), undefined)
    assert.deepEqual(radix("abc"), {yes: 2})
    assert.equal(radix("abcd"), true)
    assert.deepEqual(plain(radix()), {
      a: {
        [group]: {
          "sdf.pub": {[record]: "yuck"},
          b: {
            [group]: {
              c: {
                [group]: {
                  d: {
                    [record]: true,
                  },
                },
                [record]: {
                  yes: 2,
                },
              },
              lah: {
                [record]: "cool!",
              },
            },
          },
        },
      },
      "node/circle.bob": {[record]: "awe"},
    })
  })

  test("radix write read", () => {
    // Add some shorter values to also force group matching in Radix.map.
    radix("A", 1)
    radix("Be", 2)
    radix("Bo", 3)
    radix("L", 4)
    radix("Mi", 5)
    const all: Record<string, number> = {}
    names.forEach((value: string, index: number) => {
      all[value] = index
      radix(value, index)
    })
    assert.equal(Object.keys(all).length, names.length)
    Radix.map(radix, (value: EncodedValue, key: string) => {
      delete all[key]
    })
    assert.equal(Object.keys(all).length, 0)
  })

  test("radix read again", () => {
    const all: Record<string, number> = {}
    names.forEach((value: string, index: number) => {
      all[value] = index
    })
    assert.equal(Object.keys(all).length, names.length)
    Radix.map(radix, (value: EncodedValue, key: string) => {
      delete all[key]
    })
    assert.equal(Object.keys(all).length, 0)
  })

  test("read past a key with nothing stored below it", () => {
    const radix: RadixFunction = Radix()
    radix("root\x05small10", "a link")
    radix("0other\x05body", "another record")

    // Reading on from small10 used to restart at the top of the tree,
    // matching the "0" against 0other.
    assert.equal(radix("root\x05small100"), undefined)
    assert.equal(radix("root\x05small10"), "a link")
  })

  test("map in key order however keys were added", () => {
    const radix = Radix()
    const keys = ["b", "a", "9", "10", "c1", "c0", "~x"]
    for (const key of keys) radix(key, key as never)
    const order = (): string[] => {
      const mapped: string[] = []
      Radix.map(radix, (value, key) => {
        mapped.push(key)
      })
      return mapped
    }
    assert.deepEqual(order(), [...keys].sort())
    // A key added after mapping still comes back in order.
    radix("0", "0" as never)
    assert.deepEqual(order(), [...keys, "0"].sort())
  })

  test("keys named after Object.prototype properties", () => {
    const before = Object.getOwnPropertyNames(Object.prototype)
    const radix = Radix()
    const keys = ["constructor", "toString1", "__proto__", "__proto__x", "a"]
    for (const key of keys) radix(key, `${key} value` as never)
    for (const key of keys) {
      assert.equal(radix(key) as unknown, `${key} value`, key)
    }
    const mapped: string[] = []
    Radix.map(radix, (value, key) => {
      mapped.push(key)
    })
    assert.deepEqual(mapped, [...keys].sort())
    assert.deepEqual(Object.getOwnPropertyNames(Object.prototype), before)
  })
})

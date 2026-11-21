import {describe, test} from "node:test"
import assert from "node:assert/strict"
import Store, {encodeName, decodeName} from "../src/store.ts"
import type {Graph, Lex, StoreInterface} from "../src/schemas.ts"
import fs from "fs"

describe("store", () => {
  const kitty: StoreInterface = Store({file: "test/kitty"})
  const multiple: StoreInterface = Store({
    file: "test/multiple",
    size: 100,
  } as any)
  const special: StoreInterface = Store({file: "test/special"})
  const newFileValue =
    "file size is only 100 bytes so writing this value requires calling slice"

  test("get graph", (t, done) => {
    kitty.get(
      {"#": "FDSA"},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          FDSA: {
            _: {
              "#": "FDSA",
              ">": {
                color: 3,
                name: 2,
                slave: 2,
                species: 2,
              },
            },
            color: "ginger",
            name: "Fluffy",
            slave: {
              "#": "ASDF",
            },
            species: "felis silvestris",
          },
        })
        done()
      },
    )
  })

  test("get item", (t, done) => {
    kitty.get(
      {"#": "FDSA", ".": "species"},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          FDSA: {
            _: {
              "#": "FDSA",
              ">": {
                species: 2,
              },
            },
            species: "felis silvestris",
          },
        })
        done()
      },
    )
  })

  test("put keys to multiple files", (t, done) => {
    multiple.put(
      {
        keyA: {
          _: {"#": "keyA", ">": {value: 1}},
          value: "valueA",
        },
        keyB: {
          _: {"#": "keyB", ">": {value: 1}},
          value: "valueB",
        },
        keyC: {
          _: {"#": "keyC", ">": {value: 1, extraField: 1}},
          value: "valueC",
          extraField: true,
        },
        newFile: {
          _: {"#": "newFile", ">": {value: 1}},
          value: newFileValue,
        },
      },
      (err: string | null | undefined) => {
        assert.equal(err, null)
        fs.access("test/multiple/!", (err: NodeJS.ErrnoException | null) => {
          assert.equal(err, null)
          fs.access(
            "test/multiple/newFile",
            (err: NodeJS.ErrnoException | null) => {
              assert.equal(err, null)
              done()
            },
          )
        })
      },
    )
  })

  test("get key from first file", (t, done) => {
    multiple.get(
      {"#": "keyA"},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          keyA: {
            _: {
              "#": "keyA",
              ">": {
                value: 1,
              },
            },
            value: "valueA",
          },
        })
        done()
      },
    )
  })

  test("get another key from first file", (t, done) => {
    multiple.get(
      {"#": "keyC"},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          keyC: {
            _: {
              "#": "keyC",
              ">": {
                extraField: 1,
                value: 1,
              },
            },
            extraField: true,
            value: "valueC",
          },
        })
      },
    )
    multiple.get(
      {"#": "keyC", ".": "value"},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          keyC: {
            _: {
              "#": "keyC",
              ">": {
                value: 1,
              },
            },
            value: "valueC",
          },
        })
        done()
      },
    )
  })

  test("get key from second file", (t, done) => {
    multiple.get(
      {"#": "newFile"},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          newFile: {
            _: {
              "#": "newFile",
              ">": {
                value: 1,
              },
            },
            value: newFileValue,
          },
        })
        fs.rm(
          "test/multiple",
          {recursive: true, force: true},
          (err: NodeJS.ErrnoException | null) => {
            assert.equal(err, null)
            done()
          },
        )
      },
    )
  })

  test("put keys with special characters", (t, done) => {
    special.put(
      {
        "#": {
          _: {"#": "#", ">": {value: 1}},
          value: "ok got #",
        },
        ">": {
          _: {"#": ">", ">": {value: 1, extraField: 1}},
          value: "ok got >",
          extraField: true,
        },
        ".": {
          _: {"#": ".", ">": {value: 1, extraField: 1}},
          value: "ok got .",
          extraField: true,
        },
        "+": {
          _: {"#": "+", ">": {value: 1}},
          value: "ok got +",
        },
        "[": {
          _: {"#": "[", ">": {value: 1}},
          value: "ok got [",
        },
        ",": {
          _: {"#": ",", ">": {value: 1}},
          value: "ok got ,",
        },
        '"': {
          _: {"#": '"', ">": {value: 1}},
          value: 'ok got "',
        },
        _: {
          _: {"#": "_", ">": {value: 1}},
          value: "ok got _",
        },
      },
      (err: string | null | undefined) => {
        assert.equal(err, null)
        fs.access("test/special/!", (err: NodeJS.ErrnoException | null) => {
          assert.equal(err, null)
          done()
        })
      },
    )
  })

  test("get keys with special characters", (t, done) => {
    special.get(
      {"#": "#"},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          "#": {
            _: {
              "#": "#",
              ">": {
                value: 1,
              },
            },
            value: "ok got #",
          },
        })
      },
    )
    special.get(
      {"#": ">", ".": "value"},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          ">": {
            _: {
              "#": ">",
              ">": {
                value: 1,
              },
            },
            value: "ok got >",
          },
        })
      },
    )
    special.get(
      {"#": ".", ".": "value"},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          ".": {
            _: {
              "#": ".",
              ">": {
                value: 1,
              },
            },
            value: "ok got .",
          },
        })
      },
    )
    special.get(
      {"#": "+"},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          "+": {
            _: {
              "#": "+",
              ">": {
                value: 1,
              },
            },
            value: "ok got +",
          },
        })
      },
    )
    special.get(
      {"#": "["},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          "[": {
            _: {
              "#": "[",
              ">": {
                value: 1,
              },
            },
            value: "ok got [",
          },
        })
      },
    )
    special.get(
      {"#": ","},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          ",": {
            _: {
              "#": ",",
              ">": {
                value: 1,
              },
            },
            value: "ok got ,",
          },
        })
      },
    )
    special.get(
      {"#": '"'},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          '"': {
            _: {
              "#": '"',
              ">": {
                value: 1,
              },
            },
            value: 'ok got "',
          },
        })
      },
    )
    special.get(
      {"#": "_"},
      (err: string | null | undefined, value: Graph | undefined) => {
        assert.deepEqual(value, {
          _: {
            _: {
              "#": "_",
              ">": {
                value: 1,
              },
            },
            value: "ok got _",
          },
        })
        fs.rm(
          "test/special",
          {recursive: true, force: true},
          (err: NodeJS.ErrnoException | null) => {
            assert.equal(err, null)
            done()
          },
        )
      },
    )
  })

  test("get properties that aren't stored yet", (t, done) => {
    const missing: StoreInterface = Store({file: "test/missing-ts"})
    const graph: Graph = {
      root: {
        _: {"#": "root", ">": {small10: 1, small11: 1}},
        small10: {"#": "a"},
        small11: {"#": "b"},
      },
      "0other": {
        _: {"#": "0other", ">": {body: 1}},
        body: "another record",
      },
    }
    missing.put(graph, (err: string | null | undefined) => {
      assert.equal(err, null)
      // Longer than a stored property, so radix used to look past small10.
      missing.get(
        {"#": "root", ".": "small100"},
        (err: string | null | undefined, value: Graph | undefined) => {
          assert.equal(err, null)
          assert.deepEqual(value, {root: undefined})
          // A prefix of stored properties, so radix finds their group,
          // which used to be stored as if it were this property's value.
          missing.get(
            {"#": "root", ".": "small1"},
            (err: string | null | undefined, value: Graph | undefined) => {
              assert.equal(err, null)
              assert.deepEqual(value, {root: undefined})
              fs.rm(
                "test/missing-ts",
                {recursive: true, force: true},
                (err: NodeJS.ErrnoException | null) => {
                  assert.equal(err, null)
                  done()
                },
              )
            },
          )
        },
      )
    })
  })
})

describe("store file names", () => {
  // Files are named after souls when they're split, so these souls end up
  // as file names.
  const souls = [
    "-1",
    "-2",
    "../escaped",
    "./dot",
    ".",
    "..",
    "b/one",
    "c\x05d",
  ]

  test("encode and decode names", () => {
    for (const name of [...souls, "!", "100%", "a%2Fb", "x.", "x ", "a<b>"]) {
      const encoded = encodeName(name)
      assert.ok(!/[/\\\x00-\x1F]/.test(encoded), `${name} is encoded`)
      assert.ok(encoded !== "." && encoded !== "..", `${name} is encoded`)
      assert.equal(decodeName(encoded), name)
    }
  })

  test("put and get souls that would be unsafe file names", (t, done) => {
    // Small enough that each soul is split into a file of its own.
    const names: StoreInterface = Store({
      file: "test/names-ts",
      size: 60,
    } as any)
    const graph: Graph = {}
    for (const soul of souls) {
      graph[soul] = {_: {"#": soul, ">": {value: 1}}, value: `${soul} value`}
    }
    names.put(graph, err => {
      assert.equal(err, null)
      const files = fs.readdirSync("test/names-ts")
      for (const file of [
        "..%2Fescaped",
        ".%2Fdot",
        "%2E",
        "%2E%2E",
        "b%2Fone",
      ]) {
        assert.ok(files.includes(file), `${file} in ${files}`)
      }
      // The file named after ../escaped used to be written here.
      assert.ok(!fs.existsSync("test/escaped"))
      let count = 0
      for (const soul of souls) {
        names.get({"#": soul}, (err, value) => {
          assert.equal(err, null)
          assert.equal((value as Graph)[soul]!.value, `${soul} value`, soul)
          if (++count < souls.length) return

          fs.rm("test/names-ts", {recursive: true, force: true}, err => {
            assert.equal(err, null)
            done()
          })
        })
      }
    })
  })
})

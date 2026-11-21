import fs from "fs"
import {Server} from "mock-socket"
import {after, describe, test} from "node:test"
import assert from "node:assert/strict"
import SEA from "../src/sea.ts"
import User from "../src/user.ts"
import Wire from "../src/wire.ts"
import type {UserInterface} from "../src/schemas.ts"

describe("user", () => {
  const wss: Server = new Server("ws://localhost:1234")
  const user: UserInterface = User({file: "test/user", wss: wss} as any)

  test("create", (t, done) => {
    user.create("alice", "password", err => {
      assert.equal(err, null)
      done()
    })
  })

  test("create no username", (t, done) => {
    user.create("", "password", err => {
      assert.equal(err, "Please provide a username")
      done()
    })
  })

  test("create no password", (t, done) => {
    user.create("alice", "", err => {
      assert.equal(err, "Please provide a password")
      done()
    })
  })

  test("username already exists", (t, done) => {
    user.create("alice", "password", err => {
      assert.equal(err, "Username already exists")
      done()
    })
  })

  test("user is already being created", (t, done) => {
    user.create("bob", "password", err => {
      assert.equal(err, null)
      done()
    })
    user.create("bob", "password", err => {
      assert.equal(err, "User is already being created")
    })
  })

  test("auth", (t, done) => {
    user.auth("alice", "password", err => {
      assert.equal(err, null)
      assert.equal(user.is?.username, "alice")
      done()
    })
  })

  test("auth no username", (t, done) => {
    user.auth("", "password", err => {
      assert.equal(err, "Please provide a username")
      assert.equal(user.is, null)
      done()
    })
  })

  test("auth no password", (t, done) => {
    user.auth("alice", "", err => {
      assert.equal(err, "Please provide a password")
      assert.equal(user.is, null)
      done()
    })
  })

  test("auth wrong username", (t, done) => {
    user.auth("wrong", "password", err => {
      assert.equal(err, "Wrong username or password")
      assert.equal(user.is, null)
      done()
    })
  })

  test("auth wrong password", (t, done) => {
    user.auth("alice", "wrong", err => {
      assert.equal(err, "Wrong username or password")
      assert.equal(user.is, null)
      done()
    })
  })

  test("user is already authenticating", (t, done) => {
    user.auth("bob", "password", err => {
      assert.equal(err, null)
      assert.equal(user.is?.username, "bob")
      done()
    })
    user.auth("bob", "password", err => {
      assert.equal(err, "User is already authenticating")
      assert.equal(user.is, null)
    })
  })

  test("change", (t, done) => {
    user.change("alice", "password", "new password", err => {
      assert.equal(err, null)
      assert.equal(user.is?.username, "alice")
      done()
    })
  })

  test("change no username", (t, done) => {
    user.change("", "password", "new password", err => {
      assert.equal(err, "Please provide a username")
      assert.equal(user.is, null)
      done()
    })
  })

  test("change no password", (t, done) => {
    user.change("alice", "", "new password", err => {
      assert.equal(err, "Please provide a password")
      assert.equal(user.is, null)
      done()
    })
  })

  test("change no new password", (t, done) => {
    user.change("alice", "password", "", err => {
      assert.equal(err, "Please provide a new password")
      assert.equal(user.is, null)
      done()
    })
  })

  test("check password change and leave", (t, done) => {
    user.auth("alice", "new password", err => {
      assert.equal(err, null)
      assert.equal(user.is?.username, "alice")
      user.leave()
      assert.equal(user.is, null)
      done()
    })
  })

  test("delete wrong password", (t, done) => {
    user.delete("alice", "password", err => {
      assert.equal(err, "Wrong username or password")
      assert.equal(user.is, null)
      done()
    })
  })

  test("delete", (t, done) => {
    user.delete("alice", "new password", err => {
      assert.equal(err, null)
      assert.equal(user.is, null)
      done()
    })
  })

  test("auth after delete", (t, done) => {
    user.auth("alice", "new password", err => {
      assert.equal(err, "Wrong username or password")
      assert.equal(user.is, null)
      done()
    })
  })

  test("cleanup", (t, done) => {
    fs.rm("test/user", {recursive: true, force: true}, err => {
      assert.equal(err, null)
      done()
    })
  })
})

describe("user auth iterations", () => {
  const wss: Server = new Server("ws://localhost:1270")
  const wire = Wire({file: "test/user-iterations", wss: wss} as never)
  const user = User({} as never, wire)
  let soul: string

  // Reads the user's auth record.
  const auth = (): Promise<{salt: string; iter?: number}> =>
    new Promise(res =>
      wire.get({"#": soul, ".": "auth"}, msg =>
        res(JSON.parse(msg.put![soul]!.auth as string)),
      ),
    )

  after(() => fs.rmSync("test/user-iterations", {recursive: true, force: true}))

  test("create stores the iterations", async () => {
    await new Promise(res => user.create("carol", "password", res))
    await new Promise(res => user.auth("carol", "password", res))
    soul = "~" + user.is!.pub
    assert.equal((await auth()).iter, 600000)
  })

  test("auth with fewer iterations encrypts again", async () => {
    // An auth record from before iterations were stored.
    const salt = "an old salt"
    const work = await SEA.work("password", salt, 100000)
    const priv = {priv: user.is!.priv, epriv: user.is!.epriv}
    const enc = await SEA.encrypt(priv, work)
    const update = {auth: JSON.stringify({enc: enc, salt: salt})}
    const graph = await SEA.signProperties(soul, update, user.is as never)
    await new Promise(res => wire.put(graph, res))
    assert.equal((await auth()).iter, undefined)

    user.leave()
    const err = await new Promise(res => user.auth("carol", "password", res))
    assert.equal(err, null)
    assert.equal(user.is!.priv, priv.priv)
    const updated = await auth()
    assert.equal(updated.iter, 600000)
    assert.notEqual(updated.salt, salt)
  })
})

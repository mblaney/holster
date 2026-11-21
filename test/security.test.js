import fs from "fs"
import {Server} from "mock-socket"
import {after, before, describe, test} from "node:test"
import assert from "node:assert/strict"
import Holster from "../src/holster.js"
import SEA from "../src/sea.js"
import * as seaUtils from "../src/sea-utils.js"
import SafeBuffer from "../src/buffer.js"
import Store from "../src/store.js"
import * as utils from "../src/utils.js"

const userKey = utils.userPublicKey
const wait = ms => new Promise(res => setTimeout(res, ms))

// A holster server with another client connected to it, which can send any
// put the way a peer can.
const setup = async (port, file, secure) => {
  const wss = new Server(`ws://localhost:${port}`)
  const holster = Holster({file, wss, secure})
  const ws = new WebSocket(`ws://localhost:${port}`)
  await new Promise(res => (ws.onopen = res))
  const send = async put => {
    ws.send(JSON.stringify({"#": utils.text.random(9), put}))
    await wait(200)
  }
  // Reads the server's own copy of a node, without asking its peers.
  const read = soul =>
    new Promise(res =>
      holster.wire.get({"#": soul}, msg => res(msg.put && msg.put[soul]), {
        put: true,
      }),
    )
  const remove = () =>
    fs.rmSync(file, {recursive: true, force: true, maxRetries: 5})
  return {holster, ws, send, read, remove}
}

// Creates a user who writes a nested node, and returns their public key and
// the nested node's soul.
const createUser = async (server, alias) => {
  const user = server.holster.user()
  await new Promise(res => user.create(alias, "password", res))
  await new Promise(res => user.auth(alias, "password", res))
  await user.get("profile").put({name: alias})
  const pub = user.is.pub
  const soul = utils.rel.is((await server.read("~" + pub)).profile)
  return {pub, soul}
}

for (const secure of [false, true]) {
  const mode = secure ? "secure" : "open"
  const where = secure ? "a secure server" : "an open server"
  describe(`security - updates to user data on ${where}`, () => {
    const file = `test/security-${mode}`
    let server
    let user
    let other

    before(async () => {
      server = await setup(secure ? 9041 : 9040, file, secure)
      user = await createUser(server, "alice")
      other = await SEA.pair()
    })

    after(() => server.remove())

    test("an unsigned update is rejected", async () => {
      const state = Date.now()
      await server.send({
        [user.soul]: {
          _: {"#": user.soul, ">": {name: state}},
          name: "unsigned",
        },
      })
      assert.equal((await server.read(user.soul)).name, "alice")
    })

    test("an update signed with another key is rejected", async () => {
      const update = {name: "other key"}
      await server.send(await SEA.signProperties(user.soul, update, other))
      assert.equal((await server.read(user.soul)).name, "alice")
    })

    test("the owner's key without a signature is rejected", async () => {
      const state = Date.now()
      await server.send({
        [user.soul]: {
          _: {"#": user.soul, ">": {name: state, [userKey]: state}},
          name: "copied key",
          [userKey]: user.pub,
        },
      })
      assert.equal((await server.read(user.soul)).name, "alice")
    })

    // Data written without a user can only be created on an open server.
    if (!secure) {
      test("a key can't be added to a node that has none", async () => {
        await server.holster.get("public").put({note: "anyone"})
        const root = await server.read("root")
        const soul = utils.rel.is(root.public)
        await server.send(
          await SEA.signProperties(soul, {note: "claimed"}, other),
        )
        const node = await server.read(soul)
        assert.equal(node.note, "anyone")
        assert.equal(node[userKey], undefined)
      })
    }
  })
}

// Every update carries its signature, timestamp and public key, so anyone who
// has seen one of a user's updates has all three.
describe("security - reused signatures on a secure server", () => {
  let server
  let fresh
  let user
  let time
  let sig

  before(async () => {
    server = await setup(9042, "test/security-reused", true)
    fresh = await setup(9043, "test/security-fresh", true)
    user = await createUser(server, "bob")
    const node = await server.read(user.soul)
    time = node._[">"].name
    sig = node._.s.name
  })

  after(() => {
    server.remove()
    fresh.remove()
  })

  // Builds an update for soul that claims signature, which the user made for
  // their name, for each property in data. The node's own signed public key is
  // copied too, as anyone who has seen the node can.
  const reuse = async (soul, data, state = time, signature = sig) => {
    const node = await server.read(soul)
    const update = {
      _: {"#": soul, ">": {}, s: {}},
      ...data,
      [userKey]: user.pub,
    }
    for (const key of Object.keys(data)) {
      update._[">"][key] = state
      update._.s[key] = signature
    }
    update._[">"][userKey] = node._[">"][userKey]
    update._.s[userKey] = node._.s[userKey]
    return {[soul]: update}
  }

  test("an invalid signature is rejected", async () => {
    const invalid = (sig[0] === "A" ? "B" : "A") + sig.slice(1)
    const update = await reuse(user.soul, {name: "forged"}, time + 1, invalid)
    await server.send(update)
    assert.equal((await server.read(user.soul)).name, "bob")
  })

  test("a signature can't add a property it wasn't made for", async () => {
    await server.send(await reuse(user.soul, {added: "attacker's value"}))
    assert.equal((await server.read(user.soul)).added, undefined)
  })

  test("a signature from one node can't be used on another", async () => {
    const userSoul = "~" + user.pub
    await server.send(await reuse(userSoul, {outbox: {"#": "attackerSoul"}}))
    assert.equal((await server.read(userSoul)).outbox, undefined)
  })

  test("a node's own signature can't add a link to it", async () => {
    const userSoul = "~" + user.pub
    const node = await server.read(userSoul)
    const key = Object.keys(node._.s).find(key => key !== userKey)
    const update = await reuse(
      userSoul,
      {inbox: {"#": "attackerSoul"}},
      node._[">"][key],
      node._.s[key],
    )
    await server.send(update)
    assert.equal((await server.read(userSoul)).inbox, undefined)
  })

  test("a signature from SEA.sign can't be used for a property", async () => {
    const state = Date.now()
    const text = JSON.stringify([user.soul, "name", "signed text", state])
    const signed = await SEA.sign(text, server.holster.user().is)
    const update = await reuse(
      user.soul,
      {name: "signed text"},
      state,
      signed.s,
    )
    await server.send(update)
    assert.equal((await server.read(user.soul)).name, "bob")
  })

  test("a signature can't change a value on a server that hasn't seen it", async () => {
    await fresh.send(await reuse(user.soul, {name: "rewritten"}))
    const node = await fresh.read(user.soul)
    assert.notEqual(node && node.name, "rewritten")
  })
})

// Before property signatures, an update was signed by signing its timestamp.
// Servers no longer accept them, but still serve data they stored with them,
// which its owner signs again when they read it.
describe("security - signatures from before property signatures", () => {
  // Signs a timestamp the way holster signed updates then.
  const signTimestamp = async (timestamp, pair) => {
    const jwk = seaUtils.jwk(pair.pub, pair.priv)
    const curve = {name: "ECDSA", namedCurve: "P-256"}
    const key = await seaUtils.subtle.importKey("jwk", jwk, curve, false, [
      "sign",
    ])
    const hash = await seaUtils.sha256(timestamp.toString())
    const ecdsa = {name: "ECDSA", hash: {name: "SHA-256"}}
    const sig = await seaUtils.subtle.sign(ecdsa, key, new Uint8Array(hash))
    return SafeBuffer.from(sig, "binary").toString("base64")
  }

  // A graph for soul with every property signed by signing timestamp.
  const signed = async (soul, data, pair, timestamp) => {
    const sig = await signTimestamp(timestamp, pair)
    const graph = utils.graph(soul, data, timestamp)
    graph[soul][userKey] = pair.pub
    graph[soul]._[">"][userKey] = timestamp
    graph[soul]._.s = {}
    for (const key of Object.keys(graph[soul])) {
      if (key !== "_") graph[soul]._.s[key] = sig
    }
    return graph
  }

  test("aren't accepted by a server", async () => {
    const server = await setup(9045, "test/security-legacy", true)
    const pair = await SEA.pair()
    const timestamp = Date.now() - 1000
    await server.send(await signed("old", {name: "before"}, pair, timestamp))
    assert.equal(await server.read("old"), null)
    server.remove()
  })

  describe("stored before a server stopped accepting them", () => {
    const file = "test/security-legacy-stored"
    const clientFile = "test/security-legacy-client"
    const timestamp = Date.now() - 2000
    let pair
    let other
    let server
    let client

    // Reads a node from holster's own graph and storage.
    const read = (holster, soul) =>
      new Promise(res =>
        holster.wire.get({"#": soul}, msg => res(msg.put && msg.put[soul]), {
          put: true,
        }),
      )

    before(async () => {
      pair = await SEA.pair()
      other = await SEA.pair()
      // Written to storage directly, the way the data was stored before.
      const store = Store({file})
      const graph = {
        ...(await signed("mine", {name: "before"}, pair, timestamp)),
        ...(await signed("theirs", {name: "theirs"}, other, timestamp)),
      }
      await new Promise(res => store.put(graph, res))

      const wss = new Server("ws://localhost:9046")
      server = Holster({file, wss, secure: true})
      const connected = new Promise(res => wss.on("connection", res))
      client = Holster({peers: ["ws://localhost:9046"], file: clientFile})
      client.user().is = pair
      await connected
    })

    after(() => {
      fs.rmSync(file, {recursive: true, force: true, maxRetries: 5})
      fs.rmSync(clientFile, {recursive: true, force: true, maxRetries: 5})
    })

    test("are signed again when their owner reads them", async () => {
      const node = await new Promise(res =>
        client.wire.get({"#": "mine"}, msg => res(msg.put && msg.put.mine)),
      )
      assert.equal(node.name, "before")
      await wait(300)

      const stored = await read(server, "mine")
      assert.equal(stored.name, "before")
      assert.ok(stored._[">"].name > timestamp)
      const keys = ["name", userKey]
      const verified = await SEA.verifyProperties(
        "mine",
        stored,
        keys,
        pair.pub,
      )
      assert.equal(verified.get("name"), false)
      assert.equal(verified.get(userKey), false)
    })

    test("can't be replaced with a later signature once signed again", async () => {
      const later = await signed(
        "mine",
        {name: "later"},
        pair,
        timestamp + 1000,
      )
      await new Promise(res => client.wire.put(later, res))
      assert.equal((await read(client, "mine")).name, "before")
    })

    test("from another user are read but not signed again", async () => {
      const node = await new Promise(res =>
        client.wire.get({"#": "theirs"}, msg => res(msg.put && msg.put.theirs)),
      )
      assert.equal(node.name, "theirs")
      await wait(300)

      const stored = await read(server, "theirs")
      assert.equal(stored._[">"].name, timestamp)
    })
  })
})

describe("security - replies from a peer", () => {
  let client
  let pair

  before(async () => {
    client = await setup(9044, "test/security-reply", false)
    pair = await SEA.pair()
    const soul = "~" + pair.pub
    const now = Date.now()
    // The peer answers every get for the user's node with data that fails
    // verification.
    client.ws.onmessage = m => {
      const msg = JSON.parse(m.data)
      if (!msg.get || msg.get["#"] !== soul) return

      const node = {
        _: {"#": soul, ">": {name: now, [userKey]: now}, s: {[now]: "bad"}},
        name: "forged",
        [userKey]: pair.pub,
      }
      client.ws.send(
        JSON.stringify({
          "#": utils.text.random(9),
          "@": msg["#"],
          put: {[soul]: node},
        }),
      )
    }
  })

  after(() => client.remove())

  test("data that fails verification isn't returned", async () => {
    const value = await new Promise(res =>
      client.holster.user().get([pair.pub, "name"], res),
    )
    assert.equal(value, null)
  })
})

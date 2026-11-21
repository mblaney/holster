// Runs one scenario in its own process, started by run.js. "write" writes
// the scenario's records and reports how long they took, and "verify" opens
// the same data again to check a sample of them reached disk. Results are
// sent back to run.js over IPC.

import fs from "node:fs/promises"
import path from "node:path"
import {isDeepStrictEqual} from "node:util"
import {scenarios} from "./scenarios.js"

const [mode, lib, name, dir] = process.argv.slice(2)
const scenario = scenarios[name]
const PUT_TIMEOUT_MS = 60000
const READ_TIMEOUT_MS = 5000

// Wraps a callback-style radisk, which both libraries have since holster's
// is based on Gun's.
const radiskAdapter = (radisk, toValue = v => v, fromValue = v => v) => ({
  put: (key, value) =>
    new Promise((resolve, reject) =>
      radisk(key, toValue(value), err =>
        err ? reject(new Error(err)) : resolve(),
      ),
    ),
  get: key =>
    new Promise((resolve, reject) =>
      radisk(key, (err, value) =>
        err ? reject(new Error(err)) : resolve(fromValue(value)),
      ),
    ),
})

// Radisk's batch size and write delay, when set by run.js.
const holsterOptions = {
  ...(process.env.HOLSTER_BATCH && {batch: Number(process.env.HOLSTER_BATCH)}),
  ...(process.env.HOLSTER_WRITE && {write: Number(process.env.HOLSTER_WRITE)}),
}

// The account user scenarios write as. It's created by the write step and
// logged in again by the verify step.
const username = "bench"
const password = "password"

// Writes and reads records under a holster chain root, which is either
// holster itself or a logged in user.
const holsterChain = root => ({
  put: (soul, data) =>
    new Promise((resolve, reject) =>
      root
        .get(soul)
        .put(data, err => (err ? reject(new Error(err)) : resolve())),
    ),
  get: soul => new Promise(resolve => root.get(soul, resolve)),
})

// The same for Gun, where a callback gets an ack with an err property.
const gunChain = root => ({
  put: (soul, data) =>
    new Promise((resolve, reject) =>
      root
        .get(soul)
        .put(data, ack => (ack.err ? reject(new Error(ack.err)) : resolve())),
    ),
  get: soul => new Promise(resolve => root.get(soul).once(resolve)),
})

// Opens holster with the data in dir, as a server with no clients so writes
// only go to disk.
const openHolster = async () => {
  const {default: Holster} = await import("../src/holster.js")
  return Holster({file: dir, port: 0, ...holsterOptions})
}

// Opens Gun with the data in dir and no peers, so writes only go to disk.
// SEA has to be loaded before Gun starts for user scenarios. Gun's chain has
// a then method, so it's returned inside an object, otherwise awaiting this
// would wait on the chain itself and never finish.
const openGun = async sea => {
  const {default: Gun} = await import("gun")
  if (sea) await import("gun/sea.js")
  const gun = Gun({
    file: dir,
    peers: [],
    multicast: false,
    axe: false,
    localStorage: false,
    // Gun waits 250ms before writing a batch unless this is set.
    ...(process.env.GUN_UNTIL && {until: Number(process.env.GUN_UNTIL)}),
  })
  return {gun}
}

// Opens the data in dir for each library, through its API, as a logged in
// user for a user scenario, or straight through its radisk for a radisk
// scenario. put resolves once the write is acknowledged, which for both
// libraries is once it's on disk.
const adapters = {
  holster: {
    async api() {
      return holsterChain(await openHolster())
    },
    async user() {
      const user = (await openHolster()).user()
      const done = (resolve, reject) => err =>
        err ? reject(new Error(err)) : resolve()
      if (mode === "write") {
        await new Promise((resolve, reject) =>
          user.create(username, password, done(resolve, reject)),
        )
      }
      await new Promise((resolve, reject) =>
        user.auth(username, password, done(resolve, reject)),
      )
      return holsterChain(user)
    },
    async radisk() {
      const {default: Radisk} = await import("../src/radisk.js")
      const {fileSystem} = await import("../src/store.js")
      const opt = {file: dir, ...holsterOptions}
      opt.store = fileSystem(opt)
      return radiskAdapter(Radisk(opt))
    },
  },
  gun: {
    async api() {
      return gunChain((await openGun(false)).gun)
    },
    async user() {
      const user = (await openGun(true)).gun.user()
      const done = (resolve, reject) => ack =>
        ack.err ? reject(new Error(ack.err)) : resolve()
      if (mode === "write") {
        await new Promise((resolve, reject) =>
          user.create(username, password, done(resolve, reject)),
        )
      }
      await new Promise((resolve, reject) =>
        user.auth(username, password, done(resolve, reject)),
      )
      return gunChain(user)
    },
    async radisk() {
      const {default: Radisk} = await import("gun/lib/radisk.js")
      const {default: rfs} = await import("gun/lib/rfs.js")
      const opt = {
        file: dir,
        // Gun's radisk waits 250ms before writing unless this is set.
        ...(process.env.GUN_UNTIL && {until: Number(process.env.GUN_UNTIL)}),
      }
      opt.store = rfs(opt)
      // Gun's store keeps a value and its state as {":": value, ">": state},
      // where holster's uses [value, state].
      return radiskAdapter(
        Radisk(opt),
        ([value, state]) => ({":": value, ">": state}),
        stored => stored && [stored[":"], stored[">"]],
      )
    },
  },
}

const open = () => adapters[lib][scenario.layer ?? "api"]()

const withTimeout = (promise, ms = PUT_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`No answer after ${ms}ms`)),
        ms,
      ).unref(),
    ),
  ])

// Tracks the highest memory use while the scenario runs.
function memorySampler() {
  const peak = {rss: 0, heapUsed: 0}
  const sample = () => {
    const {rss, heapUsed} = process.memoryUsage()
    peak.rss = Math.max(peak.rss, rss)
    peak.heapUsed = Math.max(peak.heapUsed, heapUsed)
  }
  const interval = setInterval(sample, 20)
  return () => {
    clearInterval(interval)
    sample()
    return peak
  }
}

async function diskUsage(folder) {
  let bytes = 0
  let files = 0
  for (const entry of await fs.readdir(folder, {withFileTypes: true})) {
    const entryPath = path.join(folder, entry.name)
    if (entry.isDirectory()) {
      const inner = await diskUsage(entryPath)
      bytes += inner.bytes
      files += inner.files
    } else {
      bytes += (await fs.stat(entryPath)).size
      files++
    }
  }
  return {bytes, files}
}

// The value at a percentile of sorted, in milliseconds.
const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]

async function write(db) {
  const latencies = []
  const errors = []
  const records = scenario.records()
  let count = 0

  // Each lane writes the next record as soon as its last one is
  // acknowledged, so concurrency writes are always in progress.
  const lane = async () => {
    for (let next = records.next(); !next.done; next = records.next()) {
      const [soul, data] = next.value
      const start = performance.now()
      try {
        await withTimeout(db.put(soul, data))
      } catch (err) {
        errors.push(err.message)
      }
      latencies.push(performance.now() - start)
      count++
    }
  }

  const stopSampling = memorySampler()
  const start = performance.now()
  await Promise.all(Array.from({length: scenario.concurrency}, lane))
  const totalMs = performance.now() - start
  const memory = stopSampling()

  latencies.sort((a, b) => a - b)
  return {
    writes: count,
    failures: errors.length,
    errors: [...new Set(errors)].slice(0, 5),
    totalMs,
    writesPerSecond: count / (totalMs / 1000),
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies[latencies.length - 1],
    },
    peakRss: memory.rss,
    peakHeapUsed: memory.heapUsed,
    disk: await diskUsage(dir),
  }
}

// Reads back each sampled record and counts those that match what was
// written. A node only needs to contain the expected properties.
async function verify(db) {
  const sample = scenario.verify()
  let matched = 0
  const mismatches = []
  for (const [soul, expected] of sample) {
    // A read that never answers counts as a missing record.
    const actual = await withTimeout(db.get(soul), READ_TIMEOUT_MS).catch(
      () => undefined,
    )
    const matches =
      scenario.layer === "radisk"
        ? isDeepStrictEqual(actual, expected)
        : !!actual &&
          Object.entries(expected).every(([key, value]) =>
            isDeepStrictEqual(actual[key], value),
          )
    if (matches) matched++
    else if (mismatches.length < 5) mismatches.push(soul)
  }
  return {matched, sampled: sample.length, mismatches}
}

const db = await open()
const result = mode === "write" ? await write(db) : await verify(db)
process.send(result, () => process.exit(0))

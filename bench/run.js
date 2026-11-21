// Measures how fast holster writes data to disk, and Gun for comparison.
// Each scenario runs in a fresh process, writing to a new data folder under
// bench/data, then a second process reads back a sample to check it all
// reached disk. Runs are repeated and the median of each measurement is
// reported, then saved to bench/results.
//
// Usage: npm run bench -- [--preset short] [--libs holster,gun]
//                         [--scenarios a,b] [--repeat 3] [--label name]
//                         [--gun-until ms] [--holster-batch n]
//                         [--holster-write ms] [--cpu list] [--keep]

import {execSync, fork} from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {scenarios} from "./scenarios.js"

const benchDir = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? fallback : args[at + 1]
}
// The short preset only has scenarios with many writes in flight at once,
// which is where Gun's batching does best.
const presets = {
  short: [
    "small-concurrent",
    "small-burst",
    "large-1kb-concurrent",
    "user-small-concurrent",
  ],
  all: Object.keys(scenarios),
}
const preset = option("preset", "all")
if (!presets[preset]) {
  console.error(
    `Unknown preset: ${preset}, use ${Object.keys(presets).join(" or ")}`,
  )
  process.exit(1)
}
// Gun waits 250ms before writing a batch by default. The short preset uses
// 1ms, which is Gun's fastest setting for these scenarios.
const gunUntil = option("gun-until", preset === "short" ? "1" : "")
// Holster's radisk flushes after 10,000 writes, or 1ms after the last one.
const holsterBatch = option("holster-batch", "")
const holsterWrite = option("holster-write", "")
// Runs every worker on these CPUs, using taskset's list format such as 0-3.
// On a CPU with cores of different speeds, a worker otherwise runs at
// whichever speed it's given. Give it more than one CPU, since node also
// uses threads for garbage collection and file writes.
const cpu = option("cpu", "")
const libs = option("libs", "holster,gun").split(",")
const names = option("scenarios", presets[preset].join(",")).split(",")
const repeat = Number(option("repeat", "3"))
const label = option("label", "")
const keep = args.includes("--keep")

for (const lib of libs) {
  if (lib !== "holster" && lib !== "gun") {
    console.error(`Unknown library: ${lib}, use holster or gun`)
    process.exit(1)
  }
}
for (const name of names) {
  if (!scenarios[name]) {
    console.error(`Unknown scenario: ${name}`)
    console.error(`Scenarios: ${Object.keys(scenarios).join(", ")}`)
    process.exit(1)
  }
}

// Runs worker.js in its own process, from inside the run's folder, since
// holster and Gun write their temporary files relative to the working
// directory.
const runWorker = (mode, lib, name, runDir) =>
  new Promise((resolve, reject) => {
    const child = fork(
      path.join(benchDir, "worker.js"),
      [mode, lib, name, path.join(runDir, "radata")],
      {
        cwd: runDir,
        stdio: ["ignore", "ignore", "pipe", "ipc"],
        // fork runs execPath with execArgv before the script, so this starts
        // the worker as taskset -c cpu node worker.js.
        ...(cpu && {
          execPath: "taskset",
          execArgv: ["-c", cpu, process.execPath],
        }),
        env: {
          ...process.env,
          GUN_UNTIL: gunUntil,
          HOLSTER_BATCH: holsterBatch,
          HOLSTER_WRITE: holsterWrite,
        },
      },
    )
    let stderr = ""
    let result = null
    child.stderr.on("data", data => (stderr += data))
    child.on("message", message => (result = message))
    child.on("exit", code => {
      if (result) resolve(result)
      else
        reject(
          new Error(`${mode} ${lib} ${name} exited with ${code}\n${stderr}`),
        )
    })
  })

const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

// The median of each measurement across a scenario's runs.
function summarise(runs) {
  const of = pick => median(runs.map(pick))
  return {
    writes: runs[0].writes,
    failures: Math.max(...runs.map(run => run.failures)),
    writesPerSecond: of(run => run.writesPerSecond),
    totalMs: of(run => run.totalMs),
    latencyMs: {
      p50: of(run => run.latencyMs.p50),
      p95: of(run => run.latencyMs.p95),
      p99: of(run => run.latencyMs.p99),
      max: of(run => run.latencyMs.max),
    },
    peakRss: of(run => run.peakRss),
    peakHeapUsed: of(run => run.peakHeapUsed),
    diskBytes: of(run => run.disk.bytes),
    diskFiles: of(run => run.disk.files),
    verified: `${Math.min(...runs.map(run => run.verify.matched))}/${runs[0].verify.sampled}`,
  }
}

const run = command => {
  try {
    return execSync(command, {cwd: benchDir, encoding: "utf8"}).trim()
  } catch {
    return null
  }
}

const version = file =>
  JSON.parse(run(`cat ${file}`) ?? '{"version": "unknown"}').version

function environment() {
  return {
    date: new Date().toISOString(),
    holster: version("../package.json"),
    gun: version("node_modules/gun/package.json"),
    commit: run("git rev-parse --short HEAD"),
    uncommittedChanges: !!run("git status --porcelain -- ../src"),
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    filesystem: run("df --output=fstype . | tail -1"),
    gunUntilMs: gunUntil ? Number(gunUntil) : 250,
    holsterBatch: holsterBatch ? Number(holsterBatch) : 10000,
    holsterWriteMs: holsterWrite ? Number(holsterWrite) : 1,
    pinnedCpu: cpu || "any",
  }
}

const mb = bytes => (bytes / 1024 ** 2).toFixed(1)
const ms = value => value.toFixed(2)

function printTable(results) {
  const rows = [
    [
      "scenario",
      "library",
      "writes/s",
      "total s",
      "p50 ms",
      "p95 ms",
      "p99 ms",
      "disk MB",
      "files",
      "peak RSS MB",
      "verified",
    ],
    ...Object.entries(results).flatMap(([name, byLib]) =>
      Object.entries(byLib).map(([lib, r]) => [
        name,
        lib,
        Math.round(r.writesPerSecond).toString(),
        (r.totalMs / 1000).toFixed(2),
        ms(r.latencyMs.p50),
        ms(r.latencyMs.p95),
        ms(r.latencyMs.p99),
        mb(r.diskBytes),
        r.diskFiles.toString(),
        mb(r.peakRss),
        r.verified + (r.failures ? ` (${r.failures} failed)` : ""),
      ]),
    ),
  ]
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map(row => row[i].length)),
  )
  for (const row of rows) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i])).join("  "))
  }
}

const env = environment()
console.log(
  `holster ${env.holster} (${env.commit}${env.uncommittedChanges ? ", with uncommitted changes" : ""}, ` +
    `batch ${env.holsterBatch}, ${env.holsterWriteMs}ms write delay), ` +
    `gun ${env.gun} (${env.gunUntilMs}ms write delay), node ${env.node}, ${env.cpu}` +
    `${cpu ? ` (pinned to CPU ${cpu})` : ""}, ` +
    `${env.filesystem ?? "unknown"} filesystem\n`,
)

const results = {}
const runs = {}
for (const name of names) {
  results[name] = {}
  runs[name] = {}
  for (const lib of libs) {
    runs[name][lib] = []
    for (let i = 1; i <= repeat; i++) {
      process.stdout.write(`${name} ${lib} run ${i}/${repeat}... `)
      const runDir = path.join(benchDir, "data", `${name}-${lib}-${i}`)
      await fs.rm(runDir, {recursive: true, force: true})
      await fs.mkdir(runDir, {recursive: true})

      const written = await runWorker("write", lib, name, runDir)
      written.verify = await runWorker("verify", lib, name, runDir)
      runs[name][lib].push(written)
      console.log(`${Math.round(written.writesPerSecond)} writes/s`)

      if (!keep) await fs.rm(runDir, {recursive: true, force: true})
    }
    results[name][lib] = summarise(runs[name][lib])
  }
}

console.log("")
printTable(results)

const file = path.join(
  benchDir,
  "results",
  `${env.date.replace(/[:.]/g, "-")}${label ? `-${label}` : ""}.json`,
)
await fs.mkdir(path.dirname(file), {recursive: true})
await fs.writeFile(
  file,
  JSON.stringify({environment: env, repeat, results, runs}, null, 2),
)
console.log(`\nSaved ${path.relative(process.cwd(), file)}`)

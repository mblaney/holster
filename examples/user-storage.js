#!/usr/bin/env node
// Displays per-user storage stats for a Holster relay with userLimit enabled.
// Usage: node examples/user-storage.js [dir] [--limit N] [--offset N]

import {readFileSync, existsSync} from "node:fs"

const args = process.argv.slice(2)
const dir = args.find(a => !a.startsWith("--")) || "."

if (!existsSync(dir)) {
  console.error(`Error: directory not found: ${dir}`)
  process.exit(1)
}

const getFlag = (name, defaultVal) => {
  const idx = args.indexOf(`--${name}`)
  if (idx === -1) return defaultVal
  const val = parseInt(args[idx + 1], 10)
  return isNaN(val) ? defaultVal : val
}

const limit = getFlag("limit", 10)
const offset = getFlag("offset", 0)

const readJSON = file => {
  try {
    return {data: JSON.parse(readFileSync(`${dir}/${file}`, "utf8"))}
  } catch (err) {
    if (err.code === "ENOENT") return {missing: true}
    return {error: err.message}
  }
}

const formatBytes = bytes => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1073741824).toFixed(1)} GB`
}

const DEFAULT_STORAGE_LIMIT = 1 // MB

const userStorage = readJSON(".user_storage.json")
const userLimit = readJSON(".user_limit.json")

console.log(`Per-user storage report for ./${dir}:`)

if (userStorage.missing) {
  console.log("  No user storage recorded yet.")
} else if (userStorage.error) {
  console.error(`  Error reading .user_storage.json: ${userStorage.error}`)
  process.exit(1)
}

if (userLimit.missing) {
  console.log("  No per-user limits defined.")
} else if (userLimit.error) {
  console.error(`  Error reading .user_limit.json: ${userLimit.error}`)
  process.exit(1)
}

const users = Object.entries(userStorage.data || {}).map(([pub, total]) => {
  return {pub, total}
}).sort((a, b) => b.total - a.total)

const page = users.slice(offset, offset + limit)

console.log(`  Total users: ${users.length}`)
if (page.length > 0) {
  console.log(`  Showing ${page.length} user${page.length !== 1 ? "s" : ""} (offset: ${offset}, limit: ${limit})`)
}

const data = userLimit.data || {}
for (const {pub, total} of page) {
  const pubLimit = typeof data[pub] === "number" ? data[pub] : DEFAULT_STORAGE_LIMIT
  const limitStr = pubLimit === 0 ? "0 B (blocked)" : formatBytes(pubLimit * 1048576)
  console.log(`  ${pub}`)
  console.log(`    used: ${formatBytes(total)} / limit: ${limitStr}`)
}

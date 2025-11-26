/**
 * Radisk - Persistent radix tree storage
 * Provides disk-backed radix tree with caching and batching
 */

import Radix from "./radix.js"
import type { RadixFunction } from "./schemas.js"
import * as utils from "./utils.js"
import type { EncodedValue, RadiskOptions, GraphValue, Relation } from "./schemas.js"

// ASCII character for end of text
const etx = String.fromCharCode(3)
// ASCII character for enquiry
const enq = String.fromCharCode(5)
// ASCII character for unit separator
const unit = String.fromCharCode(31)

export interface RadiskInterface extends RadixFunction {
  // Override call signature to support both get (with callback) and put (with value and optional callback)
  // Accepts GraphValue (raw values) OR EncodedValue (tuples) - see src/radisk.js and tests
  (key?: string, value?: GraphValue | EncodedValue | ((err?: string | null, value?: EncodedValue | Record<string, EncodedValue>) => void), cb?: (err?: string | null) => void): void
  
  batch: RadixFunction & {
    acks: Array<(err?: string | null) => void>
    ed: number
    timeout?: NodeJS.Timeout
  }
  thrash: {
    (): void
    at?: RadixFunction
    ing?: boolean
    more?: boolean
  }
  save: (rad: RadixFunction, cb: (err?: string | null) => void) => void
  write: (file: string, rad: RadixFunction, cb: (err?: string | null) => void) => void
  read: (key: string, cb: (err?: string | null, value?: EncodedValue | Record<string, EncodedValue>) => void) => void
  parse: (file: string, cb: (err?: string | null, disk?: RadixFunction) => void) => void
}

/**
 * Create a Radisk instance with persistent storage
 */
const Radisk = (opt: RadiskOptions) => {
  const cache = new Map<string, RadixFunction>()
  let fileListCache: string[] | null = null
  let fileListCacheTime = 0
  const FILE_LIST_CACHE_TTL = 10000

  const pendingReads = new Map<
    string,
    {
      callbacks: Array<(err?: string, result?: EncodedValue | Record<string, EncodedValue>) => void>
      fired: boolean
      timeoutId: NodeJS.Timeout | null
    }
  >()

  let lastMemoryCheck = 0
  const MEMORY_CHECK_INTERVAL = 30000
  const HEAP_WARNING_THRESHOLD = 0.8
  const HEAP_CLEANUP_THRESHOLD = 0.9

  const options = {
    log: opt.log || console.log,
    batch: opt.batch || 100,
    write: opt.write || 1,
    size: opt.size || 1024 * 1024,
    memoryLimit: opt.memoryLimit || 500,
    readTimeout: opt.readTimeout || 1000,
    cache: opt.cache !== undefined ? opt.cache : true,
    store: opt.store,
  }

  if (!options.store) {
    throw new Error("Radisk needs `store` interface with `{get: fn, put: fn, list: fn}`")
  }
  if (!options.store.get) {
    throw new Error("Radisk needs `store.get` interface with `(file, cb)`")
  }
  if (!options.store.put) {
    throw new Error("Radisk needs `store.put` interface with `(file, data, cb)`")
  }
  if (!options.store.list) {
    throw new Error("Radisk needs a streaming `store.list` interface with `(cb)`")
  }

  // After validation, store is guaranteed to be defined
  const store = options.store

  const perfLog = (operation: string, startTime: number, key: string, size?: number): void => {
    const duration = Date.now() - startTime
    if (duration > 2000) {
      console.log(
        `[RADISK-SLOW] ${operation}: ${duration}ms for ${key}${size ? ` (${size} bytes)` : ""}`
      )
    }
  }

  const checkMemoryUsage = (): void => {
    if (typeof process === "undefined" || !process.memoryUsage) return

    const now = Date.now()
    if (now - lastMemoryCheck < MEMORY_CHECK_INTERVAL) return
    lastMemoryCheck = now

    const memUsage = process.memoryUsage()
    const heapUsed = memUsage.heapUsed
    const maxHeapSize = options.memoryLimit * 1024 * 1024
    const heapUsageRatio = heapUsed / maxHeapSize

    if (heapUsageRatio > HEAP_CLEANUP_THRESHOLD) {
      const cacheSize = cache.size
      console.log(
        `[RADISK-MEMORY] High memory usage: ${Math.round(heapUsageRatio * 100)}% of heap limit. Clearing ${cacheSize} cached files.`
      )
      cache.clear()
      if ((global as { gc?: () => void }).gc) {
        (global as { gc: () => void }).gc()
      }
      lastMemoryCheck = now + MEMORY_CHECK_INTERVAL
    } else if (heapUsageRatio > HEAP_WARNING_THRESHOLD) {
      console.log(
        `[RADISK-MEMORY] Memory warning: ${Math.round(heapUsageRatio * 100)}% of heap limit used. Cache size: ${cache.size} files.`
      )
    }
  }

  const radisk = ((key?: string, value?: GraphValue | EncodedValue | ((err?: string | null, value?: EncodedValue | Record<string, EncodedValue>) => void), cb?: (err?: string | null) => void) => {
    if (typeof key !== "string") return undefined

    if (typeof value === "function") {
      const callback = value
      const batchValue = radisk.batch(key)
      if (typeof batchValue !== "undefined") {
        return callback(undefined, batchValue as EncodedValue)
      }

      if (radisk.thrash.at) {
        const thrashValue = radisk.thrash.at(key)
        if (typeof thrashValue !== "undefined") {
          return callback(undefined, thrashValue as EncodedValue)
        }
      }

      if (pendingReads.has(key)) {
        pendingReads.get(key)!.callbacks.push(callback)
        return
      }

      const pending: {
        callbacks: Array<(err?: string | null, value?: EncodedValue | Record<string, EncodedValue>) => void>
        fired: boolean
        timeoutId: NodeJS.Timeout | null
      } = { callbacks: [callback], fired: false, timeoutId: null }
      pendingReads.set(key, pending)

      pending.timeoutId = setTimeout(() => {
        if (!pending.fired) {
          pending.fired = true
          pendingReads.delete(key)
          const err = "radisk read timeout"
          pending.callbacks.forEach(cb => cb(err, undefined))
        }
      }, options.readTimeout)

      const readStart = Date.now()
      return radisk.read(key, (err, result) => {
        if (pending.timeoutId) clearTimeout(pending.timeoutId)
        perfLog("read", readStart, key)
        if (!pending.fired) {
          pending.fired = true
          pendingReads.delete(key)
          pending.callbacks.forEach(callback => callback(err, result))
        }
      })
    }

    radisk.batch(key, value as EncodedValue)
    checkMemoryUsage()
    if (cb) {
      radisk.batch.acks.push(cb)
    }
    if (++radisk.batch.ed >= options.batch) {
      return radisk.thrash()
    }

    clearTimeout(radisk.batch.timeout)
    radisk.batch.timeout = setTimeout(radisk.thrash, options.write)
    return undefined
  }) as unknown as RadiskInterface

  radisk.batch = Radix() as RadiskInterface["batch"]
  radisk.batch.acks = []
  radisk.batch.ed = 0

  radisk.thrash = (() => {
    if (radisk.thrash.ing) {
      radisk.thrash.more = true
      return
    }

    const thrashStart = Date.now()
    clearTimeout(radisk.batch.timeout)
    radisk.thrash.more = false
    radisk.thrash.ing = true
    const batch = (radisk.thrash.at = radisk.batch)
    radisk.batch = Radix() as RadiskInterface["batch"]
    radisk.batch.acks = []
    radisk.batch.ed = 0
    let i = 0
    radisk.save(batch, err => {
      if (++i > 1) return

      perfLog("thrash", thrashStart, `batch-${batch.ed}`)
      if (err) options.log(err)
      batch.acks.forEach(cb => cb(err))
      radisk.thrash.at = undefined
      radisk.thrash.ing = false
      if (radisk.thrash.more) radisk.thrash()
    })
  }) as RadiskInterface["thrash"]

  radisk.save = (rad, cb) => {
    const save = {
      find: (_tree: unknown, key: string): boolean | undefined => {
        if (key < (save.start || "")) return undefined
        save.start = key
        store.list(save.lex)
        return true
      },
      lex: (file?: string): void => {
        if (!file || file > (save.start || "")) {
          save.end = file
          if (save.start) save.mix(save.file || "!", save.start, save.end)
        } else {
          save.file = file
        }
      },
      mix: (file: string, start: string, end?: string): void => {
        save.start = save.end = save.file = undefined
        if (cache.has(file)) {
          const disk = cache.get(file)!
          Radix.map(rad, (value, key) => {
            if (key < start) return undefined
            if (end && end < key) {
              save.start = key
              return undefined
            }
            disk(key, value)
            return undefined
          })
          radisk.write(file, disk, save.next)
        } else {
          radisk.parse(file, (err, disk) => {
            if (err) return cb(err)
            Radix.map(rad, (value, key) => {
              if (key < start) return undefined
              if (end && end < key) {
                save.start = key
                return undefined
              }
              disk!(key, value)
              return undefined
            })
            radisk.write(file, disk!, save.next)
          })
        }
      },
      next: (err?: string | null): void => {
        if (err) return cb(err)
        if (save.start) {
          Radix.map(rad, save.find)
          return
        }
        cb(err)
      },
      start: undefined as string | undefined,
      end: undefined as string | undefined,
      file: undefined as string | undefined,
    }
    Radix.map(rad, save.find)
  }

  radisk.write = (file, rad, cb) => {
    const write = {
      text: "",
      limit: "",
      done: false,
      count: 0,
      sub: undefined as RadixFunction | undefined,
      each: (value: EncodedValue, _key: string, k: string, pre: string[]): void | boolean => {
        if (write.done) return
        write.count++
        const valueStr =
          typeof value === "undefined" ? "" : "=" + Radisk.encode(value)
        const enc =
          Radisk.encode(pre.length) + "#" + Radisk.encode(k) + valueStr + "\n"

        if (
          write.count > 1 &&
          pre.length === 0 &&
          write.text.length + enc.length > options.size
        ) {
          const endIdx = k.indexOf(enq)
          write.limit = endIdx === -1 ? k : k.substring(0, endIdx)
          if (write.limit !== file) {
            write.done = true
            write.sub = Radix()
            Radix.map(rad, write.slice)
            radisk.write(write.limit, write.sub, cb)
            return undefined
          }
        }
        write.text += enc
      },
      slice: (value: EncodedValue, key: string): void => {
        if (key < write.limit) return
        write.sub!(key, value)
      },
    }
    Radix.map(rad, write.each, true)
    const writeStart = Date.now()
    store.put(file, write.text, err => {
      perfLog("file-write", writeStart, file, write.text.length)
      cb(err)
    })
  }

  radisk.read = (key, cb) => {
    const endIdx = key.indexOf(enq)
    const soul = endIdx === -1 ? key : key.substring(0, endIdx)

    const read = {
      lex: (file?: string): void => {
        if (!file) {
          if (!read.file) {
            cb("no file found", undefined)
            return
          }

          if (options.cache && cache.has(read.file)) {
            const cachedRadix = cache.get(read.file)!
            read.value = cachedRadix(key) as EncodedValue | Record<string, EncodedValue> | undefined
            return cb(undefined, read.value)
          }

          radisk.parse(read.file, read.it)
          return
        }

        if (file > soul || file < (read.file || "")) return
        read.file = file
      },
      it: (err?: string | null, disk?: RadixFunction): void => {
        if (err) options.log(err)
        if (disk) {
          if (options.cache) {
            cache.set(read.file!, disk)
            checkMemoryUsage()
          }
          read.value = disk(key) as EncodedValue | Record<string, EncodedValue> | undefined
        }
        cb(err, read.value)
      },
      file: undefined as string | undefined,
      value: undefined as EncodedValue | Record<string, EncodedValue> | undefined,
    }

    const now = Date.now()
    if (
      options.cache &&
      fileListCache &&
      now - fileListCacheTime < FILE_LIST_CACHE_TTL
    ) {
      fileListCache.forEach(file => read.lex(file))
      read.lex()
    } else {
      const files: string[] = []
      const originalLex = read.lex
      read.lex = (file?: string): void => {
        if (file) files.push(file)
        return originalLex(file)
      }

      store.list((file?: string) => {
        read.lex(file)
        if (!file && options.cache) {
          fileListCache = files
          fileListCacheTime = now
        }
      })
    }
  }

  radisk.parse = (file, cb) => {
    const parse = {
      disk: Radix(),
      read: (err?: string | null, data?: string | EncodedValue | Record<string, unknown>): void => {
        if (err) return cb(err)
        if (!data) return cb(null, parse.disk)

        let pre: string[] = []
        let preString = ""
        let tmp = parse.split(data as string)
        while (tmp) {
          let key: string | undefined
          let value: EncodedValue | undefined
          const tmpVal = tmp[1]
          const i = typeof tmpVal === "number" ? tmpVal : (typeof tmpVal === "string" ? parseInt(tmpVal, 10) : 0)
          tmp = parse.split(tmp[2]) || ("" as never)
          if (tmp[0] === "#") {
            const tmpKey = tmp[1]
            key = typeof tmpKey === "string" ? tmpKey : String(tmpKey)
            if (i < pre.length) {
              pre.length = i
            }
            if (i <= pre.length) {
              pre[i] = key
              pre.length = i + 1
            }
            preString = pre.join("")
          }
          tmp = parse.split(tmp[2]) || ("" as never)
          if (tmp[0] === "\n") continue

          if (tmp[0] === "=") {
            value = tmp[1] as EncodedValue
          }
          if (typeof key !== "undefined" && typeof value !== "undefined") {
            parse.disk(preString, value)
          }
          tmp = parse.split(tmp[2])
        }
        cb(null, parse.disk)
      },
      split: (
        data: string
      ): [string, unknown, string] | undefined => {
        if (!data) return undefined

        const i = data.indexOf(unit)
        if (i === -1) return undefined

        const a = data.slice(0, i)
        const o: { i?: number } = {}
        return [a, Radisk.decode(data.slice(i), o), data.slice(i + o.i!)]
      },
    }
    store.get(file, parse.read)
  }

  // TypeScript can't verify all properties are added dynamically, but they are at runtime
  return radisk as unknown as RadiskInterface
}

/**
 * Encode value for storage
 */
Radisk.encode = (input: EncodedValue | GraphValue): string => {
  let state = ""
  let sig = ""
  let data: GraphValue
  
  if (Array.isArray(input) && (input.length === 2 || input.length === 3)) {
    // input is EncodedValue - extract the GraphValue and metadata
    state = etx + input[1]
    if (input.length === 3 && input[2]) {
      sig = etx + input[2]
    }
    data = input[0]!
  } else {
    // input is already a GraphValue
    data = input as GraphValue
  }

  if (typeof data === "string") {
    let i = 0
    let current: string | undefined = undefined
    let text = unit
    while ((current = data[i++])) {
      if (current === unit) text += unit
    }
    return text + '"' + data + state + sig + unit
  }

  const relId = utils.rel.is(data)
  if (relId) return unit + "#" + relId + state + sig + unit

  if (utils.num.is(data)) return unit + "+" + (data || 0) + state + sig + unit

  if (data === true) return unit + "+" + state + sig + unit

  if (data === false) return unit + "-" + state + sig + unit

  if (data === null) return unit + " " + state + sig + unit

  return undefined as never
}

/**
 * Decode value from storage
 */
Radisk.decode = (data: string, obj?: { i?: number }): EncodedValue | GraphValue | Relation | null | undefined => {
  let i = -1
  let n = 0
  let current: string | undefined = undefined
  let previous: string | undefined = undefined
  let textStart = -1
  let textEnd = -1
  if (data[0] !== unit) return undefined

  while ((current = data[++i])) {
    if (previous) {
      if (textStart === -1) textStart = i
      if (current === unit) {
        if (--n <= 0) {
          textEnd = i
          break
        }
      }
    } else if (current === unit) {
      n++
    } else {
      previous = current || "true"
    }
  }

  const text =
    textStart !== -1 ? data.slice(textStart, textEnd !== -1 ? textEnd : i) : ""

  if (obj) obj.i = i + 1

  const parts = text.split(etx)
  const value = parts[0]!
  const state = parts[1]
  const sig = parts[2]

  if (!state) {
    if (previous === '"') return text

    if (previous === "#") return utils.rel.ify(text)

    if (previous === "+") {
      if (text.length === 0) return true
      return parseFloat(text)
    }

    if (previous === "-") return false

    if (previous === " ") return null
  } else {
    const stateNum = parseFloat(state)
    if (sig) {
      if (previous === '"') return [value, stateNum, sig]

      if (previous === "#") return [utils.rel.ify(value), stateNum, sig]

      if (previous === "+") {
        if (value.length === 0) return [true, stateNum, sig]
        return [parseFloat(value), stateNum, sig]
      }

      if (previous === "-") return [false, stateNum, sig]

      if (previous === " ") return [null, stateNum, sig]
    } else {
      if (previous === '"') return [value, stateNum]

      if (previous === "#") return [utils.rel.ify(value), stateNum]

      if (previous === "+") {
        if (value.length === 0) return [true, stateNum]
        return [parseFloat(value), stateNum]
      }

      if (previous === "-") return [false, stateNum]

      if (previous === " ") return [null, stateNum]
    }
  }
  return undefined
}

export default Radisk


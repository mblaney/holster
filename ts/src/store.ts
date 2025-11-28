/**
 * Store - Storage interface for graph data
 * Provides get and put methods with filesystem or IndexedDB backend
 */

import Radisk from "./radisk.ts"
import Radix from "./radix.ts"
import * as utils from "./utils.ts"
import type {
  Lex,
  Graph,
  GraphNode,
  StoreOptions,
  FileSystemInterface,
  EncodedValue,
} from "./schemas.ts"

const isNode = typeof document === "undefined"

// Dynamic import for Node.js fs module - won't execute in browser/service worker
const fs = isNode
  ? await import(/*webpackIgnore: true*/ "node:fs")
  : undefined

// ASCII character for enquiry
const enq = String.fromCharCode(5)
// ASCII character for unit separator
const unit = String.fromCharCode(31)
// On-disk root node format
const root = unit + "+0" + unit + "#" + unit + '"root' + unit

/**
 * Create file system storage backend
 */
const fileSystem = (opt: StoreOptions): FileSystemInterface => {
  const dir = opt.file!

  if (isNode) {
    if (!fs!.existsSync(dir)) fs!.mkdirSync(dir)
    if (!fs!.existsSync(dir + "/!")) fs!.writeFileSync(dir + "/!", root)

    return {
      get: (file, cb) => {
        fs!.readFile(dir + "/" + file, (err: NodeJS.ErrnoException | null, data?: Buffer) => {
          if (err) {
            if ((err as { code?: string }).code === "ENOENT") {
              cb()
              return
            }
            console.log("fs.readFile error:", err)
          }
          const dataStr = data ? data.toString() : undefined
          cb(err as never, dataStr)
        })
      },
      put: (file, data, cb) => {
        const tmp = file + "." + utils.text.random(9) + ".tmp"
        fs!.writeFile(tmp, data as string, (err: NodeJS.ErrnoException | null) => {
          if (err) {
            console.log("fs.writeFile error:", err)
            cb(err as never)
            return
          }
          fs!.rename(tmp, dir + "/" + file, cb as never)
        })
      },
      list: cb => {
        fs!.readdir(dir, (err: NodeJS.ErrnoException | null, files?: string[]) => {
          if (err) {
            console.log("fs.readdir error:", err)
            cb()
            return
          }
          if (files) files.forEach(cb)
          cb()
        })
      },
    }
  }

  if (opt.indexedDB) {
    let db: IDBDatabase
    const dbReady = new Promise<void>((resolve, reject) => {
      const o = indexedDB.open(dir, 1)
      o.onupgradeneeded = event => {
        ;(event.target as IDBOpenDBRequest).result.createObjectStore(dir)
      }
      o.onerror = event => {
        console.log(event)
        reject(event)
      }
      o.onsuccess = () => {
        db = o.result
        if (db) {
          const tx = db.transaction([dir], "readonly")
          const req = tx.objectStore(dir).getKey("!")
          req.onerror = () => {
            console.log(`error getting key ${dir}/!`)
            reject(req.error)
          }
          req.onsuccess = () => {
            if (!req.result) {
              const tx = db.transaction([dir], "readwrite")
              const req = tx.objectStore(dir).put(root, "!")
              req.onerror = () => {
                console.log(`error putting root on ${dir}/!`)
                reject(req.error)
              }
              req.onsuccess = () => {
                resolve()
              }
            } else {
              resolve()
            }
          }
        } else {
          console.log("error indexedDB not available")
          reject(new Error("indexedDB not available"))
        }
      }
    })

    return {
      get: (file, cb) => {
        const _get = (file: string, cb: (err?: string | null, data?: string) => void) => {
          const tx = db.transaction([dir], "readonly")
          const req = tx.objectStore(dir).get(file)
          req.onerror = () => {
            console.log(`error getting ${dir}/${file}`)
          }
          req.onsuccess = () => {
            cb(null, req.result)
          }
        }

        dbReady
          .then(() => {
            _get(file, cb)
          })
          .catch(err => {
            cb(err as string)
          })
      },
      put: (file, data, cb) => {
        const _put = (
          file: string,
          data: string,
          cb: (err?: string | null) => void
        ) => {
          const tx = db.transaction([dir], "readwrite")
          const req = tx.objectStore(dir).put(data, file)
          req.onerror = () => {
            console.log(`error putting data on ${dir}/${file}`)
          }
          req.onsuccess = () => {
            cb(null)
          }
        }

        dbReady
          .then(() => {
            _put(file, data as string, cb)
          })
          .catch(err => {
            cb(err as string)
          })
      },
      list: cb => {
        const _list = (cb: (file?: string) => void) => {
          const tx = db.transaction([dir], "readonly")
          const req = tx.objectStore(dir).getAllKeys()
          req.onerror = () => console.log("error getting keys for", dir)
          req.onsuccess = () => {
            ;(req.result as string[]).forEach(cb)
            cb()
          }
        }

        dbReady
          .then(() => {
            _list(cb)
          })
          .catch(err => {
            console.log("error indexedDB not available:", err)
            cb()
          })
      },
    }
  }

  // No browser storage
  return {
    get: (_file, cb) => {
      cb(null, root)
    },
    put: (_file, _data, cb) => {
      cb(null)
    },
    list: cb => {
      cb("!")
      cb()
    },
  }
}

export interface StoreInterface {
  get: (
    lex: Lex,
    cb: (err?: string | null, graph?: Graph) => void,
    _opt?: { secure?: boolean }
  ) => void
  put: (graph: Graph, cb: (err?: string | null) => void) => void
}

/**
 * Create Store with get and put methods
 */
const Store = (opt?: StoreOptions): StoreInterface => {
  const options = opt || {}
  options.file = String(options.file || "radata")
  if (!options.store) options.store = fileSystem(options)
  const radisk = Radisk(options as never)

  return {
    get: (lex, cb, _opt) => {
      if (!lex || !utils.obj.is(lex)) {
        cb("lex required")
        return
      }
      if (!lex["#"]) {
        cb("soul required in lex")
        return
      }

      const opts = _opt || {}
      const soul = lex["#"]
      const key =
        !opts.secure && typeof lex["."] === "string" ? lex["."] : ""
      let node: GraphNode | undefined
      const signatures: Record<string, string> = {}

      const each = (value: EncodedValue, key: string): void => {
        // Always include userPublicKey for verification, regardless of filter
        if (key !== utils.userPublicKey && !utils.match(lex["."], key)) return

        if (!node) node = { _: { "#": soul, ">": {} } }
        node[key] = value[0]
        node._[">"][key] = value[1]
        // If signature is present, store it in _["s"]
        if (value.length === 3 && value[2]) {
          const state = value[1]
          signatures[state.toString()] = value[2]
          signatures[key] = value[2]
        }
      }

      radisk(soul + enq + key, (err, value) => {
        let graph: Graph | undefined
        if (utils.obj.is(value)) {
          Radix.map(value as never, each)
          if (!node) each(value as never, key)
          graph = { [soul]: node! }
        } else if (value) {
          each(value as EncodedValue, key)
          graph = { [soul]: node! }
        }
        // Only add _["s"] if we found any signatures
        if (graph && graph[soul] && Object.keys(signatures).length > 0) {
          graph[soul]._["s"] = signatures
        }
        cb(err, graph)
      })
    },
    put: (graph, cb) => {
      if (!graph) {
        cb("graph required")
        return
      }

      let count = 0
      let finished = false
      const ack = (err?: string | null): void => {
        count--
        if (finished) return

        if (err) {
          finished = true
          cb(err)
          return
        }

        if (count === 0) {
          finished = true
          cb(null)
        }
      }

      Object.keys(graph).forEach(soul => {
        const node = graph[soul]!
        Object.keys(node).forEach(key => {
          if (key === "_") return

          count++
          const value = node[key]!
          const state = node._[">"][key]!
          const sig = node._["s"] && node._["s"][state]
          const data: EncodedValue = sig
            ? [value, state, sig]
            : [value, state]
          radisk(soul + enq + key, data, ack)
        })
      })
    },
  }
}

export default Store


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

const isNode = typeof process !== "undefined" && process.versions?.node != null

// Dynamic import for Node.js fs module - won't execute in browser/service worker
const fs = isNode ? await import(/*webpackIgnore: true*/ "node:fs") : undefined

// ASCII character for enquiry
const enq = String.fromCharCode(5)
// ASCII character for unit separator
const unit = String.fromCharCode(31)
// On-disk root node format
const root = unit + "+0" + unit + "#" + unit + '"root' + unit

// File names come from souls, which can contain any character. Characters
// that can't be in a file name, or that would lead outside the data
// directory, are written as %XX, as are % itself, the names "." and "..",
// and a trailing dot or space.
const hex = (c: string): string =>
  "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")
const encodeName = (name: string): string => {
  if (name === "." || name === "..") return name.replace(/\./g, hex)
  return name.replace(/[%/\\<>:"|?*\x00-\x1F\x7F]/g, hex).replace(/[. ]$/, hex)
}
// Radisk compares file names with keys, so list gives them back decoded.
const decodeName = (name: string): string =>
  name.replace(/%([0-9A-F]{2})/g, (_match, code: string) =>
    String.fromCharCode(parseInt(code, 16)),
  )

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
        // Read synchronously: under heavy concurrent writes, the callback of
        // an async read's final close was sometimes never called, leaving
        // radisk reads waiting for its 30 second hang timeout. A file is at
        // most opt.size, so this only blocks for about a millisecond.
        let data: string
        try {
          data = fs!.readFileSync(dir + "/" + encodeName(file)).toString()
        } catch (err) {
          if ((err as {code?: string}).code === "ENOENT") {
            cb()
            return
          }
          console.log("fs.readFileSync error:", err)
          cb(err as never)
          return
        }
        cb(null, data)
      },
      put: (file, data, cb) => {
        file = encodeName(file)
        // Don't put tmp files under dir so that they're not listed.
        const tmp = file + "." + utils.text.random(9) + ".tmp"
        fs!.writeFile(
          tmp,
          data as string,
          (err: NodeJS.ErrnoException | null) => {
            if (err) {
              console.log("fs.writeFile error:", err)
              cb(err as never)
              return
            }
            fs!.rename(tmp, dir + "/" + file, cb as never)
          },
        )
      },
      list: cb => {
        fs!.readdir(
          dir,
          (err: NodeJS.ErrnoException | null, files?: string[]) => {
            if (err) {
              console.log("fs.readdir error:", err)
              cb()
              return
            }
            if (files) files.forEach(file => cb(decodeName(file)))
            cb()
          },
        )
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
        const _get = (
          file: string,
          cb: (err?: string | null, data?: string) => void,
        ) => {
          const tx = db.transaction([dir], "readonly")
          const req = tx.objectStore(dir).get(file)
          req.onerror = () => {
            console.log(`error getting ${dir}/${file}`)
            cb(req.error as unknown as string)
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
          cb: (err?: string | null) => void,
        ) => {
          const tx = db.transaction([dir], "readwrite")
          const req = tx.objectStore(dir).put(data, file)
          req.onerror = () => {
            console.log(`error putting data on ${dir}/${file}`)
            cb(req.error as unknown as string)
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
          req.onerror = () => {
            console.log("error getting keys for", dir)
            cb()
          }
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
  get: (lex: Lex, cb: (err?: string | null, graph?: Graph) => void) => void
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
    get: (lex, cb) => {
      if (!lex || !utils.obj.is(lex)) {
        cb("lex required")
        return
      }
      if (!lex["#"]) {
        cb("soul required in lex")
        return
      }

      const soul = lex["#"]
      const key = typeof lex["."] === "string" ? lex["."] : ""
      let node: GraphNode | undefined
      const signatures: Record<string, string> = {}

      const each = (value: EncodedValue, k: string): void => {
        if (k !== utils.userPublicKey && !utils.match(lex["."], k)) return

        if (!node) node = {_: {"#": soul, ">": {}}}
        node[k] = value[0]
        node._[">"][k] = value[1]
        // Each property is stored with its own signature, which is either a
        // property signature or, for older data, a timestamp signature. Only
        // clients accept timestamp signatures (see SEA.verifyProperties).
        if (value.length === 3 && value[2]) signatures[k] = value[2]
      }

      // When doing a targeted property lookup, also fetch userPublicKey in
      // parallel so ham.js can verify signatures regardless of secure mode.
      // Full-soul scans (key="") already surface it via Radix.map.
      const needsPubKey = key !== "" && key !== utils.userPublicKey
      let pending = needsPubKey ? 2 : 1
      let cbErr: string | null = null
      const finish = (err: string | null | undefined): void => {
        if (err && !cbErr) cbErr = err
        if (--pending > 0) return
        const graph: Graph = {[soul]: node!}
        if (node && Object.keys(signatures).length > 0) node._.s = signatures
        cb(cbErr, graph)
      }

      radisk(soul + enq + key, (err, value) => {
        if (utils.obj.is(value)) {
          Radix.map(value as never, each)
        } else if (value) {
          each(value as EncodedValue, key)
        }
        finish(err)
      })

      if (needsPubKey) {
        radisk(soul + enq + utils.userPublicKey, (err, value) => {
          if (value && !utils.obj.is(value))
            each(value as EncodedValue, utils.userPublicKey)
          finish(err)
        })
      }
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
          const sig = utils.obj.own(node._.s, key)
          const data: EncodedValue = sig ? [value, state, sig] : [value, state]
          radisk(soul + enq + key, data, ack)
        })
      })
    },
  }
}

export {fileSystem, encodeName, decodeName}
export default Store

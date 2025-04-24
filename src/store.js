const jsEnv = require("browser-or-node")
const Radisk = require("./radisk")
const Radix = require("./radix")
const utils = require("./utils")

// ASCII character for enquiry.
const enq = String.fromCharCode(5)
// ASCII character for unit separator.
const unit = String.fromCharCode(31)
// On-disk root node format.
const root = unit + "+0" + unit + "#" + unit + '"root' + unit

const fileSystem = opt => {
  const dir = opt.file

  if (jsEnv.isNode) {
    const fs = require("fs")
    if (!fs.existsSync(dir)) fs.mkdirSync(dir)
    if (!fs.existsSync(dir + "/!")) fs.writeFileSync(dir + "/!", root)

    return {
      get: (file, cb) => {
        fs.readFile(dir + "/" + file, (err, data) => {
          if (err) {
            if (err.code === "ENOENT") {
              cb()
              return
            }

            console.log("fs.readFile error:", err)
          }
          if (data) data = data.toString()
          cb(err, data)
        })
      },
      put: (file, data, cb) => {
        var random = Math.random().toString(36).slice(-9)
        // Don't put tmp files under dir so that they're not listed.
        var tmp = file + "." + random + ".tmp"
        fs.writeFile(tmp, data, err => {
          if (err) {
            cb(err)
            return
          }

          fs.rename(tmp, dir + "/" + file, cb)
        })
      },
      list: cb => {
        fs.readdir(dir, (err, files) => {
          files.forEach(cb)
          cb()
        })
      },
    }
  }

  if (opt.indexedDB) {
    let db
    const o = indexedDB.open(dir, 1)
    o.onupgradeneeded = event => {
      event.target.result.createObjectStore(dir)
    }
    o.onerror = event => {
      console.log(event)
    }
    o.onsuccess = () => {
      db = o.result
      // Create the root node if it doesn't exist.
      if (db) {
        const tx = db.transaction([dir], "readonly")
        const req = tx.objectStore(dir).getKey("!")
        req.onerror = () => {
          console.log(`error getting key ${dir}/!`)
        }
        req.onsuccess = () => {
          if (!req.result) {
            const tx = db.transaction([dir], "readwrite")
            const req = tx.objectStore(dir).put(root, "!")
            req.onerror = () => {
              console.log(`error putting root on ${dir}/!`)
            }
          }
        }
      } else {
        console.log("error indexedDB not available")
      }
    }

    return {
      get: (file, cb) => {
        if (db) {
          const tx = db.transaction([dir], "readonly")
          const req = tx.objectStore(dir).get(file)
          req.onerror = () => {
            console.log(`error getting ${dir}/${file}`)
          }
          req.onsuccess = () => {
            cb(null, req.result)
          }
        } else {
          cb("error indexedDB not available")
        }
      },
      put: (file, data, cb) => {
        if (db) {
          const tx = db.transaction([dir], "readwrite")
          const req = tx.objectStore(dir).put(data, file)
          req.onerror = () => {
            console.log(`error putting data on ${dir}/${file}`)
          }
          req.onsuccess = () => {
            cb(null)
          }
        } else {
          cb("error indexedDB not available")
        }
      },
      list: cb => {
        if (db) {
          const tx = db.transaction([dir], "readonly")
          const req = tx.objectStore(dir).getAllKeys()
          req.onerror = () => console.log("error getting keys for", dir)
          req.onsuccess = () => {
            req.result.forEach(cb)
            cb()
          }
        } else {
          console.log("error indexedDB not available")
          cb()
        }
      },
    }
  }

  // No browser storage.
  return {
    get: (file, cb) => {
      cb(null, root)
    },
    put: (file, data, cb) => {
      cb(null)
    },
    list: cb => {
      cb("!")
      cb()
    },
  }
}

// Store provides get and put methods that can access radisk.
const Store = opt => {
  if (!utils.obj.is(opt)) opt = {}
  opt.file = String(opt.file || "radata")
  if (!opt.store) opt.store = fileSystem(opt)
  const radisk = Radisk(opt)

  return {
    get: (lex, cb) => {
      if (!lex) {
        cb("lex required")
        return
      }

      var soul = lex["#"]
      var key = lex["."] || ""
      var node
      const each = (value, key) => {
        if (!node) node = {_: {"#": soul, ">": {}}}
        node[key] = value[0]
        node._[">"][key] = value[1]
      }

      radisk(soul + enq + key, (err, value) => {
        let graph
        if (utils.obj.is(value)) {
          Radix.map(value, each)
          if (!node) each(value, key)
          graph = {[soul]: node}
        } else if (value) {
          each(value, key)
          graph = {[soul]: node}
        }
        cb(err, graph)
      })
    },
    put: (graph, cb) => {
      if (!graph) {
        cb("graph required")
        return
      }

      var count = 0
      const ack = err => {
        count--
        if (ack.err) return

        ack.err = err
        if (ack.err) {
          cb(ack.err)
          return
        }

        if (count === 0) cb(null)
      }

      Object.keys(graph).forEach(soul => {
        var node = graph[soul]
        Object.keys(node).forEach(key => {
          if (key === "_") return

          count++
          let value = node[key]
          let state = node._[">"][key]
          radisk(soul + enq + key, [value, state], ack)
        })
      })
    },
  }
}

module.exports = Store

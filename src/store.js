const jsEnv = require("browser-or-node")
const Radisk = require("./radisk")
const Radix = require("./radix")
const utils = require("./utils")

const fileSystem = dir => {
  if (jsEnv.isNode) {
    const fs = require("fs")
    if (!fs.existsSync(dir)) fs.mkdirSync(dir)

    return {
      get: (file, cb) => {
        fs.readFile(dir + "/" + file, (err, data) => {
          if (err) {
            if (err.code === "ENOENT") {
              cb()
              return
            }

            console.log("ERROR:", err)
          }
          if (data) data = data.toString()
          cb(err, data)
        })
      },
      put: (file, data, cb) => {
        var random = Math.random().toString(36).slice(-9)
        // Don't put tmp files under dir so that they're not listed.
        var tmp = file + "." + random + ".tmp"
        fs.writeFile(tmp, data, (err, ok) => {
          if (err) {
            cb(err)
            return
          }

          fs.rename(tmp, dir + "/" + file, cb)
        })
      },
      list: cb => {
        fs.readdir(dir, (err, dir) => {
          dir.forEach(cb)
          cb()
        })
      },
    }
  }

  // TODO: Add indexedDB
  return {
    get: (file, cb) => cb(),
    put: (file, data, cb) => cb(),
    list: cb => cb(),
  }
}

const Store = opt => {
  if (!utils.obj.is(opt)) opt = {}
  opt.file = String(opt.file || "radata")
  if (!opt.store) opt.store = fileSystem(opt.file)
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
        var data = JSON.parse(value)
        if (!node) node = {_: {"#": soul, ">": {}}}
        node[key] = data[0]
        node._[">"][key] = data[1]
      }

      radisk(soul + "." + key, (err, value) => {
        let graph
        if (value) {
          Radix.map(value, each)
          if (!node) each(value, key)
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
      const ack = (err, ok) => {
        count--
        if (ack.err) return

        if ((ack.err = err)) {
          cb(err || "ERROR!")
          return
        }

        if (count > 0) return

        cb(ack.err, 1)
      }

      Object.keys(graph).forEach(soul => {
        var node = graph[soul]
        Object.keys(node).forEach(key => {
          if ("_" === key) return

          count++
          let value = node[key]
          let state = node._[">"][key]
          radisk(soul + "." + key, JSON.stringify([value, state]), ack)
        })
      })
    },
  }
}

module.exports = Store

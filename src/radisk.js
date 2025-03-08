const Radix = require("./radix")
const utils = require("./utils")

// ASCII character for unit separator.
const unit = String.fromCharCode(31)

const Radisk = opt => {
  var u
  var cache = null

  if (!opt) opt = {}
  if (!opt.log) opt.log = console.log
  if (!opt.batch) opt.batch = 10 * 1000
  if (!opt.wait) opt.wait = 1
  if (!opt.size) opt.size = 1024 * 1024 // 1MB
  if (!opt.code) opt.code = "!" // The first printable character
  if (!opt.store) {
    opt.log(
      "Radisk needs `store` interface with `{get: fn, put: fn, list: fn}`",
    )
    return
  }
  if (!opt.store.get) {
    opt.log("Radisk needs `store.get` interface with `(file, cb)`")
    return
  }
  if (!opt.store.put) {
    opt.log("Radisk needs `store.put` interface with `(file, data, cb)`")
    return
  }
  if (!opt.store.list) {
    opt.log("Radisk needs a streaming `store.list` interface with `(cb)`")
    return
  }

  /*
		Any and all storage adapters should...
		1. Because writing to disk takes time, we should batch data to disk.
       This improves performance, and reduces potential disk corruption.
		2. If a batch exceeds a certain number of writes, we should immediately
       write to disk when physically possible. This caps total performance,
       but reduces potential loss.
	*/
  const radisk = (key, value, cb) => {
    key = "" + key

    // If no value is provided then the second parameter is the callback
    // function. Read value from memory or disk and call callback with it.
    if (typeof value === "function") {
      cb = value
      value = radisk.batch(key)
      if (typeof value !== "undefined") {
        return cb(u, value)
      }

      if (radisk.thrash.at) {
        value = radisk.thrash.at(key)
        if (typeof value !== "undefined") {
          return cb(u, value)
        }
      }

      return radisk.read(key, cb)
    }

    // Otherwise store the value provided.
    radisk.batch(key, value)
    if (cb) {
      radisk.batch.acks.push(cb)
    }
    // Don't wait if we have batched too many.
    if (++radisk.batch.ed >= opt.batch) {
      return radisk.thrash()
    }

    // Otherwise wait for more updates before writing.
    clearTimeout(radisk.batch.timeout)
    radisk.batch.timeout = setTimeout(radisk.thrash, opt.wait)
  }

  radisk.batch = Radix()
  radisk.batch.acks = []
  radisk.batch.ed = 0

  radisk.thrash = () => {
    if (radisk.thrash.ing) {
      return (radisk.thrash.more = true)
    }

    clearTimeout(radisk.batch.timeout)
    radisk.thrash.more = false
    radisk.thrash.ing = true
    var batch = (radisk.thrash.at = radisk.batch)
    radisk.batch = null
    radisk.batch = Radix()
    radisk.batch.acks = []
    radisk.batch.ed = 0
    let i = 0
    radisk.save(batch, (err, ok) => {
      // This is to ignore multiple callbacks from radisk.save calling
      // radisk.write? It looks like multiple callbacks will be made if a
      // file needs to be split.
      if (++i > 1) return

      if (err) opt.log(err)
      batch.acks.forEach(cb => cb(err, ok))
      radisk.thrash.at = null
      radisk.thrash.ing = false
      if (radisk.thrash.more) radisk.thrash()
    })
  }

  /*
		1. Find the first radix item in memory
		2. Use that as the starting index in the directory of files
		3. Find the first file that is lexically larger than it
		4. Read the previous file into memory
		5. Scan through in memory radix for all values lexically less than the limit
		6. Merge and write all of those to the in-memory file and back to disk
		7. If file is to large then split. More details needed here
	*/
  radisk.save = (rad, cb) => {
    const save = {
      find: (tree, key) => {
        // This is false for any key until save.start is set to an initial key.
        if (key < save.start) return

        save.start = key
        opt.store.list(save.lex)
        return true
      },
      lex: file => {
        if (!file || file > save.start) {
          save.end = file
          save.mix(save.file || opt.code, save.start, save.end)
          return true
        }

        save.file = file
      },
      mix: (file, start, end) => {
        save.start = save.end = save.file = u
        radisk.parse(file, (err, disk) => {
          if (err) return cb(err)

          Radix.map(rad, (value, key) => {
            if (key < start) return

            if (end && end < key) {
              save.start = key
              return save.start
            }

            disk(key, value)
          })
          radisk.write(file, disk, save.next)
        })
      },
      next: (err, ok) => {
        if (err) return cb(err)

        if (save.start) return Radix.map(rad, save.find)

        cb(err, ok)
      },
    }
    Radix.map(rad, save.find)
  }

  /*
		Any storage engine at some point will have to do a read in order to write.
		This is true of even systems that use an append only log, if they support
    updates. Therefore it is unavoidable that a read will have to happen, the
		question is just how long you delay it.
	*/
  radisk.write = (file, rad, cb) => {
    // Invalidate cache on write.
    cache = null
    const write = {
      text: "",
      count: 0,
      file: file,
      each: (value, key, k, pre) => {
        write.count++
        var enc =
          Radisk.encode(pre.length) +
          "#" +
          Radisk.encode(k) +
          (typeof value === "undefined" ? "" : "=" + Radisk.encode(value)) +
          "\n"
        // Cannot split the file if only have one entry to write.
        if (write.count > 1 && write.text.length + enc.length > opt.size) {
          write.text = ""
          // Otherwise split the entries in half.
          write.limit = Math.ceil(write.count / 2)
          write.count = 0
          write.sub = Radix()
          Radix.map(rad, write.slice)
          return true
        }

        write.text += enc
      },
      put: () => {
        opt.store.put(file, write.text, cb)
      },
      slice: (value, key) => {
        if (key < write.file) return

        if (++write.count > write.limit) {
          var name = write.file
          // Use only the soul of the key as the filename so that all
          // properties of a soul are written to the same file.
          let end = key.indexOf(".")
          if (end === -1) {
            write.file = key
          } else {
            write.file = key.substring(0, end)
          }
          write.count = 0
          radisk.write(name, write.sub, write.next)
          return true
        }

        write.sub(key, value)
      },
      next: err => {
        if (err) return cb(err)

        write.sub = Radix()
        if (!Radix.map(rad, write.slice)) {
          radisk.write(write.file, write.sub, cb)
        }
      },
    }
    // If Radix.map doesn't return true when called with write.each as a
    // callback then didn't need to split the data. The accumulated write.text
    // can then be stored with write.put().
    if (!Radix.map(rad, write.each, true)) write.put()
  }

  radisk.read = (key, cb) => {
    if (cache) {
      let value = cache(key)
      if (typeof value !== "undefined") return cb(u, value)
    }

    const read = {
      lex: file => {
        // store.list should call lex without a file last, which means no
        // file was found that was greater than key. That means the current
        // read.file is the right place to read the key.
        if (!file || file > key) {
          if (!read.file) {
            cb("no file found", u)
            return
          }

          if (read.ing) return

          read.ing = true
          radisk.parse(read.file, read.it)
          return
        }

        read.file = file
      },
      it: (err, disk) => {
        if (err) opt.log(err)
        if (disk) {
          cache = disk
          read.value = disk(key)
        }
        cb(err, read.value)
      },
    }
    opt.store.list(read.lex)
  }

  /*
		Let us start by assuming we are the only process that is
		changing the directory or bucket. Not because we do not want
		to be multi-process/machine, but because we want to experiment
		with how much performance and scale we can get out of only one.
		Then we can work on the harder problem of being multi-process.
	*/
  radisk.parse = (file, cb) => {
    const parse = {
      disk: Radix(),
      read: (err, data) => {
        if (err) return cb(err)

        if (!data) return cb(u, parse.disk)

        let pre = []
        let tmp = parse.split(data)
        while (tmp) {
          let key
          let value
          let i = tmp[1]
          tmp = parse.split(tmp[2]) || ""
          if (tmp[0] === "#") {
            key = tmp[1]
            pre = pre.slice(0, i)
            if (i <= pre.length) pre.push(key)
          }
          tmp = parse.split(tmp[2]) || ""
          if (tmp[0] === "\n") continue

          if (tmp[0] === "=") value = tmp[1]
          if (typeof key !== "undefined" && typeof value !== "undefined") {
            parse.disk(pre.join(""), value)
          }
          tmp = parse.split(tmp[2])
        }
        cb(u, parse.disk)
      },
      split: data => {
        if (!data) return

        let i = -1
        let a = ""
        let c = null
        while ((c = data[++i])) {
          if (c === unit) break

          a += c
        }
        let o = {}
        if (c) {
          return [a, Radisk.decode(data.slice(i), o), data.slice(i + o.i)]
        }
      },
    }
    opt.store.get(file, parse.read)
  }

  return radisk
}

Radisk.encode = data => {
  if (typeof data == "string") {
    let i = 0
    let current = null
    let text = unit
    while ((current = data[i++])) {
      if (current === unit) text += unit
    }
    return text + '"' + data + unit
  }

  let tmp = null
  if (data && data["#"] && (tmp = utils.rel.is(data)))
    return unit + "#" + tmp + unit

  if (utils.num.is(data)) return unit + "+" + (data || 0) + unit

  if (data === null) return unit + " " + unit

  if (data === true) return unit + "+" + unit

  if (data === false) return unit + "-" + unit
}

Radisk.decode = (data, obj) => {
  var text = ""
  var i = -1
  var n = 0
  var current = null
  var previous = null
  if (data[0] !== unit) return

  // Find a control character previous to the text we want, skipping
  // consecutive unit separator characters at the beginning of the data.
  while ((current = data[++i])) {
    if (previous) {
      if (current === unit) {
        if (--n <= 0) break
      }
      text += current
    } else if (current === unit) {
      n++
    } else {
      previous = current || true
    }
  }

  if (obj) obj.i = i + 1

  if (previous === '"') return text

  if (previous === "#") return utils.rel.ify(text)

  if (previous === "+") {
    if (text.length === 0) return true

    return parseFloat(text)
  }

  if (previous === " ") return null

  if (previous === "-") return false
}

module.exports = Radisk

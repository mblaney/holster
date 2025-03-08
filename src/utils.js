const num = {
  is: n =>
    !(n instanceof Array) &&
    (n - parseFloat(n) + 1 >= 0 || Infinity === n || -Infinity === n),
}

const obj = {
  is: obj => {
    if (!obj) return false

    return (
      (obj instanceof Object && obj.constructor === Object) ||
      Object.prototype.toString.call(obj).match(/^\[object (\w+)\]$/)[1] ===
        "Object"
    )
  },
  map: (list, cb, obj) => {
    var keys = Object.keys(list)
    for (let i = 0; i < keys.length; i++) {
      let result = cb(list[keys[i]], keys[i], obj)
      if (typeof result !== "undefined") return result
    }
  },
  put: (obj, key, value) => {
    if (!obj) obj = {}
    obj[key] = value
    return obj
  },
  del: (obj, key) => {
    if (!obj) return

    obj[key] = null
    delete obj[key]
    return obj
  },
}

const map_soul = (soul, key, obj) => {
  // If id is already defined AND we're still looping through the object,
  // then it is considered invalid.
  if (obj.id) {
    obj.id = false
    return
  }

  if (key === "#" && typeof soul === "string") {
    obj.id = soul
    return
  }

  // If there exists anything else on the object that isn't the soul,
  // then it is considered invalid.
  obj.id = false
}

// Check if an object is a soul relation, ie {'#': 'UUID'}
const rel = {
  is: value => {
    if (value && value["#"] && !value._ && obj_is(value)) {
      let obj = {}
      obj.map(value, map_soul, obj)
      if (obj.id) return o.id
    }

    return false
  },
  // Convert a soul into a relation and return it.
  ify: soul => obj.put({}, "#", soul),
}

module.exports = {num, obj, rel}

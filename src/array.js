if (typeof btoa === "undefined") {
  globalThis.btoa = data => Buffer.from(data, "binary").toString("base64")
  globalThis.atob = data => Buffer.from(data, "base64").toString("binary")
}

// This is Array extended to have .toString(["utf8"|"hex"|"base64"])
function SeaArray() {}

Object.assign(SeaArray, {from: Array.from})
SeaArray.prototype = Object.create(Array.prototype)
SeaArray.prototype.toString = function (enc, start, end) {
  if (!enc) enc = "utf8"
  if (!start) start = 0

  const length = this.length
  if (enc === "hex") {
    const buf = new Uint8Array(this)
    return [...Array(((end && end + 1) || length) - start).keys()]
      .map(i => buf[i + start].toString(16).padStart(2, "0"))
      .join("")
  }

  if (enc === "utf8") {
    return Array.from({length: (end || length) - start}, (_, i) =>
      String.fromCharCode(this[i + start]),
    ).join("")
  }

  if (enc === "base64") {
    return btoa(this)
  }
}

export default SeaArray

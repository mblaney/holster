import SeaArray from "./array.js"

// This is Buffer implementation used in SEA. Functionality is mostly
// compatible with NodeJS "safe-buffer" and is used for encoding conversions
// between binary and "hex" | "utf8" | "base64"
// See documentation and validation for safe implementation in:
// https://github.com/feross/safe-buffer#update
function SafeBuffer(...props) {
  console.warn("new SafeBuffer() is deprecated, please use SafeBuffer.from()")
  return SafeBuffer.from(...props)
}

SafeBuffer.prototype = Object.create(Array.prototype)
Object.assign(SafeBuffer, {
  // (data, enc) where typeof data === "string" then
  // enc === "utf8"|"hex"|"base64"
  from() {
    if (!Object.keys(arguments).length || arguments[0] == null) {
      throw new TypeError(
        "First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.",
      )
    }
    const input = arguments[0]
    let buf
    if (typeof input === "string") {
      const enc = arguments[1] || "utf8"
      if (enc === "hex") {
        const bytes = input
          .match(/([\da-fA-F]{2})/g)
          .map(byte => parseInt(byte, 16))
        if (!bytes || !bytes.length) {
          throw new TypeError("Invalid first argument for type 'hex'.")
        }
        buf = SeaArray.from(bytes)
      } else if (enc === "utf8" || enc === "binary") {
        const length = input.length
        const words = new Uint16Array(length)
        Array.from({length: length}, (_, i) => (words[i] = input.charCodeAt(i)))
        buf = SeaArray.from(words)
      } else if (enc === "base64") {
        const dec = atob(input)
        const length = dec.length
        const bytes = new Uint8Array(length)
        Array.from({length: length}, (_, i) => (bytes[i] = dec.charCodeAt(i)))
        buf = SeaArray.from(bytes)
      } else {
        console.info("SafeBuffer.from unknown encoding: " + enc)
      }
      return buf
    }
    const length = input.byteLength ? input.byteLength : input.length
    if (length) {
      let buf
      if (input instanceof ArrayBuffer) {
        buf = new Uint8Array(input)
      }
      const check = SeaArray.from(buf || input)
      return check
    }
  },
  // This is "safe-buffer.alloc" sans encoding support
  alloc(length, fill = 0) {
    return SeaArray.from(
      new Uint8Array(Array.from({length: length}, () => fill)),
    )
  },
  // This puts together array of array like members
  concat(arr) {
    // octet array
    if (!Array.isArray(arr)) {
      throw new TypeError(
        "First argument must be Array containing ArrayBuffer or Uint8Array instances.",
      )
    }
    return SeaArray.from(
      arr.reduce((ret, item) => ret.concat(Array.from(item)), []),
    )
  },
})
SafeBuffer.prototype.from = SafeBuffer.from
SafeBuffer.prototype.toString = SeaArray.prototype.toString

export default SafeBuffer

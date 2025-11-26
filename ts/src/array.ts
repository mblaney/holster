/**
 * SeaArray - Extended Array with custom toString for encoding support
 * Supports utf8, hex, and base64 encoding
 */

if (typeof btoa === "undefined") {
  globalThis.btoa = (data: string): string =>
    Buffer.from(data, "binary").toString("base64")
  globalThis.atob = (data: string): string =>
    Buffer.from(data, "base64").toString("binary")
}

type Encoding = "utf8" | "hex" | "base64"

/**
 * SeaArray extends Array to provide encoding capabilities
 */
class SeaArray extends Array<number> {
  /**
   * Convert array to string with specified encoding
   * @param enc - Encoding type (utf8, hex, or base64)
   * @param start - Start index (default: 0)
   * @param end - End index (default: array length)
   */
  override toString(enc?: Encoding, start?: number, end?: number): string {
    const encoding = enc || "utf8"
    const startIdx = start || 0
    const endIdx = end ? Math.min(Math.max(end, startIdx), this.length) : this.length

    if (encoding === "hex") {
      const buf = new Uint8Array(this.slice(startIdx, endIdx))
      return Array.from(buf, byte => byte.toString(16).padStart(2, "0")).join("")
    }

    if (encoding === "utf8") {
      return Array.from({ length: endIdx - startIdx }, (_, i) => {
        const charCode = this[i + startIdx]
        // Use unicode replacement character for invalid character codes
        if (
          charCode === undefined ||
          charCode < 0 ||
          charCode > 0x10ffff
        ) {
          return String.fromCharCode(0xfffd)
        }
        return String.fromCharCode(charCode)
      }).join("")
    }

    if (encoding === "base64") {
      const utf8String = Array.from({ length: endIdx - startIdx }, (_, i) => {
        const charCode = this[i + startIdx]
        if (charCode === undefined || charCode < 0 || charCode > 255) {
          return String.fromCharCode(0xfffd)
        }
        return String.fromCharCode(charCode)
      }).join("")
      return btoa(utf8String)
    }

    // Default to utf8
    return this.toString("utf8", startIdx, endIdx)
  }

  /**
   * Create SeaArray from iterable or array-like
   */
  static override from<T>(
    arrayLike: ArrayLike<T> | Iterable<T>
  ): SeaArray {
    const arr = Array.from(arrayLike) as number[]
    const seaArray = new SeaArray(...arr)
    return seaArray
  }
}

export default SeaArray


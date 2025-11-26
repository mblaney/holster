/**
 * SafeBuffer - Secure Buffer implementation with validation
 * Compatible with Node.js Buffer API but with enhanced security checks
 */

import SeaArray from "./array.js"

type Encoding = "utf8" | "utf-8" | "hex" | "base64" | "binary" | "latin1" | "ascii"

// Security constants
const SECURITY_LIMITS = {
  MAX_BUFFER_SIZE: 10 * 1024 * 1024, // 10MB limit
  MAX_STRING_LENGTH: 1024 * 1024, // 1MB string limit
}

// Type definition for SafeBuffer static interface
interface SafeBufferConstructor {
  (...props: unknown[]): SeaArray
  prototype: typeof Array.prototype
  from(input: string, encoding?: Encoding): SeaArray
  from(input: ArrayBuffer | ArrayBufferView | number[]): SeaArray
  from(...args: unknown[]): SeaArray
  alloc(length: number, fill?: number | string): SeaArray
  concat(arr: ArrayLike<unknown>[]): SeaArray
  isBuffer(obj: unknown): obj is SeaArray
  byteLength(string: string, encoding?: Encoding): number
}

/**
 * SafeBuffer constructor (deprecated - use SafeBuffer.from())
 */
const SafeBuffer = function SafeBuffer(..._props: unknown[]): SeaArray {
  console.warn("new SafeBuffer() is deprecated, please use SafeBuffer.from()")
  // Will be implemented after from() is defined
  return SeaArray.from([])
} as SafeBufferConstructor

SafeBuffer.prototype = Object.create(Array.prototype)

// ============================================================================
// Input Validation Helpers
// ============================================================================

const validateStringInput = (input: string, _encoding: Encoding): void => {
  if (input.length > SECURITY_LIMITS.MAX_STRING_LENGTH) {
    throw new RangeError(
      `String too large: ${input.length} > ${SECURITY_LIMITS.MAX_STRING_LENGTH}`
    )
  }
}

const validateBufferSize = (size: number, operation = "buffer operation"): void => {
  if (size > SECURITY_LIMITS.MAX_BUFFER_SIZE) {
    throw new RangeError(
      `Buffer size too large for ${operation}: ${size} > ${SECURITY_LIMITS.MAX_BUFFER_SIZE}`
    )
  }
}

// ============================================================================
// Encoding Parsers
// ============================================================================

const parseHexString = (hexString: string): Uint8Array => {
  validateStringInput(hexString, "hex")

  const cleanHex = hexString.replace(/\s/g, "").toLowerCase()

  if (!/^[0-9a-f]*$/.test(cleanHex)) {
    throw new TypeError("Invalid hex string: contains non-hex characters")
  }

  if (cleanHex.length % 2 !== 0) {
    throw new TypeError("Invalid hex string: must have even length")
  }

  if (cleanHex.length === 0) {
    return new Uint8Array(0)
  }

  validateBufferSize(cleanHex.length / 2, "hex parsing")

  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    const hexByte = cleanHex.substr(i, 2)
    bytes[i / 2] = parseInt(hexByte, 16)
  }
  return bytes
}

const encodeUtf8String = (str: string): Uint8Array => {
  validateStringInput(str, "utf8")

  try {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(str)
    validateBufferSize(bytes.length, "UTF-8 encoding")
    return bytes
  } catch (err) {
    throw new TypeError(`Failed to encode UTF-8 string: ${(err as Error).message}`)
  }
}

const encodeBinaryString = (str: string): Uint8Array => {
  validateStringInput(str, "binary")
  validateBufferSize(str.length, "binary encoding")

  const bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i)
    if (charCode > 255) {
      throw new TypeError(
        `Invalid binary string: character at position ${i} exceeds byte range (${charCode} > 255)`
      )
    }
    bytes[i] = charCode
  }
  return bytes
}

const parseBase64String = (base64String: string): Uint8Array => {
  validateStringInput(base64String, "base64")

  const cleanBase64 = base64String.replace(/\s/g, "")

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) {
    throw new TypeError("Invalid base64 string: contains invalid characters")
  }

  try {
    const decodedString = atob(cleanBase64)
    validateBufferSize(decodedString.length, "base64 decoding")

    const bytes = new Uint8Array(decodedString.length)
    for (let i = 0; i < decodedString.length; i++) {
      bytes[i] = decodedString.charCodeAt(i)
    }
    return bytes
  } catch (err) {
    throw new TypeError(`Failed to decode base64 string: ${(err as Error).message}`)
  }
}

const processArrayLikeInput = (input: unknown): Uint8Array => {
  if (input instanceof ArrayBuffer) {
    validateBufferSize(input.byteLength, "ArrayBuffer processing")
    return new Uint8Array(input)
  }

  if (ArrayBuffer.isView(input)) {
    validateBufferSize(input.byteLength, "TypedArray processing")
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }

  if (Array.isArray(input)) {
    validateBufferSize(input.length, "Array processing")

    for (let i = 0; i < input.length; i++) {
      const val = input[i]
      if (
        typeof val !== "number" ||
        val < 0 ||
        val > 255 ||
        !Number.isInteger(val)
      ) {
        throw new TypeError(
          `Invalid byte value at index ${i}: ${val} (must be integer 0-255)`
        )
      }
    }
    return new Uint8Array(input)
  }

  if (
    typeof input === "object" &&
    input !== null &&
    "byteLength" in input &&
    typeof (input as { byteLength: unknown }).byteLength === "number"
  ) {
    validateBufferSize((input as { byteLength: number }).byteLength, "ArrayBuffer-like processing")
    return new Uint8Array(input as ArrayBuffer)
  }

  if (
    typeof input === "object" &&
    input !== null &&
    "length" in input &&
    typeof (input as { length: unknown }).length === "number"
  ) {
    const arrayLike = input as ArrayLike<unknown>
    validateBufferSize(arrayLike.length, "array-like processing")

    const arr = Array.from(arrayLike)
    for (let i = 0; i < arr.length; i++) {
      const val = arr[i]
      if (
        typeof val !== "number" ||
        val < 0 ||
        val > 255 ||
        !Number.isInteger(val)
      ) {
        throw new TypeError(
          `Invalid byte value at index ${i}: ${val} (must be integer 0-255)`
        )
      }
    }
    return new Uint8Array(arr as number[])
  }

  throw new TypeError("Unsupported input type: " + typeof input)
}

// ============================================================================
// SafeBuffer Static Methods
// ============================================================================

Object.assign(SafeBuffer, {
  from(...args: unknown[]): SeaArray {
    const argCount = args.length

    if (argCount === 0) {
      throw new TypeError("SafeBuffer.from() requires at least one argument")
    }

    const input = args[0]

    if (input === null || input === undefined) {
      throw new TypeError("First argument must not be null or undefined")
    }

    let bytes: Uint8Array

    if (typeof input === "string") {
      const encoding = ((args[1] as string) || "utf8").toLowerCase() as Encoding

      switch (encoding) {
        case "hex":
          bytes = parseHexString(input)
          break

        case "utf8":
        case "utf-8":
          bytes = encodeUtf8String(input)
          break

        case "binary":
        case "latin1":
          bytes = encodeBinaryString(input)
          break

        case "base64":
          bytes = parseBase64String(input)
          break

        case "ascii":
          validateStringInput(input, "ascii")
          for (let i = 0; i < input.length; i++) {
            if (input.charCodeAt(i) > 127) {
              throw new TypeError(
                `Invalid ASCII character at position ${i}: ${input.charCodeAt(i)} > 127`
              )
            }
          }
          bytes = encodeUtf8String(input)
          break

        default:
          throw new TypeError("Unknown encoding: " + encoding)
      }
    } else {
      bytes = processArrayLikeInput(input)
    }

    if (!bytes || bytes.length === 0) {
      return SeaArray.from(new Uint8Array(0))
    }

    try {
      return SeaArray.from(bytes)
    } catch (err) {
      throw new Error(`Failed to create SafeBuffer: ${(err as Error).message}`)
    }
  },

  alloc(length: number, fill: number | string = 0): SeaArray {
    if (typeof length !== "number" || !Number.isInteger(length) || length < 0) {
      throw new TypeError("Length must be a non-negative integer")
    }

    validateBufferSize(length, "buffer allocation")

    let fillValue: number
    if (typeof fill === "number") {
      if (fill < 0 || fill > 255 || !Number.isInteger(fill)) {
        throw new TypeError("Fill value must be an integer between 0 and 255")
      }
      fillValue = fill
    } else if (typeof fill === "string") {
      if (fill.length !== 1) {
        throw new TypeError("Fill string must be exactly one character")
      }
      fillValue = fill.charCodeAt(0)
      if (fillValue > 255) {
        throw new TypeError("Fill character code must be <= 255")
      }
    } else {
      throw new TypeError("Fill must be a number or single character string")
    }

    try {
      const buffer = new Uint8Array(length)
      if (fillValue !== 0) {
        buffer.fill(fillValue)
      }
      return SeaArray.from(buffer)
    } catch (err) {
      throw new Error(`Failed to allocate buffer: ${(err as Error).message}`)
    }
  },

  concat(arr: ArrayLike<unknown>[]): SeaArray {
    if (!Array.isArray(arr)) {
      throw new TypeError("First argument must be an array")
    }

    if (arr.length === 0) {
      return SeaArray.from(new Uint8Array(0))
    }

    let totalLength = 0
    const validatedBuffers: Uint8Array[] = []

    for (let i = 0; i < arr.length; i++) {
      const item = arr[i]

      if (!item) {
        throw new TypeError(`Array element at index ${i} is null or undefined`)
      }

      let bytes: Uint8Array
      try {
        bytes = processArrayLikeInput(item)
      } catch (err) {
        throw new TypeError(
          `Invalid array element at index ${i}: ${(err as Error).message}`
        )
      }

      totalLength += bytes.length
      validateBufferSize(totalLength, "buffer concatenation")
      validatedBuffers.push(bytes)
    }

    try {
      const result = new Uint8Array(totalLength)
      let offset = 0

      for (const buffer of validatedBuffers) {
        result.set(buffer, offset)
        offset += buffer.length
      }

      return SeaArray.from(result)
    } catch (err) {
      throw new Error(`Failed to concatenate buffers: ${(err as Error).message}`)
    }
  },

  isBuffer(obj: unknown): obj is SeaArray {
    return (
      obj instanceof SeaArray ||
      (obj !== null &&
        typeof obj === "object" &&
        (obj as { constructor?: unknown }).constructor === SafeBuffer)
    )
  },

  byteLength(string: string, encoding: Encoding = "utf8"): number {
    if (typeof string !== "string") {
      throw new TypeError("First argument must be a string")
    }

    switch (encoding.toLowerCase()) {
      case "utf8":
      case "utf-8":
        return new TextEncoder().encode(string).length

      case "ascii":
      case "binary":
      case "latin1":
        return string.length

      case "base64": {
        const clean = string.replace(/\s/g, "")
        return (
          Math.floor((clean.length * 3) / 4) - (clean.match(/=/g) || []).length
        )
      }

      case "hex":
        return Math.floor(string.replace(/\s/g, "").length / 2)

      default:
        throw new TypeError("Unknown encoding: " + encoding)
    }
  },
})

// Add instance method for toString
SafeBuffer.prototype.toString = function (
  this: SeaArray,
  encoding: Encoding = "utf8",
  start = 0,
  end = this.length
): string {
  if (typeof encoding !== "string") {
    throw new TypeError("Encoding must be a string")
  }

  if (typeof start !== "number" || !Number.isInteger(start) || start < 0) {
    throw new TypeError("Start must be a non-negative integer")
  }

  if (typeof end !== "number" || !Number.isInteger(end) || end < start) {
    throw new TypeError("End must be an integer >= start")
  }

  try {
    return SeaArray.prototype.toString.call(
      this,
      encoding as "utf8" | "hex" | "base64",
      start,
      end
    )
  } catch (err) {
    throw new Error(`Failed to convert buffer to string: ${(err as Error).message}`)
  }
}

export default SafeBuffer


/**
 * Dup - Duplicate message tracking for wire protocol
 * Prevents processing the same message multiple times
 */

export interface DupInterface {
  store: Record<string, number>
  check: (id: string) => string | false
  track: (id: string) => string
  expiry: NodeJS.Timeout | null
}

/**
 * Create a duplicate message tracker
 * @param maxAge - Maximum age of tracked messages in milliseconds (default: 9000)
 * @returns Dup interface for checking and tracking message IDs
 */
const Dup = (maxAge?: number): DupInterface => {
  const maxAgeMs = maxAge || 9000
  const dup: DupInterface = {
    store: {},
    expiry: null,
    check: (id: string): string | false => {
      return dup.store[id] ? dup.track(id) : false
    },
    track: (id: string): string => {
      // Keep the liveliness of the message up while it is being received
      dup.store[id] = Date.now()
      if (!dup.expiry) {
        dup.expiry = setTimeout(() => {
          if (!dup.expiry) return

          const now = Date.now()
          Object.keys(dup.store).forEach(id => {
            if (now - dup.store[id]! > maxAgeMs) {
              delete dup.store[id]
            }
          })
          dup.expiry = null
        }, maxAgeMs)
      }
      return id
    },
  }
  return dup
}

export default Dup


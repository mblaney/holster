export interface DupInterface {
  store: Record<string, number>
  check: (id: string) => string | false
  track: (id: string) => string
  expiry: NodeJS.Timeout | null
}

const Dup = (): DupInterface => {
  const maxAge = 9000
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
          const now = Date.now()
          Object.keys(dup.store).forEach(id => {
            if (now - dup.store[id]! > maxAge) {
              delete dup.store[id]
            }
          })
          dup.expiry = null
        }, maxAge)
        // Don't block process exit — cleanup is best-effort.
        if (dup.expiry.unref) dup.expiry.unref()
      }
      return id
    },
  }
  return dup
}

export default Dup

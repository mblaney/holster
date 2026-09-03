import type {HolsterAPI} from "./holster.ts"
import type {WireOptions} from "./schemas.ts"

// Backs on(cb, _get, {nested: true}) - see holster.ts. A plain on() only
// resolves the node it's given; it never re-checks a child whose own
// value is an object (which always has its own soul, since only scalars
// live directly on a node) once that child's content changes in place -
// nothing on the parent's own soul changes when that happens, so a
// listener on the parent alone never sees it. get()'s own read-resolution
// (holster.ts) already recursively resolves every such child into plain
// data for a one-time read - this doesn't repeat that; it adds a live
// subscription for each child that resolution already exposed, so a
// later change to it reaches the caller too.
//
// Pure and holster-internals-free: chain is a factory - () =>
// user.get([host, "shared"]).next("domains").next(code) - not a
// pre-built chained object, since a fresh, independent instance is
// needed per discovered child (reusing one chained object across
// multiple .next() calls would push them onto the same path instead of
// giving sibling paths).
export function attachNested(
  chain: () => HolsterAPI,
  cb: (data: unknown) => void,
  _get?: boolean,
  _opt?: WireOptions,
): () => void {
  // Stripped before being used on any .on() call this function makes
  // itself (top-level or child) - otherwise a caller-provided {nested:
  // true} would re-trigger holster.ts's own nested check on re-entry,
  // before the normal rel-resolution logic that actually finds the right
  // soul ever runs.
  const opt: WireOptions = {..._opt}
  delete opt.nested

  const childListeners = new Map<
    string,
    {api: HolsterAPI; handler: (data: unknown) => void}
  >()
  let latest: Record<string, unknown> | null = null

  const notify = () => cb(latest === null ? null : {...latest})

  const topLevelHandler = (data: unknown) => {
    if (data === null || typeof data !== "object") {
      latest = data as Record<string, unknown> | null
      notify()
      return
    }

    if (!latest || typeof latest !== "object") latest = {}
    const node = data as Record<string, unknown>
    for (const [key, value] of Object.entries(node)) {
      if (key === "_") continue
      latest[key] = value

      if (
        value !== null &&
        typeof value === "object" &&
        !childListeners.has(key)
      ) {
        const childApi = chain().next(key)
        const handler = (childData: unknown) => {
          if (childData === null) {
            delete latest![key]
            childListeners.delete(key)
          } else {
            latest![key] = childData
          }
          notify()
        }
        childListeners.set(key, {api: childApi, handler})
        // false, not true - the current value is already in data above,
        // so this only needs to watch for future changes, not trigger a
        // redundant immediate re-read.
        childApi.on(handler, false, opt)
      }
    }

    for (const key of [...childListeners.keys()]) {
      if (!(key in node)) {
        const entry = childListeners.get(key)!
        entry.api.off(entry.handler)
        childListeners.delete(key)
        delete latest[key]
      }
    }

    notify()
  }

  const topLevelApi = chain()
  topLevelApi.on(topLevelHandler, _get, opt)

  return () => {
    topLevelApi.off(topLevelHandler)
    for (const {api: childApi, handler} of childListeners.values()) {
      childApi.off(handler)
    }
    childListeners.clear()
  }
}

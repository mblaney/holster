import {obj} from "./utils.js"

// Backs on(cb, _get, {nested: true}) - see holster.js. A plain on() only
// resolves the node it's given; it never re-checks a child whose own
// value is an object (which always has its own soul, since only scalars
// live directly on a node) once that child's content changes in place -
// nothing on the parent's own soul changes when that happens, so a
// listener on the parent alone never sees it. get()'s own read-resolution
// (holster.js) already recursively resolves every such child into plain
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
export function attachNested(chain, cb, _get, _opt) {
  // Stripped before being used on any .on() call this function makes
  // itself (top-level or child) - otherwise a caller-provided {nested:
  // true} would re-trigger holster.js's own nested check on re-entry,
  // before the normal rel-resolution logic that actually finds the right
  // soul ever runs.
  const opt = {..._opt}
  delete opt.nested

  const childListeners = new Map() // key -> {api, handler}
  let latest = null

  const notify = () => cb(latest === null ? null : {...latest})

  const stopChild = key => {
    const {api: childApi, handler} = childListeners.get(key)
    childApi.off(handler)
    childListeners.delete(key)
  }

  const topLevelHandler = data => {
    if (!obj.is(data)) {
      latest = data
      notify()
      return
    }

    if (!obj.is(latest)) latest = {}
    for (const [key, value] of Object.entries(data)) {
      if (key === "_") continue
      latest[key] = value

      const isObject = obj.is(value)
      // A child that's removed only has its fields cleared, so its own
      // listener never sees it go. It's stopped here instead, so a new
      // value for key gets a listener on its own node.
      if (!isObject && childListeners.has(key)) stopChild(key)
      if (isObject && !childListeners.has(key)) {
        const childApi = chain().next(key)
        const handler = childData => {
          // An update already on its way when this was stopped.
          if (childListeners.get(key)?.handler !== handler) return
          if (childData === null) {
            stopChild(key)
            delete latest[key]
          } else {
            latest[key] = childData
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
      if (!(key in data)) {
        stopChild(key)
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

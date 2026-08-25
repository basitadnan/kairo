/** Minimal event bus decoupling local writes (db.ts) from the sync engine (sync.ts). */
type Handler = () => void

const listeners = new Set<Handler>()

export function onLocalChange(handler: Handler): () => void {
  listeners.add(handler)
  return () => listeners.delete(handler)
}

export function emitLocalChange() {
  for (const fn of listeners) fn()
}

import { create } from 'zustand'
import { db } from './db'
import { onLocalChange } from './bus'
import { getCloud, getCred } from './cloud'
import { api } from '../../convex/_generated/api'

/**
 * Document-style sync: every local entity is mirrored into one remote table
 * (`syncDocs`) keyed by (owner, tableName, recordId) with the full local row
 * as JSON. Last-write-wins on `updatedAt`, enforced both server- and
 * client-side. Single-user app: the pairing-key hash is the namespace.
 */

const SYNCED_TABLES = ['courses', 'classSlots', 'exams', 'assignments', 'personalItems', 'attendance'] as const

// Overlap window so clocks that drift a little can't silently skip rows.
const SKEW_MS = 30_000

const PULL_PAGE = 500

interface RowLike {
  id: string
  updatedAt: number
  deleted: 0 | 1
}

interface OutboundDoc {
  tableName: string
  recordId: string
  data: RowLike
  updatedAt: number
}

function table(name: (typeof SYNCED_TABLES)[number]) {
  return db[name as keyof typeof db] as unknown as {
    where: (key: string) => {
      above: (v: number) => { toArray(): Promise<RowLike[]> }
    }
    get: (id: string) => Promise<RowLike | undefined>
    put: (row: RowLike) => Promise<void>
    bulkPut: (rows: RowLike[]) => Promise<void>
  }
}

async function getWatermark(): Promise<number> {
  return (await db.syncMeta.get('lastSyncedAt'))?.value ?? 0
}

async function setWatermark(value: number) {
  await db.syncMeta.put({ key: 'lastSyncedAt', value })
}

interface SyncResult {
  pushed: number
  pulled: number
}

async function doPush(watermark: number): Promise<number> {
  const client = await getCloud()
  if (!client) throw new Error('no client')
  const cred = await getCred()
  if (!cred) throw new Error('no cred')

  let pushed = 0
  for (const name of SYNCED_TABLES) {
    // Dexie v4: collections are not awaitable — .toArray() is required.
    const rows = await table(name).where('updatedAt').above(watermark).toArray()
    const fresh = rows.filter((r) => r.updatedAt > watermark)
    if (fresh.length === 0) continue
    console.info(`[sync] pushing ${fresh.length} ${name} row(s)`)
    for (let i = 0; i < fresh.length; i += 200) {
      const batch: OutboundDoc[] = fresh.slice(i, i + 200).map((row) => ({
        tableName: name,
        recordId: row.id,
        data: row,
        updatedAt: row.updatedAt,
      }))
      const res = (await client.mutation(api.sync.pushDocs, { cred, docs: batch })) as { accepted?: number }
      console.info(`[sync] pushed ${res?.accepted ?? '?'} ${name} row(s)`)
      pushed += batch.length
    }
  }
  return pushed
}

async function doPull(): Promise<number> {
  const client = await getCloud()
  if (!client) throw new Error('no client')
  const cred = await getCred()
  if (!cred) throw new Error('no cred')

  // Server-ordered cursor (Convex _creationTime) — immune to device clock skew,
  // which previously let a phone skip rows written by a laptop with a lagging
  // or leading clock while still reporting a happy "Synced".
  let cursor = (await db.syncMeta.get('lastCursor'))?.value ?? 0
  let pulled = 0

  for (let page = 0; page < 50; page++) {
    const result = (await client.query(api.sync.pullDocs, { cred, cursor })) as {
      docs: { tableName: string; recordId: string; data: RowLike; updatedAt: number }[]
      newCursor: number
      hasMore: boolean
    }
    if (!result.docs || result.docs.length === 0) break
    pulled += result.docs.length

    for (const doc of result.docs) {
      if (!(SYNCED_TABLES as readonly string[]).includes(doc.tableName)) continue
      const row = doc.data as RowLike
      if (!row || row.id !== doc.recordId) continue
      const t = table(doc.tableName as (typeof SYNCED_TABLES)[number])
      const local = await t.get(row.id)
      // Last-write-wins: remote only replaces local if strictly newer.
      if (!local || doc.updatedAt > local.updatedAt) await t.put(row)
    }

    cursor = Math.max(cursor, result.newCursor)
    await db.syncMeta.put({ key: 'lastCursor', value: cursor })
    if (!result.hasMore) break
  }
  return pulled
}

/** Full round-trip: push local edits, then pull remote ones. */
export async function runSync(reason: 'startup' | 'interval' | 'focus' | 'local-change' | 'manual'): Promise<void> {
  const state = useSync.getState()
  if (state.status === 'syncing') return
  const client = await getCloud()
  if (!client) {
    useSync.setState({ status: 'no-config' })
    return
  }
  const cred = await getCred()
  if (!cred) {
    useSync.setState({ status: 'signed-out' }) // connected but not paired yet
    return
  }

  useSync.setState({ status: 'syncing', error: undefined })
  try {
    // One-time full backfill: rows that predate a device's watermark would
    // otherwise never upload (this is exactly what bit the first phone↔
    // laptop pairing). After one successful all-rows push, mark it done.
    const backfilled = await db.syncMeta.get('fullPushDone')
    const watermark = backfilled ? await getWatermark() : 0
    const pushed = await doPush(watermark)
    const pulled = await doPull()
    await setWatermark(Date.now() - SKEW_MS)
    if (!backfilled && pushed >= 0) await db.syncMeta.put({ key: 'fullPushDone', value: 1 })
    useSync.setState({ status: 'ok', lastSyncedAt: Date.now(), error: undefined })
    if (pushed || pulled) console.info(`[sync:${reason}] pushed ${pushed}, pulled ${pulled}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[sync:${reason}] failed: ${msg}`)
    useSync.setState({ status: 'error', error: msg })
  }
}

let started = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null

/** Wire up automatic syncing: on startup, on local edits (debounced), periodically and on focus. */
export function startAutoSync() {
  if (started) return
  started = true

  void runSync('startup')
  const interval = setInterval(() => void runSync('interval'), 60_000)

  // Every write in the app flows through db helpers, which ping the bus.
  const off = onLocalChange(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void runSync('local-change'), 3_000)
  })

  window.addEventListener('focus', () => void runSync('focus'))
  window.addEventListener('online', () => void runSync('focus'))

  return () => {
    clearInterval(interval)
    off()
  }
}

interface SyncState {
  status: 'no-config' | 'signed-out' | 'syncing' | 'ok' | 'error' | 'unknown'
  lastSyncedAt?: number
  error?: string
}

export const useSync = create<SyncState>(() => ({ status: 'unknown' }))

export async function refreshSyncStatus() {
  const client = await getCloud()
  if (!client) return useSync.setState({ status: 'no-config' })
  const cred = await getCred()
  if (!cred) return useSync.setState({ status: 'signed-out' })
  const last = await db.syncMeta.get('lastSyncedAt')
  useSync.setState({ status: 'ok', lastSyncedAt: last?.value })
}

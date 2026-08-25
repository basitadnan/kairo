import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

/**
 * Cloud sync backend for Kairo.
 *
 * Auth is a single pairing key: devices store the raw key locally and send
 * its SHA-256 hex (`cred`) with every call. The server only ever sees the
 * hash. Whoever holds the key owns that data namespace — treat it like a
 * password.
 */

const PULL_PAGE = 500

interface SyncDocRow {
  tableName: string
  recordId: string
  data: unknown
  updatedAt: number
  creationTime: number
}

/** Does a pairing key exist yet? Clients use this to offer create-vs-join. */
export const hasSyncKey = query({
  args: {},
  handler: async (ctx) => {
    const any = await ctx.db.query('syncKeys').first()
    return any != null
  },
})

/** First device claims the namespace with its key's hash. Fails if taken. */
export const registerSyncKey = mutation({
  args: { credHash: v.string() },
  handler: async (ctx, { credHash }) => {
    const existing = await ctx.db
      .query('syncKeys')
      .withIndex('by_cred', (q) => q.eq('credHash', credHash))
      .unique()
    if (existing) return // idempotent re-registration from a paired device

    const taken = await ctx.db.query('syncKeys').first()
    if (taken) throw new Error('This Convex deployment already has a pairing key.')
    await ctx.db.insert('syncKeys', { credHash, createdAt: Date.now() })
  },
})

async function ownerFor(ctx: any, cred: string): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(cred)) throw new Error('Bad credential format.')
  const key = await ctx.db
    .query('syncKeys')
    .withIndex('by_cred', (q: any) => q.eq('credHash', cred))
    .unique()
  if (!key) throw new Error('Unknown pairing key — connect the first device first.')
  return cred
}

/** Push local changes. Server-side last-write-wins on updatedAt. */
export const pushDocs = mutation({
  args: {
    cred: v.string(),
    docs: v.array(
      v.object({
        tableName: v.string(),
        recordId: v.string(),
        data: v.any(),
        updatedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, { cred, docs }) => {
    const owner = await ownerFor(ctx, cred)
    let accepted = 0
    for (const doc of docs.slice(0, 500)) {
      const existing = await ctx.db
        .query('syncDocs')
        .withIndex('by_owner_table_record', (q) =>
          q.eq('owner', owner).eq('tableName', doc.tableName).eq('recordId', doc.recordId),
        )
        .unique()
      if (existing) {
        if ((doc.updatedAt as number) > (existing as any).updatedAt) {
          // Replace rather than patch: a fresh row gets a fresh _creationTime,
          // which is what other devices' pull cursors track. Patching in place
          // would make updates/deletes invisible to them.
          await ctx.db.delete(existing._id)
          await ctx.db.insert('syncDocs', {
            owner,
            tableName: doc.tableName,
            recordId: doc.recordId,
            data: doc.data,
            updatedAt: doc.updatedAt,
          })
          accepted++
        }
      } else {
        await ctx.db.insert('syncDocs', {
          owner,
          tableName: doc.tableName,
          recordId: doc.recordId,
          data: doc.data,
          updatedAt: doc.updatedAt,
        })
        accepted++
      }
    }
    return { accepted }
  },
})

/**
 * Pull remote changes arriving after the server-side cursor, oldest first,
 * one page at a time. The cursor is the server's own `_creationTime`, so
 * device clocks are irrelevant to what gets pulled.
 */
export const pullDocs = query({
  args: { cred: v.string(), cursor: v.optional(v.number()) },
  handler: async (ctx, { cred, cursor }) => {
    const owner = await ownerFor(ctx, cred)
    const from = cursor ?? 0
    const rows = await ctx.db
      .query('syncDocs')
      .withIndex('by_owner_created', (q) => q.eq('owner', owner).gt('_creationTime', from))
      .order('asc')
      .take(PULL_PAGE)

    const docs: SyncDocRow[] = rows.map((r: any) => ({
      tableName: r.tableName,
      recordId: r.recordId,
      data: r.data,
      updatedAt: r.updatedAt,
      creationTime: r._creationTime as number,
    }))
    const newCursor = docs.length > 0 ? docs[docs.length - 1]!.creationTime : from
    return { docs, newCursor, hasMore: rows.length === PULL_PAGE }
  },
})

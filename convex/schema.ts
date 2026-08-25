import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * One flat document table mirrors Kairo's local-first design: every Dexie row
 * is stored verbatim as `data`, keyed by (owner, tableName, recordId).
 * `owner` is the SHA-256 of the user's pairing key — never the raw key.
 */
export default defineSchema({
  syncKeys: defineTable({
    // SHA-256 hex of the pairing key. The raw key only ever lives on devices.
    credHash: v.string(),
    createdAt: v.number(),
  }).index('by_cred', ['credHash']),

  syncDocs: defineTable({
    owner: v.string(), // credHash of the owning pairing key
    tableName: v.string(),
    recordId: v.string(),
    data: v.any(), // full local record incl. id / createdAt / deleted
    updatedAt: v.number(),
  })
    .index('by_owner_table_record', ['owner', 'tableName', 'recordId'])
    .index('by_owner_updated', ['owner', 'updatedAt'])
    // _creationTime is implicitly appended to this index, giving us a stable
    // server-ordered pull cursor without trusting device clocks.
    .index('by_owner_created', ['owner']),
})

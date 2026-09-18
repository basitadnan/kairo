import { query, mutation } from './_generated/server'
import { v } from 'convex/values'

/**
 * Account auth for Kairo.
 *
 * Passwords never leave the device. The client derives an account key from
 * the password (PBKDF2, on-device) and sends only `sha256(accountKey)` as
 * `cred` — the same "server sees a hash, never the secret" model as the
 * original pairing-key flow. A user's cred is their data-namespace owner in
 * `syncDocs`, so accounts isolate data with zero extra plumbing.
 */

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

/** Username lowercased on-device; here it is stored and matched as-is. */
export const createAccount = mutation({
  args: {
    username: v.string(),
    displayName: v.string(),
    cred: v.string(), // sha256(accountKey)
  },
  handler: async (ctx, { username, displayName, cred }) => {
    if (!USERNAME_RE.test(username)) throw new Error('Username must be 3–20 characters: letters, numbers, underscores.')
    if (displayName.length > 40) throw new Error('Name is too long.')

    const taken = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (taken) throw new Error('That username is already taken.')

    const credInUse = await ctx.db
      .query('users')
      .withIndex('by_cred', (q) => q.eq('credHash', cred))
      .unique()
    if (credInUse) throw new Error('An account with these credentials already exists.')

    await ctx.db.insert('users', { username, displayName, credHash: cred, createdAt: Date.now() })

    // Register the cred as a namespace owner so sync's ownerFor() accepts it.
    const existingKey = await ctx.db
      .query('syncKeys')
      .withIndex('by_cred', (q) => q.eq('credHash', cred))
      .unique()
    if (!existingKey) await ctx.db.insert('syncKeys', { credHash: cred, createdAt: Date.now() })

    return { username, displayName }
  },
})

/** Verify credentials; returns the display name for the UI. */
export const verifyLogin = query({
  args: { username: v.string(), cred: v.string() },
  handler: async (ctx, { username, cred }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    if (!user || user.credHash !== cred) throw new Error('Wrong username or password.')
    return { username: user.username, displayName: user.displayName }
  },
})

/** Does a username exist? Lets the sign-in screen pick create-vs-login wording. */
export const usernameExists = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', username))
      .unique()
    return user != null
  },
})

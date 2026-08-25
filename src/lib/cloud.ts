import { ConvexHttpClient } from 'convex/browser'
import { getSetting, setSetting, db } from './db'
import { api } from '../../convex/_generated/api'

/**
 * Cloud sync connection over Convex.
 *
 * Two secrets live on each device:
 *   - Deployment URL (e.g. https://happy-otter-123.convex.cloud) — not secret
 *   - Pairing key — a 32-byte random key; only its SHA-256 ever leaves the
 *     device. Whoever holds the raw key owns that cloud namespace.
 *
 * The URL is stored in the settings table like everything else. Replacing
 * supabase.ts: same responsibilities, no accounts — the key IS the identity.
 */

export const CLOUD_URL_KEY = 'cloud.url'
export const CLOUD_KEY_KEY = 'cloud.key'

let cached: { url: string; client: ConvexHttpClient } | null = null

export async function getCloud(): Promise<ConvexHttpClient | null> {
  const url = await getSetting(CLOUD_URL_KEY)
  if (!url || !/^https:\/\/[a-z0-9-]+\.convex\.(cloud|site)/i.test(url.trim())) return null
  const clean = url.trim()
  if (cached && cached.url === clean) return cached.client
  const client = new ConvexHttpClient(clean)
  cached = { url: clean, client }
  return client
}

/** Invalidate the memoised client after disconnect/url change. */
export function resetCloudClient() {
  cached = null
}

export async function saveConnection(url: string, pairingKey: string) {
  await setSetting(CLOUD_URL_KEY, url.trim())
  await setSetting(CLOUD_KEY_KEY, pairingKey.trim())
  resetCloudClient()
}

export async function clearConnection() {
  await db.settings.delete(CLOUD_URL_KEY)
  await db.settings.delete(CLOUD_KEY_KEY)
  resetCloudClient()
}

export async function getConnection(): Promise<{ url: string; key: string }> {
  const [url, key] = await Promise.all([getSetting(CLOUD_URL_KEY), getSetting(CLOUD_KEY_KEY)])
  return { url: url ?? '', key: key ?? '' }
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Credential sent with every call — the hash of the local pairing key. */
export async function getCred(): Promise<string | null> {
  const { key } = await getConnection()
  if (!key) return null
  return sha256Hex(key)
}

/** Generate a fresh pairing key (32 bytes, url-safe). */
export function generatePairingKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 50)
}

/**
 * Claim this deployment's namespace with our key's hash.
 * Idempotent for an already-paired device; throws if another key owns it.
 */
export async function registerPairingKey(): Promise<void> {
  const client = await getCloud()
  if (!client) throw new Error('Save the deployment URL first.')
  const cred = await getCred()
  if (!cred) throw new Error('No pairing key on this device yet.')
  await client.mutation(api.sync.registerSyncKey, { credHash: cred })
}

/** Round-trip check used by the "Test connection" button. */
export async function testCloudConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = await getCloud()
    if (!client) return { ok: false, error: 'No deployment URL saved.' }
    const cred = await getCred()
    if (!cred) return { ok: false, error: 'No pairing key saved.' }
    await client.query(api.sync.pullDocs, { cred })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

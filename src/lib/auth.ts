import { create } from 'zustand'
import { db, getSetting, setSetting } from './db'
import { api } from '../../convex/_generated/api'
import { getCloud, AUTH_KEY_KEY, CLOUD_KEY_KEY, resetCloudClient } from './cloud'
import { sha256Hex } from './hash'
import { runSync } from './sync'

/**
 * Account auth, local-first style.
 *
 * The password never leaves the device: it is stretched into an "account
 * key" with PBKDF2 (salted with the username), and only sha256(accountKey)
 * — the cred — is ever sent. The cred doubles as the sync namespace owner,
 * so each account's data is isolated by construction.
 *
 * Settings keys:
 *   auth.user     — username (lowercased)
 *   auth.name     — display name
 *   auth.key      — derived account key (device-secret, like the legacy pairing key)
 *   auth.offline  — '1' when the user chose "continue offline" at the gate
 *
 * A device that already has data (or a legacy pairing key) gets a "claim"
 * style first-run: create an account and its existing rows upload into the
 * new namespace. Signing into an account on a device that already has rows
 * offers merge (last-write-wins, the same rule sync uses) or a clean wipe
 * before pulling. Either way the legacy pairing key is retired once an
 * account is bound — migration is per-device.
 */

export const AUTH_USER_KEY = 'auth.user'
export const AUTH_NAME_KEY = 'auth.name'
export const AUTH_OFFLINE_KEY = 'auth.offline'

const PBKDF2_ITERATIONS = 200_000

export interface AuthUser {
  username: string
  displayName: string
}

export type BootContext = 'fresh' | 'legacy'

interface AuthState {
  phase: 'loading' | 'gate' | 'ready'
  user: AuthUser | null
  /** What the gate should show for this device: brand-new vs has existing data. */
  context: BootContext
  offline: boolean
}

export const useAuth = create<AuthState>(() => ({ phase: 'loading', user: null, context: 'fresh', offline: false }))

/** Decide what this boot should show, before any sync/reminder engine matters. */
export async function bootAuth(): Promise<void> {
  const [username, name, key, offline] = await Promise.all([
    getSetting(AUTH_USER_KEY),
    getSetting(AUTH_NAME_KEY),
    getSetting(AUTH_KEY_KEY),
    getSetting(AUTH_OFFLINE_KEY),
  ])

  if (username && key) {
    useAuth.setState({ phase: 'ready', user: { username, displayName: name ?? username } })
    return
  }
  if (offline === '1') {
    useAuth.setState({ phase: 'ready', offline: true })
    return
  }

  const context: BootContext = (await hasLocalData()) || (await getSetting(CLOUD_KEY_KEY)) ? 'legacy' : 'fresh'
  useAuth.setState({ phase: 'gate', context })
}

/** Any real rows on this device? Drives claim/merge UX at the gate. */
export async function hasLocalData(): Promise<boolean> {
  const counts = await Promise.all([
    db.courses.count(),
    db.classSlots.count(),
    db.exams.count(),
    db.assignments.count(),
    db.personalItems.count(),
    db.attendance.count(),
  ])
  return counts.some((n) => n > 0)
}

/** Stretch a password into the device-secret account key. Slow on purpose. */
export async function deriveAccountKey(password: string, username: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`kairo:v1:${username}`), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function credFromKey(accountKey: string): Promise<string> {
  return sha256Hex(accountKey)
}

/**
 * Sync meta resets whenever credentials change: the new namespace starts
 * empty, so watermark-gated pushes would skip older rows. A clean slate
 * forces the one-time full backfill — same mechanism that fixed the first
 * phone↔laptop pairing.
 */
async function resetSyncMeta(): Promise<void> {
  await db.syncMeta.bulkDelete(['lastSyncedAt', 'lastCursor', 'fullPushDone'])
}

async function bindDevice(username: string, displayName: string, accountKey: string): Promise<void> {
  await setSetting(AUTH_USER_KEY, username)
  await setSetting(AUTH_NAME_KEY, displayName)
  await setSetting(AUTH_KEY_KEY, accountKey)
  await db.settings.delete(AUTH_OFFLINE_KEY)
  // Account bound: the legacy pairing key is retired on this device.
  await db.settings.delete(CLOUD_KEY_KEY)
  resetCloudClient()
  useAuth.setState({ phase: 'ready', user: { username, displayName }, offline: false })
}

/** Create a new account and bind this device to it. Caller handles backup UX. */
export async function signUp(username: string, displayName: string, password: string): Promise<void> {
  const client = await getCloud()
  if (!client) throw new Error('Cloud sync is not configured on this device yet — connect it in Settings first.')
  const accountKey = await deriveAccountKey(password, username)
  await client.mutation(api.auth.createAccount, { username, displayName, cred: await credFromKey(accountKey) })
  await bindDevice(username, displayName, accountKey)
  await resetSyncMeta()
  void runSync('manual')
}

/**
 * Sign in. Returns whether the device already holds data so the caller can
 * offer merge-vs-fresh. Credentials are bound immediately; data decisions
 * happen in completeSignIn().
 */
export async function signIn(username: string, password: string): Promise<{ hasData: boolean }> {
  const client = await getCloud()
  if (!client) throw new Error('Cloud sync is not configured on this device yet — connect it in Settings first.')
  const accountKey = await deriveAccountKey(password, username)
  const remote = (await client.query(api.auth.verifyLogin, {
    username,
    cred: await credFromKey(accountKey),
  })) as { username: string; displayName: string }
  const hasData = await hasLocalData()
  await bindDevice(remote.username, remote.displayName, accountKey)
  await resetSyncMeta()
  return { hasData }
}

/** Finish a sign-in: merge local rows with the account (LWW) or wipe first. */
export async function completeSignIn(mode: 'merge' | 'fresh'): Promise<void> {
  if (mode === 'fresh') await wipeLocalData()
  void runSync('manual')
}

/** Leave the account. Erasing also clears every local table (cloud copy untouched). */
export async function signOut(erase: boolean): Promise<void> {
  if (erase) await wipeLocalData()
  await db.settings.delete(AUTH_USER_KEY)
  await db.settings.delete(AUTH_NAME_KEY)
  await db.settings.delete(AUTH_KEY_KEY)
  await db.settings.delete(AUTH_OFFLINE_KEY)
  resetCloudClient()
  const context: BootContext = (await hasLocalData()) ? 'legacy' : 'fresh'
  useAuth.setState({ phase: 'gate', user: null, offline: false, context })
}

/** Gate escape hatch: use the app without an account; Settings offers setup later. */
export async function continueOffline(): Promise<void> {
  await setSetting(AUTH_OFFLINE_KEY, '1')
  useAuth.setState({ phase: 'ready', user: null, offline: true })
}

/** Undo "continue offline" (Settings CTA) — shows the gate again. */
export async function returnToGate(): Promise<void> {
  await db.settings.delete(AUTH_OFFLINE_KEY)
  useAuth.setState({ phase: 'gate', user: null, offline: false })
}

/**
 * Erase every local table but keep the deployment URL so a subsequent sign-in
 * can pull the account's data straight back down. The cloud copy is untouched.
 */
export async function wipeLocalData(): Promise<void> {
  await Promise.all([
    db.courses.clear(),
    db.classSlots.clear(),
    db.exams.clear(),
    db.assignments.clear(),
    db.personalItems.clear(),
    db.attendance.clear(),
    db.aiImports.clear(),
    db.chatMessages.clear(),
    db.firedReminders.clear(),
    db.syncMeta.clear(),
  ])
  const keepUrl = await getSetting('cloud.url')
  await db.settings.clear()
  if (keepUrl) await setSetting('cloud.url', keepUrl)
}

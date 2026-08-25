import { Capacitor } from '@capacitor/core'

/**
 * Preview access gate.
 *
 * A lightweight front-door for the hosted web preview: the first visitor
 * creates the single allowed account (stored on that device), everyone else
 * must sign in with those exact credentials. Deliberately not real security —
 * it keeps strangers out of a personal demo, nothing more.
 *
 * Skipped entirely for native builds and local file:// runs, where the app is
 * already personal by definition.
 */

const ACCOUNT_KEY = 'access.account'
const SESSION_KEY = 'access.session'

export interface AccessAccount {
  name: string
  username: string
  passHash: string // sha-256 of the password — never stored in plain text
}

/** Should this launch show the gate at all? */
export function gateRequired(): boolean {
  if (Capacitor.isNativePlatform()) return false
  if (location.protocol === 'file:') return false
  return true
}

export function readAccount(): AccessAccount | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    return raw ? (JSON.parse(raw) as AccessAccount) : null
  } catch {
    return null
  }
}

export function hasAccount(): boolean {
  return readAccount() != null
}

export function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function unlock(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch {}
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Create THE account for this preview. Fails if one already exists. */
export async function createAccount(name: string, username: string, password: string): Promise<void> {
  if (readAccount()) throw new Error('An account already exists on this device.')
  const passHash = await sha256Hex(password)
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ name: name.trim(), username: username.trim(), passHash }))
  unlock()
}

/** Verify credentials against the stored account. */
export async function verifyLogin(username: string, password: string): Promise<boolean> {
  const account = readAccount()
  if (!account) return false
  if (account.username.toLowerCase() !== username.trim().toLowerCase()) return false
  return (await sha256Hex(password)) === account.passHash
}

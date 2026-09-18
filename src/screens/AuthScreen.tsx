import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Check, Eye, EyeSlash, LockKey, ShieldCheck, Sparkle } from '@phosphor-icons/react'
import { completeSignIn, continueOffline, hasLocalData, signIn, signUp, useAuth } from '../lib/auth'
import { exportBackupJson } from '../lib/backup'

/**
 * Account gate. First run on any device: create an account (this device's
 * data uploads into it) or sign in (existing data offers merge-or-wipe), or
 * continue offline. The claim variant — shown when the device already holds
 * data or a legacy pairing key — auto-downloads a JSON backup before anything
 * touches the account.
 */

type Step = 'welcome' | 'create' | 'signin' | 'merge'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

/** Convex wraps server errors in request-id/stack noise — show just the message. */
function cleanAuthError(raw: string): string {
  return raw
    .replace(/\[Request ID:[^\]]+\]\s*/i, '')
    .replace(/^Server Error\s*/i, '')
    .replace(/Uncaught Error:\s*/i, '')
    .replace(/\s*at handler \(.*$/s, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function AuthScreen() {
  const context = useAuth((s) => s.context)
  const [step, setStep] = useState<Step>('welcome')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deviceHasData, setDeviceHasData] = useState(false)

  useEffect(() => {
    void hasLocalData().then(setDeviceHasData)
  }, [])

  function fail(err: unknown) {
    setBusy(null)
    setError(err instanceof Error ? cleanAuthError(err.message) : String(err))
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const uname = username.trim().toLowerCase()
    if (!name.trim()) return setError('Your name is required.')
    if (!USERNAME_RE.test(uname)) return setError('Username: 3–20 lowercase letters, numbers or underscores.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    try {
      if (context === 'legacy') {
        setBusy('Saving a backup file…')
        await exportBackupJson()
      }
      setBusy('Creating your account…')
      await signUp(uname, name.trim(), password)
      // Store flips to ready; gate unmounts us.
    } catch (err) {
      fail(err)
    }
  }

  async function submitSignin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const uname = username.trim().toLowerCase()
    if (!uname || !password) return setError('Username and password are required.')
    try {
      setBusy('Signing in…')
      const { hasData } = await signIn(uname, password)
      setBusy(null)
      if (hasData) setStep('merge')
      else await completeSignIn('merge')
    } catch (err) {
      fail(err)
    }
  }

  async function chooseMerge(mode: 'merge' | 'fresh') {
    try {
      if (mode === 'fresh') {
        if (!window.confirm('Erase this device\u2019s data and pull everything from your account? The cloud copy is safe.')) return
        setBusy('Cleaning this device…')
      } else {
        setBusy('Merging this device\u2019s data…')
      }
      await completeSignIn(mode)
    } catch (err) {
      fail(err)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft">
            {step === 'merge' ? (
              <ShieldCheck size={22} weight="regular" className="text-accent" aria-hidden />
            ) : (
              <LockKey size={22} weight="regular" className="text-accent" aria-hidden />
            )}
          </div>
          <h1 className="mt-5 font-serif text-[30px] font-medium leading-none tracking-[-0.01em] text-ink">Kairo</h1>
          <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.24em] text-ink-2">schedule</p>
          <p className="mt-5 max-w-[280px] text-[13px] leading-relaxed text-ink-2">{headline(step, context, deviceHasData)}</p>
        </div>

        <div className="mt-7 flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-card">
          {step === 'welcome' && (
            <>
              <button
                onClick={() => setStep('create')}
                className="inline-flex h-10 cursor-pointer select-none items-center justify-center gap-2 rounded-[10px] bg-btn text-sm font-medium tracking-[-0.01em] text-btn-text transition-colors duration-200 hover:bg-btn-hover"
              >
                <Sparkle size={14} weight="bold" aria-hidden />
                Create an account
              </button>
              <button
                onClick={() => setStep('signin')}
                className="inline-flex h-10 cursor-pointer select-none items-center justify-center rounded-[10px] border border-line bg-surface text-sm font-medium tracking-[-0.01em] text-ink transition-colors duration-200 hover:bg-surface-2"
              >
                I already have one — sign in
              </button>
              <button
                onClick={() => void continueOffline()}
                className="cursor-pointer select-none font-mono text-[10.5px] tracking-[0.04em] text-ink-3 transition-colors duration-200 hover:text-ink-2"
              >
                continue offline for now
              </button>
            </>
          )}

          {(step === 'create' || step === 'signin') && (
            <form onSubmit={step === 'create' ? submitCreate : submitSignin} className="flex flex-col gap-4">
              {step === 'create' && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink">Your name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Basit"
                    autoComplete="name"
                    className={inputClass}
                  />
                </label>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink">Username</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder={step === 'create' ? 'pick a username' : 'your username'}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={inputClass}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-ink">Password</span>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={step === 'create' ? 'new-password' : 'current-password'}
                    className={inputClass + ' pr-10'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
                  >
                    {showPass ? <EyeSlash size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                  </button>
                </div>
              </label>

              {step === 'create' && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-ink">Confirm password</span>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="repeat it"
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </label>
              )}

              {error && <p className="text-xs leading-relaxed text-chip-red-text">{error}</p>}

              <button type="submit" disabled={busy != null} className={primaryBtnClass}>
                <Sparkle size={14} weight="bold" aria-hidden />
                {busy ?? (step === 'create' ? 'Create my account' : 'Sign in')}
              </button>

              <p className="text-center font-mono text-[10px] tracking-[0.04em] text-ink-3">
                {step === 'create'
                  ? context === 'legacy'
                    ? 'Your data on this device stays put and uploads to your new account.'
                    : 'Only a hash of your password ever leaves this device.'
                  : 'Your password unlocks this account on any device.'}
              </p>

              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setStep('welcome')
                }}
                className="cursor-pointer select-none font-mono text-[10.5px] tracking-[0.04em] text-ink-3 transition-colors duration-200 hover:text-ink-2"
              >
                back
              </button>
            </form>
          )}

          {step === 'merge' && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] leading-relaxed text-ink-2">
                This device already holds {deviceHasData ? 'schedule data' : 'data'}. What should happen with it?
              </p>
              <button
                onClick={() => void chooseMerge('merge')}
                disabled={busy != null}
                className="inline-flex h-10 cursor-pointer select-none items-center justify-center gap-2 rounded-[10px] bg-btn text-sm font-medium tracking-[-0.01em] text-btn-text transition-colors duration-200 hover:bg-btn-hover disabled:pointer-events-none disabled:opacity-45"
              >
                <Check size={14} weight="bold" aria-hidden />
                {busy ?? 'Keep it — merge with my account'}
              </button>
              <button
                onClick={() => void chooseMerge('fresh')}
                disabled={busy != null}
                className="inline-flex h-10 cursor-pointer select-none items-center justify-center rounded-[10px] border border-line bg-surface text-sm font-medium tracking-[-0.01em] text-ink transition-colors duration-200 hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-45"
              >
                Erase this device — pull from my account
              </button>
              {error && <p className="text-xs leading-relaxed text-chip-red-text">{error}</p>}
              <p className="text-center font-mono text-[10px] tracking-[0.04em] text-ink-3">
                Merging keeps both copies, newest edit wins.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function headline(step: Step, context: string, deviceHasData: boolean): string {
  if (step === 'merge') return 'Signed in — one last choice about this device.'
  if (step === 'create') return context === 'legacy' ? 'Your data stays with you.' : 'Set up your account.'
  if (step === 'signin') return 'Welcome back.'
  return context === 'legacy' && deviceHasData
    ? 'This device has your data. Make it an account so it syncs — and so others get their own space.'
    : 'Sign in to sync across your devices, or explore offline first.'
}

const inputClass =
  'h-10 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none'

const primaryBtnClass =
  'mt-1 inline-flex h-10 cursor-pointer select-none items-center justify-center gap-2 rounded-[10px] bg-btn text-sm font-medium tracking-[-0.01em] text-btn-text transition-colors duration-200 hover:bg-btn-hover disabled:pointer-events-none disabled:opacity-45'

import { useState } from "react"
import { motion } from 'motion/react'
import { Eye, EyeSlash, LockKey, Sparkle } from '@phosphor-icons/react'
import { createAccount, verifyLogin, type AccessAccount } from '../lib/access'

/**
 * Preview front-door: account setup on first visit, login afterwards.
 * Soft Editorial styling; runs only on the hosted web preview.
 */
export function AccessGate({ account, onUnlock }: { account: AccessAccount | null; onUnlock: () => void }) {
  const [mode, setMode] = useState<'setup' | 'login'>(account ? 'login' : 'setup')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(undefined)
    if (busy) return
    if (!username.trim() || !password) {
      setError('Username and password are required.')
      return
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'setup') {
        if (!name.trim()) {
          setError('Your name is required.')
          setBusy(false)
          return
        }
        if (password !== confirm) {
          setError('Passwords do not match.')
          setBusy(false)
          return
        }
        await createAccount(name, username, password)
      } else {
        const ok = await verifyLogin(username, password)
        if (!ok) {
          setError('Wrong username or password.')
          setBusy(false)
          return
        }
      }
      onUnlock()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const greeting = mode === 'setup' ? 'Set your access' : 'Welcome back'

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
            <LockKey size={22} weight="regular" className="text-accent" aria-hidden />
          </div>
          <h1 className="mt-5 font-serif text-[30px] font-medium leading-none tracking-[-0.01em] text-ink">Kairo</h1>
          <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.24em] text-ink-2">schedule</p>
          <p className="mt-5 max-w-[260px] text-[13px] leading-relaxed text-ink-2">{greeting} — this preview is private to its owner.</p>
        </div>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-card">
          {mode === 'setup' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink">Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Basit"
                autoComplete="name"
                className="h-10 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={mode === 'setup' ? 'pick a username' : 'your username'}
              autoComplete="username"
              autoCapitalize="none"
              className="h-10 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
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
                autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 pr-10 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
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

          {mode === 'setup' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink">Confirm password</span>
              <input
                type={showPass ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="repeat it"
                autoComplete="new-password"
                className="h-10 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
              />
            </label>
          )}

          {error && <p className="text-xs leading-relaxed text-chip-red-text">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 inline-flex h-10 cursor-pointer select-none items-center justify-center gap-2 rounded-[10px] bg-btn text-sm font-medium tracking-[-0.01em] text-btn-text transition-colors duration-200 hover:bg-btn-hover disabled:pointer-events-none disabled:opacity-45"
          >
            <Sparkle size={14} weight="bold" aria-hidden />
            {busy ? 'One moment…' : mode === 'setup' ? 'Create my access' : 'Sign in'}
          </button>

          <p className="text-center font-mono text-[10px] tracking-[0.04em] text-ink-3">
            {mode === 'setup'
              ? 'This creates the single owner account for this preview.'
              : 'Private preview — sign in with the owner credentials.'}
          </p>
        </form>
      </motion.div>
    </div>
  )
}

/** Convenience wrapper so App can switch modes without prop drilling. */
export function accessInitialMode(): 'setup' | 'login' {
  try {
    return localStorage.getItem('access.account') ? 'login' : 'setup'
  } catch {
    return 'setup'
  }
}

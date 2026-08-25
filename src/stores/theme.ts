import { create } from 'zustand'
import { getSetting, setSetting } from '../lib/db'

export type Theme = 'light' | 'dark' | 'system'

export const THEME_KEY = 'mega.theme' // localStorage cache
const THEME_SETTING = 'app.theme' // durable source of truth (syncs nowhere, survives WebView storage loss)

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** The theme currently painted, whatever preference produced it. */
export function resolvedTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem(THEME_KEY)
  const theme: Theme = stored === 'dark' || stored === 'light' ? stored : 'system'
  return theme === 'dark' || (theme === 'system' && systemPrefersDark()) ? 'dark' : 'light'
}

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

function readStoredTheme(): Theme {
  const raw = localStorage.getItem(THEME_KEY)
  // '', 'system' and missing all mean "follow the system".
  return raw === 'dark' || raw === 'light' ? raw : 'system'
}

async function persist(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme === 'system' ? 'system' : theme)
  try {
    await setSetting(THEME_SETTING, theme)
  } catch {
    /* dexie unavailable (very early boot) — localStorage still holds it */
  }
}

export const useTheme = create<ThemeState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    void persist(theme)
    apply(theme)
    set({ theme })
  },
}))

apply(useTheme.getState().theme)

// Durable restore: Android WebViews may hydrate localStorage late (or lose it
// entirely under aggressive battery cleanup), which made saved themes revert
// to light on relaunch. Settings-table wins over the cache once it arrives.
void (async () => {
  try {
    const saved = (await getSetting(THEME_SETTING)) as Theme | undefined
    if (saved === 'dark' || saved === 'light' || saved === 'system') {
      if (saved !== readStoredTheme()) {
        localStorage.setItem(THEME_KEY, saved)
        useTheme.setState({ theme: saved })
        apply(saved)
      }
    } else if (!localStorage.getItem(THEME_KEY)) {
      // First run ever — remember the implicit default so it sticks.
      await persist('system')
    }
  } catch {
    /* ignore */
  }
})()

if (useTheme.getState().theme === 'system') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply('system'))
}

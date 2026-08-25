import { Monitor, Moon, Sun } from '@phosphor-icons/react'
import { useTheme, type Theme } from '../stores/theme'
import { cn } from '../lib/cn'

const OPTIONS: Array<{ value: Theme; icon: typeof Sun; label: string }> = [
  { value: 'light', icon: Sun, label: 'Light theme' },
  { value: 'system', icon: Monitor, label: 'Follow system theme' },
  { value: 'dark', icon: Moon, label: 'Dark theme' },
]

export function ThemeSegmented() {
  const { theme, setTheme } = useTheme()
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2 p-1">
      {OPTIONS.map(({ value, icon: IconCmp, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            'grid h-6.5 w-6.5 cursor-pointer place-items-center rounded-full transition-all duration-200',
            theme === value ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink',
          )}
        >
          <IconCmp size={13} weight={theme === value ? 'fill' : 'regular'} aria-hidden />
        </button>
      ))}
    </div>
  )
}

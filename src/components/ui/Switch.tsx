import { cn } from '../../lib/cn'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
        checked ? 'bg-accent' : 'bg-line-strong',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
          checked && 'translate-x-4',
        )}
      />
    </button>
  )
}

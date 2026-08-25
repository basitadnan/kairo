import { cn } from '../../lib/cn'

interface SectionHeaderProps {
  title: string
  hint?: string
  action?: React.ReactNode
  className?: string
}

export function SectionHeader({ title, hint, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-ink-2">{hint}</p>}
      </div>
      {action && <div className="shrink-0 pb-0.5">{action}</div>}
    </div>
  )
}

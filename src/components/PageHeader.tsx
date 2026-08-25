import { cn } from '../lib/cn'

interface PageHeaderProps {
  title: string
  sub?: string
  action?: React.ReactNode
  className?: string
}

export function PageHeader({ title, sub, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
      </div>
      {action && <div className="shrink-0 pb-0.5">{action}</div>}
    </div>
  )
}

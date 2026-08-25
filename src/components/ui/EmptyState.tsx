import type { Icon } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'

interface EmptyStateProps {
  icon: Icon
  title: string
  body: string
  action?: React.ReactNode
  className?: string
}

/** Composed empty state: soft icon disc, plain-language copy, optional primary action. */
export function EmptyState({ icon: IconCmp, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft">
        <IconCmp size={22} weight="regular" className="text-accent" aria-hidden />
      </div>
      <h3 className="mt-5 text-sm font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ink-2">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

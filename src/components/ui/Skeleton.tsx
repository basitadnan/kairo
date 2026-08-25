import { cn } from '../../lib/cn'

/** Layout-shaped loading placeholder; never a bare spinner. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-line/70 dark:bg-line', className)} />
}

const BAR_WIDTHS = ['w-1/3', 'w-full', 'w-5/6', 'w-full', 'w-2/3']

/** A surface card holding placeholder text bars — mirrors list-row layouts while live queries resolve. */
export function SkeletonCard({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('rounded-card border border-line bg-surface p-5 shadow-card', className)} aria-hidden>
      <div className="flex flex-col gap-3.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={cn('h-4', BAR_WIDTHS[i % BAR_WIDTHS.length])} />
        ))}
      </div>
    </div>
  )
}

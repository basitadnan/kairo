import { Link } from 'react-router-dom'
import { cn } from '../lib/cn'

/** Editorial lockup: Newsreader serif name + tracked mono descriptor. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" aria-label="Kairo home" className={cn('inline-flex select-none items-baseline gap-2', className)}>
      <span className="font-serif text-[21px] font-medium leading-none tracking-[-0.01em] text-ink">Kairo</span>
      <span className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-ink-2">schedule</span>
    </Link>
  )
}

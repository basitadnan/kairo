import type { ChipColor } from '../../lib/types'
import { cn } from '../../lib/cn'

const CHIP_CLASS: Record<ChipColor, string> = {
  red: 'bg-chip-red-bg text-chip-red-text',
  blue: 'bg-chip-blue-bg text-chip-blue-text',
  green: 'bg-chip-green-bg text-chip-green-text',
  yellow: 'bg-chip-yellow-bg text-chip-yellow-text',
  lavender: 'bg-chip-lavender-bg text-chip-lavender-text',
  teal: 'bg-chip-teal-bg text-chip-teal-text',
}

interface ChipProps {
  color?: ChipColor | 'neutral'
  className?: string
  children: React.ReactNode
}

/** Small uppercase pill used for course tags and status labels. */
export function Chip({ color = 'neutral', className, children }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.07em]',
        color === 'neutral' ? 'bg-surface-2 text-ink-2 border border-line' : CHIP_CLASS[color],
        className,
      )}
    >
      {children}
    </span>
  )
}

export const chipClassForColor = (color: ChipColor) => CHIP_CLASS[color]

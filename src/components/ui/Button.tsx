import { forwardRef } from 'react'
import type { HTMLMotionProps } from 'motion/react'
import { motion } from 'motion/react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'accent' | 'soft' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: Variant
  size?: Size
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-btn text-btn-text hover:bg-btn-hover',
  accent: 'bg-accent text-on-accent hover:bg-accent-strong',
  soft: 'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  danger: 'bg-transparent text-chip-red-text border border-line hover:border-line-strong hover:bg-surface-2',
}

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'inline-flex cursor-pointer select-none items-center justify-center rounded-[10px] font-medium tracking-[-0.01em]',
        'transition-colors duration-200 disabled:pointer-events-none disabled:opacity-45',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  )
})

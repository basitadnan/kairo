import { forwardRef } from 'react'
import { motion } from 'motion/react'
import { cn } from '../../lib/cn'

interface IconButtonProps extends React.HTMLAttributes<HTMLButtonElement> {
  label: string
}

/** Square ghost control for toolbars; requires a human-readable label for a11y. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, children, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.96 }}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-9 w-9 cursor-pointer place-items-center rounded-[10px] text-ink-2',
        'transition-colors duration-200 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  )
})

import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '../../lib/cn'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px] dark:bg-black/60"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'relative w-full max-w-md rounded-card border border-line bg-surface shadow-pop',
              className,
            )}
          >
            {title && (
              <h2 className="border-b border-line px-6 py-4 text-sm font-semibold tracking-tight text-ink">{title}</h2>
            )}
            <div className="px-6 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

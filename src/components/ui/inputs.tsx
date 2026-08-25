import { forwardRef, useId } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'

/* Label sits ABOVE the input; helper and error text live BELOW. No placeholder-as-label. */

const baseField =
  'w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-colors duration-200 focus:border-accent focus:outline-none disabled:opacity-50'

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label?: string
  hint?: string
  error?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-chip-red-text">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-2">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(baseField, 'h-10', className)} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(baseField, 'min-h-[84px] py-2.5', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    const id = useId()
    return (
      <div className="relative">
        <select ref={ref} className={cn(baseField, 'h-10 appearance-none pr-9', className)} {...rest}>
          {children}
        </select>
        <CaretDown size={14} weight="bold" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden id={id} />
      </div>
    )
  },
)

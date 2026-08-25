import { forwardRef } from 'react'
import { cn } from '../../lib/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds a gentle hover lift (border deepen + softer, larger shadow). */
  interactive?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-card border border-line bg-surface shadow-card',
        interactive &&
          'cursor-pointer transition-[border-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-line-strong hover:shadow-card-hover',
        className,
      )}
      {...rest}
    />
  )
})

import { NavLink } from 'react-router-dom'
import { MORE_ITEM, TAB_ITEMS, type NavItem } from './nav'
import { cn } from '../lib/cn'

function Tab({ item }: { item: NavItem }) {
  const IconCmp = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'mx-auto flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-colors duration-200',
          'min-h-[48px] justify-center', // 48dp touch target
          isActive ? 'text-accent' : 'text-ink-3 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'grid h-7 w-12 place-items-center rounded-full transition-colors duration-200',
              isActive && 'bg-accent-soft',
            )}
          >
            <IconCmp size={19} weight={isActive ? 'fill' : 'regular'} aria-hidden />
          </span>
          <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/** Mobile bottom navigation. Fixed; content clears it via wrapper padding. */
export function TabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}
    >
      <div className="grid grid-cols-5 px-2 pt-1">
        {TAB_ITEMS.map((item) => (
          <Tab key={item.to} item={item} />
        ))}
        <Tab item={MORE_ITEM} />
      </div>
    </nav>
  )
}

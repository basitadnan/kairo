import { NavLink } from 'react-router-dom'
import { SIDEBAR_FOOTER, SIDEBAR_MAIN, type NavItem } from './nav'
import { Wordmark } from './Wordmark'
import { ThemeSegmented } from './ThemeSegmented'
import { SyncStatus } from './SyncStatus'
import { cn } from '../lib/cn'

function SidebarLink({ item }: { item: NavItem }) {
  const IconCmp = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-sm transition-colors duration-200',
          isActive ? 'bg-accent-soft font-medium text-accent-strong' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      <IconCmp size={17} weight="regular" aria-hidden />
      {item.label}
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden w-[228px] shrink-0 flex-col border-r border-line px-4 pb-5 pt-7 lg:flex">
      <div className="px-2">
        <Wordmark />
      </div>

      <nav className="mt-9 flex flex-col gap-0.5" aria-label="Primary">
        {SIDEBAR_MAIN.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <nav className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3" aria-label="Secondary">
        {SIDEBAR_FOOTER.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="mt-4 flex items-center justify-between px-1">
        <SyncStatus />
        <ThemeSegmented />
      </div>
    </aside>
  )
}

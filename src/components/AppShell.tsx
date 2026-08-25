import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { GearSix } from '@phosphor-icons/react'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { Wordmark } from './Wordmark'
import { SyncStatus } from './SyncStatus'
import { ThemeSegmented } from './ThemeSegmented'
import { IconButton } from './ui/IconButton'
import { Link } from 'react-router-dom'

/**
 * Responsive chrome: sidebar on desktop (>= lg), sticky top bar + bottom tabs on mobile.
 * Route changes get a quiet fade-rise; transform/opacity only.
 */
export function AppShell() {
  const location = useLocation()
  return (
    <div className="flex h-dvh bg-canvas text-ink">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur-md lg:hidden">
          <Wordmark />
          <div className="flex items-center gap-1.5">
            <SyncStatus className="mr-1" />
            <ThemeSegmented />
            <Link to="/settings" aria-label="Settings">
              <IconButton label="Settings">
                <GearSix size={18} aria-hidden />
              </IconButton>
            </Link>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto w-full max-w-[860px] px-5 pb-32 pt-8 sm:px-8 lg:pb-14"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      <TabBar />
    </div>
  )
}

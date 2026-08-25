import { NavLink } from 'react-router-dom'
import { motion } from 'motion/react'
import { CaretRight } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { SIDEBAR_FOOTER, SIDEBAR_MAIN } from '../components/nav'

const EXTRA = SIDEBAR_MAIN.filter((i) => !['/', '/schedule', '/tasks', '/exams'].includes(i.to))
const ITEMS = [...EXTRA, ...SIDEBAR_FOOTER]

/** Mobile hub for destinations that don't earn a tab. */
export function MoreScreen() {
  return (
    <div>
      <PageHeader title="More" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6"
      >
        <Card className="divide-y divide-line">
          {ITEMS.map((item) => {
            const IconCmp = item.icon
            return (
              <NavLink key={item.to} to={item.to} className="flex min-h-[52px] items-center gap-3.5 px-5 transition-colors duration-200 hover:bg-surface-2">
                <IconCmp size={18} weight="regular" className="text-ink-2" aria-hidden />
                <span className="flex-1 text-sm font-medium text-ink">{item.label}</span>
                <CaretRight size={14} className="text-ink-3" aria-hidden />
              </NavLink>
            )
          })}
        </Card>
      </motion.div>
    </div>
  )
}

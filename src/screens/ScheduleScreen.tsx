import { useState } from 'react'
import { format, startOfWeek, addDays } from 'date-fns'
import { motion } from 'motion/react'
import { CalendarBlank, Plus } from '@phosphor-icons/react'
import { useCoreData, activeCourses, courseOf } from '../lib/core-data'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { ClassModal } from '../components/modals/ClassModal'
import { CoursesModal } from '../components/modals/CoursesModal'
import { SkeletonCard } from '../components/ui/Skeleton'
import { minutesToLabel, todayISO } from '../lib/format'
import type { ClassSlot } from '../lib/types'

const DAY_COL = 76 // left column holding the day labels
const ROW_H = 60 // height of each day row
const DAY_START = 8 * 60 // time axis begins at 08:00
const PX_PER_HOUR = 62 // horizontal scale
const GRID_HOURS = 14 // 08:00 → 22:00
const GRID_W = GRID_HOURS * PX_PER_HOUR

export function ScheduleScreen() {
  const { courses, slots, ready } = useCoreData()
  const liveCourses = activeCourses(courses)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ClassSlot | null>(null)
  const [managingCourses, setManagingCourses] = useState(false)

  const today = todayISO()
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()

  const liveSlots = slots.filter((s) => !s.deleted && s.validFrom <= today && (!s.validTo || s.validTo >= today))

  const slotsForDay = (day: Date): ClassSlot[] =>
    liveSlots
      .filter((s) => s.dayOfWeek === day.getDay())
      .sort((a, b) => a.startMin - b.startMin)

  if (!ready) {
    return (
      <div>
        <PageHeader
          title="Timetable"
          sub="Your recurring weekly classes"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="soft" disabled>Courses</Button>
              <Button size="sm" disabled><Plus size={14} weight="bold" aria-hidden /> Add class</Button>
            </div>
          }
        />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6"
        >
          <SkeletonCard rows={6} />
        </motion.div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Timetable"
        sub="Your recurring weekly classes"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="soft" onClick={() => setManagingCourses(true)}>Courses</Button>
            <Button size="sm" onClick={() => setAdding(true)}><Plus size={14} weight="bold" aria-hidden /> Add class</Button>
          </div>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6"
      >
        <Card className="overflow-x-auto">
          <div className="flex min-w-[944px]">
            {/* Day label column */}
            <div className="w-[76px] shrink-0">
              <div className="h-9 border-b border-line" />
              {days.map((d, i) => {
                const isToday = format(d, 'yyyy-MM-dd') === today
                return (
                  <div
                    key={d.toISOString()}
                    className={`grid h-[60px] place-items-center ${i > 0 ? 'border-t border-line' : ''} ${
                      isToday ? 'rounded-l-lg bg-accent-soft/45 dark:bg-accent-soft/60' : ''
                    }`}
                  >
                    <div className="text-center">
                      <p className={`font-mono text-[9.5px] uppercase tracking-[0.16em] ${isToday ? 'text-accent' : 'text-ink-3'}`}>
                        {format(d, 'EEE')}
                      </p>
                      <p className={`tnum mt-0.5 text-[15px] font-semibold leading-none ${isToday ? 'text-accent-strong' : 'text-ink'}`}>
                        {format(d, 'd')}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Time axis area */}
            <div className="min-w-0 flex-1">
              {/* Hour header */}
              <div className="relative h-9 border-b border-line">
                <span className="tnum absolute bottom-1.5 left-1.5 font-mono text-[9px] text-ink-3">08</span>
                {Array.from({ length: GRID_HOURS - 1 }, (_, i) => (
                  <span
                    key={i}
                    className="tnum absolute bottom-1.5 -translate-x-1/2 font-mono text-[9px] text-ink-3"
                    style={{ left: (i + 1) * PX_PER_HOUR }}
                  >
                    {String(8 + i + 1).padStart(2, '0')}
                  </span>
                ))}
                <span className="tnum absolute bottom-1.5 right-1.5 font-mono text-[9px] text-ink-3">22</span>
              </div>

              {/* Day rows */}
              <div className="relative">
                {days.map((d, rowIdx) => {
                  const isToday = format(d, 'yyyy-MM-dd') === today
                  const showNowLine = isToday && nowMin >= DAY_START && nowMin <= DAY_START + GRID_W / (PX_PER_HOUR / 60)
                  return (
                    <div
                      key={d.toISOString()}
                      className={`relative h-[60px] ${rowIdx > 0 ? 'border-t border-line' : ''} ${
                        isToday ? 'rounded-r-lg bg-accent-soft/45 dark:bg-accent-soft/60' : ''
                      }`}
                    >
                      {/* Hour gridlines (under the pills) */}
                      {Array.from({ length: GRID_HOURS + 1 }, (_, i) => (
                        <span
                          key={i}
                          className="absolute inset-y-0 border-l border-line/70"
                          style={{ left: i * PX_PER_HOUR }}
                          aria-hidden
                        />
                      ))}

                      {/* Now line for today's row */}
                      {showNowLine && (
                        <span
                          className="absolute inset-y-0 z-10 w-px bg-accent/70"
                          style={{ left: ((nowMin - DAY_START) / 60) * PX_PER_HOUR }}
                          aria-hidden
                        >
                          <span className="absolute -left-[3px] top-0 h-[7px] w-[7px] rounded-full bg-accent" />
                        </span>
                      )}

                      {/* Classes */}
                      {slotsForDay(d).map((slot) => {
                        if (slot.endMin <= DAY_START || slot.startMin >= DAY_START + GRID_HOURS * 60) return null
                        const course = courseOf(liveCourses, slot.courseId)
                        const color = course?.color
                        const left = ((slot.startMin - DAY_START) / 60) * PX_PER_HOUR
                        const width = Math.max(((slot.endMin - slot.startMin) / 60) * PX_PER_HOUR - 3, 26)
                        const isNow = isToday && slot.startMin <= nowMin && slot.endMin > nowMin
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setEditing(slot)}
                            title={`${course?.name ?? 'Untitled'} · ${minutesToLabel(slot.startMin)}–${minutesToLabel(slot.endMin)}`}
                            className={`absolute inset-y-1 z-[5] flex cursor-pointer flex-col justify-center overflow-hidden rounded-lg px-2 text-left transition-all duration-200 hover:brightness-[0.97] active:scale-[0.98] ${
                              !color ? 'bg-surface-2 text-ink' : ''
                            } ${isNow ? 'ring-2 ring-accent' : ''}`}
                            style={{
                              left,
                              width,
                              ...(color ? { background: `var(--chip-${color}-bg)`, color: `var(--chip-${color}-text)` } : {}),
                            }}
                          >
                            <p className="truncate text-[11px] font-semibold leading-tight">{course?.name ?? 'Untitled'}</p>
                            {width > 84 && (
                              <p className="tnum mt-0.5 font-mono text-[9px] leading-none opacity-80">
                                {minutesToLabel(slot.startMin)}
                              </p>
                            )}
                            {width > 168 && slot.room && (
                              <p className="mt-0.5 truncate text-[9.5px] leading-none opacity-75">{slot.room}</p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}

                {liveSlots.length === 0 && (
                  <div className="absolute inset-0 grid place-items-center">
                    <EmptyState
                      icon={CalendarBlank}
                      title="No classes yet"
                      body="Build your week once and it repeats every week after. Start with your first subject."
                      action={<Button variant="soft" onClick={() => setAdding(true)}>Add your first class</Button>}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <p className="mt-3 font-mono text-[11px] tracking-[0.02em] text-ink-3">
          Tip: click any class block to edit or delete it.
        </p>
      </motion.div>

      <ClassModal open={adding} onClose={() => setAdding(false)} />
      <ClassModal open={editing !== null} onClose={() => setEditing(null)} slot={editing} />
      <CoursesModal open={managingCourses} onClose={() => setManagingCourses(false)} />
    </div>
  )
}

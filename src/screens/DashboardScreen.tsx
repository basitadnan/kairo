import { format } from 'date-fns'
import { motion } from 'motion/react'
import { ArrowRight, CalendarBlank, Leaf, ListChecks } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { useCoreData, activeCourses, courseOf, useAttendanceFor } from '../lib/core-data'
import { greeting, minutesToLabel, relativeDue, todayISO } from '../lib/format'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { EmptyState } from '../components/ui/EmptyState'
import { SectionHeader } from '../components/ui/SectionHeader'
import { SkeletonCard } from '../components/ui/Skeleton'
import { QuickAddBar } from '../components/quick-add/QuickAddBar'
import { AttendanceMarkingRow } from '../components/attendance/AttendanceMarking'
import { daysUntilLabel } from '../lib/format'

const rise = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
}

export function DashboardScreen() {
  const { courses, slots, exams, assignments, personalItems, ready } = useCoreData()
  const liveCourses = activeCourses(courses)
  const today = todayISO()
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const todayAttendance = useAttendanceFor(today)

  const todaySlots = slots
    .filter((s) => !s.deleted && s.dayOfWeek === new Date().getDay() && s.validFrom <= today && (!s.validTo || s.validTo >= today))
    .sort((a, b) => a.startMin - b.startMin)
  const nextUp = todaySlots.find((s) => s.endMin > nowMin)

  // "Due soon" mixes open assignments with today's personal items so the
  // dashboard reflects everything on your plate. Personal items have no dates
  // — daily/one-off ones count as today; weekly ones only on their day.
  const todayDow = new Date().getDay()
  type DueEntry =
    | { kind: 'task'; id: string; at: number; task: (typeof assignments)[number] }
    | { kind: 'personal'; id: string; at: number; item: (typeof personalItems)[number] }

  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const dueSoon: DueEntry[] = [
    ...assignments
      .filter((a) => !a.deleted && a.status === 'todo')
      .map((task): DueEntry => ({ kind: 'task', id: task.id, at: task.dueAt ?? Number.MAX_SAFE_INTEGER, task })),
    ...personalItems
      .filter((p) => {
        if (p.deleted) return false
        if (p.recurrence === 'weekly') return p.dayOfWeek === todayDow
        return true
      })
      .map((item): DueEntry => {
        const at =
          item.timeMin != null
            ? dayStart.getTime() + item.timeMin * 60_000
            : dayStart.getTime() + (23 * 60 + 59) * 60_000 // undated → end of today
        return { kind: 'personal', id: item.id, at, item }
      }),
  ]
    .sort((a, b) => a.at - b.at)
    .slice(0, 6)

  const upcomingExams = exams
    .filter((e) => !e.deleted)
    .filter((e) => Number(e.dateISO.replaceAll('-', '')) >= Number(today.replaceAll('-', '')))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
    .slice(0, 6)

  const totallyEmpty =
    liveCourses.length === 0 && slots.length === 0 && exams.length === 0 && assignments.length === 0 && personalItems.length === 0

  const PRIORITY_COLOR = { high: 'red', med: 'yellow', low: 'green' } as const

  return (
    <div className="flex flex-col gap-10">
      {/* Greeting */}
      <motion.header {...rise} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{format(new Date(), 'EEEE · d MMMM yyyy')}</p>
        <h1 className="mt-2 font-serif text-[32px] font-medium leading-[1.15] tracking-[-0.01em] text-ink">
          {greeting()}.
        </h1>
      </motion.header>

      <QuickAddBar />

      {!ready ? (
        <motion.div {...rise} transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }} className="flex flex-col gap-6">
          <SectionHeader title="Today" />
          <SkeletonCard rows={3} />
          <SectionHeader title="Due soon" />
          <SkeletonCard rows={4} />
        </motion.div>
      ) : totallyEmpty ? (
        <motion.div {...rise} transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}>
          <Card className="overflow-hidden">
            <EmptyState
              icon={CalendarBlank}
              title="Your semester starts here"
              body="Add your courses and timetable, import an exam schedule, and everything shows up on this page. Start with Import once AI lands, or add things manually from each section."
              action={
                <Link to="/schedule">
                  <Button variant="primary">Set up your timetable</Button>
                </Link>
              }
            />
          </Card>
        </motion.div>
      ) : (
        <>
          {/* Next up */}
          {nextUp && (
            <motion.section {...rise} transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}>
              <SectionHeader title="Next up" />
              <NextUpCard slot={nextUp} courses={liveCourses} />
            </motion.section>
          )}

          {/* Today's classes */}
          {todaySlots.length > 0 && (
            <motion.section {...rise} transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}>
              <SectionHeader
                title="Today"
                hint={`${todaySlots.length} ${todaySlots.length === 1 ? 'class' : 'classes'}`}
                action={<Link to="/attendance" className="text-[13px] font-medium text-accent hover:text-accent-strong">Attendance</Link>}
              />
              <Card className="mt-3 divide-y divide-line">
                {todaySlots.map((slot) => (
                  <AttendanceMarkingRow key={slot.id} slot={slot} dateISO={today} records={todayAttendance} courses={liveCourses} />
                ))}
              </Card>
            </motion.section>
          )}

          {/* Due soon — assignments + today's personal items */}
          <motion.section {...rise} transition={{ duration: 0.45, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}>
            <SectionHeader
              title="Due soon"
              action={<Link to="/tasks" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-strong">All tasks <ArrowRight size={12} weight="bold" aria-hidden /></Link>}
            />
            {dueSoon.length === 0 ? (
              <Card className="mt-3">
                <EmptyState icon={ListChecks} title="Nothing due" body="Assignments with deadlines and today's personal items gather here." className="py-10" />
              </Card>
            ) : (
              <Card className="mt-3 divide-y divide-line">
                {dueSoon.map((entry) =>
                  entry.kind === 'task' ? (
                    <div key={entry.id} className="flex items-center gap-3 px-5 py-3.5">
                      <Chip color={PRIORITY_COLOR[entry.task.priority]}>{entry.task.priority}</Chip>
                      <p className="min-w-0 flex-1 truncate text-sm text-ink">{entry.task.title}</p>
                      <span className="shrink-0 font-mono text-xs text-ink-2">
                        {entry.task.dueAt ? relativeDue(entry.task.dueAt) : 'No date'}
                      </span>
                    </div>
                  ) : (
                    <div key={entry.id} className="flex items-center gap-3 px-5 py-3.5">
                      <Leaf size={15} weight="regular" className="shrink-0 text-accent" aria-hidden />
                      <p className="min-w-0 flex-1 truncate text-sm text-ink">{entry.item.title}</p>
                      <span className="tnum shrink-0 font-mono text-xs text-ink-2">
                        {entry.item.timeMin != null ? minutesToLabel(entry.item.timeMin) : 'anytime'}
                      </span>
                    </div>
                  ),
                )}
              </Card>
            )}
          </motion.section>

          {/* Exam countdowns */}
          {upcomingExams.length > 0 && (
            <motion.section {...rise} transition={{ duration: 0.45, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}>
              <SectionHeader
                title="Exams"
                action={<Link to="/exams" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-strong">All exams <ArrowRight size={12} weight="bold" aria-hidden /></Link>}
              />
              <div className="-mx-1 mt-3 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
                {upcomingExams.map((exam) => (
                  <Card key={exam.id} className="min-w-[190px] snap-start p-4">
                    <p className="tnum font-mono text-[26px] leading-none text-ink">{daysUntil(exam.dateISO)}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">days away</p>
                    <p className="mt-3 truncate text-sm font-medium text-ink">{exam.title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-2">{format(new Date(`${exam.dateISO}T00:00:00`), 'EEE d MMM')}{exam.startMin != null ? ` · ${minutesToLabel(exam.startMin)}` : ''}</p>
                  </Card>
                ))}
              </div>
            </motion.section>
          )}
        </>
      )}
    </div>
  )
}

function daysUntil(dateISO: string): number | string {
  const target = new Date(`${dateISO}T00:00:00`)
  const now = new Date()
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  const d = Math.round((target.getTime() - now.getTime()) / 86_400_000)
  return d >= 0 ? d : '·'
}

function NextUpCard({ slot, courses }: { slot: import('../lib/types').ClassSlot; courses: import('../lib/types').Course[] }) {
  const course = courseOf(courses, slot.courseId)
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const minsAway = slot.startMin - nowMin
  return (
    <Card interactive className="mt-3 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
            {minsAway > 0 ? `in ${minsAway} min` : 'happening now'}
          </p>
          <p className="mt-1.5 truncate text-base font-semibold tracking-tight text-ink">{course?.name ?? 'Untitled course'}</p>
          <p className="mt-1 text-[13px] text-ink-2">
            <span className="tnum font-mono">{minutesToLabel(slot.startMin)}–{minutesToLabel(slot.endMin)}</span>
            {slot.room ? ` · ${slot.room}` : ''}
          </p>
        </div>
        {course && <Chip color={course.color}>{slot.kind}</Chip>}
      </div>
    </Card>
  )
}

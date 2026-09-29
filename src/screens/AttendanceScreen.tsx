import { useState } from 'react'
import { motion } from 'motion/react'
import { CalendarCheck, Trash } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCoreData, activeCourses, courseOf, useAttendanceFor } from '../lib/core-data'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { Chip } from '../components/ui/Chip'
import { EmptyState } from '../components/ui/EmptyState'
import { IconButton } from '../components/ui/IconButton'
import { SectionHeader } from '../components/ui/SectionHeader'
import { SkeletonCard } from '../components/ui/Skeleton'
import { StatusButton, AttendanceMarkingRow } from '../components/attendance/AttendanceMarking'
import { CatchUpList } from '../components/attendance/CatchUp'
import {
  ATTENDANCE_META,
  ATTENDANCE_ORDER,
  ATT_KEYS,
  attendanceTarget,
  catchUpStart,
  insightFor,
  markAttendance,
  statsFor,
} from '../lib/attendance'
import { db, softDelete } from '../lib/db'
import { addDaysISO, todayISO } from '../lib/format'
import type { ClassSlot } from '../lib/types'

function safeSkipLabel(safe: number): string {
  if (safe <= 0) return 'no slack left — the next absence breaks it'
  return `you can miss ${safe} more ${safe === 1 ? 'class' : 'classes'}`
}

export function AttendanceScreen() {
  const { courses, slots, ready } = useCoreData()
  const liveCourses = activeCourses(courses)
  const today = todayISO()
  const todayRecords = useAttendanceFor(today)
  const allRecords = useLiveQuery(() => db.attendance.toArray(), []) ?? []
  const targetRow = useLiveQuery(() => db.settings.get(ATT_KEYS.target), [])
  const sinceRow = useLiveQuery(() => db.settings.get(ATT_KEYS.since), [])
  const [openRow, setOpenRow] = useState<string | undefined>()

  const target = attendanceTarget(targetRow?.value)
  const catchUpFrom = catchUpStart(slots, sinceRow?.value)
  const catchUpTo = addDaysISO(today, -1)

  const liveSlotsToday = slots.filter(
    (s: ClassSlot) => !s.deleted && s.dayOfWeek === new Date().getDay() && s.validFrom <= today && (!s.validTo || s.validTo >= today),
  )
  liveSlotsToday.sort((a, b) => a.startMin - b.startMin)

  const markedToday = liveSlotsToday.filter((s) => todayRecords.some((r) => !r.deleted && r.slotId === s.id)).length

  const overall = statsFor(allRecords)
  const overallOnTrack = overall.percent != null && overall.percent >= target

  // Worst first: the course that most needs your attention sits at the top.
  const insights = liveCourses
    .map((course) => ({ course, insight: insightFor(allRecords, course.id, target) }))
    .filter((x) => x.insight.totalMarked > 0)
    .sort((a, b) => (a.insight.percent ?? 101) - (b.insight.percent ?? 101))

  const history = allRecords
    .filter((r) => !r.deleted)
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.createdAt - a.createdAt)
    .slice(0, 40)

  if (!ready) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Attendance" sub="Show up, keep score" />
        <div className="flex flex-col gap-3">
          <SectionHeader title="Semester so far" />
          <SkeletonCard rows={2} />
          <SectionHeader title="Today" />
          <SkeletonCard rows={3} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Attendance" sub="Show up, keep score" />

      {/* Overall + per-course */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-3"
      >
        <SectionHeader title="Semester so far" hint={overall.totalMarked > 0 ? `${overall.attended}/${overall.totalMarked} attended` : undefined} />
        <Card className="p-5">
          {overall.percent == null ? (
            <EmptyState
              icon={CalendarCheck}
              title="No attendance yet"
              body="Mark classes below or straight from Today — cancelled classes never count against you. Fell behind? The catch-up list below takes them in bulk."
              className="py-6"
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-5">
                <span className="tnum font-mono text-[34px] leading-none text-ink">{overall.percent}%</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${overallOnTrack ? 'bg-accent' : 'bg-chip-red-text'}`}
                    style={{ width: `${overall.percent}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-ink-2">
                Target <span className="font-medium text-ink">{target}%</span> ·{' '}
                {overallOnTrack ? safeSkipLabel(Math.max(0, Math.floor(overall.attended / (target / 100) - overall.totalMarked))) : 'below target, see insights below'}
              </p>
            </div>
          )}
        </Card>

        {insights.length > 0 && (
          <Card className="divide-y divide-line">
            {insights.map(({ course, insight }) => (
              <div key={course.id} className="flex items-center gap-4 px-5 py-3.5">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: `var(--chip-${course.color}-bg)`, border: `1.5px solid var(--chip-${course.color}-text)` }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="truncate text-sm font-medium text-ink">{course.name}</p>
                    <span className="shrink-0 font-mono text-[11px] text-ink-3">
                      {insight.attended}/{insight.totalMarked}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${insight.onTrack ? 'bg-accent' : 'bg-chip-red-text'}`}
                      style={{ width: `${insight.percent ?? 0}%` }}
                    />
                  </div>
                </div>
                <div className="w-[104px] shrink-0 text-right">
                  <p className="tnum font-mono text-sm text-ink">{insight.percent != null ? `${insight.percent}%` : '—'}</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-ink-2">
                    {insight.onTrack
                      ? insight.safeSkips > 0
                        ? `can miss ${insight.safeSkips} more`
                        : 'no slack left'
                      : `attend ${insight.recoverIn} in a row`}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </motion.section>

      {/* Today */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-3"
      >
        <SectionHeader
          title="Today"
          hint={
            liveSlotsToday.length === 0
              ? 'No classes'
              : `${markedToday}/${liveSlotsToday.length} marked`
          }
        />
        {liveSlotsToday.length === 0 ? (
          <Card>
            <EmptyState icon={CalendarCheck} title="Nothing scheduled" body="Enjoy the day off." className="py-6" />
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {liveSlotsToday.map((slot) => (
              <AttendanceMarkingRow key={slot.id} slot={slot} dateISO={today} records={todayRecords} courses={liveCourses} />
            ))}
          </Card>
        )}
      </motion.section>

      {/* Catch up — everything since the semester started that never got a mark */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-3"
      >
        <SectionHeader
          title="Catch up"
          hint={`Every class since ${format(new Date(`${catchUpFrom}T00:00:00`), 'd MMM')} without a mark.`}
        />
        <CatchUpList slots={slots} records={allRecords} courses={liveCourses} fromISO={catchUpFrom} toISO={catchUpTo} />
      </motion.section>

      {/* History */}
      {history.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3"
        >
          <SectionHeader title="Recent" hint={`${history.length}`} />
          <Card className="divide-y divide-line">
            {history.map((r) => {
              const course = courseOf(liveCourses, r.courseId)
              const meta = ATTENDANCE_META[r.status]
              const isOpen = openRow === r.id
              return (
                <div key={r.id}>
                  <button
                    onClick={() => setOpenRow(isOpen ? undefined : r.id)}
                    className="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors duration-150 hover:bg-surface-2"
                    title="Change status"
                  >
                    <span className="w-[86px] shrink-0 font-mono text-xs text-ink-2">
                      {format(new Date(`${r.dateISO}T00:00:00`), 'EEE d MMM')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {course?.name ?? (r.slotId ? 'Class' : 'Unknown course')}
                    </span>
                    {r.auto && !isOpen && (
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3" title="Recorded automatically">
                        auto
                      </span>
                    )}
                    <Chip color={meta.chip}>{meta.label}</Chip>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-2 border-t border-line bg-surface-2 px-5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {ATTENDANCE_ORDER.map((status) => (
                            <StatusButton
                              key={status}
                              status={status}
                              active={r.status === status}
                              onClick={() => void markAttendance({ courseId: r.courseId, slotId: r.slotId, dateISO: r.dateISO, status })}
                            />
                          ))}
                        </div>
                        <IconButton
                          label="Delete record"
                          onClick={() => void softDelete(db.attendance, r.id)}
                          className="hover:text-chip-red-text"
                        >
                          <Trash size={14} aria-hidden />
                        </IconButton>
                      </div>
                      {r.auto && (
                        <p className="text-[11px] text-ink-2">
                          Kairo recorded this one because the reminders went unanswered — tap <span className="font-medium text-ink">Present</span> if you were actually there.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </Card>
        </motion.section>
      )}
    </div>
  )
}

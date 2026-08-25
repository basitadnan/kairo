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
import {
  ATTENDANCE_META,
  ATTENDANCE_ORDER,
  markAttendance,
  statsFor,
} from '../lib/attendance'
import { db, softDelete } from '../lib/db'
import { todayISO } from '../lib/format'
import type { ClassSlot } from '../lib/types'

export function AttendanceScreen() {
  const { courses, slots, ready } = useCoreData()
  const liveCourses = activeCourses(courses)
  const today = todayISO()
  const todayRecords = useAttendanceFor(today)
  const allRecords = useLiveQuery(() => db.attendance.toArray(), []) ?? []
  const [openRow, setOpenRow] = useState<string | undefined>()

  const liveSlotsToday = slots.filter(
    (s: ClassSlot) => !s.deleted && s.dayOfWeek === new Date().getDay() && s.validFrom <= today && (!s.validTo || s.validTo >= today),
  )
  liveSlotsToday.sort((a, b) => a.startMin - b.startMin)

  const overall = statsFor(allRecords)
  const perCourse = liveCourses
    .map((c) => ({ course: c, stats: statsFor(allRecords, c.id) }))
    .filter((x) => x.stats.totalMarked > 0)

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
              body="Mark classes below or straight from Today — cancelled classes never count against you."
              className="py-6"
            />
          ) : (
            <div className="flex items-center gap-5">
              <span className="tnum font-mono text-[34px] leading-none text-ink">{overall.percent}%</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${overall.percent}%` }} />
              </div>
            </div>
          )}
        </Card>

        {perCourse.length > 0 && (
          <Card className="divide-y divide-line">
            {perCourse.map(({ course, stats }) => (
              <div key={course.id} className="flex items-center gap-4 px-5 py-3.5">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: `var(--chip-${course.color}-bg)`, border: `1.5px solid var(--chip-${course.color}-text)` }}
                  aria-hidden
                />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{course.name}</p>
                <span className="shrink-0 font-mono text-xs text-ink-2">{stats.attended}/{stats.totalMarked}</span>
                <span className="tnum w-[52px] shrink-0 text-right font-mono text-sm text-ink">
                  {stats.percent != null ? `${stats.percent}%` : '—'}
                </span>
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
        <SectionHeader title="Today" hint={`${liveSlotsToday.length} ${liveSlotsToday.length === 1 ? 'class' : 'classes'}`} />
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
                    <Chip color={meta.chip}>{meta.label}</Chip>
                  </button>
                  {isOpen && (
                    <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2 px-5 py-2.5">
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

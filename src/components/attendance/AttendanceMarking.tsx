import { minutesToLabel } from '../../lib/format'
import { courseOf } from '../../lib/core-data'
import {
  ATTENDANCE_META,
  ATTENDANCE_ORDER,
  markAttendance,
} from '../../lib/attendance'
import type { Attendance, AttendanceStatus, ClassSlot, Course } from '../../lib/types'

/**
 * One class occurrence with inline Present/Late/Absent/Cancelled controls,
 * shown once the class has started. Used on the dashboard and Attendance screen;
 * marks are unique per slot per day, so re-tapping another status simply corrects.
 */
export function AttendanceMarkingRow({
  slot,
  dateISO,
  records,
  courses,
}: {
  slot: ClassSlot
  dateISO: string
  records: Attendance[]
  courses: Course[]
}) {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const existing = records.find((r) => !r.deleted && r.slotId === slot.id)
  const started = slot.startMin <= nowMin
  const course = courseOf(courses, slot.courseId)

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-4">
        <span className="tnum w-[52px] shrink-0 font-mono text-[13px] text-ink-2">{minutesToLabel(slot.startMin)}</span>
        <span className="h-8 w-px shrink-0 bg-line" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{course?.name ?? 'Untitled course'}</p>
          <p className="mt-0.5 truncate text-xs capitalize text-ink-2">
            {slot.kind}
            {slot.room ? ` · ${slot.room}` : ''}
          </p>
        </div>
        {!started && existing && (
          <StatusChip status={existing.status} />
        )}
      </div>
      {started && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 pl-[68px]">
          {ATTENDANCE_ORDER.map((status) => (
            <StatusButton
              key={status}
              status={status}
              active={existing?.status === status}
              onClick={() => void markAttendance({ courseId: slot.courseId, slotId: slot.id, dateISO, status })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function StatusChip({ status }: { status: AttendanceStatus }) {
  const meta = ATTENDANCE_META[status]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] ${
        meta.chip === 'neutral' ? 'border border-line bg-surface-2 text-ink-2' : ''
      }`}
      style={
        meta.chip !== 'neutral'
          ? { background: `var(--chip-${meta.chip}-bg)`, color: `var(--chip-${meta.chip}-text)` }
          : undefined
      }
    >
      {meta.label}
    </span>
  )
}

export function StatusButton({ status, active, onClick }: { status: AttendanceStatus; active: boolean; onClick: () => void }) {
  const meta = ATTENDANCE_META[status]
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ${
        active ? '' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
      }`}
      style={
        active && meta.chip !== 'neutral'
          ? { background: `var(--chip-${meta.chip}-bg)`, borderColor: `var(--chip-${meta.chip}-text)`, color: `var(--chip-${meta.chip}-text)` }
          : active
            ? { background: 'var(--c-surface-2)', borderColor: 'var(--c-line-strong)', color: 'var(--c-ink)' }
            : undefined
      }
    >
      {meta.label}
    </button>
  )
}

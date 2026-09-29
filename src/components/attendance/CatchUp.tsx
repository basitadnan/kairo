import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle, CaretDown } from '@phosphor-icons/react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { courseOf } from '../../lib/core-data'
import {
  ATTENDANCE_ORDER,
  groupByDay,
  markAttendance,
  occurrencesBetween,
  unmarkedOccurrences,
  type Occurrence,
} from '../../lib/attendance'
import { minutesToLabel } from '../../lib/format'
import { StatusButton } from './AttendanceMarking'
import type { Attendance, ClassSlot, Course } from '../../lib/types'

const DAYS_AT_ONCE = 10

/**
 * Every past class occurrence that has no mark yet, newest day first, with the
 * same one-tap status buttons used on Today — plus a per-day and whole-list
 * "everyone was present" shortcut for the common case of catching up in bulk.
 */
export function CatchUpList({
  slots,
  records,
  courses,
  fromISO,
  toISO,
}: {
  slots: ClassSlot[]
  records: Attendance[]
  courses: Course[]
  fromISO: string
  toISO: string
}) {
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)

  const pending = useMemo(
    () => unmarkedOccurrences(occurrencesBetween(slots, fromISO, toISO), records),
    [slots, records, fromISO, toISO],
  )
  const days = useMemo(() => groupByDay(pending), [pending])
  const visible = showAll ? days : days.slice(0, DAYS_AT_ONCE)
  const hidden = days.length - visible.length

  if (pending.length === 0) {
    return (
      <Card className="flex items-center gap-3 px-5 py-4">
        <CheckCircle size={18} weight="fill" className="shrink-0 text-chip-green-text" aria-hidden />
        <p className="text-sm text-ink-2">Everything since {format(new Date(`${fromISO}T00:00:00`), 'd MMM')} is marked. Nice.</p>
      </Card>
    )
  }

  async function mark(occ: Occurrence, status: (typeof ATTENDANCE_ORDER)[number]) {
    await markAttendance({ courseId: occ.courseId, slotId: occ.slotId, dateISO: occ.dateISO, status })
  }

  async function markDay(items: Occurrence[]) {
    setBusy(true)
    try {
      for (const occ of items) await markAttendance({ courseId: occ.courseId, slotId: occ.slotId, dateISO: occ.dateISO, status: 'present' })
    } finally {
      setBusy(false)
    }
  }

  async function markAll() {
    if (pending.length > 5 && !confirm(`Mark all ${pending.length} unmarked classes as present? You can still correct any of them afterwards.`)) return
    setBusy(true)
    try {
      for (const occ of pending) await markAttendance({ courseId: occ.courseId, slotId: occ.slotId, dateISO: occ.dateISO, status: 'present' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="text-[13px] text-ink-2">
          <span className="font-medium text-ink">{pending.length}</span> {pending.length === 1 ? 'class' : 'classes'} across{' '}
          <span className="font-medium text-ink">{days.length}</span> {days.length === 1 ? 'day' : 'days'} still need a mark.
        </p>
        <Button size="sm" variant="soft" disabled={busy} onClick={() => void markAll()}>
          <CheckCircle size={14} aria-hidden /> All present
        </Button>
      </Card>

      {visible.map(({ dateISO, items }) => (
        <Card key={dateISO} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2/60 px-5 py-2.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">
              {format(new Date(`${dateISO}T00:00:00`), 'EEE d MMM')}
              <span className="ml-2 text-ink-3">
                {items.length} {items.length === 1 ? 'class' : 'classes'}
              </span>
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void markDay(items)}
              className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:cursor-default disabled:opacity-50"
            >
              All present
            </button>
          </div>
          <div className="divide-y divide-line">
            {items.map((occ) => {
              const course = courseOf(courses, occ.courseId)
              return (
                <div key={`${occ.slotId}-${occ.dateISO}`} className="px-5 py-3">
                  <div className="flex items-center gap-4">
                    <span className="tnum w-[52px] shrink-0 font-mono text-[13px] text-ink-2">{minutesToLabel(occ.startMin)}</span>
                    <span className="h-8 w-px shrink-0 bg-line" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{course?.name ?? 'Untitled course'}</p>
                      <p className="mt-0.5 truncate text-xs capitalize text-ink-2">
                        {occ.kind}
                        {occ.room ? ` · ${occ.room}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5 pl-[68px]">
                    {ATTENDANCE_ORDER.map((status) => (
                      <StatusButton key={status} status={status} active={false} onClick={() => void mark(occ, status)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      ))}

      {hidden > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
          <CaretDown size={13} weight="bold" aria-hidden /> Show {hidden} earlier {hidden === 1 ? 'day' : 'days'}
        </Button>
      )}
    </div>
  )
}

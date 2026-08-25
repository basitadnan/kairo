import type { Attendance, AttendanceStatus, ChipColor } from './types'
import { db, putNew, putUpdate } from './db'

/** Shared attendance helpers: one record per (slot ?? course) per day. */

export const ATTENDANCE_META: Record<AttendanceStatus, { label: string; chip: ChipColor | 'neutral'; short: string }> = {
  present: { label: 'Present', chip: 'green', short: 'P' },
  late: { label: 'Late', chip: 'yellow', short: 'L' },
  absent: { label: 'Absent', chip: 'red', short: 'A' },
  cancelled: { label: 'Cancelled', chip: 'neutral', short: 'C' },
}

export const ATTENDANCE_ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'cancelled']

export async function markAttendance(input: { courseId: string; slotId?: string; dateISO: string; status: AttendanceStatus }) {
  const sameDay = await db.attendance.where('dateISO').equals(input.dateISO).toArray()
  const existing = sameDay.find(
    (r: Attendance) => !r.deleted && (input.slotId ? r.slotId === input.slotId : r.courseId === input.courseId),
  )
  if (existing) {
    await putUpdate(db.attendance, existing.id, { status: input.status })
  } else {
    await putNew(db.attendance, input)
  }
}

export interface CourseAttendanceStats {
  attended: number // present + late
  excusedOrCancelled: number
  totalMarked: number
  percent: number | null
}

export function statsFor(records: Attendance[], courseId?: string): CourseAttendanceStats {
  let attended = 0
  let cancelled = 0
  let total = 0
  for (const r of records) {
    if (r.deleted) continue
    if (courseId && r.courseId !== courseId) continue
    if (r.status === 'cancelled') cancelled++
    else total++
    if (r.status === 'present' || r.status === 'late') attended++
  }
  return { attended, excusedOrCancelled: cancelled, totalMarked: total, percent: total > 0 ? Math.round((attended / total) * 100) : null }
}

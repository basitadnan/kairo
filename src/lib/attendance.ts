import type { Attendance, AttendanceStatus, ChipColor, ClassSlot, Course } from './types'
import { db, getSetting, putNew, putUpdate, setSetting } from './db'
import { emitLocalChange } from './bus'
import { addDaysISO, dayOf, isoOf, todayISO } from './format'

/** Shared attendance helpers: one record per (slot ?? course) per day. */

export const ATTENDANCE_META: Record<AttendanceStatus, { label: string; chip: ChipColor | 'neutral'; short: string }> = {
  present: { label: 'Present', chip: 'green', short: 'P' },
  late: { label: 'Late', chip: 'yellow', short: 'L' },
  absent: { label: 'Absent', chip: 'red', short: 'A' },
  cancelled: { label: 'Cancelled', chip: 'neutral', short: 'C' },
}

export const ATTENDANCE_ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'cancelled']

/** Device-level attendance preferences (not synced — they describe this device's nudging). */
export const ATT_KEYS = {
  target: 'attendance.target',
  since: 'attendance.since',
} as const

export const DEFAULT_ATTENDANCE_TARGET = 75

/** How far back the catch-up list may ever reach, so a stale timetable can't flood it. */
const CATCHUP_FLOOR_DAYS = 120

export async function markAttendance(input: {
  courseId: string
  slotId?: string
  dateISO: string
  status: AttendanceStatus
  /** true = the app decided this, not the user; cleared the moment they correct it. */
  auto?: boolean
}) {
  const sameDay = (await db.attendance.where('dateISO').equals(input.dateISO).toArray()).filter((r: Attendance) => !r.deleted)
  // Slot-level marks match their own slot; a courseless mark (from history
  // edits or imports) falls back to any record for that course on that day.
  const target = input.slotId
    ? sameDay.find((r) => r.slotId === input.slotId)
    : sameDay.find((r) => !r.slotId && r.courseId === input.courseId) ?? sameDay.find((r) => r.courseId === input.courseId)
  if (target) {
    await putUpdate(db.attendance, target.id, { status: input.status, auto: input.auto ? true : undefined })
  } else {
    await putNew(db.attendance, {
      courseId: input.courseId,
      slotId: input.slotId,
      dateISO: input.dateISO,
      status: input.status,
      auto: input.auto ? true : undefined,
    })
  }
}

/* ----------------------------- occurrence model ----------------------------- */

/** One dated instance of the recurring timetable. */
export interface Occurrence {
  slotId: string
  courseId: string
  dateISO: string
  startMin: number
  endMin: number
  room?: string
  kind: ClassSlot['kind']
}

/**
 * Expand the weekly timetable into every dated instance between two ISO dates
 * (inclusive), honouring each slot's validity window. This is the source of
 * truth for "which classes exist on a given day", used by both the catch-up
 * list and the reminder engine.
 */
export function occurrencesBetween(slots: ClassSlot[], fromISO: string, toISO: string): Occurrence[] {
  const out: Occurrence[] = []
  if (toISO < fromISO) return out
  const end = dayOf(toISO)
  for (let d = dayOf(fromISO); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = isoOf(d)
    const dow = d.getDay()
    for (const slot of slots) {
      if (slot.deleted || slot.dayOfWeek !== dow) continue
      if (slot.validFrom > iso) continue
      if (slot.validTo && slot.validTo < iso) continue
      out.push({
        slotId: slot.id,
        courseId: slot.courseId,
        dateISO: iso,
        startMin: slot.startMin,
        endMin: slot.endMin,
        room: slot.room,
        kind: slot.kind,
      })
    }
  }
  return out.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.startMin - b.startMin)
}

/** The record that already answers for an occurrence, if any. */
export function recordFor(records: Attendance[], occ: Occurrence): Attendance | undefined {
  const live = records.filter((r) => !r.deleted && r.dateISO === occ.dateISO)
  return live.find((r) => r.slotId === occ.slotId) ?? live.find((r) => !r.slotId && r.courseId === occ.courseId)
}

export function isMarked(records: Attendance[], occ: Occurrence): boolean {
  return recordFor(records, occ) !== undefined
}

export function unmarkedOccurrences(occurrences: Occurrence[], records: Attendance[]): Occurrence[] {
  return occurrences.filter((occ) => !isMarked(records, occ))
}

/** Group occurrences by date, newest day first, classes in start order. */
export function groupByDay(occurrences: Occurrence[]): { dateISO: string; items: Occurrence[] }[] {
  const byDay = new Map<string, Occurrence[]>()
  for (const occ of occurrences) {
    const list = byDay.get(occ.dateISO)
    if (list) list.push(occ)
    else byDay.set(occ.dateISO, [occ])
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateISO, items]) => ({ dateISO, items: items.sort((a, b) => a.startMin - b.startMin) }))
}

/* --------------------------------- catch-up -------------------------------- */

/**
 * First day offered in the catch-up list: the user's saved override when set,
 * otherwise the oldest timetable start, never reaching further back than
 * {@link CATCHUP_FLOOR_DAYS}.
 */
export function catchUpStart(slots: ClassSlot[], savedSince?: string): string {
  const floor = addDaysISO(todayISO(), -CATCHUP_FLOOR_DAYS)
  if (savedSince && /^\d{4}-\d{2}-\d{2}$/.test(savedSince)) return savedSince < floor ? floor : savedSince
  const starts = slots.filter((s) => !s.deleted).map((s) => s.validFrom).sort()
  const earliest = starts[0] ?? addDaysISO(todayISO(), -30)
  return earliest < floor ? floor : earliest
}

export async function getCatchUpStart(slots: ClassSlot[]): Promise<string> {
  return catchUpStart(slots, await getSetting(ATT_KEYS.since))
}

/** Parse a stored target percentage, clamped to something meaningful. */
export function attendanceTarget(saved?: string): number {
  const n = Number(saved)
  if (!Number.isFinite(n) || n <= 0 || n > 100) return DEFAULT_ATTENDANCE_TARGET
  return Math.round(n)
}

export async function getAttendanceTarget(): Promise<number> {
  return attendanceTarget(await getSetting(ATT_KEYS.target))
}

export async function setAttendanceTarget(pct: number) {
  await setSetting(ATT_KEYS.target, String(attendanceTarget(String(pct))))
}

/* --------------------------------- insights --------------------------------- */

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

export interface CourseInsight extends CourseAttendanceStats {
  /** Extra absences you can still take while staying at or above the target. */
  safeSkips: number
  /** Consecutive classes you'd have to attend to climb back to the target. */
  recoverIn: number
  onTrack: boolean
}

/**
 * Turn a raw present/absent tally into advice: how much slack is left, or how
 * many classes in a row it takes to get back over the line.
 * `total` counts marked classes only — cancelled ones never count against you.
 */
export function insightFor(records: Attendance[], courseId: string, targetPct = DEFAULT_ATTENDANCE_TARGET): CourseInsight {
  const stats = statsFor(records, courseId)
  const t = Math.min(99, Math.max(1, targetPct)) / 100
  const { attended, totalMarked: total } = stats
  if (total === 0) return { ...stats, safeSkips: 0, recoverIn: 0, onTrack: true }
  const safeSkips = Math.max(0, Math.floor(attended / t - total))
  const onTrack = attended / total >= t
  const recoverIn = onTrack ? 0 : Math.max(1, Math.ceil((t * total - attended) / (1 - t)))
  return { ...stats, safeSkips, recoverIn, onTrack }
}

/* ------------------------------- auto-absent -------------------------------- */

/**
 * Deterministic id for an app-decided absence, so two devices that reach the
 * same conclusion converge on one synced row instead of double-counting.
 */
export function autoAbsentId(occ: { slotId: string; dateISO: string }): string {
  return `att-${occ.slotId}-${occ.dateISO}`
}

/** Dedupe marker: one auto-absence per occurrence, ever. */
export function autoAbsentKey(occ: { slotId: string; dateISO: string }): string {
  return `att:absent:${occ.slotId}:${occ.dateISO.replaceAll('-', '')}`
}

/** Write the absence the reminder engine threatened. Never overwrites a mark. */
export async function markAutoAbsent(occ: Occurrence): Promise<void> {
  const id = autoAbsentId(occ)
  const existing = await db.attendance.get(id)
  if (existing && !existing.deleted && existing.status !== 'absent') return
  const now = Date.now()
  await db.attendance.put({
    id,
    courseId: occ.courseId,
    slotId: occ.slotId,
    dateISO: occ.dateISO,
    status: 'absent',
    auto: true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deleted: 0,
  })
  emitLocalChange()
}

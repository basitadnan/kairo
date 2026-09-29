import { Capacitor } from '@capacitor/core'
import { format } from 'date-fns'
import { db, getSetting } from './db'
import type { Assignment, ClassSlot, Course, Exam } from './types'
import { onLocalChange } from './bus'
import { isoOf, todayISO } from './format'
import {
  autoAbsentKey,
  getCatchUpStart,
  markAutoAbsent,
  occurrencesBetween,
  unmarkedOccurrences,
  type Occurrence,
} from './attendance'

/**
 * Reminder engine.
 *
 * Desktop (Electron tray / browser tab): every 30s we recompute what is due
 * from the live local database and fire anything whose time has arrived and
 * that has not been fired before (dedupe table).
 *
 * Android: the engine additionally registers upcoming reminders as real
 * scheduled notifications (exact alarms where permitted), so they survive the
 * app process being killed. Scheduled reminders are marked in the same dedupe
 * table so the foreground ticker never double-fires them.
 *
 * Attendance follow-ups ride the same machinery: a class that ends without a
 * mark gets a short burst of escalating reminders, and if none of them land the
 * engine records the absence itself (see `reconcileAttendance`).
 */

export const NOTIF_KEYS = {
  classes: 'notif.classes',
  leadMin: 'notif.leadMin',
  tasks: 'notif.tasks',
  exams: 'notif.exams',
  attendance: 'notif.attendance',
  attendNags: 'notif.attendNags',
  attendFirstMin: 'notif.attendFirstMin',
  attendGapMin: 'notif.attendGapMin',
  attendAutoAbsent: 'notif.attendAutoAbsent',
} as const

export const DEFAULT_ATTEND_NAGS = 5
export const DEFAULT_ATTEND_FIRST_MIN = 5
export const DEFAULT_ATTEND_GAP_MIN = 15

export interface NotificationPrefs {
  classes: boolean
  leadMin: number
  tasks: boolean
  exams: boolean
  attendance: boolean
  attendNags: number
  attendFirstMin: number
  attendGapMin: number
  autoAbsent: boolean
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const [classes, leadMin, tasks, exams, attendance, nags, first, gap, autoAbsent] = await Promise.all([
    getSetting(NOTIF_KEYS.classes),
    getSetting(NOTIF_KEYS.leadMin),
    getSetting(NOTIF_KEYS.tasks),
    getSetting(NOTIF_KEYS.exams),
    getSetting(NOTIF_KEYS.attendance),
    getSetting(NOTIF_KEYS.attendNags),
    getSetting(NOTIF_KEYS.attendFirstMin),
    getSetting(NOTIF_KEYS.attendGapMin),
    getSetting(NOTIF_KEYS.attendAutoAbsent),
  ])
  return {
    classes: classes !== 'off', // default on
    leadMin: clampInt(leadMin, 15, 1, 240),
    tasks: tasks !== 'off',
    exams: exams !== 'off',
    attendance: attendance !== 'off',
    attendNags: clampInt(nags, DEFAULT_ATTEND_NAGS, 1, 8),
    attendFirstMin: clampInt(first, DEFAULT_ATTEND_FIRST_MIN, 1, 120),
    attendGapMin: clampInt(gap, DEFAULT_ATTEND_GAP_MIN, 5, 120),
    autoAbsent: autoAbsent !== 'off',
  }
}

export interface DueReminder {
  key: string
  at: number // epoch ms when the reminder should fire
  title: string
  body: string
}

const STALE_MS = 30 * 60_000 // don't fire reminders more than 30 min past their time
const HORIZON_MS = 48 * 3_600_000 // how far ahead scheduled notifications are registered

function atDayMinute(dateISO: string, minuteOfDay: number): number {
  return new Date(`${dateISO}T00:00:00`).getTime() + minuteOfDay * 60_000
}

/* --------------------------- attendance follow-ups -------------------------- */

/** How far back the engine will auto-record an absence (grace for a closed app). */
const ATTENDANCE_LOOKBACK_DAYS = 3

/** Dedupe key for the i-th follow-up of one class occurrence. */
export function nagKey(occ: { slotId: string; dateISO: string }, i: number): string {
  return `att:${occ.slotId}:${occ.dateISO.replaceAll('-', '')}:${i}`
}

function nagTitle(name: string, i: number, nags: number): string {
  if (i === 0) return `Did you make ${name}?`
  if (i === nags - 1) return `Last call — mark ${name}`
  return `${name} is still unmarked`
}

function nagBody(occ: Occurrence, i: number, nags: number, gap: number): string {
  if (i === 0) return `Class ended at ${pad(occ.endMin)}. Tap to mark it before it counts as absent.`
  if (i === nags - 1) return `Mark it in the next ${gap} min or it will be recorded as absent.`
  const left = nags - i - 1
  return `${left} reminder${left === 1 ? '' : 's'} left before it counts as absent.`
}

/**
 * Every follow-up reminder for classes that ended unmarked, inside the window
 * [now − STALE_MS, windowEnd]. Reads its own prefs and data so the reminder
 * schedule can be inspected (and tested) on its own.
 */
export async function attendanceFollowUps(now: number, windowEnd: number): Promise<DueReminder[]> {
  const prefs = await getNotificationPrefs()
  if (!prefs.attendance) return []
  const [slots, records, courses] = await Promise.all([
    db.classSlots.toArray(),
    db.attendance.toArray(),
    db.courses.toArray(),
  ])
  const courseName = (id?: string) => (courses as Course[]).find((c) => !c.deleted && c.id === id)?.name ?? 'Class'
  const out: DueReminder[] = []
  const fromISO = isoOf(new Date(now - ATTENDANCE_LOOKBACK_DAYS * 86_400_000))
  const toISO = isoOf(new Date(Math.max(now, windowEnd) + 86_400_000))
  const range = occurrencesBetween(slots, fromISO, toISO)
  const { attendNags: nags, attendFirstMin: first, attendGapMin: gap } = prefs
  for (const occ of unmarkedOccurrences(range, records)) {
    const endMs = atDayMinute(occ.dateISO, occ.endMin)
    for (let i = 0; i < nags; i++) {
      const at = endMs + (first + i * gap) * 60_000
      if (at < now - STALE_MS || at > windowEnd) continue
      out.push({
        key: nagKey(occ, i),
        at,
        title: nagTitle(courseName(occ.courseId), i, nags),
        body: nagBody(occ, i, nags, gap),
      })
    }
  }
  return out
}

/**
 * Record the absence the reminders kept warning about — but only once the final
 * follow-up has actually fired on this device, so a week with the app closed
 * can never silently rewrite history. Runs from the foreground ticker and on
 * startup; absences are written with a deterministic id so two devices agree.
 */
export async function reconcileAttendance(): Promise<number> {
  const prefs = await getNotificationPrefs()
  if (!prefs.attendance || !prefs.autoAbsent) return 0
  const now = Date.now()
  const [slots, records, courses] = await Promise.all([
    db.classSlots.toArray(),
    db.attendance.toArray(),
    db.courses.toArray(),
  ])
  const name = (id?: string) => (courses as Course[]).find((c) => !c.deleted && c.id === id)?.name ?? 'Class'
  const fromISO = isoOf(new Date(now - ATTENDANCE_LOOKBACK_DAYS * 86_400_000))
  const range = occurrencesBetween(slots, fromISO, isoOf(new Date(now)))
  let marked = 0
  for (const occ of unmarkedOccurrences(range, records)) {
    const endMs = atDayMinute(occ.dateISO, occ.endMin)
    const autoAt = endMs + (prefs.attendFirstMin + prefs.attendNags * prefs.attendGapMin) * 60_000
    if (now < autoAt) continue
    // Only punish the user if we actually nagged and were ignored.
    if (!(await db.firedReminders.get(nagKey(occ, prefs.attendNags - 1)))) continue
    if (await db.firedReminders.get(autoAbsentKey(occ))) continue
    await markAutoAbsent(occ)
    await db.firedReminders.put({ key: autoAbsentKey(occ), at: now })
    await deliver(
      `Marked absent: ${name(occ.courseId)}`,
      `${occ.dateISO === todayISO() ? 'Today' : format(atDay(occ.dateISO), 'EEE d MMM')} · tap to correct it if you were there.`,
    )
    marked++
  }
  return marked
}

/**
 * One gentle once-a-day heads-up about yesterday-and-before that never got
 * marked. Classes from today are the follow-up reminders' job.
 */
async function nudgeUnmarkedBacklog(): Promise<void> {
  const prefs = await getNotificationPrefs()
  if (!prefs.attendance) return
  const key = `att:catchup:${todayISO()}`
  if (await db.firedReminders.get(key)) return
  const [slots, records] = await Promise.all([db.classSlots.toArray(), db.attendance.toArray()])
  const yesterday = isoOf(new Date(Date.now() - 86_400_000))
  const start = await getCatchUpStart(slots)
  if (start > yesterday) return
  const pending = unmarkedOccurrences(occurrencesBetween(slots, start, yesterday), records)
  if (pending.length === 0) return
  await db.firedReminders.put({ key, at: Date.now() })
  await deliver(
    `${pending.length} ${pending.length === 1 ? 'class is' : 'classes are'} still unmarked`,
    'Open Kairo → Attendance → Catch up to fill in the gaps.',
  )
}

function atDay(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00`)
}

/** Compute every reminder that exists within [now − STALE_MS, now + horizon], from live local data. */
async function computeWindow(now: number, horizonMs: number): Promise<DueReminder[]> {
  const prefs = await getNotificationPrefs()
  const [courses, slots, exams, assignments] = await Promise.all([
    db.courses.toArray(),
    db.classSlots.toArray(),
    db.exams.toArray(),
    db.assignments.toArray(),
  ])
  const courseName = (id?: string) => courses.find((c) => !c.deleted && c.id === id)?.name ?? 'Class'
  const due: DueReminder[] = []
  const windowEnd = now + horizonMs
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  if (prefs.classes) {
    const lead = prefs.leadMin
    // Walk day-by-day across the window so multi-day horizons stay correct.
    for (let dayOffset = 0; dayOffset <= Math.ceil(horizonMs / 86_400_000); dayOffset++) {
      const day = new Date(todayStart)
      day.setDate(day.getDate() + dayOffset)
      const iso = isoOf(day)
      const dow = day.getDay()
      for (const slot of slots as ClassSlot[]) {
        if (slot.deleted || slot.dayOfWeek !== dow) continue
        if (slot.validFrom > iso || (slot.validTo && slot.validTo < iso)) continue
        const startMs = atDayMinute(iso, slot.startMin)
        const remindAt = startMs - lead * 60_000
        if (remindAt < now - STALE_MS || remindAt > windowEnd || startMs <= now) continue
        due.push({
          key: `class:${slot.id}:${iso.replaceAll('-', '')}:${lead}`,
          at: remindAt,
          title: `${courseName(slot.courseId)} starts ${lead >= 1 ? `in ${lead} min` : 'soon'}`,
          body: `${pad(slot.startMin)}${slot.room ? ` · ${slot.room}` : ''}`,
        })
      }
    }
  }

  if (prefs.tasks) {
    for (const task of assignments as Assignment[]) {
      if (task.deleted || task.status !== 'todo' || task.dueAt == null) continue
      const remindAt = task.dueAt - 24 * 3_600_000
      if (remindAt >= now - STALE_MS && remindAt <= windowEnd && task.dueAt > now) {
        due.push({ key: `task:${task.id}:24h`, at: remindAt, title: 'Due tomorrow', body: task.title })
      }
      if (task.dueAt >= now - STALE_MS && task.dueAt <= windowEnd) {
        due.push({ key: `task:${task.id}:now`, at: task.dueAt, title: 'Due now', body: task.title })
      }
    }
  }

  if (prefs.attendance) due.push(...(await attendanceFollowUps(now, windowEnd)))

  if (prefs.exams) {
    for (const exam of exams as Exam[]) {
      if (exam.deleted || exam.dateISO < isoOf(todayStart)) continue
      // Evening before, and morning of.
      const dayBefore = new Date(`${exam.dateISO}T00:00:00`)
      dayBefore.setDate(dayBefore.getDate() - 1)
      const prevISO = isoOf(dayBefore)
      const eveAt = atDayMinute(prevISO, 19 * 60)
      if (prevISO >= isoOf(todayStart) && eveAt >= now - STALE_MS && eveAt <= windowEnd) {
        due.push({ key: `exam:${exam.id}:eve:${prevISO.replaceAll('-', '')}`, at: eveAt, title: 'Exam tomorrow', body: exam.title })
      }
      const mornAt = atDayMinute(exam.dateISO, 7 * 60 + 30)
      if (mornAt >= now - STALE_MS && mornAt <= windowEnd) {
        const startLabel = exam.startMin != null ? ` at ${pad(exam.startMin)}` : ''
        due.push({
          key: `exam:${exam.id}:morn:${exam.dateISO.replaceAll('-', '')}`,
          at: mornAt,
          title: 'Exam today',
          body: `${exam.title}${startLabel}${exam.room ? ` · ${exam.room}` : ''}`,
        })
      }
    }
  }

  return due.sort((a, b) => a.at - b.at)
}

/** Reminders that should fire right now (ticker path). */
async function computeDue(now: number): Promise<DueReminder[]> {
  return (await computeWindow(now, 0)).filter((r) => r.at <= now && now - r.at <= STALE_MS)
}

function pad(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/* ---------------------------------- output --------------------------------- */

let permissionRequested = false

export async function notificationPermission(): Promise<NotificationPermission | 'unknown'> {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const { display } = await LocalNotifications.checkPermissions()
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default'
  }
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied'
}

export async function requestNotificationPermission(): Promise<boolean> {
  permissionRequested = true
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const { display } = await LocalNotifications.requestPermissions()
    const granted = display === 'granted'
    if (granted) void refreshScheduledNotifications()
    return granted
  }
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'default') await Notification.requestPermission()
  return Notification.permission === 'granted'
}

/**
 * Exact alarms (Android 12+): without them the OS may batch our scheduled
 * notifications into maintenance windows. 'unsupported' means web/desktop or
 * an older plugin build, where none of this matters.
 */
export async function exactAlarmStatus(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!Capacitor.isNativePlatform()) return 'unsupported'
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    if (typeof LocalNotifications.checkExactNotificationSetting !== 'function') return 'unsupported'
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting()
    return exact_alarm === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'unsupported'
  }
}

/** Sends the user to the system screen that grants exact-alarm permission. */
export async function requestExactAlarm(): Promise<boolean> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.changeExactNotificationSetting()
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting()
    return exact_alarm === 'granted'
  } catch {
    return false
  }
}

/** Fire a sample notification so the user can verify permissions end-to-end. */
export async function sendTestNotification(): Promise<boolean> {
  const granted = await requestNotificationPermission()
  if (granted) await deliver('Notifications are on', 'You will hear from me before every class, deadline and exam.')
  return granted
}

async function deliver(title: string, body: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const { display } = await LocalNotifications.checkPermissions()
    if (display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [{ id: Math.floor(Math.random() * 2_000_000_000), title, body }],
    })
    return
  }
  if (typeof Notification === 'undefined') return
  if (!permissionRequested && Notification.permission === 'default') {
    // First real reminder doubles as the permission moment.
    const granted = await requestNotificationPermission()
    if (!granted) return
  }
  if (Notification.permission === 'granted') {
    const n = new Notification(title, { body, silent: false })
    // Clicking a reminder should land you in the app, not just dismiss it.
    n.onclick = () => {
      window.focus()
      n.close()
    }
  }
}

/* ------------------------- Android forward scheduling ----------------------- */

/** Stable positive int32 for a reminder key, so re-registration replaces cleanly. */
function idForKey(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h | 0) % 2_000_000_000
}

interface NotifIndex {
  [id: string]: string // notification id → reminder key
}

function loadIndex(): NotifIndex {
  try {
    return JSON.parse(localStorage.getItem('mega.notifIndex') ?? '{}') as NotifIndex
  } catch {
    return {}
  }
}

function saveIndex(index: NotifIndex) {
  localStorage.setItem('mega.notifIndex', JSON.stringify(index))
}

/**
 * Mirror the computed reminder window into the OS scheduler. Anything already
 * registered but no longer desired (data changed) is cancelled; anything new
 * is scheduled with an exact `at`. Registered reminders are marked as fired in
 * the dedupe table so the foreground ticker stays quiet about them.
 */
export async function refreshScheduledNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const { display } = await LocalNotifications.checkPermissions()
    if (display !== 'granted') return

    const index = loadIndex()
    const { notifications: pending } = await LocalNotifications.getPending()
    const desired = (await computeWindow(Date.now(), HORIZON_MS)).filter((r) => r.at > Date.now())
    const desiredById = new Map(desired.map((r) => [idForKey(r.key), r]))

    const stale = pending.filter((p) => !desiredById.has(p.id))
    if (stale.length > 0) {
      await LocalNotifications.cancel({ notifications: stale.map((p) => ({ id: p.id })) })
      for (const p of stale) {
        const key = index[String(p.id)]
        if (key) await db.firedReminders.delete(key)
        delete index[String(p.id)]
      }
    }

    const fresh = desired.filter((r) => !pending.some((p) => p.id === idForKey(r.key)))
    if (fresh.length > 0) {
      await LocalNotifications.schedule({
        notifications: fresh.map((r) => ({
          id: idForKey(r.key),
          title: r.title,
          body: r.body,
          schedule: { at: new Date(r.at), allowWhileIdle: true },
        })),
      })
      for (const r of fresh) {
        const id = idForKey(r.key)
        index[String(id)] = r.key
        // The OS owns delivery now; stop the ticker from double-firing it.
        await db.firedReminders.put({ key: r.key, at: r.at })
      }
    }
    saveIndex(index)
  } catch (err) {
    console.warn('[notifications:schedule]', err)
  }
}

/* ---------------------------------- ticker --------------------------------- */

let started = false

export function startNotificationEngine() {
  if (started) return
  started = true

  // Prune dedupe rows older than a week, then tick.
  void db.firedReminders.where('at').below(Date.now() - 7 * 86_400_000).delete()

  const tick = async () => {
    try {
      const due = await computeDue(Date.now())
      for (const r of due) {
        if (await db.firedReminders.get(r.key)) continue
        await db.firedReminders.put({ key: r.key, at: r.at })
        await deliver(r.title, r.body)
      }
      await nudgeUnmarkedBacklog()
      await reconcileAttendance()
    } catch (err) {
      console.warn('[notifications]', err)
    }
  }

  void tick()
  setInterval(tick, 30_000)

  if (Capacitor.isNativePlatform()) {
    void refreshScheduledNotifications()
    let timer: ReturnType<typeof setTimeout> | null = null
    onLocalChange(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void refreshScheduledNotifications(), 4_000)
    })
  }
}

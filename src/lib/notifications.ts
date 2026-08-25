import { Capacitor } from '@capacitor/core'
import { db, getSetting } from './db'
import type { Assignment, ClassSlot, Exam } from './types'
import { onLocalChange } from './bus'

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
 */

export const NOTIF_KEYS = {
  classes: 'notif.classes',
  leadMin: 'notif.leadMin',
  tasks: 'notif.tasks',
  exams: 'notif.exams',
} as const

export async function getNotificationPrefs() {
  const [classes, leadMin, tasks, exams] = await Promise.all([
    getSetting(NOTIF_KEYS.classes),
    getSetting(NOTIF_KEYS.leadMin),
    getSetting(NOTIF_KEYS.tasks),
    getSetting(NOTIF_KEYS.exams),
  ])
  return {
    classes: classes !== 'off', // default on
    leadMin: Number(leadMin ?? 15),
    tasks: tasks !== 'off',
    exams: exams !== 'off',
  }
}

interface DueReminder {
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

function isoOf(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
  if (Notification.permission === 'granted') new Notification(title, { body, silent: false })
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

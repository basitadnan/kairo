import { Capacitor, registerPlugin } from '@capacitor/core'
import { format } from 'date-fns'
import { db } from './db'
import { daysUntil, minutesToLabel, todayISO } from './format'
import { onLocalChange } from './bus'
import { resolvedTheme, useTheme } from '../stores/theme'

/**
 * Android home-screen widget feed. The web app serialises "today" into a small
 * JSON snapshot and hands it to the native WidgetBridge plugin; the provider
 * renders it with RemoteViews. Web/desktop builds are no-ops.
 *
 * Rows mix three sources so the widget is useful even on class-free days:
 *   1. today's classes   — time · course · room
 *   2. personal items    — time · title
 *   3. soonest open tasks— blank time · "Due <day> · title"
 */

interface WidgetBridgePluginInterface {
  ping(): Promise<void>
  saveSnapshot(opts: { json: string }): Promise<void>
}

const WidgetBridge = registerPlugin<WidgetBridgePluginInterface>('WidgetBridge')

interface WidgetRow {
  time?: string
  label: string
}

interface WidgetSnapshot {
  dateISO: string
  generatedAt: number
  theme: 'light' | 'dark'
  rows: WidgetRow[]
  nextExam?: { title: string; daysUntil: number }
}

const MAX_ROWS = 6

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dueLabel(dueAt: number): string {
  const d = daysUntil(format(new Date(dueAt), 'yyyy-MM-dd'))
  if (d < 0) return 'Overdue'
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  return DAY_SHORT[new Date(dueAt).getDay()] ?? ''
}

export async function pushWidgetSnapshot(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const today = todayISO()
    const dow = new Date().getDay()
    const [courses, slots, exams, assignments, personal] = await Promise.all([
      db.courses.toArray(),
      db.classSlots.toArray(),
      db.exams.toArray(),
      db.assignments.toArray(),
      db.personalItems.toArray(),
    ])
    const live = courses.filter((c) => !c.deleted)
    const courseName = (id?: string) => live.find((c) => c.id === id)?.name ?? 'Class'

    const rows: WidgetRow[] = []

    // 1 · Today's classes
    for (const s of slots
      .filter(
        (s) =>
          !s.deleted &&
          s.dayOfWeek === dow &&
          s.validFrom <= today &&
          (!s.validTo || s.validTo >= today),
      )
      .sort((a, b) => a.startMin - b.startMin)
      .slice(0, 4)) {
      const room = s.room ? ` · ${s.room}` : ''
      rows.push({ time: minutesToLabel(s.startMin), label: `${courseName(s.courseId)}${room}` })
    }

    // 2 · Personal items (recurring or one-off — they have no past/future dates,
    //     so anything in the list is treated as part of today)
    for (const p of personal
      .filter((p) => !p.deleted)
      .sort((a, b) => (a.timeMin ?? 9999) - (b.timeMin ?? 9999))
      .slice(0, 3)) {
      rows.push({ time: p.timeMin != null ? minutesToLabel(p.timeMin) : '', label: p.title })
    }

    // 3 · Soonest open tasks
    for (const a of assignments
      .filter((a) => !a.deleted && a.status === 'todo' && a.dueAt != null && a.dueAt! > Date.now() - 86_400_000)
      .sort((x, y) => x.dueAt! - y.dueAt!)
      .slice(0, 2)) {
      rows.push({ label: `Due ${dueLabel(a.dueAt!)} · ${a.title}` })
    }

    const next = exams
      .filter((e) => !e.deleted && e.dateISO >= today)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO))[0]

    const snapshot: WidgetSnapshot = {
      dateISO: format(new Date(), 'yyyy-MM-dd'),
      generatedAt: Date.now(),
      theme: resolvedTheme(),
      rows: rows.slice(0, MAX_ROWS),
      ...(next ? { nextExam: { title: next.title, daysUntil: daysUntil(next.dateISO) } } : {}),
    }
    await WidgetBridge.saveSnapshot({ json: JSON.stringify(snapshot) })
  } catch (err) {
    // Loud on purpose — Capacitor forwards console errors to logcat on debug builds.
    console.error('[widget] push failed:', err)
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

/** Push once now, then again shortly after any local data change or app resume. */
export function startWidgetSync(): void {
  // Round-trip probe — native platforms only (web has no WidgetBridge plugin).
  if (Capacitor.isNativePlatform()) {
    WidgetBridge.ping()
      .then(() => console.info('[widget] bridge ping ok'))
      .catch((err) => console.error('[widget] bridge ping failed:', err))
  }

  void pushWidgetSnapshot()

  onLocalChange(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void pushWidgetSnapshot(), 3_000)
  })

  // Returning to the app (task switch / unlock) refreshes stale data even if
  // nothing was edited — e.g. the date rolled over overnight.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => void pushWidgetSnapshot(), 1_000)
    }
  })

  // Safety net for long-running sessions.
  setInterval(() => void pushWidgetSnapshot(), 15 * 60_000)

  // Theme switches re-skin the widget instantly.
  useTheme.subscribe(() => void pushWidgetSnapshot())
}

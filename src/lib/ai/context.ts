import { db } from '../db'
import { format } from 'date-fns'

/**
 * Compact text snapshot of the user's live data for LLM prompts.
 * Deliberately terse: every token costs money on real providers.
 */
export async function buildContext(): Promise<string> {
  const now = new Date()
  const todayISO = format(now, 'yyyy-MM-dd')
  const [courses, slots, exams, assignments, personal] = await Promise.all([
    db.courses.toArray(),
    db.classSlots.toArray(),
    db.exams.toArray(),
    db.assignments.toArray(),
    db.personalItems.toArray(),
  ])
  const courseName = (id?: string) => courses.find((c) => !c.deleted && c.id === id)?.name

  const lines: string[] = []
  lines.push(`Today is ${format(now, 'EEEE d MMMM yyyy')}.`)

  const validSlots = slots.filter((s) => !s.deleted && s.validFrom <= todayISO && (!s.validTo || s.validTo >= todayISO))
  const byDay = [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
    dow,
    items: validSlots.filter((s) => s.dayOfWeek === dow).sort((a, b) => a.startMin - b.startMin),
  }))
  const fmtMin = (m?: number) => (m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)

  const todayDow = now.getDay()
  const todayItems = byDay.find((d) => d.dow === todayDow)?.items ?? []
  if (todayItems.length) {
    lines.push(
      `CLASSES TODAY: ${todayItems.map((s) => `${fmtMin(s.startMin)}-${fmtMin(s.endMin)} ${courseName(s.courseId) ?? 'Class'}${s.room ? ` (${s.room})` : ''}`).join('; ')}`,
    )
  } else {
    lines.push('CLASSES TODAY: none')
  }

  for (const { dow, items } of byDay.filter((d) => d.dow !== todayDow && d.items.length > 0)) {
    const dayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow]
    lines.push(
      `WEEKLY ${dayLabel}: ${items.map((s) => `${fmtMin(s.startMin)} ${courseName(s.courseId) ?? 'Class'}${s.room ? ` (${s.room})` : ''}`).join(', ')}`,
    )
  }

  const open = assignments
    .filter((a) => !a.deleted && a.status === 'todo')
    .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))
    .slice(0, 15)
  lines.push(
    open.length
      ? `OPEN TASKS: ${open.map((a) => `[${a.priority}] ${a.title}${a.dueAt ? ` due ${format(new Date(a.dueAt), 'EEE d MMM HH:mm')}` : ''}`).join(' | ')}`
      : 'OPEN TASKS: none',
  )

  const upcomingExams = exams
    .filter((e) => !e.deleted && e.dateISO >= todayISO)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
    .slice(0, 8)
  lines.push(
    upcomingExams.length
      ? `UPCOMING EXAMS: ${upcomingExams
          .map((e) => {
            const days = Math.round((new Date(`${e.dateISO}T00:00:00`).getTime() - new Date(`${todayISO}T00:00:00`).getTime()) / 86_400_000)
            return `${e.title} ${format(new Date(`${e.dateISO}T00:00:00`), 'EEE d MMM')}${e.startMin != null ? ` ${fmtMin(e.startMin)}` : ''} (in ${days}d)`
          })
          .join(' | ')}`
      : 'UPCOMING EXAMS: none',
  )

  const items = personal.filter((p) => !p.deleted)
  if (items.length) {
    lines.push(`PERSONAL: ${items.map((p) => `${p.title}${p.timeMin != null ? ` ${fmtMin(p.timeMin)}` : ''}${p.recurrence !== 'none' ? ` (${p.recurrence})` : ''}`).join(' | ')}`)
  }

  const attendance = (await db.attendance.toArray()).filter((a) => !a.deleted)
  if (attendance.length) {
    const counted = attendance.filter((a) => a.status !== 'cancelled')
    const attended = counted.filter((a) => a.status === 'present' || a.status === 'late').length
    lines.push(
      `ATTENDANCE: ${attended}/${counted.length} classes attended${counted.length ? ` (${Math.round((attended / counted.length) * 100)}%)` : ''}`,
    )
  }

  const marks = courses.filter((c) => !c.deleted && c.markPct != null && c.credits)
  if (marks.length) {
    const { computeGpa, loadBands } = await import('../gpa')
    const gpa = computeGpa(marks, await loadBands())
    if (gpa.gpa != null) {
      lines.push(
        `MARKS: GPA ${gpa.gpa.toFixed(2)}/4.0 over ${marks.length} graded ${marks.length === 1 ? 'course' : 'courses'} (${marks
          .map((c) => `${courseName(c.id)}: ${c.markPct}%`)
          .join(', ')})`,
      )
    }
  }

  return lines.join('\n')
}

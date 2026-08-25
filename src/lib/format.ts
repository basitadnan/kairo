import { format } from 'date-fns'

export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function dayName(day: number): string {
  return DAY_NAMES[day] ?? ''
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function daysUntil(dateISO: string): number {
  const target = new Date(`${dateISO}T00:00:00`)
  const now = new Date()
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 86_400_000)
}

export function daysUntilLabel(dateISO: string): string {
  const d = daysUntil(dateISO)
  if (d < 0) return `${-d} ${-d === 1 ? 'day' : 'days'} ago`
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  return `In ${d} days`
}

export function greeting(hour = new Date().getHours()): string {
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 22) return 'Good evening'
  return 'Good night'
}

export function relativeDue(dueAt: number): string {
  const diffMs = dueAt - Date.now()
  const diffH = diffMs / 3_600_000
  if (diffH < 0) {
    const late = format(new Date(dueAt), 'EEE d MMM')
    return `Overdue · was ${late}`
  }
  if (diffH < 1) return `Due in ${Math.max(1, Math.round(diffMs / 60_000))} min`
  if (diffH < 24) return `Due in ${Math.round(diffH)} h`
  return `Due ${format(new Date(dueAt), 'EEE d MMM')}`
}

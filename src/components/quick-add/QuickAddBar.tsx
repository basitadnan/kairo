import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sparkle, ArrowRight, X } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { Input } from '../ui/inputs'
import { db, putNew } from '../../lib/db'
import { getProvider, type QuickAddDraft } from '../../lib/ai'
import { colorForIndex } from '../../lib/ai/shared'

const TYPE_LABEL = { task: 'Task', personal: 'Personal', exam: 'Exam', class: 'Class' } as const

function describe(draft: QuickAddDraft): string {
  const bits: string[] = []
  if (draft.type === 'task' && draft.dueAt) bits.push(`due ${format(new Date(draft.dueAt), 'EEE d MMM HH:mm')}`)
  if (draft.type === 'exam' && draft.dateISO) bits.push(format(new Date(`${draft.dateISO}T00:00:00`), 'EEE d MMM'))
  if (draft.timeMin != null) {
    const end = draft.endMin ? `- ${fmt(draft.endMin)}` : ''
    bits.push(`${fmt(draft.timeMin)}${end}`)
  }
  if (draft.dayOfWeek != null && draft.type !== 'task') bits.push(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][draft.dayOfWeek])
  if (draft.recurrence === 'weekly') bits.push('weekly')
  if (draft.recurrence === 'daily') bits.push('daily')
  if (draft.room) bits.push(draft.room)
  return bits.join(' · ')
}

function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export function QuickAddBar() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState<QuickAddDraft | null>(null)
  const [savedLabel, setSavedLabel] = useState<string>()

  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? []
  const liveCourses = courses.filter((c) => !c.deleted)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const provider = await getProvider()
      const todayContext = format(new Date(), 'EEEE d MMMM yyyy')
      const result = await provider.parseQuickAdd(value, todayContext)
      setDraft(result)
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function courseIdFor(name?: string): Promise<string | undefined> {
    const key = name?.trim().toLowerCase()
    if (!key) return undefined
    const existing = liveCourses.find((c) => c.name.trim().toLowerCase() === key)
    if (existing) return existing.id
    const rec = await putNew(db.courses, { name: name!.trim(), color: colorForIndex(liveCourses.length) })
    return rec.id
  }

  async function save() {
    if (!draft) return
    try {
      switch (draft.type) {
        case 'task':
          await putNew(db.assignments, {
            title: draft.title,
            courseId: await courseIdFor(draft.courseName),
            dueAt: draft.dueAt,
            priority: draft.priority ?? 'med',
            status: 'todo',
          })
          break
        case 'exam': {
          if (!draft.dateISO) throw new Error('The model could not read an exam date - add it manually in Exams.')
          await putNew(db.exams, {
            title: draft.title,
            courseId: await courseIdFor(draft.courseName),
            dateISO: draft.dateISO,
            startMin: draft.timeMin,
            room: draft.room,
          })
          break
        }
        case 'class': {
          if (draft.dayOfWeek == null || draft.timeMin == null) throw new Error('A class needs at least a day and a start time.')
          await putNew(db.classSlots, {
            courseId: (await courseIdFor(draft.courseName ?? draft.title))!,
            dayOfWeek: draft.dayOfWeek,
            startMin: draft.timeMin,
            endMin: draft.endMin ?? draft.timeMin + 60,
            kind: 'lecture',
            validFrom: format(new Date(), 'yyyy-MM-dd'),
          })
          break
        }
        default:
          await putNew(db.personalItems, {
            title: draft.title,
            timeMin: draft.timeMin,
            recurrence: draft.recurrence ?? 'none',
            dayOfWeek: draft.recurrence === 'weekly' ? draft.dayOfWeek : undefined,
          })
      }
      setSavedLabel(`${TYPE_LABEL[draft.type]} saved`)
      setDraft(null)
      setTimeout(() => setSavedLabel(undefined), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDraft(null)
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex items-center gap-2">
        <Sparkle size={17} weight="regular" className="ml-1 shrink-0 text-accent" aria-hidden />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Type anything… "physics assignment friday" · "gym 7am daily"'
          aria-label="Quick add"
          className="border-transparent bg-transparent focus:border-transparent"
        />
        <Button size="sm" type="submit" disabled={busy || !text.trim()}>
          {busy ? 'Reading…' : <>Add <ArrowRight size={13} weight="bold" aria-hidden /></>}
        </Button>
      </form>

      {error && <p className="mt-2 pl-7 text-xs text-chip-red-text">{error}</p>}
      {savedLabel && <p className="mt-2 pl-7 text-xs text-accent">{savedLabel}</p>}

      {draft && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-accent-line bg-accent-soft/50 p-3 dark:bg-accent-soft">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Chip>{TYPE_LABEL[draft.type]}</Chip>
              {draft.priority === 'high' && <Chip color="red">high</Chip>}
            </div>
            <p className="mt-1.5 truncate text-sm font-medium text-ink">{draft.title}</p>
            <p className="mt-0.5 font-mono text-[11px] text-ink-2">{describe(draft) || 'No details detected'}</p>
            {draft.needsMore && draft.clarifying && <p className="mt-1 text-[11px] text-chip-yellow-text">{draft.clarifying}</p>}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" onClick={() => void save()}>Save</Button>
            <Button size="sm" variant="ghost" aria-label="Discard suggestion" onClick={() => setDraft(null)}>
              <X size={14} aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

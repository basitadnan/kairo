import type { ParseResult, ParsedExam, ParsedSlot } from './types'
import type { QuickAddDraft } from './types'
import { COURSE_COLORS } from '../types'

export const PARSE_PROMPT = `You are a university schedule parser. Read the attached page(s) of an exam schedule or weekly timetable.
Return ONLY minified JSON, no markdown fences, no commentary. Choose the matching shape:

Exam schedule:
{"kind":"exam-schedule","exams":[{"title":"","courseName":"","date":"YYYY-MM-DD","time":"HH:MM","room":""}],"notes":""}

Weekly timetable:
{"kind":"timetable","slots":[{"courseName":"","day":1,"start":"10:30","end":"12:00","room":"","kind":"lecture"}],"notes":""}

Rules: day is 0=Sunday..6=Saturday; kind is one of lecture|lab|tutorial|seminar; use null for unknown fields; keep course names short ("Marketing", not "BBA 301 - Marketing Management (Section 2)"); if the pages show neither exams nor a timetable return {"kind":"unknown","exams":[],"slots":[],"notes":"why"}.`

export const QUICKADD_PROMPT = (todayContext: string) => `You convert a student's quick note into one structured entry.
Today is ${todayContext}.
Return ONLY minified JSON: {"type":"task|personal|exam|class","title":"","date":"YYYY-MM-DD|null","time":"HH:MM|null","endTime":"HH:MM|null","day":null,"repeat":"none|daily|weekly|null","priority":"low|med|high|null","courseName":null,"room":null,"needsMore":false}
Rules: tasks get date (deadline); classes need day(0=Sun..6=Sat)+time+endTime and repeat weekly; personal items may have time/day; exams need date+time. If the note is too vague set needsMore=true. Title max 60 chars, plain words.`

/** Pull the first balanced JSON object out of a model reply. */
export function extractJson<T>(text: string): T {
  const start = text.indexOf('{')
  if (start === -1) throw new Error('Model returned no JSON.')
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return JSON.parse(text.slice(start, i + 1)) as T
    }
  }
  throw new Error('Model returned malformed JSON.')
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function timeToMin(t: unknown): number | undefined {
  if (typeof t !== 'string') return undefined
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return undefined
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return undefined
  return h * 60 + mi
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

const KINDS = ['lecture', 'lab', 'tutorial', 'seminar'] as const

/** Validate/coerce raw model JSON into safe internal shapes; drops junk rows silently. */
export function normalizeParse(raw: Record<string, unknown>): ParseResult {
  const kind = raw.kind === 'exam-schedule' || raw.kind === 'timetable' ? raw.kind : 'unknown'
  const exams: ParsedExam[] = Array.isArray(raw.exams)
    ? (raw.exams as Record<string, unknown>[])
        .map((e) => ({
          title: str(e.title) ?? str(e.courseName) ?? 'Untitled exam',
          courseName: str(e.courseName),
          dateISO: typeof e.date === 'string' && DATE_RE.test(e.date) ? e.date : undefined,
          startMin: timeToMin(e.time),
          room: str(e.room),
        }))
        .filter((e) => e.dateISO)
    : []
  const slots: ParsedSlot[] = Array.isArray(raw.slots)
    ? (raw.slots as Record<string, unknown>[])
        .map((s) => {
          const startMin = timeToMin(s.start)
          const endMin = timeToMin(s.end)
          const day = Number(s.day)
          const k = KINDS.includes(s.kind as never) ? (s.kind as ParsedSlot['kind']) : 'lecture'
          return {
            courseName: str(s.courseName) ?? 'Untitled course',
            dayOfWeek: Number.isInteger(day) && day >= 0 && day <= 6 ? day : -1,
            startMin,
            endMin,
            room: str(s.room),
            kind: k,
          }
        })
        .filter((s) => s.dayOfWeek >= 0 && s.startMin != null && s.endMin != null && (s.endMin as number) > (s.startMin as number))
        .map((s) => ({ ...s, startMin: s.startMin as number, endMin: s.endMin as number }))
    : []
  return { kind, exams, slots, notes: str(raw.notes) }
}

export function normalizeQuickAdd(raw: Record<string, unknown>): QuickAddDraft {
  const types = ['task', 'personal', 'exam', 'class'] as const
  const type = types.includes(raw.type as never) ? (raw.type as QuickAddDraft['type']) : 'personal'
  const priorities = ['low', 'med', 'high'] as const
  const recurrences = ['none', 'daily', 'weekly'] as const
  const timeMin = timeToMin(raw.time)
  const endMin = timeToMin(raw.endTime)
  const day = Number(raw.day)
  const dueISO = typeof raw.date === 'string' && DATE_RE.test(raw.date) ? raw.date : undefined
  return {
    type,
    title: str(raw.title) ?? 'Untitled',
    dateISO: dueISO,
    dueAt: dueISO ? new Date(`${dueISO}T${pad(timeMin ?? 9 * 60)}:00`).getTime() : undefined,
    priority: priorities.includes(raw.priority as never) ? (raw.priority as QuickAddDraft['priority']) : undefined,
    dayOfWeek: Number.isInteger(day) && day >= 0 && day <= 6 ? day : undefined,
    timeMin,
    endMin,
    recurrence: recurrences.includes(raw.repeat as never) ? (raw.repeat as QuickAddDraft['recurrence']) : undefined,
    courseName: str(raw.courseName),
    room: str(raw.room),
    needsMore: raw.needsMore === true,
  }
}

function pad(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** Deterministic pastel assignment so repeated imports keep colors stable. */
export function colorForIndex(i: number) {
  return COURSE_COLORS[i % COURSE_COLORS.length]
}

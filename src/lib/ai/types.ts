import type { ClassSlot } from '../types'

export type ParsedKind = 'exam-schedule' | 'timetable' | 'unknown'

export interface ParsedExam {
  title: string
  courseName?: string
  dateISO?: string // validated yyyy-MM-dd
  startMin?: number
  room?: string
}

export interface ParsedSlot {
  courseName: string
  dayOfWeek: number // 0=Sun..6=Sat
  startMin: number
  endMin: number
  room?: string
  kind: ClassSlot['kind']
}

export interface ParseResult {
  kind: ParsedKind
  exams: ParsedExam[]
  slots: ParsedSlot[]
  notes?: string
}

export type QuickAddType = 'task' | 'personal' | 'exam' | 'class'

export interface QuickAddDraft {
  type: QuickAddType
  title: string
  /** task */
  dueAt?: number
  priority?: 'low' | 'med' | 'high'
  /** exam */
  dateISO?: string
  /** class / personal */
  dayOfWeek?: number
  timeMin?: number
  endMin?: number
  recurrence?: 'none' | 'daily' | 'weekly'
  courseName?: string
  room?: string
  notes?: string
  needsMore?: boolean
  clarifying?: string
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AIProvider {
  readonly id: string
  readonly label: string
  /** pages = JPEG data URLs, one per rendered page. */
  parseDocument(pages: string[]): Promise<ParseResult>
  parseQuickAdd(text: string, todayContext: string): Promise<QuickAddDraft>
  chat(history: ChatTurn[], context: string): Promise<string>
}

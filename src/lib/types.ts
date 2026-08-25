// Core entity types. Every synced record carries createdAt / updatedAt (epoch ms)
// and a soft-delete flag so the sync engine can do last-write-wins merges.

export type ChipColor = 'red' | 'blue' | 'green' | 'yellow' | 'lavender' | 'teal'

export interface BaseRecord {
  id: string
  createdAt: number
  updatedAt: number
  deleted: 0 | 1
}

export interface Course extends BaseRecord {
  name: string
  code?: string
  color: ChipColor
  credits?: number // for the GPA tracker
  markPct?: number // final mark, 0–100
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'cancelled'

/** One marked class occurrence. Unique per (slotId ?? courseId) + dateISO. */
export interface Attendance extends BaseRecord {
  courseId: string
  slotId?: string
  dateISO: string // yyyy-MM-dd
  status: AttendanceStatus
  note?: string
}

/** A recurring weekly meeting rule, e.g. "Marketing, Mon 10:30-12:00, room B4". */
export interface ClassSlot extends BaseRecord {
  courseId: string
  dayOfWeek: number // 0 = Sunday ... 6 = Saturday
  startMin: number // minutes from midnight
  endMin: number
  room?: string
  kind: 'lecture' | 'lab' | 'tutorial' | 'seminar'
  validFrom: string // ISO date (yyyy-MM-dd)
  validTo?: string // semester end; empty = open-ended
}

export interface Exam extends BaseRecord {
  courseId?: string
  title: string
  dateISO: string // yyyy-MM-dd
  startMin?: number
  durationMin?: number
  room?: string
  notes?: string
}

export type Priority = 'low' | 'med' | 'high'
export type TaskStatus = 'todo' | 'done'

export interface Assignment extends BaseRecord {
  courseId?: string
  title: string
  dueAt?: number // epoch ms
  priority: Priority
  status: TaskStatus
  notes?: string
}

export type Recurrence = 'none' | 'daily' | 'weekly'

export interface PersonalItem extends BaseRecord {
  title: string
  timeMin?: number
  recurrence: Recurrence
  dayOfWeek?: number
  notes?: string
}

export type ImportStatus = 'draft' | 'confirmed' | 'discarded'

/** Device-local record of an AI document import (not synced; may hold binary data). */
export interface AiImport {
  id: string
  status: ImportStatus
  kind: 'exam-schedule' | 'timetable' | 'unknown'
  fileName: string
  mimeType: string
  dataB64?: string
  draftJson: string
  createdAt: number
}

export const COURSE_COLORS: ChipColor[] = ['red', 'blue', 'green', 'yellow', 'lavender', 'teal']

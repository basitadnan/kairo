import Dexie, { type Table } from 'dexie'
import type { AiImport, Assignment, Attendance, ClassSlot, Course, Exam, PersonalItem } from './types'
import { emitLocalChange } from './bus'

export interface SettingRow {
  key: string
  value: string
}

export interface SyncMeta {
  key: string // 'lastSyncedAt' | 'lastPushAt'
  value: number
}

export interface FiredReminder {
  key: string // stable reminder identity, e.g. `class:${slotId}:${yyyymmdd}:${lead}`
  at: number // when the reminder was due
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

/**
 * Local-first database. Everything the app shows is read from here;
 * Supabase sync (lib/sync.ts) merely mirrors rows in the background.
 */
export class MegaDB extends Dexie {
  courses!: Table<Course, string>
  classSlots!: Table<ClassSlot, string>
  exams!: Table<Exam, string>
  assignments!: Table<Assignment, string>
  personalItems!: Table<PersonalItem, string>
  attendance!: Table<Attendance, string>
  aiImports!: Table<AiImport, string>
  settings!: Table<SettingRow, string>
  syncMeta!: Table<SyncMeta, string>
  firedReminders!: Table<FiredReminder, string>
  chatMessages!: Table<ChatMessage, string>

  constructor() {
    super('mega-schedule')
    this.version(1).stores({
      courses: 'id, updatedAt, deleted, name',
      classSlots: 'id, courseId, dayOfWeek, updatedAt, deleted',
      exams: 'id, dateISO, courseId, updatedAt, deleted',
      assignments: 'id, courseId, dueAt, status, updatedAt, deleted',
      personalItems: 'id, updatedAt, deleted',
      aiImports: 'id, status, createdAt',
      settings: 'key',
      syncMeta: 'key',
    })
    this.version(2).stores({
      firedReminders: 'key, at',
    })
    this.version(3).stores({
      chatMessages: 'id, createdAt',
    })
    this.version(4).stores({
      attendance: 'id, courseId, slotId, dateISO, updatedAt, deleted',
    })
  }
}

export const db = new MegaDB()

/** Stamp + insert a new record with a fresh id. */
export async function putNew<T extends { id: string; createdAt: number; updatedAt: number; deleted: 0 | 1 }>(
  table: Table<T, string>,
  data: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>,
): Promise<T> {
  const now = Date.now()
  const rec = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now, deleted: 0 } as T
  await table.put(rec)
  emitLocalChange()
  return rec
}

/** Stamp an edit on an existing record. */
export async function putUpdate<T extends { id: string; updatedAt: number; deleted: 0 | 1 }>(
  table: Table<T, string>,
  id: string,
  patch: Partial<T>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dexie's UpdateSpec is intentionally loose
  await table.update(id, { ...patch, updatedAt: Date.now() } as any)
  emitLocalChange()
}

/** Soft delete so other devices learn about the removal. */
export async function softDelete(table: Table<{ id: string; updatedAt: number; deleted: 0 | 1 }, string>, id: string) {
  await table.update(id, { deleted: 1 as const, updatedAt: Date.now() })
  emitLocalChange()
}

export async function getSetting(key: string): Promise<string | undefined> {
  return (await db.settings.get(key))?.value
}

export async function setSetting(key: string, value: string) {
  await db.settings.put({ key, value })
}

import { db } from './db'
import { downloadText } from './csv'

/**
 * Full local-data JSON dump — the same shape Settings' "Export backup" and
 * the account gate's pre-signup safety copy use.
 */
export async function exportBackupJson(): Promise<void> {
  const dump = {
    exportedAt: new Date().toISOString(),
    courses: await db.courses.toArray(),
    classSlots: await db.classSlots.toArray(),
    exams: await db.exams.toArray(),
    assignments: await db.assignments.toArray(),
    personalItems: await db.personalItems.toArray(),
    attendance: await db.attendance.toArray(),
  }
  downloadText('mega-schedule-backup.json', JSON.stringify(dump, null, 2), 'application/json')
}

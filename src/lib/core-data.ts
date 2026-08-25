import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import type { Assignment, Attendance, ClassSlot, Course, Exam, PersonalItem } from '../lib/types'

export interface CoreData {
  courses: Course[]
  slots: ClassSlot[]
  exams: Exam[]
  assignments: Assignment[]
  personalItems: PersonalItem[]
}

const EMPTY: CoreData = { courses: [], slots: [], exams: [], assignments: [], personalItems: [] }

/**
 * Live view of everything the UI needs; re-renders on any local write.
 * `ready` is false until every initial query has resolved once — screens use
 * it to show skeletons instead of flashing their empty states.
 */
export function useCoreData(): CoreData & { ready: boolean } {
  const coursesQ = useLiveQuery(() => db.courses.toArray(), [])
  const slotsQ = useLiveQuery(() => db.classSlots.toArray(), [])
  const examsQ = useLiveQuery(() => db.exams.toArray(), [])
  const assignmentsQ = useLiveQuery(() => db.assignments.toArray(), [])
  const personalItemsQ = useLiveQuery(() => db.personalItems.toArray(), [])
  const ready =
    coursesQ !== undefined &&
    slotsQ !== undefined &&
    examsQ !== undefined &&
    assignmentsQ !== undefined &&
    personalItemsQ !== undefined
  return {
    courses: coursesQ ?? EMPTY.courses,
    slots: slotsQ ?? EMPTY.slots,
    exams: examsQ ?? EMPTY.exams,
    assignments: assignmentsQ ?? EMPTY.assignments,
    personalItems: personalItemsQ ?? EMPTY.personalItems,
    ready,
  }
}

export function activeCourses(courses: Course[]): Course[] {
  return courses.filter((c) => !c.deleted)
}

export function courseOf(courses: Course[], id?: string): Course | undefined {
  return id ? activeCourses(courses).find((c) => c.id === id) : undefined
}

export function useAttendanceFor(dateISO: string): Attendance[] {
  return useLiveQuery(() => db.attendance.where('dateISO').equals(dateISO).toArray(), [dateISO]) ?? []
}

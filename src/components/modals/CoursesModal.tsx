import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash } from '@phosphor-icons/react'
import { Modal } from '../ui/Modal'
import { Field, Input } from '../ui/inputs'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Chip } from '../ui/Chip'
import { db, putNew, putUpdate, softDelete } from '../../lib/db'
import { COURSE_COLORS, type ChipColor, type Course } from '../../lib/types'

interface CoursesModalProps {
  open: boolean
  onClose: () => void
}

export function CoursesModal({ open, onClose }: CoursesModalProps) {
  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? []
  const slots = useLiveQuery(() => db.classSlots.toArray(), []) ?? []
  const liveCourses = courses.filter((c) => !c.deleted).sort((a, b) => a.name.localeCompare(b.name))

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [color, setColor] = useState<ChipColor>('blue')

  async function addCourse(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await putNew(db.courses, { name: name.trim(), code: code.trim() || undefined, color })
    setName('')
    setCode('')
    setColor(COURSE_COLORS[(liveCourses.length + 1) % COURSE_COLORS.length])
  }

  async function removeCourse(course: Course) {
    if (!window.confirm(`Delete "${course.name}" and its ${slots.filter((s) => !s.deleted && s.courseId === course.id).length} classes?`)) return
    await softDelete(db.courses, course.id)
    for (const slot of slots.filter((s) => !s.deleted && s.courseId === course.id)) {
      await softDelete(db.classSlots, slot.id)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Your courses">
      <div className="flex flex-col gap-4">
        {liveCourses.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            No courses yet. Create your subjects below — they become the colour tags across your timetable.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {liveCourses.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2.5">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ background: `var(--chip-${c.color}-bg)`, border: `1.5px solid var(--chip-${c.color}-text)` }}
                  aria-hidden
                />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{c.name}</p>
                {c.code && <Chip color={c.color}>{c.code}</Chip>}
                <IconButton label={`Delete ${c.name}`} onClick={() => void removeCourse(c)} className="hover:text-chip-red-text">
                  <Trash size={15} aria-hidden />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addCourse} className="flex flex-col gap-4 border-t border-line pt-4">
          <div className="grid grid-cols-[1fr_110px] gap-4">
            <Field label="Add a course" htmlFor="c-name">
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing" />
            </Field>
            <Field label="Code" htmlFor="c-code">
              <Input id="c-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MKT201" />
            </Field>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="flex gap-2 pb-0.5" role="radiogroup" aria-label="Colour">
              {COURSE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 cursor-pointer rounded-full transition-transform duration-150 hover:scale-110 ${
                    color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''
                  }`}
                  style={{ background: `var(--chip-${c}-bg)`, border: `1px solid var(--chip-${c}-text)` }}
                />
              ))}
            </div>
            <Button type="submit" size="sm">Create</Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

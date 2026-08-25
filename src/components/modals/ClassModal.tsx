import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Modal } from '../ui/Modal'
import { Field, Input, Select } from '../ui/inputs'
import { Button } from '../ui/Button'
import { db, putNew, putUpdate } from '../../lib/db'
import { COURSE_COLORS, type ChipColor, type ClassSlot } from '../../lib/types'
import { todayISO } from '../../lib/format'

const DAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
]

const KINDS = ['lecture', 'lab', 'tutorial', 'seminar'] as const

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToInput(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

interface ClassModalProps {
  open: boolean
  onClose: () => void
  /** Existing slot → edit mode; null → add mode. */
  slot?: ClassSlot | null
}

export function ClassModal({ open, onClose, slot }: ClassModalProps) {
  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? []
  const liveCourses = courses.filter((c) => !c.deleted)

  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [courseId, setCourseId] = useState('')
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newColor, setNewColor] = useState<ChipColor>('blue')
  const [kind, setKind] = useState<ClassSlot['kind']>('lecture')
  const [day, setDay] = useState('1')
  const [start, setStart] = useState('10:30')
  const [end, setEnd] = useState('12:00')
  const [room, setRoom] = useState('')
  const [error, setError] = useState<string>()

  // Reset the form each time the modal opens for a different target.
  useEffect(() => {
    if (!open) return
    setError(undefined)
    if (slot) {
      setMode('existing')
      setCourseId(slot.courseId)
      setKind(slot.kind)
      setDay(String(slot.dayOfWeek))
      setStart(minutesToInput(slot.startMin))
      setEnd(minutesToInput(slot.endMin))
      setRoom(slot.room ?? '')
    } else {
      setMode(liveCourses.length > 0 ? 'existing' : 'new')
      setCourseId(liveCourses[0]?.id ?? '')
      setNewName('')
      setNewCode('')
      setNewColor(COURSE_COLORS[liveCourses.length % COURSE_COLORS.length])
      setKind('lecture')
      setDay('1')
      setStart('10:30')
      setEnd('12:00')
      setRoom('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slot?.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const startMin = timeToMin(start)
    const endMin = timeToMin(end)
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return setError('Pick both a start and an end time.')
    if (endMin <= startMin) return setError('End time must be after the start time.')

    let finalCourseId = courseId
    if (mode === 'new') {
      if (!newName.trim()) return setError('Give the course a name.')
      const course = await putNew(db.courses, {
        name: newName.trim(),
        code: newCode.trim() || undefined,
        color: newColor,
      })
      finalCourseId = course.id
    }
    if (!finalCourseId) return setError('Choose a course.')

    const payload = {
      courseId: finalCourseId,
      dayOfWeek: Number(day),
      startMin,
      endMin,
      room: room.trim() || undefined,
      kind,
    }

    if (slot) await putUpdate(db.classSlots, slot.id, payload)
    else await putNew(db.classSlots, { ...payload, validFrom: todayISO() })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={slot ? 'Edit class' : 'Add class'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {/* Course picker / creator */}
        {liveCourses.length > 0 && (
          <div role="radiogroup" aria-label="Which course?" className="flex gap-2">
            <Button type="button" size="sm" variant={mode === 'existing' ? 'primary' : 'soft'} onClick={() => setMode('existing')}>
              Existing course
            </Button>
            <Button type="button" size="sm" variant={mode === 'new' ? 'primary' : 'soft'} onClick={() => setMode('new')}>
              New course
            </Button>
          </div>
        )}

        {mode === 'existing' && liveCourses.length > 0 ? (
          <Field label="Course" htmlFor="f-course">
            <Select id="f-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {liveCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.code ? ` (${c.code})` : ''}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[1fr_110px] gap-4">
              <Field label="Course name" htmlFor="f-new-name">
                <Input id="f-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Marketing" autoFocus />
              </Field>
              <Field label="Code" htmlFor="f-new-code">
                <Input id="f-new-code" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="MKT201" />
              </Field>
            </div>
            <Field label="Colour tag">
              <div className="flex gap-2 pt-0.5">
                {COURSE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    onClick={() => setNewColor(c)}
                    className={`h-7 w-7 cursor-pointer rounded-full transition-transform duration-150 hover:scale-110 ${
                      newColor === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''
                    }`}
                    style={{ background: `var(--chip-${c}-bg)`, border: `1px solid var(--chip-${c}-text)` }}
                  />
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* When + what */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Day" htmlFor="f-day">
            <Select id="f-day" value={day} onChange={(e) => setDay(e.target.value)}>
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Type" htmlFor="f-kind">
            <Select id="f-kind" value={kind} onChange={(e) => setKind(e.target.value as ClassSlot['kind'])}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Starts" htmlFor="f-start">
            <Input id="f-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Ends" htmlFor="f-end">
            <Input id="f-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>

        <Field label="Room" htmlFor="f-room" hint="Optional.">
          <Input id="f-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="B4 Hall" />
        </Field>

        {error && <p className="text-xs text-chip-red-text">{error}</p>}

        <div className="mt-1 flex items-center justify-between gap-2">
          {slot ? (
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={async () => {
                await putUpdate(db.classSlots, slot.id, { deleted: 1 })
                onClose()
              }}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">{slot ? 'Save changes' : 'Add class'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

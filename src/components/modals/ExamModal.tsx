import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Modal } from '../ui/Modal'
import { Field, Input, Select, Textarea } from '../ui/inputs'
import { Button } from '../ui/Button'
import { db, putNew, putUpdate } from '../../lib/db'

interface ExamModalProps {
  open: boolean
  onClose: () => void
  /** Existing exam → edit mode; null → add mode. */
  exam?: import('../../lib/types').Exam | null
}

export function ExamModal({ open, onClose, exam }: ExamModalProps) {
  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? []
  const liveCourses = courses.filter((c) => !c.deleted)

  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [dateISO, setDateISO] = useState('')
  const [time, setTime] = useState('')
  const [room, setRoom] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!open) return
    setError(undefined)
    if (exam) {
      setTitle(exam.title)
      setCourseId(exam.courseId ?? '')
      setDateISO(exam.dateISO)
      setTime(
        exam.startMin != null
          ? `${String(Math.floor(exam.startMin / 60)).padStart(2, '0')}:${String(exam.startMin % 60).padStart(2, '0')}`
          : '',
      )
      setRoom(exam.room ?? '')
      setNotes(exam.notes ?? '')
    } else {
      setTitle('')
      setCourseId(liveCourses[0]?.id ?? '')
      setDateISO('')
      setTime('')
      setRoom('')
      setNotes('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exam?.id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Give the exam a title.')
    if (!dateISO) return setError('Pick the exam date.')
    const startMin = time ? (() => { const [h, m] = time.split(':').map(Number); return h * 60 + m })() : undefined

    const payload = {
      title: title.trim(),
      courseId: courseId || undefined,
      dateISO,
      startMin,
      room: room.trim() || undefined,
      notes: notes.trim() || undefined,
    }

    if (exam) await putUpdate(db.exams, exam.id, payload)
    else await putNew(db.exams, payload)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={exam ? 'Edit exam' : 'Add exam'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Title" htmlFor="f-ex-title">
          <Input id="f-ex-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Marketing Final" autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" htmlFor="f-ex-date">
            <Input id="f-ex-date" type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
          </Field>
          <Field label="Starts" htmlFor="f-ex-time" hint="Optional.">
            <Input id="f-ex-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>

        {liveCourses.length > 0 && (
          <Field label="Course" htmlFor="f-ex-course" hint="Links the exam to a subject colour.">
            <Select id="f-ex-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">None</option>
              {liveCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4">
          <Field label="Room" htmlFor="f-ex-room" hint="Optional.">
            <Input id="f-ex-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Exam Hall A" />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Chapters 4-7, closed book" />
        </Field>

        {error && <p className="text-xs text-chip-red-text">{error}</p>}

        <div className="mt-1 flex items-center justify-between gap-2">
          {exam ? (
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={async () => {
                await putUpdate(db.exams, exam.id, { deleted: 1 })
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
            <Button type="submit">{exam ? 'Save changes' : 'Add exam'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

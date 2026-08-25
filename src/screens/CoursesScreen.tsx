import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { BookOpen, CaretRight, Plus, Trash } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { Chip } from '../components/ui/Chip'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Field, Input } from '../components/ui/inputs'
import { SkeletonCard } from '../components/ui/Skeleton'
import { db, putNew, putUpdate, softDelete } from '../lib/db'
import { activeCourses } from '../lib/core-data'
import { computeGpa, loadBands, type GradeBand } from '../lib/gpa'
import { COURSE_COLORS, type ChipColor, type Course } from '../lib/types'

export function CoursesScreen() {
  const coursesQ = useLiveQuery(() => db.courses.toArray(), [])
  const slotsQ = useLiveQuery(() => db.classSlots.toArray(), [])
  const ready = coursesQ !== undefined && slotsQ !== undefined
  const liveCourses = activeCourses(coursesQ ?? []).sort((a, b) => a.name.localeCompare(b.name))
  const slots = slotsQ ?? []
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Course | undefined>()
  const [bands, setBands] = useState<GradeBand[]>([])

  useEffect(() => {
    void loadBands().then(setBands)
  }, [])

  const gpa = computeGpa(liveCourses, bands)

  if (!ready) {
    return (
      <div>
        <PageHeader
          title="Courses"
          sub="Subjects, marks and your GPA"
          action={<Button size="sm" disabled><Plus size={14} weight="bold" aria-hidden /> Add</Button>}
        />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6"
        >
          <SkeletonCard rows={4} />
        </motion.div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Courses"
        sub="Subjects, marks and your GPA"
        action={<Button size="sm" onClick={() => setAdding(true)}><Plus size={14} weight="bold" aria-hidden /> Add</Button>}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6 flex flex-col gap-6"
      >
        {/* GPA summary */}
        {gpa.gpa != null && (
          <Card className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-baseline gap-2">
              <span className="tnum font-mono text-[34px] leading-none text-ink">{gpa.gpa.toFixed(2)}</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">/ 4.0 gpa</span>
            </div>
            <p className="text-right text-xs text-ink-2">
              {gpa.gradedCount} {gpa.gradedCount === 1 ? 'course' : 'courses'} graded · {gpa.totalCredits} credits.
              <br />
              Adjust marks or bands below / in Settings.
            </p>
          </Card>
        )}

        {/* Course list */}
        {liveCourses.length === 0 ? (
          <Card>
            <EmptyState
              icon={BookOpen}
              title="No courses yet"
              body="Courses are the colours across your timetable. Add them here — with credits and a final mark if you want your GPA tracked."
              action={<Button variant="soft" onClick={() => setAdding(true)}>Add a course</Button>}
            />
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {liveCourses.map((c) => {
              const classCount = slots.filter((s) => !s.deleted && s.courseId === c.id).length
              const letter = c.markPct != null ? bandLetter(c.markPct, bands) : undefined
              return (
                <button
                  key={c.id}
                  onClick={() => setEditing(c)}
                  className="group flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2"
                  title={`Edit ${c.name}`}
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                    style={{ background: `var(--chip-${c.color}-bg)`, border: `1.5px solid var(--chip-${c.color}-text)` }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                    <p className="mt-0.5 text-xs text-ink-2">
                      {classCount > 0 ? `${classCount} ${classCount === 1 ? 'class' : 'classes'} per week` : 'No classes yet'}
                      {c.credits ? ` · ${c.credits} cr` : ''}
                    </p>
                  </div>
                  {letter && c.markPct != null && (
                    <Chip color={c.color}>
                      <span className="tnum">{c.markPct}%</span>&nbsp;<span aria-hidden>·</span>&nbsp;{letter}
                    </Chip>
                  )}
                  <CaretRight size={14} className="shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                </button>
              )
            })}
          </Card>
        )}

        <p className="text-xs leading-relaxed text-ink-2">
          Editing a course renames it everywhere. Deleting it also removes its weekly classes; exams and tasks keep their history.
          Set credits and a final mark (0–100) to include a course in your GPA.
        </p>
      </motion.div>

      <CourseFormModal open={adding || !!editing} course={editing} onClose={() => { setAdding(false); setEditing(undefined) }} />
    </div>
  )
}

function bandLetter(pct: number, bands: GradeBand[]): string | undefined {
  const sorted = [...bands].sort((a, b) => b.minPct - a.minPct)
  return sorted.find((b) => pct >= b.minPct)?.letter
}

function CourseFormModal({ open, course, onClose }: { open: boolean; course?: Course; onClose: () => void }) {
  const slots = useLiveQuery(() => db.classSlots.toArray(), []) ?? []
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [color, setColor] = useState<ChipColor>('blue')
  const [credits, setCredits] = useState('')
  const [markPct, setMarkPct] = useState('')

  useEffect(() => {
    if (!open) return
    setName(course?.name ?? '')
    setCode(course?.code ?? '')
    setColor(course?.color ?? COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)])
    setCredits(course?.credits != null ? String(course.credits) : '')
    setMarkPct(course?.markPct != null ? String(course.markPct) : '')
  }, [open, course])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const creditsNum = Number(credits)
    const markNum = Number(markPct)
    const fields = {
      name: name.trim(),
      code: code.trim() || undefined,
      color,
      credits: credits.trim() && isFinite(creditsNum) && creditsNum > 0 ? creditsNum : undefined,
      markPct: markPct.trim() && isFinite(markNum) && markNum >= 0 && markNum <= 100 ? markNum : undefined,
    }
    if (course) await putUpdate(db.courses, course.id, fields)
    else await putNew(db.courses, fields)
    onClose()
  }

  async function remove() {
    if (!course) return
    const count = slots.filter((s) => !s.deleted && s.courseId === course.id).length
    if (!window.confirm(`Delete "${course.name}"${count ? ` and its ${count} classes` : ''}?`)) return
    await softDelete(db.courses, course.id)
    for (const slot of slots.filter((s) => !s.deleted && s.courseId === course.id)) {
      await softDelete(db.classSlots, slot.id)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={course ? 'Edit course' : 'Add a course'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Course name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing" autoFocus />
        </Field>
        <div className="grid grid-cols-[1fr_110px_110px] gap-4">
          <Field label="Code">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MKT201" />
          </Field>
          <Field label="Credits">
            <Input inputMode="decimal" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="3" />
          </Field>
          <Field label="Mark %">
            <Input inputMode="numeric" value={markPct} onChange={(e) => setMarkPct(e.target.value)} placeholder="82" />
          </Field>
        </div>
        <div className="flex gap-2 py-1" role="radiogroup" aria-label="Colour">
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
        <div className="mt-1 flex items-center justify-between gap-2">
          {course ? (
            <Button type="button" variant="danger" size="sm" onClick={() => void remove()}>
              <Trash size={14} aria-hidden /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">{course ? 'Save changes' : 'Create'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

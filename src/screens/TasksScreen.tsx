import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Check, ListChecks, Plus, Trash } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { useCoreData, courseOf, activeCourses } from '../lib/core-data'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { Chip } from '../components/ui/Chip'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/inputs'
import { SectionHeader } from '../components/ui/SectionHeader'
import { SkeletonCard } from '../components/ui/Skeleton'
import { QuickAddBar } from '../components/quick-add/QuickAddBar'
import { db, putNew, putUpdate, softDelete } from '../lib/db'
import { relativeDue } from '../lib/format'
import type { Assignment, Priority } from '../lib/types'

const PRIORITY_COLOR = { high: 'red', med: 'yellow', low: 'green' } as const

/** epoch ms → value for <input type="datetime-local"> */
function toLocalInput(ms?: number): string {
  return ms ? format(new Date(ms), "yyyy-MM-dd'T'HH:mm") : ''
}

export function TasksScreen() {
  const { assignments, courses, ready } = useCoreData()
  const liveCourses = activeCourses(courses)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Assignment | undefined>()

  const todo = assignments.filter((a) => !a.deleted && a.status === 'todo')
    .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))
  const done = assignments.filter((a) => !a.deleted && a.status === 'done')

  const toggle = (id: string, status: 'todo' | 'done') => void putUpdate(db.assignments, id, { status })

  if (!ready) {
    return (
      <div>
        <PageHeader
          title="Tasks"
          sub="Assignments and deadlines"
        />
        <div className="mt-6">
          <QuickAddBar />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 flex flex-col gap-8"
        >
          <SectionHeader title="Open" />
          <SkeletonCard rows={4} />
        </motion.div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        sub="Assignments and deadlines"
        action={<Button size="sm" onClick={() => setAdding(true)}><Plus size={14} weight="bold" aria-hidden /> Add</Button>}
      />

      <div className="mt-6">
        <QuickAddBar />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 flex flex-col gap-8"
      >
        <section>
          <SectionHeader title="Open" hint={`${todo.length} ${todo.length === 1 ? 'task' : 'tasks'}`} />
          {todo.length === 0 ? (
            <Card className="mt-3">
              <EmptyState
                icon={ListChecks}
                title="All clear"
                body="Add an assignment the moment you get it so it never lives only in your head. Sync carries it to your laptop automatically."
                action={<Button variant="soft" onClick={() => setAdding(true)}>Add your first task</Button>}
              />
            </Card>
          ) : (
            <Card className="mt-3 divide-y divide-line">
              {todo.map((a) => {
                const course = courseOf(liveCourses, a.courseId)
                return (
                  <div key={a.id} className="group flex items-center gap-3 px-5 py-3.5">
                    <button
                      aria-label="Mark done"
                      onClick={() => toggle(a.id, 'done')}
                      className="h-[18px] w-[18px] shrink-0 cursor-pointer rounded-full border border-line-strong transition-colors duration-200 hover:border-accent hover:bg-accent-soft"
                    />
                    <button
                      onClick={() => setEditing(a)}
                      className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm text-ink transition-colors duration-150 hover:text-accent"
                      title="Edit task"
                    >
                      {a.title}
                    </button>
                    {course && <Chip color={course.color} className="hidden sm:inline-flex">{course.code || course.name}</Chip>}
                    <Chip color={PRIORITY_COLOR[a.priority]}>{a.priority}</Chip>
                    <span className="w-[104px] shrink-0 text-right font-mono text-xs text-ink-2">
                      {a.dueAt ? relativeDue(a.dueAt) : ''}
                    </span>
                  </div>
                )
              })}
            </Card>
          )}
        </section>

        {done.length > 0 && (
          <section>
            <SectionHeader title="Completed" hint={`${done.length}`} />
            <Card className="mt-3 divide-y divide-line">
              {done.slice(0, 20).map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <button
                    aria-label="Reopen"
                    onClick={() => toggle(a.id, 'todo')}
                    className="grid h-[18px] w-[18px] shrink-0 cursor-pointer place-items-center rounded-full bg-accent text-on-accent transition-transform duration-200 hover:scale-105"
                  >
                    <Check size={11} weight="bold" aria-hidden />
                  </button>
                  <button
                    onClick={() => setEditing(a)}
                    className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm text-ink-3 line-through transition-colors duration-150 hover:text-ink"
                    title="Edit task"
                  >
                    {a.title}
                  </button>
                </div>
              ))}
            </Card>
          </section>
        )}
      </motion.div>

      <TaskModal open={adding || !!editing} task={editing} onClose={() => { setAdding(false); setEditing(undefined) }} />
    </div>
  )
}

function TaskModal({ open, task, onClose }: { open: boolean; task?: Assignment; onClose: () => void }) {
  const { courses } = useCoreData()
  const liveCourses = activeCourses(courses)
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [priority, setPriority] = useState<Priority>('med')
  const [dueAt, setDueAt] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setCourseId(task?.courseId ?? '')
    setPriority(task?.priority ?? 'med')
    setDueAt(toLocalInput(task?.dueAt))
    setNotes(task?.notes ?? '')
  }, [open, task])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const fields = {
      title: title.trim(),
      courseId: courseId || undefined,
      priority,
      dueAt: dueAt ? new Date(dueAt).getTime() : undefined,
      notes: notes.trim() || undefined,
    }
    if (task) await putUpdate(db.assignments, task.id, fields)
    else await putNew(db.assignments, { ...fields, status: 'todo' })
    onClose()
  }

  async function remove() {
    if (!task) return
    if (!window.confirm(`Delete "${task.title}"?`)) return
    await softDelete(db.assignments, task.id)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit task' : 'New task'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="What needs doing?">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Physics problem set 3" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Course">
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">None</option>
              {liveCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low</option>
              <option value="med">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
        </div>
        <Field label="Due" hint="Optional, but reminders need it.">
          <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details" />
        </Field>
        <div className="mt-1 flex items-center justify-between gap-2">
          {task ? (
            <Button type="button" variant="danger" size="sm" onClick={() => void remove()}>
              <Trash size={14} aria-hidden /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">{task ? 'Save changes' : 'Add task'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

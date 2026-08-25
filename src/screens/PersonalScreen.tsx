import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Leaf, Plus, Trash } from '@phosphor-icons/react'
import { useCoreData } from '../lib/core-data'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { Chip } from '../components/ui/Chip'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../components/ui/inputs'
import { SkeletonCard } from '../components/ui/Skeleton'
import { db, putNew, putUpdate, softDelete } from '../lib/db'
import { minutesToLabel } from '../lib/format'
import type { PersonalItem, Recurrence } from '../lib/types'

const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'Once',
  daily: 'Every day',
  weekly: 'Weekly',
}

export function PersonalScreen() {
  const { personalItems, ready } = useCoreData()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<PersonalItem | undefined>()

  const items = personalItems
    .filter((p) => !p.deleted)
    .sort((a, b) => (a.timeMin ?? 9999) - (b.timeMin ?? 9999))

  if (!ready) {
    return (
      <div>
        <PageHeader
          title="Personal"
          sub="Gym, errands, everything that is yours"
          action={<Button size="sm" disabled><Plus size={14} weight="bold" aria-hidden /> Add</Button>}
        />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6"
        >
          <SkeletonCard rows={3} />
        </motion.div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Personal"
        sub="Gym, errands, everything that is yours"
        action={<Button size="sm" onClick={() => setAdding(true)}><Plus size={14} weight="bold" aria-hidden /> Add</Button>}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6"
      >
        {items.length === 0 ? (
          <Card>
            <EmptyState
              icon={Leaf}
              title="Life outside university"
              body="Gym at seven, call home at nine — put it here and the assistant will treat it with the same respect as a lecture."
              action={<Button variant="soft" onClick={() => setAdding(true)}>Add something</Button>}
            />
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setEditing(item)}
                className="flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2"
                title="Edit item"
              >
                <span className="tnum w-[52px] shrink-0 font-mono text-[13px] text-ink-2">
                  {item.timeMin != null ? minutesToLabel(item.timeMin) : ''}
                </span>
                <span className="h-8 w-px shrink-0 bg-line" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                  {item.notes && <p className="mt-0.5 truncate text-xs text-ink-2">{item.notes}</p>}
                </div>
                {item.recurrence !== 'none' && <Chip color="teal">{RECURRENCE_LABEL[item.recurrence]}</Chip>}
              </button>
            ))}
          </Card>
        )}
      </motion.div>

      <ItemModal open={adding || !!editing} item={editing} onClose={() => { setAdding(false); setEditing(undefined) }} />
    </div>
  )
}

function ItemModal({ open, item, onClose }: { open: boolean; item?: PersonalItem; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence>('none')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(item?.title ?? '')
    setTime(item?.timeMin != null ? minutesToLabel(item.timeMin) : '')
    setRecurrence(item?.recurrence ?? 'none')
    setNotes(item?.notes ?? '')
  }, [open, item])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const [h, m] = time ? time.split(':').map(Number) : [undefined, undefined]
    const fields = {
      title: title.trim(),
      timeMin: h != null && m != null ? h * 60 + m : undefined,
      recurrence,
      dayOfWeek: recurrence === 'weekly' ? (item?.dayOfWeek ?? new Date().getDay()) : undefined,
      notes: notes.trim() || undefined,
    }
    if (item) await putUpdate(db.personalItems, item.id, fields)
    else await putNew(db.personalItems, fields)
    onClose()
  }

  async function remove() {
    if (!item) return
    if (!window.confirm(`Delete "${item.title}"?`)) return
    await softDelete(db.personalItems, item.id)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? 'Edit personal item' : 'Add personal item'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="What is it?">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gym time" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Repeats">
            <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              <option value="none">Just once</option>
              <option value="daily">Every day</option>
              <option value="weekly">Weekly</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details" />
        </Field>
        <div className="mt-1 flex items-center justify-between gap-2">
          {item ? (
            <Button type="button" variant="danger" size="sm" onClick={() => void remove()}>
              <Trash size={14} aria-hidden /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">{item ? 'Save changes' : 'Save'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

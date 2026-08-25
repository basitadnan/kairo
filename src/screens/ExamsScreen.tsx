import { useState } from 'react'
import { format } from 'date-fns'
import { motion } from 'motion/react'
import { GraduationCap, Plus } from '@phosphor-icons/react'
import { useCoreData, courseOf, activeCourses } from '../lib/core-data'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { EmptyState } from '../components/ui/EmptyState'
import { ExamModal } from '../components/modals/ExamModal'
import { SkeletonCard } from '../components/ui/Skeleton'
import { daysUntilLabel, minutesToLabel, todayISO } from '../lib/format'
import type { Exam } from '../lib/types'

export function ExamsScreen() {
  const { exams, courses, ready } = useCoreData()
  const liveCourses = activeCourses(courses)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const today = todayISO()

  const upcoming = exams
    .filter((e) => !e.deleted)
    .filter((e) => e.dateISO >= today)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))

  if (!ready) {
    return (
      <div>
        <PageHeader
          title="Exams"
          sub="Countdowns and prep time at a glance"
          action={<Button size="sm" disabled><Plus size={14} weight="bold" aria-hidden /> Add exam</Button>}
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
        title="Exams"
        sub="Countdowns and prep time at a glance"
        action={<Button size="sm" onClick={() => setAdding(true)}><Plus size={14} weight="bold" aria-hidden /> Add exam</Button>}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6"
      >
        {upcoming.length === 0 ? (
          <Card>
            <EmptyState
              icon={GraduationCap}
              title="No exams yet"
              body="Add them manually for now — soon you'll drop a photo or PDF of your exam schedule and it fills this list automatically."
              action={<Button variant="soft" onClick={() => setAdding(true)}>Add your first exam</Button>}
            />
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {upcoming.map((exam) => {
              const course = courseOf(liveCourses, exam.courseId)
              const d = Number(exam.dateISO.replaceAll('-', '')) - Number(today.replaceAll('-', ''))
              const urgency = d <= 7 ? ('red' as const) : d <= 14 ? ('yellow' as const) : ('green' as const)
              return (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => setEditing(exam)}
                  className="flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left transition-colors duration-200 hover:bg-surface-2"
                >
                  <div className="w-10 shrink-0 text-center">
                    <p className="tnum text-xl font-semibold leading-none text-ink">{format(new Date(`${exam.dateISO}T00:00:00`), 'd')}</p>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">
                      {format(new Date(`${exam.dateISO}T00:00:00`), 'MMM')}
                    </p>
                  </div>
                  <span className="h-9 w-px shrink-0 bg-line" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{exam.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-2">
                      {exam.startMin != null && <span className="tnum font-mono">{minutesToLabel(exam.startMin)}</span>}
                      {course && <Chip color={course.color} className="!py-0.5">{course.code || course.name}</Chip>}
                      {exam.room && <span>{exam.room}</span>}
                    </p>
                  </div>
                  <Chip color={urgency}>{daysUntilLabel(exam.dateISO)}</Chip>
                </button>
              )
            })}
          </Card>
        )}
      </motion.div>

      <ExamModal open={adding} onClose={() => setAdding(false)} />
      <ExamModal open={editing !== null} onClose={() => setEditing(null)} exam={editing} />
    </div>
  )
}

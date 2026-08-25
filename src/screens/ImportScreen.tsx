import { useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, CheckCircle, FileImage, FilePdf, Warning } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/inputs'
import { getProvider, type ParsedExam, type ParsedKind, type ParsedSlot } from '../lib/ai'
import { fileToPages, makeSampleExamSheet } from '../lib/ai/documents'
import { colorForIndex } from '../lib/ai/shared'
import { db, putNew } from '../lib/db'
import { minutesToLabel, todayISO } from '../lib/format'

type Stage = 'idle' | 'working' | 'review' | 'done'

interface ReviewRow {
  id: string
  include: boolean
  // exam fields
  title?: string
  dateISO?: string
  startMin?: number | null
  room?: string
  courseName?: string
  // slot fields
  dayOfWeek?: number
  endMin?: number | null
  kind?: ParsedSlot['kind']
}

const DAY_OPTIONS = [
  { v: 1, l: 'Monday' }, { v: 2, l: 'Tuesday' }, { v: 3, l: 'Wednesday' },
  { v: 4, l: 'Thursday' }, { v: 5, l: 'Friday' }, { v: 6, l: 'Saturday' }, { v: 0, l: 'Sunday' },
]

function minToInput(min: number | null | undefined): string {
  if (min == null) return ''
  return minutesToLabel(min)
}
function inputToMin(v: string): number | null {
  if (!v) return null
  const [h, m] = v.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

export function ImportScreen() {
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string>()
  const [kind, setKind] = useState<ParsedKind>('unknown')
  const [pages, setPages] = useState<string[]>([])
  const [notes, setNotes] = useState<string>()
  const [examRows, setExamRows] = useState<ReviewRow[]>([])
  const [slotRows, setSlotRows] = useState<ReviewRow[]>([])
  const [savedCounts, setSavedCounts] = useState<{ courses: number; slots: number; exams: number }>()
  const imageInput = useRef<HTMLInputElement>(null)
  const pdfInput = useRef<HTMLInputElement>(null)

  async function runParse(pagesIn: string[]) {
    setStage('working')
    setError(undefined)
    try {
      const provider = await getProvider()
      const result = await provider.parseDocument(pagesIn)
      const toRow = (r: Partial<ReviewRow>): ReviewRow => ({ id: crypto.randomUUID(), include: true, ...r })
      setPages(pagesIn)
      setKind(result.kind)
      setNotes(result.notes)
      setExamRows(result.exams.map((e: ParsedExam) => toRow({ title: e.title, dateISO: e.dateISO, startMin: e.startMin ?? null, room: e.room, courseName: e.courseName })))
      setSlotRows(result.slots.map((s: ParsedSlot) => toRow({ courseName: s.courseName, dayOfWeek: s.dayOfWeek, startMin: s.startMin, endMin: s.endMin, room: s.room, kind: s.kind })))
      setStage('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStage('idle')
    }
  }

  async function onFile(file: File) {
    try {
      setStage('working')
      const pages = await fileToPages(file)
      await runParse(pages)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStage('idle')
    }
  }

  function reset() {
    setStage('idle')
    setError(undefined)
    setPages([])
    setExamRows([])
    setSlotRows([])
    setSavedCounts(undefined)
  }

  const distinctCourses = useMemo(() => {
    const names = new Set<string>()
    for (const r of slotRows.filter((x) => x.include)) names.add(r.courseName?.trim() || 'Untitled course')
    for (const r of examRows.filter((x) => x.include)) if (r.courseName?.trim()) names.add(r.courseName.trim())
    return [...names]
  }, [slotRows, examRows])

  async function confirmImport() {
    const courses = (await db.courses.toArray()).filter((c) => !c.deleted)
    const nameToId = new Map(courses.map((c) => [c.name.trim().toLowerCase(), c.id]))
    let created = 0

    async function courseIdFor(name?: string): Promise<string | undefined> {
      const key = name?.trim().toLowerCase()
      if (!key) return undefined
      const existing = nameToId.get(key)
      if (existing) return existing
      const rec = await putNew(db.courses, { name: name!.trim(), color: colorForIndex(nameToId.size + created) })
      nameToId.set(key, rec.id)
      created++
      return rec.id
    }

    let slotCount = 0
    for (const row of slotRows.filter((r) => r.include)) {
      if (row.dayOfWeek == null || !row.startMin || !row.endMin || row.endMin <= row.startMin) continue
      await putNew(db.classSlots, {
        courseId: (await courseIdFor(row.courseName))!,
        dayOfWeek: row.dayOfWeek,
        startMin: row.startMin,
        endMin: row.endMin,
        room: row.room?.trim() || undefined,
        kind: row.kind ?? 'lecture',
        validFrom: todayISO(),
      })
      slotCount++
    }

    let examCount = 0
    for (const row of examRows.filter((r) => r.include)) {
      if (!row.title?.trim() || !row.dateISO) continue
      await putNew(db.exams, {
        title: row.title.trim(),
        courseId: await courseIdFor(row.courseName),
        dateISO: row.dateISO,
        startMin: row.startMin ?? undefined,
        room: row.room?.trim() || undefined,
      })
      examCount++
    }

    await db.aiImports.put({
      id: crypto.randomUUID(),
      status: 'confirmed',
      kind: kind === 'unknown' ? 'unknown' : kind,
      fileName: pages.length > 1 ? `document (${pages.length} pages)` : 'document',
      mimeType: 'image/jpeg',
      draftJson: JSON.stringify({ exams: examRows, slots: slotRows }),
      createdAt: Date.now(),
    })

    setSavedCounts({ courses: created, slots: slotCount, exams: examCount })
    setStage('done')
  }

  /* ------------------------------- rendering ------------------------------- */

  if (stage === 'done') {
    return (
      <div>
        <PageHeader title="Import" sub="Turn messy documents into clean rows" />
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-8">
          <Card className="p-10 text-center">
            <CheckCircle size={40} weight="regular" className="mx-auto text-accent" aria-hidden />
            <h2 className="mt-4 font-serif text-2xl font-medium text-ink">Imported.</h2>
            <p className="mt-2 text-sm text-ink-2">
              {savedCounts?.slots ?? 0} classes · {savedCounts?.exams ?? 0} exams
              {savedCounts?.courses ? ` · ${savedCounts.courses} new ${savedCounts.courses === 1 ? 'course' : 'courses'}` : ''}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Link to="/schedule"><Button variant="soft">View timetable</Button></Link>
              <Button onClick={reset}>Import another</Button>
            </div>
          </Card>
        </motion.div>
      </div>
    )
  }

  if (stage === 'review') {
    return (
      <div>
        <PageHeader
          title="Review import"
          sub={kind === 'exam-schedule' ? 'Detected an exam schedule' : kind === 'timetable' ? 'Detected a weekly timetable' : 'Could not classify confidently'}
          action={<Button size="sm" variant="ghost" onClick={() => setStage('idle')}><ArrowLeft size={14} aria-hidden /> Start over</Button>}
        />

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-4">
            {error && <Card className="border-chip-red-text/30 p-4 text-sm text-chip-red-text">{error}</Card>}

            {examRows.length === 0 && slotRows.length === 0 && (
              <Card><EmptyState icon={Warning} title="Nothing usable found" body={notes ?? 'The model could not read schedule rows from these pages.'} /></Card>
            )}

            {examRows.length > 0 && (
              <>
                <h3 className="text-sm font-semibold tracking-tight text-ink">Exams <span className="text-ink-3">({examRows.filter((r) => r.include).length})</span></h3>
                {examRows.map((row) => (
                  <Card key={row.id} className={`p-4 ${!row.include ? 'opacity-45' : ''}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => setExamRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, include: e.target.checked } : r)))}
                        className="mt-1.5 h-4 w-4 cursor-pointer accent-[var(--c-accent)]"
                        aria-label="Include this exam"
                      />
                      <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_130px_100px_110px]">
                        <label className="flex flex-col gap-1 text-xs text-ink-2">
                          Title
                          <Input value={row.title ?? ''} onChange={(e) => setExamRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, title: e.target.value } : r)))} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-ink-2">
                          Date
                          <Input type="date" value={row.dateISO ?? ''} onChange={(e) => setExamRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, dateISO: e.target.value } : r)))} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-ink-2">
                          Time
                          <Input type="time" value={minToInput(row.startMin)} onChange={(e) => setExamRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, startMin: inputToMin(e.target.value) } : r)))} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-ink-2">
                          Room
                          <Input value={row.room ?? ''} onChange={(e) => setExamRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, room: e.target.value } : r)))} />
                        </label>
                      </div>
                    </div>
                    {!row.dateISO && row.include && (
                      <p className="mt-2 pl-7 text-xs text-chip-yellow-text">Needs a date before it can be saved.</p>
                    )}
                  </Card>
                ))}
              </>
            )}

            {slotRows.length > 0 && (
              <>
                <h3 className="text-sm font-semibold tracking-tight text-ink">Weekly classes <span className="text-ink-3">({slotRows.filter((r) => r.include).length})</span></h3>
                {slotRows.map((row) => (
                  <Card key={row.id} className={`p-4 ${!row.include ? 'opacity-45' : ''}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => setSlotRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, include: e.target.checked } : r)))}
                        className="mt-1.5 h-4 w-4 cursor-pointer accent-[var(--c-accent)]"
                        aria-label="Include this class"
                      />
                      <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_120px_96px_96px_100px]">
                        <label className="flex flex-col gap-1 text-xs text-ink-2">
                          Course
                          <Input value={row.courseName ?? ''} onChange={(e) => setSlotRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, courseName: e.target.value } : r)))} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-ink-2">
                          Day
                          <select
                            value={row.dayOfWeek ?? 1}
                            onChange={(e) => setSlotRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, dayOfWeek: Number(e.target.value) } : r)))}
                            className="h-10 rounded-[10px] border border-line bg-surface px-2 text-sm focus:border-accent focus:outline-none"
                          >
                            {DAY_OPTIONS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-ink-2">
                          Start
                          <Input type="time" value={minToInput(row.startMin)} onChange={(e) => setSlotRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, startMin: inputToMin(e.target.value) } : r)))} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-ink-2">
                          End
                          <Input type="time" value={minToInput(row.endMin)} onChange={(e) => setSlotRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, endMin: inputToMin(e.target.value) } : r)))} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-ink-2">
                          Room
                          <Input value={row.room ?? ''} onChange={(e) => setSlotRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, room: e.target.value } : r)))} />
                        </label>
                      </div>
                    </div>
                  </Card>
                ))}
              </>
            )}

            {(distinctCourses.length > 0 || notes) && (
              <Card className="bg-surface-2 p-4">
                {distinctCourses.length > 0 && (
                  <p className="text-xs leading-relaxed text-ink-2">
                    Courses that will exist after this import:{' '}
                    <span className="inline-flex flex-wrap gap-1 align-middle">
                      {distinctCourses.map((name, i) => (
                        <Chip key={name} color={colorForIndex(i)}>{name}</Chip>
                      ))}
                    </span>
                  </p>
                )}
                {notes && <p className="mt-2 font-mono text-[11px] text-ink-3">{notes}</p>}
              </Card>
            )}

            {(examRows.some((r) => r.include) || slotRows.some((r) => r.include)) && (
              <div className="sticky bottom-24 z-10 lg:bottom-4">
                <Button className="w-full" onClick={() => void confirmImport()}>
                  Confirm {examRows.filter((r) => r.include).length + slotRows.filter((r) => r.include).length} rows
                </Button>
              </div>
            )}
          </div>

          {/* Original pages */}
          <aside className="order-first lg:order-last">
            <div className="lg:sticky lg:top-6">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-ink-3">Original</h3>
              <div className="flex gap-2 overflow-x-auto lg:flex-col">
                {pages.map((src, i) => (
                  <img key={i} src={src} alt={`Original page ${i + 1}`} className="w-48 shrink-0 rounded-lg border border-line shadow-card lg:w-full" />
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    )
  }

  /* ------------------------------- idle / working ------------------------------ */
  return (
    <div>
      <PageHeader title="Import" sub="Turn messy documents into clean rows" />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }} className="mt-8">
        <p className="max-w-md text-sm leading-relaxed text-ink-2">
          Drop in a photo of a noticeboard or the PDF from your portal. The model reads it, shows you its draft next
          to the original, and nothing touches your schedule until you confirm.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <SourceCard icon={FileImage} title="Photo" body="Phone camera shots of timetables, whiteboards and printed notices." onPick={() => imageInput.current?.click()} disabled={stage === 'working'} />
          <SourceCard icon={FilePdf} title="PDF" body="Portal exports, up to 5 pages per import." onPick={() => pdfInput.current?.click()} disabled={stage === 'working'} />
        </div>

        <input ref={imageInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />

        {stage === 'working' ? (
          <Card className="mt-6 p-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
            <p className="mt-4 text-sm text-ink-2">Reading the document…</p>
            <p className="mt-1 font-mono text-[11px] text-ink-3">vision pass · this takes a few seconds</p>
          </Card>
        ) : (
          <button
            type="button"
            onClick={async () => await runParse([makeSampleExamSheet()])}
            className="mt-5 cursor-pointer font-mono text-[11px] tracking-[0.02em] text-ink-3 underline-offset-4 hover:text-ink hover:underline"
          >
            No file handy? Run the sample sheet instead.
          </button>
        )}

        {error && (
          <Card className="mt-4 p-4 text-sm text-chip-red-text">{error}</Card>
        )}
      </motion.div>
    </div>
  )
}

function SourceCard({ icon: IconCmp, title, body, onPick, disabled }: { icon: typeof FileImage; title: string; body: string; onPick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`flex-1 rounded-card border border-line bg-surface p-5 text-left shadow-card transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:-translate-y-[1px] hover:border-line-strong hover:shadow-card-hover'
      }`}
    >
      <IconCmp size={22} weight="regular" className="text-accent" aria-hidden />
      <h3 className="mt-4 text-sm font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{body}</p>
    </button>
  )
}

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { motion } from 'motion/react'
import { format } from 'date-fns'
import {
  ArrowsCounterClockwise,
  Bell,
  DownloadSimple,
  Plug,
  Plus,
  SignOut,
  Trash,
  UploadSimple,
  X,
} from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { Field, Input, Select } from '../components/ui/inputs'
import { Switch } from '../components/ui/Switch'
import { SectionHeader } from '../components/ui/SectionHeader'
import { ThemeSegmented } from '../components/ThemeSegmented'
import { SyncStatus } from '../components/SyncStatus'
import { db, getSetting, setSetting } from '../lib/db'
import { minutesToLabel } from '../lib/format'
import { downloadText, toCsv } from '../lib/csv'
import { DEFAULT_BANDS, loadBands, saveBands, type GradeBand } from '../lib/gpa'
import {
  NOTIF_KEYS,
  exactAlarmStatus,
  getNotificationPrefs,
  notificationPermission,
  refreshScheduledNotifications,
  requestExactAlarm,
  sendTestNotification,
} from '../lib/notifications'
import { AI_SETTINGS, PROVIDERS, getProvider } from '../lib/ai'
import {
  CLOUD_URL_KEY,
  CLOUD_KEY_KEY,
  clearConnection,
  generatePairingKey,
  getConnection,
  getCloud,
  registerPairingKey,
  saveConnection,
  testCloudConnection,
} from '../lib/cloud'
import { api } from '../../convex/_generated/api'
import { runSync } from '../lib/sync'

export function SettingsScreen() {
  const [cloudUrl, setCloudUrl] = useState('')
  const [pairingKey, setPairingKey] = useState('')
  const [hasRemoteKey, setHasRemoteKey] = useState<boolean | null>(null) // null = unknown (no URL yet)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notif, setNotif] = useState({ classes: true, leadMin: 15, tasks: true, exams: true })
  const [perm, setPerm] = useState<string>('default')
  const [aiProviderId, setAiProviderId] = useState('mock')
  const [aiKey, setAiKey] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [aiTest, setAiTest] = useState<{ state: 'idle' | 'testing' | 'ok' | 'error'; msg?: string }>({ state: 'idle' })
  const [csvKind, setCsvKind] = useState<CsvKind>('tasks')
  const [restoreMsg, setRestoreMsg] = useState<string>()
  const [cloudMsg, setCloudMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [bands, setBands] = useState<GradeBand[]>([])
  const [bandsSaved, setBandsSaved] = useState(false)
  const [alarm, setAlarm] = useState<'granted' | 'denied' | 'unsupported'>('unsupported')
  const isNative = Capacitor.isNativePlatform()

  useEffect(() => {
    void (async () => {
      const conn = await getConnection()
      setCloudUrl(conn.url)
      setPairingKey(conn.key)
      if (conn.url) {
        try {
          const client = await getCloud()
          setHasRemoteKey(client ? ((await client.query(api.sync.hasSyncKey, {})) as boolean) : null)
        } catch {
          setHasRemoteKey(null)
        }
      } else {
        setHasRemoteKey(null)
      }
      setNotif(await getNotificationPrefs())
      setPerm(await notificationPermission())
      setAiProviderId((await getSetting(AI_SETTINGS.provider)) ?? 'mock')
      setAiKey((await getSetting(AI_SETTINGS.apiKey)) ?? '')
      setAiModel((await getSetting(AI_SETTINGS.model)) ?? '')
      setAlarm(await exactAlarmStatus())
      setBands(await loadBands())
    })()
  }, [saved])

  /** Turn raw Convex errors into a complete, actionable sentence. */
  function cloudErrorHint(raw: string): string {
    const clean = raw.replace(/\[Request ID:[^\]]+\]\s*/i, '').replace(/\s+/g, ' ').trim()
    if (/could not find public function/i.test(clean))
      return `${clean} — the functions aren't pushed to this deployment yet. Run "npx convex dev" in the project folder, then retry.`
    if (/unknown pairing key/i.test(clean))
      return `${clean} Copy the key from the device that created it (Settings → Cloud sync → “Show this device’s key”).`
    if (/already has a pairing key/i.test(clean))
      return `${clean} This cloud belongs to another key — paste that existing key here instead of creating a new one.`
    if (/bad credential format/i.test(clean))
      return `${clean} The saved pairing key looks corrupted — re-paste it or create a new one.`
    return clean
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault()
    setCloudMsg(null)
    await saveConnection(cloudUrl, pairingKey)
    const test = await testCloudConnection()
    if (!test.ok) {
      setCloudMsg({ ok: false, text: cloudErrorHint(test.error) })
      return
    }
    if (hasRemoteKey === false && pairingKey.trim()) {
      try {
        await registerPairingKey()
        setHasRemoteKey(true)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setCloudMsg({ ok: false, text: cloudErrorHint(msg) })
        return
      }
    }
    setCloudMsg({ ok: true, text: 'Connected — syncing in the background.' })
    void runSync('manual')
    setSaved((s) => !s)
  }

  /** First device: generate a key, save it, and claim the deployment. */
  async function createKey() {
    const key = generatePairingKey()
    setPairingKey(key)
    setShowKey(true)
    setCloudMsg(null)
    await saveConnection(cloudUrl, key)
    try {
      await registerPairingKey()
      setHasRemoteKey(true)
      setRestoreMsg('Pairing key created. Copy it into Kairo on your other devices.')
      void runSync('manual')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCloudMsg({ ok: false, text: cloudErrorHint(msg) })
    }
    setSaved((s) => !s)
  }

  async function saveAi(patch: { provider?: string; key?: string; model?: string }) {
    if (patch.provider != null) await setSetting(AI_SETTINGS.provider, patch.provider)
    if (patch.key != null) await setSetting(AI_SETTINGS.apiKey, patch.key)
    if (patch.model != null) await setSetting(AI_SETTINGS.model, patch.model)
  }

  async function testAi() {
    setAiTest({ state: 'testing' })
    try {
      const provider = await getProvider()
      const started = performance.now()
      const reply = await provider.chat([{ role: 'user', content: 'Reply with the single word: ready' }], 'Test call. No data.')
      const ms = Math.round(performance.now() - started)
      setAiTest({ state: 'ok', msg: `${provider.label} replied in ${ms} ms ("${reply.trim().slice(0, 40)}")` })
    } catch (err) {
      setAiTest({ state: 'error', msg: err instanceof Error ? err.message : String(err) })
    }
  }

  async function saveNotif(patch: Partial<typeof notif>) {
    const next = { ...notif, ...patch }
    setNotif(next)
    await setSetting(NOTIF_KEYS.classes, next.classes ? 'on' : 'off')
    await setSetting(NOTIF_KEYS.leadMin, String(next.leadMin))
    await setSetting(NOTIF_KEYS.tasks, next.tasks ? 'on' : 'off')
    await setSetting(NOTIF_KEYS.exams, next.exams ? 'on' : 'off')
  }

  async function exportJson() {
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

  async function restoreBackup(file: File) {
    try {
      const dump = JSON.parse(await file.text()) as Record<string, unknown>
      // Same merge rule as sync: a backup row only wins if it is strictly newer.
      const tables: [string, DexieLikeTable][] = [
        ['courses', db.courses],
        ['classSlots', db.classSlots],
        ['exams', db.exams],
        ['assignments', db.assignments],
        ['personalItems', db.personalItems],
        ['attendance', db.attendance],
      ]
      let count = 0
      for (const [name, table] of tables) {
        const rows = dump[name]
        if (!Array.isArray(rows)) continue
        for (const raw of rows as BackupRow[]) {
          if (!raw || typeof raw.id !== 'string' || typeof raw.updatedAt !== 'number') continue
          const local = (await table.get(raw.id)) as BackupRow | undefined
          if (!local || raw.updatedAt > local.updatedAt) {
            await table.put(raw)
            count++
          }
        }
      }
      setRestoreMsg(`Restored ${count} ${count === 1 ? 'record' : 'records'} from backup.`)
    } catch (err) {
      setRestoreMsg(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function persistBands(next?: GradeBand[]) {
    const value = next ?? bands
    await saveBands(value)
    setBands(value)
    setSaved((s) => !s)
    setBandsSaved(true)
    setTimeout(() => setBandsSaved(false), 2000)
  }

  /* ---------------------------------- CSV ---------------------------------- */

  async function exportCsv(kind: CsvKind) {
    const [courses, slots, exams, assignments, personal] = await Promise.all([
      db.courses.toArray(),
      db.classSlots.toArray(),
      db.exams.toArray(),
      db.assignments.toArray(),
      db.personalItems.toArray(),
    ])
    const courseName = (id?: string) => courses.find((c) => !c.deleted && c.id === id)?.name ?? ''
    const dt = (ms?: number) => (ms ? format(new Date(ms), 'yyyy-MM-dd HH:mm') : '')
    let rows: (string | number | undefined)[][]

    if (kind === 'tasks') {
      rows = [
        ['Title', 'Course', 'Priority', 'Status', 'Due', 'Notes'],
        ...assignments.filter((a) => !a.deleted).map((a) => [a.title, courseName(a.courseId), a.priority, a.status, dt(a.dueAt), a.notes] as (string | number | undefined)[]),
      ]
    } else if (kind === 'exams') {
      rows = [
        ['Title', 'Course', 'Date', 'Start', 'Duration (min)', 'Room', 'Notes'],
        ...exams.filter((e) => !e.deleted).map((e) => [e.title, courseName(e.courseId), e.dateISO, e.startMin != null ? minutesToLabel(e.startMin) : '', e.durationMin ?? '', e.room ?? '', e.notes ?? ''] as (string | number | undefined)[]),
      ]
    } else if (kind === 'timetable') {
      rows = [
        ['Course', 'Day', 'Kind', 'Start', 'End', 'Room', 'Valid from', 'Valid to'],
        ...slots
          .filter((s) => !s.deleted)
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMin - b.startMin)
          .map((s) => [courseName(s.courseId), DAY_NAMES[s.dayOfWeek] ?? '', s.kind, minutesToLabel(s.startMin), minutesToLabel(s.endMin), s.room ?? '', s.validFrom, s.validTo ?? ''] as (string | number | undefined)[]),
      ]
    } else {
      rows = [
        ['Title', 'Time', 'Repeats', 'Day', 'Notes'],
        ...personal.filter((p) => !p.deleted).map((p) => [p.title, p.timeMin != null ? minutesToLabel(p.timeMin) : '', p.recurrence, p.dayOfWeek != null ? DAY_NAMES[p.dayOfWeek] ?? '' : '', p.notes ?? ''] as (string | number | undefined)[]),
      ]
    }
    downloadText(`mega-schedule-${kind}.csv`, toCsv(rows))
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Settings" sub="Make it yours" />

      {/* Appearance */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <SectionHeader title="Appearance" hint="Light and dark are both first-class here." />
        <Card className="mt-3 flex items-center justify-between px-5 py-4">
          <p className="text-sm text-ink">Theme</p>
          <ThemeSegmented />
        </Card>
      </motion.section>

      {/* Notifications */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
      >
        <SectionHeader
          title="Notifications"
          hint="Reminders fire while the app is running — desktop keeps it in the tray."
          action={
            <Button
              size="sm"
              variant="soft"
              onClick={async () => {
                await sendTestNotification()
                setPerm(await notificationPermission())
              }}
            >
              <Bell size={14} aria-hidden /> Send a test
            </Button>
          }
        />
        <Card className="mt-3 divide-y divide-line">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-ink">Class reminders</p>
              <p className="mt-0.5 text-xs text-ink-2">A nudge before every class in your timetable.</p>
            </div>
            <Switch checked={notif.classes} onChange={(v) => void saveNotif({ classes: v })} label="Class reminders" />
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <p className="text-sm text-ink">Remind me before class</p>
            <div className="w-[110px]">
              <Select
                aria-label="Lead time"
                value={String(notif.leadMin)}
                onChange={(e) => void saveNotif({ leadMin: Number(e.target.value) })}
                className="h-9 text-[13px]"
              >
                <option value="5">5 min</option>
                <option value="10">10 min</option>
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="60">60 min</option>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-ink">Task deadlines</p>
              <p className="mt-0.5 text-xs text-ink-2">One day before and at the deadline itself.</p>
            </div>
            <Switch checked={notif.tasks} onChange={(v) => void saveNotif({ tasks: v })} label="Task reminders" />
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-ink">Exam alerts</p>
              <p className="mt-0.5 text-xs text-ink-2">The evening before and on the morning of every exam.</p>
            </div>
            <Switch checked={notif.exams} onChange={(v) => void saveNotif({ exams: v })} label="Exam reminders" />
          </div>
          {isNative && (
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-ink">Exact alarms</p>
                <p className="mt-0.5 text-xs text-ink-2">Lets reminders land on time even when Android dozes the app.</p>
              </div>
              {alarm === 'granted' ? (
                <Chip color="green">Allowed</Chip>
              ) : (
                <Button
                  size="sm"
                  variant="soft"
                  onClick={async () => {
                    const ok = await requestExactAlarm()
                    setAlarm(ok ? 'granted' : 'denied')
                    void refreshScheduledNotifications()
                  }}
                >
                  Enable
                </Button>
              )}
            </div>
          )}
          {perm !== 'granted' && (
            <div className="flex items-center justify-between gap-4 bg-chip-yellow-bg/40 px-5 py-3 dark:bg-transparent">
              <p className="text-xs text-ink-2">
                {perm === 'denied' ? 'Notifications are blocked in this browser or system settings.' : 'Permission not granted yet — send a test to enable.'}
              </p>
            </div>
          )}
        </Card>

        {isNative && (
          <Card className="mt-3 p-5">
            <p className="text-sm font-medium text-ink">If reminders ever arrive late</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-2">
              <li>Open Android Settings → Apps → Kairo → Battery.</li>
              <li>Choose “Unrestricted” (or switch off battery optimisation).</li>
              <li>Allow “Alarms &amp; reminders” when Android asks.</li>
              <li>Reopen the app once so it re-registers its reminders.</li>
            </ol>
          </Card>
        )}
      </motion.section>

      {/* AI model */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
      >
        <SectionHeader title="AI Model" hint="Powers document import, quick-add and the assistant." />
        <Card className="mt-3 p-5">
          <div className="flex flex-col gap-4">
            <Field label="Provider" htmlFor="ai-provider">
              <Select
                id="ai-provider"
                value={aiProviderId}
                onChange={(e) => {
                  setAiProviderId(e.target.value)
                  setAiTest({ state: 'idle' })
                  void saveAi({ provider: e.target.value })
                }}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            </Field>

            {PROVIDERS.find((p) => p.id === aiProviderId)?.hint && (
              <p className="text-xs text-ink-2">{PROVIDERS.find((p) => p.id === aiProviderId)?.hint}</p>
            )}

            {PROVIDERS.find((p) => p.id === aiProviderId)?.needsKey && (
              <Field label="API key" htmlFor="ai-key" hint="Stored on this device only. Never synced.">
                <Input id="ai-key" type="password" value={aiKey} onChange={(e) => setAiKey(e.target.value)} placeholder="Paste your key" autoComplete="off" />
              </Field>
            )}

            {aiProviderId !== 'mock' && (
              <Field label="Model (optional)" htmlFor="ai-model" hint="Leave empty for the provider default.">
                <Input id="ai-model" value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder={aiProviderId === 'gemini' ? 'gemini-2.0-flash' : ''} autoComplete="off" />
              </Field>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                size="sm"
                variant="soft"
                disabled={aiTest.state === 'testing'}
                onClick={() => {
                  void saveAi({ key: aiKey, model: aiModel }).then(testAi)
                }}
              >
                {aiTest.state === 'testing' ? 'Testing…' : 'Save & test'}
              </Button>
              {aiTest.state === 'ok' && <p className="text-xs text-chip-green-text">{aiTest.msg}</p>}
              {aiTest.state === 'error' && <p className="min-w-0 flex-1 truncate text-right text-xs text-chip-red-text">{aiTest.msg}</p>}
            </div>
          </div>
        </Card>
      </motion.section>

      {/* Grading / GPA bands */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
      >
        <SectionHeader
          title="Grading"
          hint="Percentage marks convert through these bands into your GPA."
          action={
            <Button size="sm" variant="soft" onClick={() => void persistBands(DEFAULT_BANDS)}>
              <ArrowsCounterClockwise size={14} aria-hidden /> Reset
            </Button>
          }
        />
        <Card className="mt-3 p-5">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_90px_90px_32px] gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">
              <span>Letter</span>
              <span>Min %</span>
              <span>Points</span>
              <span />
            </div>
            {bands.map((band, i) => (
              <div key={`${band.letter}-${i}`} className="grid grid-cols-[1fr_90px_90px_32px] items-center gap-2">
                <Input
                  value={band.letter}
                  onChange={(e) => setBands((b) => b.map((x, xi) => (xi === i ? { ...x, letter: e.target.value } : x)))}
                  className="h-8 text-[13px]"
                  aria-label={`Letter for band ${i + 1}`}
                />
                <Input
                  type="number" min={0} max={100}
                  value={band.minPct}
                  onChange={(e) => setBands((b) => b.map((x, xi) => (xi === i ? { ...x, minPct: Number(e.target.value) } : x)))}
                  className="h-8 text-[13px]"
                  aria-label={`Minimum percentage for band ${i + 1}`}
                />
                <Input
                  type="number" min={0} max={10} step={0.1}
                  value={band.points}
                  onChange={(e) => setBands((b) => b.map((x, xi) => (xi === i ? { ...x, points: Number(e.target.value) } : x)))}
                  className="h-8 text-[13px]"
                  aria-label={`Grade points for band ${i + 1}`}
                />
                <button
                  type="button"
                  aria-label={`Remove band ${band.letter || i + 1}`}
                  onClick={() => setBands((b) => b.filter((_, xi) => xi !== i))}
                  className="grid h-8 cursor-pointer place-items-center rounded-[10px] text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-chip-red-text"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            ))}
            {bands.length === 0 && <p className="text-xs text-ink-2">No bands — add at least one so marks can convert.</p>}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button size="sm" variant="ghost" onClick={() => setBands((b) => [...b, { letter: '', minPct: 0, points: 0 }])}>
              <Plus size={13} weight="bold" aria-hidden /> Add band
            </Button>
            <div className="flex items-center gap-3">
              {bandsSaved && <p className="text-xs text-accent">Saved</p>}
              <Button size="sm" onClick={() => void persistBands()}>Save bands</Button>
            </div>
          </div>
        </Card>
      </motion.section>

      {/* Cloud sync */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
      >
        <SectionHeader
          title="Cloud sync"
          hint="One pairing key owns your cloud — devices that know it stay in sync."
          action={<SyncStatus />}
        />
        <Card className="mt-3 p-5">
          <form onSubmit={connect} className="flex flex-col gap-4">
            <Field label="Deployment URL" hint="Convex dashboard → your project → the .convex.cloud URL.">
              <Input value={cloudUrl} onChange={(e) => setCloudUrl(e.target.value)} placeholder="https://your-project.convex.cloud" autoComplete="off" />
            </Field>
            <Field
              label="Pairing key"
              hint={
                hasRemoteKey === false
                  ? 'This deployment has no key yet — use “Create pairing key” on your first device.'
                  : 'Same key on every device you want synced. Anyone with it can read your data.'
              }
            >
              <Input
                type={showKey ? 'text' : 'password'}
                value={pairingKey}
                onChange={(e) => setPairingKey(e.target.value)}
                placeholder="Paste from another device, or create one below"
                autoComplete="off"
              />
            </Field>
            {pairingKey && (
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="cursor-pointer self-start text-xs text-ink-2 underline-offset-4 hover:text-ink hover:underline"
              >
                {showKey ? 'Hide key' : 'Show this device’s key'}
              </button>
            )}
            {showKey && pairingKey && (
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-accent-line bg-accent-soft/50 px-3 py-2.5 dark:bg-accent-soft">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{pairingKey}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void navigator.clipboard?.writeText(pairingKey)}
                >
                  Copy
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  void clearConnection()
                  setCloudUrl('')
                  setPairingKey('')
                  setHasRemoteKey(null)
                  setShowKey(false)
                  setSaved((s) => !s)
                }}
                className="cursor-pointer text-xs text-ink-2 underline-offset-4 hover:text-ink hover:underline"
              >
                Disconnect
              </button>
              <div className="flex items-center gap-2">
                {hasRemoteKey === false && (
                  <Button type="button" size="sm" variant="soft" disabled={!cloudUrl.trim()} onClick={() => void createKey()}>
                    Create pairing key
                  </Button>
                )}
                <Button type="submit" size="sm"><Plug size={14} aria-hidden /> Save &amp; test</Button>
              </div>
            </div>
            {cloudMsg && (
              <p
                role="status"
                className={`whitespace-normal break-words text-xs leading-relaxed ${
                  cloudMsg.ok ? 'text-accent' : 'text-chip-red-text'
                }`}
              >
                {cloudMsg.text}
              </p>
            )}
          </form>

          {hasRemoteKey === true && (
            <>
              <div className="my-5 border-t border-line" />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">Paired</p>
                  <p className="mt-0.5 text-xs text-ink-2">
                    {pairingKey ? `Key ends “…${pairingKey.slice(-4)}”. Reveal it above to add another device.` : 'Add a device by pasting this deployment’s key there.'}
                  </p>
                </div>
                <Button size="sm" variant="soft" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? 'Hide' : 'Show'}
                </Button>
              </div>
            </>
          )}

          {restoreMsg && (
            <p className="mt-4 text-xs text-accent">{restoreMsg}</p>
          )}
        </Card>
      </motion.section>

      {/* Data */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
      >
        <SectionHeader title="Your data" hint="Everything lives on-device first; you can always take a copy." />
        <Card className="mt-3 divide-y divide-line">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-sm font-medium text-ink">JSON backup</p>
              <p className="mt-0.5 text-xs text-ink-2">Full copy of every record — courses, classes, exams, tasks, attendance.</p>
            </div>
            <Button size="sm" variant="soft" onClick={() => void exportJson()}>
              <DownloadSimple size={14} aria-hidden /> JSON
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Restore backup</p>
              <p className="mt-0.5 truncate text-xs text-ink-2">{restoreMsg ?? 'Merges a JSON backup — newer records always win.'}</p>
            </div>
            <label
              className="inline-flex h-8 shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-medium tracking-[-0.01em] text-ink transition-colors duration-200 hover:border-line-strong hover:bg-surface-2"
            >
              <UploadSimple size={14} aria-hidden /> Choose file
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void restoreBackup(f)
                  e.currentTarget.value = ''
                }}
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <p className="text-sm text-ink">Spreadsheet (CSV)</p>
            <div className="flex shrink-0 items-center gap-2">
              <Select
                value={csvKind}
                onChange={(e) => setCsvKind(e.target.value as CsvKind)}
                aria-label="CSV dataset"
                className="h-9 w-[150px] text-[13px]"
              >
                <option value="tasks">Tasks</option>
                <option value="exams">Exams</option>
                <option value="timetable">Timetable</option>
                <option value="personal">Personal</option>
              </Select>
              <Button size="sm" variant="soft" onClick={() => void exportCsv(csvKind)}>
                <DownloadSimple size={14} aria-hidden /> CSV
              </Button>
            </div>
          </div>
        </Card>
      </motion.section>
    </div>
  )
}

type CsvKind = 'tasks' | 'exams' | 'timetable' | 'personal'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface BackupRow {
  id: string
  updatedAt: number
  [key: string]: unknown
}

/** The sliver of Dexie's API that backup restore needs, so any entity table fits. */
interface DexieLikeTable {
  get(id: string): Promise<unknown>
  put(row: unknown): Promise<unknown>
}

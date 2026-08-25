import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { ArrowUp, ChatCircleDots, Trash } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { IconButton } from '../components/ui/IconButton'
import { db } from '../lib/db'
import { getProvider, type ChatTurn } from '../lib/ai'
import { buildContext } from '../lib/ai/context'

const SUGGESTIONS = [
  'What do I have tomorrow?',
  'How long until my next exam?',
  'What am I forgetting this week?',
]

export function AssistantScreen() {
  const messages = useLiveQuery(() => db.chatMessages.orderBy('createdAt').limit(100).toArray(), []) ?? []
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, busy])

  async function send(text: string) {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setError(undefined)
    setInput('')
    await db.chatMessages.put({ id: crypto.randomUUID(), role: 'user', content: value, createdAt: Date.now() })
    try {
      const provider = await getProvider()
      const context = await buildContext()
      // Last 20 stored turns give the model conversational memory.
      const history: ChatTurn[] = [...messages, { id: '', role: 'user' as const, content: value, createdAt: 0 }]
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }))
      const reply = await provider.chat(history, context)
      await db.chatMessages.put({ id: crypto.randomUUID(), role: 'assistant', content: reply, createdAt: Date.now() })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Assistant"
        sub="Knows your timetable, tasks and exams"
        action={
          messages.length > 0 && !busy ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void db.chatMessages.clear()}
            >
              <Trash size={14} aria-hidden /> Clear
            </Button>
          ) : undefined
        }
      />

      <Card className="mt-5 flex min-h-[60vh] flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {messages.length === 0 && !busy ? (
            <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft">
                <ChatCircleDots size={22} weight="regular" className="text-accent" aria-hidden />
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-2">
                Ask about your week. It reads your live schedule, tasks and exams every time you press send.
              </p>
              <div className="mt-5 flex flex-col items-center gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="cursor-pointer font-serif text-[15px] italic text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'self-end rounded-br-md bg-btn text-btn-text'
                      : 'self-start rounded-bl-md border border-line bg-surface-2 text-ink'
                  }`}
                >
                  {m.content.split('\n').map((line, i) => (
                    <p key={i} className={i > 0 ? 'mt-1' : ''}>{line}</p>
                  ))}
                </motion.div>
              ))}
              {busy && (
                <div className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md border border-line bg-surface-2 px-4 py-3">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="border-t border-line bg-chip-red-bg px-4 py-2 text-xs text-chip-red-text">{error}</p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
          className="flex items-center gap-2 border-t border-line bg-surface p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={busy ? 'Thinking…' : 'Ask anything about your schedule'}
            disabled={busy}
            aria-label="Message the assistant"
            className="h-10 min-w-0 flex-1 rounded-full border border-transparent bg-surface-2 px-4 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none disabled:opacity-50"
          />
          <IconButton label="Send" onClick={() => void send(input)} className="shrink-0 bg-btn text-btn-text hover:bg-btn-hover hover:text-btn-text">
            <ArrowUp size={16} weight="bold" aria-hidden />
          </IconButton>
        </form>
      </Card>

      <p className="mt-3 font-mono text-[11px] tracking-[0.02em] text-ink-3">
        Model and key live in Settings → AI Model. The offline demo answers without one.
      </p>
    </div>
  )
}

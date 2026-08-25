import type { AIProvider, ChatTurn, ParseResult, QuickAddDraft } from './types'

/**
 * Deterministic offline provider. Powers the whole import/quick-add/chat flow
 * with zero API key so the UX can be tested and demoed anywhere.
 */
export const mockProvider: AIProvider = {
  id: 'mock',
  label: 'Offline demo (no key)',

  async parseDocument(_pages) {
    // Simulated network latency keeps loading states honest.
    await new Promise((r) => setTimeout(r, 900))
    return {
      kind: 'timetable',
      slots: [
        { courseName: 'Marketing', dayOfWeek: 1, startMin: 630, endMin: 720, room: 'B4 Hall', kind: 'lecture' },
        { courseName: 'Marketing', dayOfWeek: 3, startMin: 630, endMin: 720, room: 'B4 Hall', kind: 'tutorial' },
        { courseName: 'Data Structures', dayOfWeek: 1, startMin: 780, endMin: 870, room: 'Lab 2', kind: 'lab' },
        { courseName: 'Physics', dayOfWeek: 2, startMin: 600, endMin: 690, kind: 'lecture' },
        { courseName: 'Physics', dayOfWeek: 4, startMin: 600, endMin: 690, kind: 'lecture' },
      ],
      exams: [],
      notes: 'Sample draft from the offline demo provider. Connect a real model in Settings to parse your own documents.',
    }
  },

  async parseQuickAdd(text): Promise<QuickAddDraft> {
    await new Promise((r) => setTimeout(r, 500))
    const t = text.toLowerCase()
    const timeMatch = t.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/) || t.match(/\b(\d{1,2})\s*(am|pm)\b/)
    let timeMin: number | undefined
    if (timeMatch) {
      let h = Number(timeMatch[1])
      const m = Number(timeMatch[2] ?? 0)
      const suffix = timeMatch[3]
      if (suffix === 'pm' && h < 12) h += 12
      if (suffix === 'am' && h === 12) h = 0
      timeMin = h * 60 + m
    }
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayIdx = dayNames.findIndex((d) => t.includes(d))
    const isExam = t.includes('exam') || t.includes('test') || t.includes('quiz')
    const isAssignment = t.includes('assignment') || t.includes('due') || t.includes('homework') || t.includes('submit')
    return {
      type: isExam ? 'exam' : isAssignment ? 'task' : 'personal',
      title: text.trim().replace(/\s+/g, ' ').slice(0, 80),
      timeMin,
      dayOfWeek: dayIdx >= 0 ? dayIdx : undefined,
      recurrence: dayIdx >= 0 ? 'weekly' : 'none',
      priority: /urgent|important|asap/.test(t) ? 'high' : undefined,
      needsMore: isExam && !/(\d{4}-\d{2}-\d{2})|\d{1,2}\/\d{1,2}/.test(t),
      clarifying: isExam ? 'Add the exam date on the next screen.' : undefined,
    }
  },

  async chat(history: ChatTurn[], context: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 700))
    const last = history.filter((h) => h.role === 'user').at(-1)?.content ?? ''
    const summary = context.split('\n').slice(0, 6).join('\n')
    return [
      `Offline demo here — connect Gemini, OpenAI or Anthropic in Settings for real answers.`,
      ``,
      `I heard: "${last.slice(0, 120)}"`,
      ``,
      `A real model would answer from this live snapshot of your data:`,
      summary,
    ].join('\n')
  },
}

import type { AIProvider, ChatTurn, ParseResult, QuickAddDraft } from './types'
import { PARSE_PROMPT, QUICKADD_PROMPT, extractJson, normalizeParse, normalizeQuickAdd } from './shared'

/**
 * Google Gemini via plain REST (generativelanguage.googleapis.com).
 * The free tier is generous and vision-capable, so this is the default cloud provider.
 */
export function geminiProvider(apiKey: string, model = 'gemini-2.0-flash'): AIProvider {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  async function call(parts: unknown[], jsonMode: boolean): Promise<string> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: jsonMode ? 0 : 0.6,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    if (!text) throw new Error('Gemini returned an empty response.')
    return text
  }

  function pageParts(pages: string[]): unknown[] {
    return pages.slice(0, 5).map((dataUrl) => {
      const [meta, b64] = dataUrl.split(',')
      const mime = /data:(.*?);/.exec(meta)?.[1] ?? 'image/jpeg'
      return { inline_data: { mime_type: mime, data: b64 } }
    })
  }

  return {
    id: 'gemini',
    label: 'Google Gemini',

    async parseDocument(pages): Promise<ParseResult> {
      const text = await call([{ text: PARSE_PROMPT }, ...pageParts(pages)], true)
      return normalizeParse(extractJson(text))
    },

    async parseQuickAdd(input, todayContext): Promise<QuickAddDraft> {
      const text = await call([{ text: `${QUICKADD_PROMPT(todayContext)}\n\nNote: ${input}` }], true)
      return normalizeQuickAdd(extractJson(text))
    },

    async chat(history: ChatTurn[], context: string): Promise<string> {
      const system = `You are Kairo's assistant for one student. Answer using the live snapshot; be concise and specific with times and course names. If asked to create or change something, describe exactly what you would create (you cannot write yet).\n\nLIVE SNAPSHOT:\n${context}`
      // Merge into strict alternating user/model turns starting with user.
      const merged: { role: string; text: string }[] = []
      for (const turn of history) {
        const role = turn.role === 'assistant' ? 'model' : 'user'
        const prev = merged.at(-1)
        if (prev && prev.role === role) prev.text += `\n\n${turn.content}`
        else merged.push({ role, text: turn.content })
      }
      while (merged[0]?.role === 'model') merged.shift()
      if (!merged.some((m) => m.role === 'user')) throw new Error('Nothing to ask.')
      return call([{ text: system }, ...merged.map((m) => ({ text: m.text }))], false)
    },
  }
}

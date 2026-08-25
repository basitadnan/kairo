import type { AIProvider, ChatTurn, ParseResult, QuickAddDraft } from './types'
import { PARSE_PROMPT, QUICKADD_PROMPT, extractJson, normalizeParse, normalizeQuickAdd } from './shared'

const API = 'https://api.openai.com/v1/chat/completions'

export function openaiProvider(apiKey: string, model = 'gpt-4o-mini'): AIProvider {
  async function call(messages: unknown[], jsonMode: boolean): Promise<string> {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: jsonMode ? 0 : 0.6,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const text: string | undefined = data?.choices?.[0]?.message?.content
    if (!text) throw new Error('OpenAI returned an empty response.')
    return text
  }

  return {
    id: 'openai',
    label: 'OpenAI',

    async parseDocument(pages): Promise<ParseResult> {
      const content = [
        { type: 'text', text: PARSE_PROMPT },
        ...pages.slice(0, 5).map((dataUrl) => ({ type: 'image_url', image_url: { url: dataUrl } })),
      ]
      const text = await call([{ role: 'user', content }], true)
      return normalizeParse(extractJson(text))
    },

    async parseQuickAdd(input, todayContext): Promise<QuickAddDraft> {
      const text = await call([{ role: 'user', content: `${QUICKADD_PROMPT(todayContext)}\n\nNote: ${input}` }], true)
      return normalizeQuickAdd(extractJson(text))
    },

    async chat(history: ChatTurn[], context: string): Promise<string> {
      const system: ChatTurn = {
        role: 'user',
        content: `You are Kairo's assistant for one student. Answer using the live snapshot; be concise and specific with times and course names. If asked to create or change something, describe exactly what you would create (you cannot write yet).\n\nLIVE SNAPSHOT:\n${context}`,
      }
      const turns = history.map((h) => ({ role: h.role, content: h.content }))
      return call([{ role: 'system', content: system.content }, ...turns], false)
    },
  }
}

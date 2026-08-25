import type { AIProvider, ChatTurn, ParseResult, QuickAddDraft } from './types'
import { PARSE_PROMPT, QUICKADD_PROMPT, extractJson, normalizeParse, normalizeQuickAdd } from './shared'

const API = 'https://api.anthropic.com/v1/messages'

export function anthropicProvider(apiKey: string, model = 'claude-sonnet-4-5'): AIProvider {
  async function call(contentBlocks: unknown[], system: string | undefined, jsonMode: boolean): Promise<string> {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: jsonMode ? 2000 : 1200,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const text: string | undefined = data?.content?.map((c: { text?: string }) => c.text ?? '').join('')
    if (!text) throw new Error('Anthropic returned an empty response.')
    return text
  }

  function pageBlocks(pages: string[]): unknown[] {
    return pages.slice(0, 5).flatMap((dataUrl) => {
      const [meta, b64] = dataUrl.split(',')
      const media = /data:(.*?);/.exec(meta)?.[1] ?? 'image/jpeg'
      return [
        { type: 'image', source: { type: 'base64', media_type: media, data: b64 } },
      ]
    })
  }

  return {
    id: 'anthropic',
    label: 'Anthropic Claude',

    async parseDocument(pages): Promise<ParseResult> {
      const blocks = [...pageBlocks(pages), { type: 'text', text: `${PARSE_PROMPT}\nReturn only the JSON object.` }]
      const text = await call(blocks, 'You output only minified JSON.', true)
      return normalizeParse(extractJson(text))
    },

    async parseQuickAdd(input, todayContext): Promise<QuickAddDraft> {
      const text = await call(
        [{ type: 'text', text: `${QUICKADD_PROMPT(todayContext)}\n\nNote: ${input}\nReturn only the JSON object.` }],
        'You output only minified JSON.',
        true,
      )
      return normalizeQuickAdd(extractJson(text))
    },

    async chat(history: ChatTurn[], context: string): Promise<string> {
      const system = `You are Kairo's assistant for one student. Answer using the live snapshot; be concise and specific with times and course names. If asked to create or change something, describe exactly what you would create (you cannot write yet).\n\nLIVE SNAPSHOT:\n${context}`
      // Anthropic requires strict alternation starting with user.
      const merged: { role: string; text: string }[] = []
      for (const turn of history) {
        const prev = merged.at(-1)
        if (prev && prev.role === turn.role) prev.text += `\n\n${turn.content}`
        else merged.push({ role: turn.role, text: turn.content })
      }
      while (merged[0]?.role === 'assistant') merged.shift()
      if (!merged.some((m) => m.role === 'user')) throw new Error('Nothing to ask.')
      return call(
        merged.map((m) => ({ type: 'text', text: m.text })),
        system,
        false,
      )
    },
  }
}

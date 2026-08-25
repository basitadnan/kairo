import { getSetting } from '../db'
import { mockProvider } from './mock'
import { geminiProvider } from './gemini'
import { openaiProvider } from './openai'
import { anthropicProvider } from './anthropic'
import type { AIProvider } from './types'

export interface ProviderMeta {
  id: string
  label: string
  needsKey: boolean
  hint?: string
}

export const PROVIDERS: ProviderMeta[] = [
  { id: 'mock', label: 'Offline demo (no key)', needsKey: false, hint: 'Canned responses so you can try every flow without a key.' },
  { id: 'gemini', label: 'Google Gemini', needsKey: true, hint: 'Generous free tier. Create a key at aistudio.google.com.' },
  { id: 'openai', label: 'OpenAI', needsKey: true, hint: 'Paid per use. platform.openai.com.' },
  { id: 'anthropic', label: 'Anthropic Claude', needsKey: true, hint: 'Paid per use. console.anthropic.com.' },
]

export const AI_SETTINGS = {
  provider: 'ai.provider',
  apiKey: 'ai.apiKey',
  model: 'ai.model',
} as const

/** Build the configured provider; throws a friendly error when misconfigured. */
export async function getProvider(): Promise<AIProvider> {
  const id = (await getSetting(AI_SETTINGS.provider)) ?? 'mock'
  const model = (await getSetting(AI_SETTINGS.model)) || undefined
  switch (id) {
    case 'gemini': {
      const key = await getSetting(AI_SETTINGS.apiKey)
      if (!key) throw new Error('Add your Gemini API key in Settings → AI Model first.')
      return geminiProvider(key, model)
    }
    case 'openai': {
      const key = await getSetting(AI_SETTINGS.apiKey)
      if (!key) throw new Error('Add your OpenAI API key in Settings → AI Model first.')
      return openaiProvider(key, model)
    }
    case 'anthropic': {
      const key = await getSetting(AI_SETTINGS.apiKey)
      if (!key) throw new Error('Add your Anthropic API key in Settings → AI Model first.')
      return anthropicProvider(key, model)
    }
    default:
      return mockProvider
  }
}

export * from './types'

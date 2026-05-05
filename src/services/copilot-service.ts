/**
 * Copilot prompt service.
 * Manages built-in copilot prompts, custom copilot prompts, and enable/disable state.
 * Uses syncStorageService for persistence.
 */

import { syncStorageService } from '@/storage/index'
import { sendRequest } from '@/ipc/client'

// === Default Prompts ===

const DEFAULT_SUMMARY_PROMPT = `Provide a concise summary of the following text, capturing its main ideas and key points:

Text:
---------
{text}
---------

Summarize the text in no more than 3-4 sentences.

Response:`

const DEFAULT_REPHRASE_PROMPT = `Rewrite the following text in a different way, maintaining its original meaning but using alternative vocabulary and sentence structures:

Text:
---------
{text}
---------

Ensure that your rephrased version conveys the same information and intent as the original.

Response:`

const DEFAULT_TRANSLATE_PROMPT = `Translate the following text from its original language into "english". Maintain the tone and style of the original text as much as possible:

Text:
---------
{text}
---------

Response:`

const DEFAULT_EXPLAIN_PROMPT = `Provide a detailed explanation of the following text, breaking down its key concepts, implications, and context:

Text:
---------
{text}
---------

Your explanation should:

Clarify any complex terms or ideas
Provide relevant background information
Discuss the significance or implications of the content
Address any potential questions a reader might have
Use examples or analogies to illustrate points when appropriate

Aim for a comprehensive explanation that would help someone with little prior knowledge fully understand the text.

Response:`

const DEFAULT_CUSTOM_PROMPT = `{text}`

// === Types ===

export interface CustomCopilotPrompt {
  id: string
  title: string
  prompt: string
  enabled: boolean
  createdAt: number
}

// === ID Generation ===

const generateId = (): string =>
  'custom_xxxx-xxxx-xxx-xxxx'.replace(/[x]/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  )

// === Built-in Prompt Getters/Setters ===

export const getSummaryPrompt = async (): Promise<string> =>
  (await syncStorageService.get<string>('copilotSummaryPrompt')) ?? DEFAULT_SUMMARY_PROMPT

export const setSummaryPrompt = async (prompt: string): Promise<void> =>
  syncStorageService.set('copilotSummaryPrompt', prompt)

export const getRephrasePrompt = async (): Promise<string> =>
  (await syncStorageService.get<string>('copilotRephrasePrompt')) ?? DEFAULT_REPHRASE_PROMPT

export const setRephrasePrompt = async (prompt: string): Promise<void> =>
  syncStorageService.set('copilotRephrasePrompt', prompt)

export const getTranslatePrompt = async (): Promise<string> =>
  (await syncStorageService.get<string>('copilotTranslatePrompt')) ?? DEFAULT_TRANSLATE_PROMPT

export const setTranslatePrompt = async (prompt: string): Promise<void> =>
  syncStorageService.set('copilotTranslatePrompt', prompt)

export const getExplainPrompt = async (): Promise<string> =>
  (await syncStorageService.get<string>('copilotExplainPrompt')) ?? DEFAULT_EXPLAIN_PROMPT

export const setExplainPrompt = async (prompt: string): Promise<void> =>
  syncStorageService.set('copilotExplainPrompt', prompt)

export const getCustomPrompt = async (): Promise<string> =>
  (await syncStorageService.get<string>('copilotCustomPrompt')) ?? DEFAULT_CUSTOM_PROMPT

export const setCustomPrompt = async (prompt: string): Promise<void> =>
  syncStorageService.set('copilotCustomPrompt', prompt)

// === Enable/Disable State ===

const DEFAULT_ENABLED_STATE: Record<string, boolean> = {
  summary: true,
  rephrase: true,
  translate: true,
  explain: true,
  custom: true,
}

export const getPromptsEnabledState = async (): Promise<Record<string, boolean>> =>
  (await syncStorageService.get<Record<string, boolean>>('copilotPromptsEnabled')) ?? {
    ...DEFAULT_ENABLED_STATE,
  }

export const togglePromptEnabled = async (key: string, enabled: boolean): Promise<void> => {
  const state = await getPromptsEnabledState()
  state[key] = enabled
  await syncStorageService.set('copilotPromptsEnabled', state)
  // Notify background to refresh menus
  sendRequest('refresh_builtin_copilot_menus').catch(() => {
    // Background might not be ready
  })
}

// === Unified Prompt Getter ===

export const getPrompt = async (key: string): Promise<string> => {
  // Check custom copilot prompt
  if (key.startsWith('custom_copilot_')) {
    const promptId = key.replace('custom_copilot_', '')
    const customPrompts = await getCustomPrompts()
    const found = customPrompts.find((p) => p.id === promptId)
    return found?.prompt ?? ''
  }

  switch (key) {
    case 'summary':
      return getSummaryPrompt()
    case 'rephrase':
      return getRephrasePrompt()
    case 'translate':
      return getTranslatePrompt()
    case 'explain':
      return getExplainPrompt()
    case 'custom':
      return getCustomPrompt()
    default:
      return ''
  }
}

// === Custom Copilot Prompts CRUD ===

const CUSTOM_PROMPTS_KEY = 'customCopilotPrompts'

export const getCustomPrompts = async (): Promise<CustomCopilotPrompt[]> =>
  (await syncStorageService.get<CustomCopilotPrompt[]>(CUSTOM_PROMPTS_KEY)) ?? []

const saveCustomPrompts = async (prompts: CustomCopilotPrompt[]): Promise<void> =>
  syncStorageService.set(CUSTOM_PROMPTS_KEY, prompts)

const notifyCustomMenusRefresh = (): void => {
  sendRequest('refresh_custom_copilot_menus').catch(() => {
    // Background might not be ready
  })
}

export const saveCustomPrompt = async (data: {
  title: string
  prompt: string
}): Promise<CustomCopilotPrompt> => {
  const prompts = await getCustomPrompts()
  const newPrompt: CustomCopilotPrompt = {
    id: generateId(),
    title: data.title,
    prompt: data.prompt,
    enabled: true,
    createdAt: Date.now(),
  }
  prompts.push(newPrompt)
  await saveCustomPrompts(prompts)
  notifyCustomMenusRefresh()
  return newPrompt
}

export const updateCustomPrompt = async (
  id: string,
  data: Partial<Omit<CustomCopilotPrompt, 'id' | 'createdAt'>>
): Promise<CustomCopilotPrompt | null> => {
  const prompts = await getCustomPrompts()
  const index = prompts.findIndex((p) => p.id === id)
  if (index === -1) return null
  prompts[index] = { ...prompts[index], ...data }
  await saveCustomPrompts(prompts)
  notifyCustomMenusRefresh()
  return prompts[index]
}

export const deleteCustomPrompt = async (id: string): Promise<void> => {
  const prompts = await getCustomPrompts()
  await saveCustomPrompts(prompts.filter((p) => p.id !== id))
  notifyCustomMenusRefresh()
}

// === Menu Refresh ===

export const refreshCustomMenus = async (): Promise<void> => {
  sendRequest('refresh_custom_copilot_menus').catch(() => {})
}

export const refreshBuiltinMenus = async (): Promise<void> => {
  sendRequest('refresh_builtin_copilot_menus').catch(() => {})
}

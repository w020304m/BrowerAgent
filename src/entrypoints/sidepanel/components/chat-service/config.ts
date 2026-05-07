/**
 * Provider configuration loading utilities
 */

import type { ProviderType } from '@/types/provider'
import type { ChatMode } from '@/chat-pipeline/types'
import { openaiConfigRepo } from '@/db/repositories/openai-config.repository'
import { ollamaSettings } from '@/storage/ollama-settings'
import { promptRepo } from '@/db/repositories/prompt.repository'

/**
 * Load base URL for the given provider type.
 * Ollama uses sync storage; others use the openaiConfigRepo (IndexedDB).
 * If configId is provided, look up by ID first; otherwise fall back to first match by provider type.
 */
export async function getBaseUrl(providerType: ProviderType, configId?: string | null): Promise<string | undefined> {
  if (providerType === 'ollama') {
    return ollamaSettings.getOllamaURL()
  }

  const configs = await openaiConfigRepo.getAll()
  const config = configId
    ? configs.find(c => c.id === configId)
    : configs.find(c => c.provider === providerType)
  return config?.baseUrl
}

/**
 * Load API key for the given provider type from openaiConfigRepo.
 */
export async function getApiKey(providerType: ProviderType, configId?: string | null): Promise<string | undefined> {
  if (providerType === 'ollama') return undefined

  const configs = await openaiConfigRepo.getAll()
  const config = configId
    ? configs.find(c => c.id === configId)
    : configs.find(c => c.provider === providerType)
  return config?.apiKey || undefined
}

/**
 * Load custom headers for the given provider type.
 * Only Ollama supports custom headers via storage.
 */
export async function getHeaders(providerType: ProviderType, configId?: string | null): Promise<Record<string, string> | undefined> {
  if (providerType === 'ollama') {
    return ollamaSettings.getCustomHeadersMap()
  }

  const configs = await openaiConfigRepo.getAll()
  const config = configId
    ? configs.find(c => c.id === configId)
    : configs.find(c => c.provider === providerType)
  return config?.headers || undefined
}

/**
 * Load system prompt for the given chat mode.
 * If promptId is provided, use that specific prompt.
 * Otherwise fall back to the first system prompt from the repository.
 */
export async function getSystemPrompt(mode: ChatMode, promptId?: string | null): Promise<string | undefined> {
  if (promptId) {
    const prompt = await promptRepo.getById(promptId)
    return prompt?.content || undefined
  }

  const systemPrompts = await promptRepo.getSystemPrompts()
  if (systemPrompts.length === 0) return undefined

  // Use the first system prompt by default
  return systemPrompts[0].content || undefined
}

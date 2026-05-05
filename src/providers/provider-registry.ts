/**
 * Provider Registry.
 * Manages registered model providers and their available models.
 */

import type { ProviderType } from '@/types/provider'
import type { ModelInfo } from '@/types/provider'
import { listOllamaModels } from './ollama/ollama-model.service'
import { smartFetch } from './proxy-fetch'

/**
 * Normalize base URL by ensuring it ends with a version path like /v1.
 * If the URL already ends with /v{number}, keep it as-is.
 */
function normalizeBaseUrl(url: string): string {
  const base = url.replace(/\/$/, '')
  if (/\/v\d+$/.test(base)) return base
  return base + '/v1'
}

export interface ProviderInstance {
  providerType: ProviderType
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
  enabled: boolean
}

/**
 * Get all available models from all registered providers.
 */
export async function getAllModels(
  providers: ProviderInstance[]
): Promise<ModelInfo[]> {
  const results = await Promise.allSettled(
    providers
      .filter(p => p.enabled)
      .map(p => getProviderModels(p))
  )

  const models: ModelInfo[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      models.push(...result.value)
    }
  }

  return models
}

/**
 * Get models for a specific provider instance.
 */
export async function getProviderModels(
  provider: ProviderInstance
): Promise<ModelInfo[]> {
  switch (provider.providerType) {
    case 'ollama':
      return getOllamaModels(provider)
    case 'openai':
    case 'openrouter':
    case 'ollama2':
      return getOpenAIModels(provider)
    case 'anthropic':
      return getAnthropicModels(provider)
    case 'chrome-ai':
      return getChromeAIModels()
    case 'google':
      return getGeminiModels(provider)
    default:
      return []
  }
}

async function getOllamaModels(provider: ProviderInstance): Promise<ModelInfo[]> {
  const models = await listOllamaModels(provider.baseUrl, provider.headers)
  return models.map(m => ({
    id: m.name,
    name: m.name,
    family: m.details.family,
    size: m.size,
    quantization: m.details.quantization_level,
    provider: 'ollama' as ProviderType,
  }))
}

async function getOpenAIModels(provider: ProviderInstance): Promise<ModelInfo[]> {
  const headers: Record<string, string> = {
    ...provider.headers,
  }
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`
  }

  const response = await smartFetch(`${normalizeBaseUrl(provider.baseUrl)}/models`, { headers })
  if (!response.ok) return []

  const data = await response.json() as { data: Array<{ id: string; owned_by?: string }> }
  return data.data.map(m => ({
    id: m.id,
    name: m.id,
    provider: provider.providerType,
  }))
}

async function getAnthropicModels(provider: ProviderInstance): Promise<ModelInfo[]> {
  // Anthropic doesn't have a model list endpoint
  // Return known models based on provider config
  return [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' as ProviderType },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' as ProviderType },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic' as ProviderType },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic' as ProviderType },
  ]
}

async function getGeminiModels(provider: ProviderInstance): Promise<ModelInfo[]> {
  const headers: Record<string, string> = { ...provider.headers }
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`
  }

  // Gemini OpenAI-compatible endpoint
  const baseUrl = provider.baseUrl.replace(/\/$/, '')
  const response = await smartFetch(`${normalizeBaseUrl(baseUrl)}/models`, { headers })
  if (!response.ok) return []

  const data = await response.json() as { data: Array<{ id: string }> }
  return data.data.map(m => ({
    id: m.id,
    name: m.id,
    provider: 'google' as ProviderType,
  }))
}

function getChromeAIModels(): ModelInfo[] {
  return [
    { id: 'gemini-nano', name: 'Gemini Nano (Chrome AI)', provider: 'chrome-ai' as ProviderType },
  ]
}

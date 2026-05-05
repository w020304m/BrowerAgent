/**
 * Provider factory.
 * Creates the appropriate IChatProvider or IEmbeddingProvider based on provider type and config.
 * Includes instance caching with TTL and max size limits.
 */

import type { IChatProvider, IEmbeddingProvider, ModelParams } from './types'
import type { ProviderType } from '@/types/provider'
import { OllamaChatProvider } from './ollama/ollama-chat.provider'
import { OllamaEmbeddingProvider } from './ollama/ollama-embedding.provider'
import { OpenAIChatProvider } from './openai-compatible/openai-chat.provider'
import { OpenAIEmbeddingProvider } from './openai-compatible/openai-embedding.provider'
import { AnthropicChatProvider } from './anthropic/anthropic-chat.provider'
import { GoogleAIChatProvider } from './google/google-chat.provider'
import { ChromeAIChatProvider } from './chrome-ai/chrome-ai-chat.provider'

export interface ProviderFactoryConfig {
  provider: ProviderType
  model: string
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
  params?: ModelParams
  /** Anthropic-specific: API version */
  apiVersion?: string
}

// ── Provider instance cache ──────────────────────────────────────────

interface CacheEntry {
  provider: IChatProvider | IEmbeddingProvider
  timestamp: number
}

const CACHE_TTL = 5 * 60 * 1000  // 5 minutes
const MAX_CACHE_SIZE = 20

const providerCache = new Map<string, CacheEntry>()

function buildCacheKey(config: ProviderFactoryConfig): string {
  return `${config.provider}:${config.model}:${config.baseUrl}:${config.apiKey ?? ''}`
}

function getFromCache(key: string): IChatProvider | IEmbeddingProvider | undefined {
  const entry = providerCache.get(key)
  if (!entry) return undefined

  const age = Date.now() - entry.timestamp
  if (age > CACHE_TTL) {
    providerCache.delete(key)
    return undefined
  }

  return entry.provider
}

function addToCache(key: string, provider: IChatProvider | IEmbeddingProvider): void {
  if (providerCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const oldestKey = providerCache.keys().next().value
    if (oldestKey !== undefined) {
      providerCache.delete(oldestKey)
    }
  }

  providerCache.set(key, { provider, timestamp: Date.now() })
}

/**
 * Clear the provider instance cache.
 */
export function clearProviderCache(): void {
  providerCache.clear()
}

// ── Internal factory ─────────────────────────────────────────────────

function createChatProviderInternal(config: ProviderFactoryConfig): IChatProvider {
  const headers = {
    ...config.headers,
    ...(config.apiKey ? buildAuthHeader(config.provider, config.apiKey) : {}),
  }

  switch (config.provider) {
    case 'ollama':
      return new OllamaChatProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        headers,
        params: config.params,
      })

    case 'openai':
      return new OpenAIChatProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        headers,
        params: config.params,
      })

    case 'anthropic':
      return new AnthropicChatProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        headers,
        params: config.params,
        apiVersion: config.apiVersion,
      })

    case 'google':
      return new GoogleAIChatProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        headers,
        params: config.params,
      })

    case 'openrouter':
      return new OpenAIChatProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        headers,
        params: config.params,
      })

    case 'ollama2':
      return new OpenAIChatProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        headers,
        params: config.params,
      })

    case 'chrome-ai':
      return new ChromeAIChatProvider({
        model: config.model,
        params: config.params,
      })

    default:
      throw new Error(`Unknown provider type: ${config.provider}`)
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Create a chat provider based on configuration.
 * Returns a cached instance if one exists for the same config.
 */
export function createChatProvider(config: ProviderFactoryConfig): IChatProvider {
  const cacheKey = buildCacheKey(config)
  const cached = getFromCache(cacheKey)
  if (cached && 'streamChat' in cached) {
    return cached as IChatProvider
  }

  const provider = createChatProviderInternal(config)
  addToCache(cacheKey, provider)
  return provider
}

/**
 * Create an embedding provider based on configuration.
 */
export function createEmbeddingProvider(config: ProviderFactoryConfig): IEmbeddingProvider {
  const headers = {
    ...config.headers,
    ...(config.apiKey ? buildAuthHeader(config.provider, config.apiKey) : {}),
  }

  switch (config.provider) {
    case 'ollama':
      return new OllamaEmbeddingProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        headers,
      })

    case 'openai':
    case 'openrouter':
    case 'ollama2':
      return new OpenAIEmbeddingProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        headers,
      })

    default:
      throw new Error(`Embedding not supported for provider: ${config.provider}`)
  }
}

/**
 * Build authentication header based on provider type.
 */
function buildAuthHeader(provider: ProviderType, apiKey: string): Record<string, string> {
  switch (provider) {
    case 'anthropic':
      return { 'x-api-key': apiKey }
    case 'openai':
    case 'openrouter':
    case 'ollama2':
    case 'google':
      return { 'Authorization': `Bearer ${apiKey}` }
    default:
      return {}
  }
}

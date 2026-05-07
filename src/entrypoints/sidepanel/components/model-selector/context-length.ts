/**
 * Context length detection utilities for ModelSelector
 */

import { smartFetch } from '@/providers/proxy-fetch'
import { lookupKnownContextLength } from './utils'

/**
 * Fetch context length from Ollama /api/show endpoint.
 * Returns the context_length from model info, or undefined.
 */
export async function fetchOllamaContextLength(baseUrl: string, modelId: string): Promise<number | undefined> {
  try {
    const response = await smartFetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelId }),
    })
    if (!response.ok) return undefined
    const data = await response.json() as {
      model_info?: Record<string, unknown>
      parameters?: string
    }
    // Try model_info first (Ollama >= 0.1.30)
    if (data.model_info) {
      const contextLength = data.model_info['context_length'] as number | undefined
      if (contextLength && contextLength > 0) return contextLength
    }
    // Fallback: parse num_ctx from parameters string
    if (data.parameters) {
      const match = data.parameters.match(/num_ctx\s+(\d+)/)
      if (match) return parseInt(match[1], 10)
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Fetch context length from OpenAI-compatible models endpoint.
 * The /v1/models/:id endpoint sometimes includes context_window or max_tokens.
 */
export async function fetchOpenAIContextLength(baseUrl: string, apiKey: string | undefined, modelId: string): Promise<number | undefined> {
  try {
    const headers: Record<string, string> = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const normalizedUrl = baseUrl.replace(/\/$/, '')
    const url = /\/v\d+$/.test(normalizedUrl)
      ? `${normalizedUrl}/models/${encodeURIComponent(modelId)}`
      : `${normalizedUrl}/v1/models/${encodeURIComponent(modelId)}`

    const response = await smartFetch(url, { headers })
    if (!response.ok) return undefined

    const data = await response.json() as {
      context_window?: number
      max_context_length?: number
      metadata?: { context_length?: number }
    }
    return data.context_window ?? data.max_context_length ?? data.metadata?.context_length
  } catch {
    return undefined
  }
}

/**
 * Auto-detect context length for a given model and provider.
 * Tries Ollama API, OpenAI-compatible API, then falls back to known models list.
 */
export async function detectContextLength(
  providerType: string,
  baseUrl: string,
  apiKey: string | undefined,
  modelId: string
): Promise<number> {
  let detected: number | undefined

  // Try Ollama API
  if (providerType === 'ollama' && baseUrl) {
    detected = await fetchOllamaContextLength(baseUrl, modelId)
  }
  // Try OpenAI-compatible API (works for OpenAI, Anthropic-compatible, etc.)
  else if (providerType !== 'ollama' && providerType !== 'chrome-ai' && baseUrl) {
    detected = await fetchOpenAIContextLength(baseUrl, apiKey, modelId)
  }

  // Fallback to known model list
  if (!detected) {
    detected = lookupKnownContextLength(modelId)
  }

  // Default to 128K if nothing detected
  return (detected && detected > 0) ? detected : 128000
}

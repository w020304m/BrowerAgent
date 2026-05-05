/**
 * OpenAI-compatible Embedding Provider.
 * Implements IEmbeddingProvider using /embeddings endpoint.
 */

import type { IEmbeddingProvider } from '../types'
import type { OpenAIEmbedRequest, OpenAIEmbedResponse } from './openai-types'
import { smartFetch } from '../proxy-fetch'

/**
 * Normalize base URL — same logic as openai-chat.provider.ts.
 * Ensures URL ends with a version path like /v1.
 */
function normalizeBaseUrl(url: string, versionPath: string): string {
  const base = url.replace(/\/$/, '')
  if (/\/v\d+$/.test(base)) return base
  return base + versionPath
}

export interface OpenAIEmbeddingConfig {
  baseUrl: string
  model: string
  headers?: Record<string, string>
}

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly providerType = 'openai' as const
  readonly modelId: string

  private baseUrl: string
  private headers: Record<string, string>

  constructor(config: OpenAIEmbeddingConfig) {
    this.modelId = config.model
    this.baseUrl = normalizeBaseUrl(config.baseUrl, '/v1')
    this.headers = config.headers ?? {}
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const body: OpenAIEmbedRequest = {
      model: this.modelId,
      input: texts,
    }

    const response = await this.fetch('/embeddings', body)

    if (!response.ok) {
      throw new Error(`OpenAI embed error: ${response.status} ${await response.text()}`)
    }

    const data = await response.json() as OpenAIEmbedResponse
    // Sort by index to maintain order
    return data.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding)
  }

  async embedQuery(text: string): Promise<number[]> {
    const body: OpenAIEmbedRequest = {
      model: this.modelId,
      input: text,
    }

    const response = await this.fetch('/embeddings', body)

    if (!response.ok) {
      throw new Error(`OpenAI embed error: ${response.status} ${await response.text()}`)
    }

    const data = await response.json() as OpenAIEmbedResponse
    return data.data[0].embedding
  }

  private async fetch(path: string, body: unknown): Promise<Response> {
    return smartFetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(body),
    })
  }
}

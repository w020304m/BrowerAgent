/**
 * Ollama Embedding Provider.
 * Implements IEmbeddingProvider using Ollama /api/embed endpoint.
 */

import type { IEmbeddingProvider } from '../types'
import type { OllamaEmbedRequest, OllamaEmbedResponse } from './ollama-types'
import { smartFetch } from '../proxy-fetch'

export interface OllamaEmbeddingConfig {
  baseUrl: string
  model: string
  headers?: Record<string, string>
}

export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  readonly providerType = 'ollama' as const
  readonly modelId: string

  private baseUrl: string
  private headers: Record<string, string>

  constructor(config: OllamaEmbeddingConfig) {
    this.modelId = config.model
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.headers = config.headers ?? {}
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const body: OllamaEmbedRequest = {
      model: this.modelId,
      input: texts,
    }

    const response = await this.fetch('/api/embed', body)

    if (!response.ok) {
      // Fallback: embed one by one
      const results: number[][] = []
      for (const text of texts) {
        results.push(await this.embedQuery(text))
      }
      return results
    }

    const data = await response.json() as OllamaEmbedResponse
    return data.embeddings
  }

  async embedQuery(text: string): Promise<number[]> {
    const body: OllamaEmbedRequest = {
      model: this.modelId,
      input: text,
    }

    const response = await this.fetch('/api/embed', body)

    if (!response.ok) {
      throw new Error(`Ollama embed error: ${response.status} ${await response.text()}`)
    }

    const data = await response.json() as OllamaEmbedResponse
    return data.embeddings[0]
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

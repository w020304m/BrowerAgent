/**
 * Perplexity search API engine implementation.
 * Uses Perplexity AI's search API.
 */

import type { ISearchEngine, SearchResult } from '../types'

interface PerplexityResult {
  title: string
  url: string
  snippet: string
}

interface PerplexityResponse {
  results?: PerplexityResult[]
}

export class PerplexityEngine implements ISearchEngine {
  private readonly apiKey: string

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey
  }

  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const response = await fetch('https://api.perplexity.ai/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, max_results: maxResults }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      throw new Error(`Perplexity API search failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as PerplexityResponse

    if (!data?.results) return []

    return data.results
      .slice(0, maxResults)
      .filter((item) => item.url && item.title)
      .map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet ?? '',
      }))
  }
}

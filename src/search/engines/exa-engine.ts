/**
 * Exa search API engine implementation.
 * Uses the Exa AI search API with Bearer token authentication.
 */

import type { ISearchEngine, SearchResult } from '../types'

interface ExaAPIResult {
  title: string
  url: string
  text: string
}

interface ExaAPIResponse {
  results?: ExaAPIResult[]
}

export class ExaEngine implements ISearchEngine {
  private readonly apiKey: string

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey
  }

  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        numResults: maxResults,
        text: true,
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      throw new Error(`Exa API search failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as ExaAPIResponse

    if (!data?.results) return []

    return data.results
      .slice(0, maxResults)
      .filter((item) => item.url && item.title)
      .map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.text ?? '',
      }))
  }
}

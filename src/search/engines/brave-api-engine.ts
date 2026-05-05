/**
 * Brave Search API engine implementation.
 * Uses the official Brave Search API with API key authentication.
 */

import type { ISearchEngine, SearchResult } from '../types'

interface BraveAPIResult {
  title: string
  url: string
  description: string
}

interface BraveAPIResponse {
  web?: {
    results?: BraveAPIResult[]
  }
}

export class BraveAPIEngine implements ISearchEngine {
  private readonly apiKey: string

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey
  }

  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Subscription-Token': this.apiKey,
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      throw new Error(`Brave API search failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as BraveAPIResponse

    if (!data?.web?.results) return []

    return data.web.results
      .slice(0, maxResults)
      .filter((item) => item.title && item.url)
      .map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.description ?? '',
      }))
  }
}

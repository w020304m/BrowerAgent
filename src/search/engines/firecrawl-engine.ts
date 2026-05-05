/**
 * Firecrawl search API engine implementation.
 * Uses Firecrawl's search API.
 */

import type { ISearchEngine, SearchResult } from '../types'

interface FirecrawlResult {
  title: string
  url: string
  description: string
  markdown: string
}

interface FirecrawlResponse {
  data?: FirecrawlResult[]
}

export class FirecrawlEngine implements ISearchEngine {
  private readonly apiKey: string

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey
  }

  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        limit: maxResults,
        query,
        timeout: 60000,
        scrapeOptions: { formats: [] },
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      throw new Error(`Firecrawl API search failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as FirecrawlResponse

    if (!data?.data) return []

    return data.data
      .slice(0, maxResults)
      .filter((item) => item.url && item.title)
      .map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.description ?? '',
      }))
  }
}

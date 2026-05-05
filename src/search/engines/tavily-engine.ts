/**
 * Tavily search API engine implementation.
 * Uses the Tavily AI search API with API key authentication.
 */

import type { ISearchEngine, SearchResult } from '../types'

interface TavilyResult {
  title: string
  url: string
  content: string
}

interface TavilyResponse {
  answer?: string
  results?: TavilyResult[]
}

export class TavilyEngine implements ISearchEngine {
  private readonly apiKey: string

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey
  }

  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: maxResults,
        include_answer: false,
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      throw new Error(`Tavily API search failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as TavilyResponse

    if (!data.results || !Array.isArray(data.results)) return []

    return data.results
      .slice(0, maxResults)
      .filter((item) => item.url && item.title)
      .map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.content ?? '',
      }))
  }
}

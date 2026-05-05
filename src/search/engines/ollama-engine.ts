/**
 * Ollama web search API engine implementation.
 * Uses Ollama's web search API.
 */

import type { ISearchEngine, SearchResult } from '../types'

interface OllamaSearchResult {
  title: string
  url: string
  content: string
}

interface OllamaSearchResponse {
  results?: OllamaSearchResult[]
}

export class OllamaSearchEngine implements ISearchEngine {
  private readonly apiKey: string

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey
  }

  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const response = await fetch('https://ollama.com/api/web_search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, max_results: maxResults }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      throw new Error(`Ollama search API failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as OllamaSearchResponse

    if (!data?.results) return []

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

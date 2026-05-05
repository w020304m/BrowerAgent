/**
 * Stract search API engine implementation.
 * Uses the open Stract search API.
 */

import type { ISearchEngine, SearchResult } from '../types'

interface StractFragment {
  kind: string
  text: string
}

interface StractSnippet {
  text: { fragments: StractFragment[] }
}

interface StractResult {
  title: string
  url: string
  snippet: StractSnippet
}

interface StractResponse {
  webpages?: StractResult[]
}

export class StractEngine implements ISearchEngine {
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const response = await fetch('https://stract.com/beta/api/search', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, num_results: maxResults }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      throw new Error(`Stract search failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as StractResponse

    if (!data?.webpages) return []

    return data.webpages
      .slice(0, maxResults)
      .filter((item) => item.url && item.title)
      .map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet?.text?.fragments?.map((f) => f.text).join(' ') ?? '',
      }))
  }
}

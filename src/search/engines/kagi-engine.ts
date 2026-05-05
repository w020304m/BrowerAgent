/**
 * Kagi search API engine implementation.
 * Uses Kagi's search API with Bot authorization.
 */

import type { ISearchEngine, SearchResult } from '../types'

interface KagiSearchResult {
  t: number
  url?: string
  title?: string
  snippet?: string
}

interface KagiAPIResponse {
  data?: KagiSearchResult[]
  error?: Array<{ code: number; msg: string }>
}

export class KagiEngine implements ISearchEngine {
  private readonly apiKey: string

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey
  }

  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const url = `https://kagi.com/api/v0/search?q=${encodeURIComponent(query)}&limit=${maxResults}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bot ${this.apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      throw new Error(`Kagi API search failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as KagiAPIResponse

    if (data.error?.length) {
      throw new Error(`Kagi API error: ${data.error.map((e) => e.msg).join(', ')}`)
    }

    if (!data?.data) return []

    return data.data
      .filter((item) => item.t === 0 && item.url && item.title)
      .slice(0, maxResults)
      .map((item) => ({
        title: item.title!,
        url: item.url!,
        snippet: item.snippet ?? '',
      }))
  }
}

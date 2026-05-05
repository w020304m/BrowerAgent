/**
 * Baidu search engine implementation.
 * Uses Baidu's JSON API for search results.
 */

import type { ISearchEngine, SearchResult } from '../types'

interface BaiduFeedEntry {
  title?: string
  url?: string
  abs?: string
}

interface BaiduResponse {
  feed?: {
    entry?: BaiduFeedEntry[]
  }
}

export class BaiduEngine implements ISearchEngine {
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&tn=json&rn=${maxResults}`

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`Baidu search failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as BaiduResponse
    const entries = data?.feed?.entry ?? []

    return entries
      .slice(0, maxResults)
      .filter((item) => item.url)
      .map((item) => ({
        title: item.title ?? '',
        url: item.url!,
        snippet: item.abs ?? '',
      }))
  }
}

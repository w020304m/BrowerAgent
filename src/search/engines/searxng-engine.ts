/**
 * SearXNG search engine implementation.
 * Supports both JSON API mode and HTML scraping mode.
 */

import * as cheerio from 'cheerio'
import type { ISearchEngine, SearchResult, SearchEngineConfig } from '../types'

/** Shape of a single result item in the SearXNG JSON response */
interface SearXNGResultItem {
  title?: string
  url?: string
  content?: string
  snippet?: string
}

/** Top-level shape of the SearXNG JSON response */
interface SearXNGResponse {
  results?: SearXNGResultItem[]
}

export class SearXNGEngine implements ISearchEngine {
  private readonly baseUrl: string
  private readonly jsonMode: boolean

  constructor(config: { baseUrl: string; jsonMode?: boolean }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.jsonMode = config.jsonMode ?? true
  }

  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    return this.jsonMode
      ? this.jsonSearch(query, maxResults)
      : this.htmlSearch(query, maxResults)
  }

  private async jsonSearch(query: string, maxResults: number): Promise<SearchResult[]> {
    const url = new URL('/search', this.baseUrl)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      throw new Error(`SearXNG search failed: ${response.status} ${response.statusText}`)
    }

    const data: SearXNGResponse = (await response.json()) as SearXNGResponse

    if (!Array.isArray(data.results)) return []

    return data.results
      .slice(0, maxResults)
      .filter((item): item is SearXNGResultItem & { url: string; title: string } =>
        typeof item.url === 'string' && item.url.length > 0 &&
        typeof item.title === 'string' && item.title.length > 0
      )
      .map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.content ?? item.snippet ?? '',
      }))
  }

  private async htmlSearch(query: string, maxResults: number): Promise<SearchResult[]> {
    const url = new URL('/search', this.baseUrl)
    url.searchParams.set('q', query)

    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`SearXNG HTML search failed: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const results: SearchResult[] = []

    $('article.result').each((_, el) => {
      if (results.length >= maxResults) return false

      const title = $(el).find('h3').text().trim()
      const link = $(el).find('a.url_header').attr('href') ?? ''
      const snippet = $(el).find('p.content').text().trim()

      if (title && link) {
        results.push({ title, url: link, snippet })
      }
    })

    return results
  }
}

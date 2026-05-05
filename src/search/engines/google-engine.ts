/**
 * Google search engine implementation.
 * Scrapes Google search results using cheerio.
 * Supports pagination to gather enough results.
 */

import * as cheerio from 'cheerio'
import type { ISearchEngine, SearchResult } from '../types'

export class GoogleEngine implements ISearchEngine {
  private readonly domain: string

  constructor(config?: { domain?: string }) {
    this.domain = config?.domain ?? 'google.com'
  }

  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const results: SearchResult[] = []
    const seenUrls = new Set<string>()
    let page = 0

    while (results.length < maxResults) {
      const start = page * 10
      const url = `https://www.${this.domain}/search?hl=en&q=${encodeURIComponent(query)}&start=${start}`

      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      })

      if (!response.ok) break

      const html = await response.text()
      const $ = cheerio.load(html)

      let pageHasResults = false

      $('div.g').each((_, el) => {
        if (results.length >= maxResults) return false

        const title = $(el).find('h3').text().trim()
        const link = $(el).find('a').first().attr('href') ?? ''
        const snippet = $(el).find('span').map((__, span) => $(span).text()).get().join(' ').trim()

        if (title && link && !seenUrls.has(link)) {
          seenUrls.add(link)
          results.push({ title, url: link, snippet })
          pageHasResults = true
        }
      })

      if (!pageHasResults) break

      page++

      // Safety limit
      if (page > 10) break

      // Delay between pages
      if (results.length < maxResults) {
        await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000))
      }
    }

    return results.slice(0, maxResults)
  }
}

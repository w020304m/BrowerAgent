/**
 * Brave Search engine implementation (HTML scraping).
 * Scrapes Brave search results using cheerio.
 */

import * as cheerio from 'cheerio'
import type { ISearchEngine, SearchResult } from '../types'

export class BraveEngine implements ISearchEngine {
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}`

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`Brave search failed: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const results: SearchResult[] = []

    $('div#results div.snippet').each((_, el) => {
      if (results.length >= maxResults) return false

      const link = $(el).find('a').attr('href') ?? ''
      const title = $(el).find('div.title').text().trim()
      const snippet = $(el).find('div.snippet-description').text().trim()

      if (title && link) {
        results.push({ title, url: link, snippet })
      }
    })

    return results
  }
}

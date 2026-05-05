/**
 * Startpage search engine implementation.
 * Scrapes Startpage search results using cheerio.
 */

import * as cheerio from 'cheerio'
import type { ISearchEngine, SearchResult } from '../types'

export class StartpageEngine implements ISearchEngine {
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const url = `https://www.startpage.com/sp/search?query=${encodeURIComponent(query)}&cat=web&pl=Opensearch`

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`Startpage search failed: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const results: SearchResult[] = []

    $('.result').each((_, el) => {
      if (results.length >= maxResults) return false

      const title = $(el).find('.wgl-title').text().trim()
      const snippet = $(el).find('.description').text().trim()
      const link = $(el).find('.wgl-display-url .default-link-text').text().trim()

      if (title && link) {
        results.push({ title, url: link, snippet })
      }
    })

    return results
  }
}

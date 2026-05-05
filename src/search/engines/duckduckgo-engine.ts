/**
 * DuckDuckGo search engine implementation.
 * Scrapes the HTML version of DuckDuckGo search results.
 */

import * as cheerio from 'cheerio'
import type { ISearchEngine, SearchResult } from '../types'

export class DuckDuckGoEngine implements ISearchEngine {
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const results: SearchResult[] = []

    $('div.results_links_deep').each((_, el) => {
      if (results.length >= maxResults) return false

      const title = $(el).find('a.result__a').text().trim()
      const rawLink = $(el).find('a.result__snippet').attr('href') ?? ''
      const snippet = $(el).find('a.result__snippet').text().trim()

      // Decode DuckDuckGo redirect URL
      const decodedLink = decodeURIComponent(
        rawLink.replace('//duckduckgo.com/l/?uddg=', '').replace(/&rut=.*/, '')
      )

      if (title && decodedLink) {
        results.push({ title, url: decodedLink, snippet })
      }
    })

    return results
  }
}

/**
 * Bing search engine implementation.
 * Scrapes Bing search results using cheerio.
 */

import * as cheerio from 'cheerio'
import type { ISearchEngine, SearchResult } from '../types'

export class BingEngine implements ISearchEngine {
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`Bing search failed: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const results: SearchResult[] = []
    const $results = $('#b_content #b_results')

    // Regular search results
    $results.find('.b_algo').each((_, el) => {
      if (results.length >= maxResults) return false

      const link = $(el).find('.tilk').attr('href') ?? $(el).find('h2 a').attr('href') ?? ''
      const title = $(el).find('h2').text().trim()
      const snippet = $(el).find('.b_caption p').text().trim()

      if (title && link) {
        results.push({ title, url: link, snippet })
      }
    })

    // News results
    $results.find('.b_nwsAns').each((_, el) => {
      if (results.length >= maxResults) return false

      const link = $(el).find('a.itm_link').attr('href') ?? ''
      const title = $(el).find('.na_t_news_caption').text().trim()
      const snippet = $(el).find('.itm_spt_news_caption').text().trim()

      if (title && link) {
        results.push({ title, url: link, snippet })
      }
    })

    return results.slice(0, maxResults)
  }
}

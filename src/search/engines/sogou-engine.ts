/**
 * Sogou search engine implementation.
 * Scrapes Sogou search results using cheerio.
 * Handles redirect URL resolution for relative links.
 */

import * as cheerio from 'cheerio'
import type { ISearchEngine, SearchResult } from '../types'

async function resolveRedirectUrl(url: string): Promise<string> {
  if (!url) return ''
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    const html = await res.text()
    const $ = cheerio.load(html)
    const script = $('script').text()
    const matches = script.match(/"(.*?)"/)
    return matches?.[1] ?? ''
  } catch {
    return ''
  }
}

export class SogouEngine implements ISearchEngine {
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const url = `https://www.sogou.com/web?query=${encodeURIComponent(query)}`

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`Sogou search failed: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const rawResults: Array<{ title: string; link: string; snippet: string }> = []

    $('#main .results').children().each((_, el) => {
      const $el = $(el)
      const title = $el.find('.vr-title').text().replace(/\n/g, '').trim()
      let link = $el.find('.vr-title > a').get(0)?.attribs.href ?? ''

      // Remove noise elements
      ;['.text-lightgray', '.zan-box', '.tag-website'].forEach((cls) => {
        $el.find(cls).remove()
      })

      const snippet = ['.star-wiki', '.fz-mid', '.attribute-centent']
        .map((selector) => $el.find(selector).text().trim())
        .filter(Boolean)
        .join(' ')

      if (title && link) {
        rawResults.push({ title, link, snippet })
      }
    })

    // Resolve relative redirect URLs in parallel
    const results: SearchResult[] = []
    const resolvedLinks = await Promise.all(
      rawResults.map(async (r) => {
        if (r.link.startsWith('/')) {
          const resolved = await resolveRedirectUrl(`https://www.sogou.com${r.link}`)
          return { ...r, link: resolved }
        }
        return r
      })
    )

    for (const r of resolvedLinks) {
      if (results.length >= maxResults) break
      if (r.link) {
        results.push({ title: r.title, url: r.link, snippet: r.snippet })
      }
    }

    return results
  }
}

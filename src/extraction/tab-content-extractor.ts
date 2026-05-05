/**
 * Tab content extractor.
 * Extracts readable content from browser tabs using chrome.scripting.executeScript.
 * Uses innerText directly on live DOM elements (not clones) for reliable text extraction.
 */

import type { IContentExtractor, ExtractionResult, ContentSource } from './types'

/** Maximum characters to extract (prevents token overflow) */
const MAX_CONTENT_LENGTH = 30000

/**
 * Extracts content from browser tabs.
 * Uses chrome.scripting.executeScript to inject an extraction function
 * that finds the main content area and extracts readable text.
 */
export class TabContentExtractor implements IContentExtractor {
  canHandle(source: ContentSource): boolean {
    return source.type === 'tab'
  }

  async extract(source: ContentSource): Promise<ExtractionResult> {
    if (source.type !== 'tab') {
      throw new Error('TabContentExtractor only handles tab sources')
    }

    const tabContent = await this.getTabContent(source.tabId)

    return {
      content: tabContent.content,
      title: tabContent.title,
      sourceUrl: tabContent.url,
      contentType: 'text/html',
      metadata: {
        tabId: source.tabId,
        selector: tabContent.selector,
        contentLength: tabContent.content.length,
      },
    }
  }

  /**
   * Get tab content via chrome.scripting.executeScript.
   *
   * IMPORTANT: Must use innerText on LIVE DOM elements, not cloned nodes.
   * innerText relies on the browser's rendering tree. A detached clone
   * is not in the rendering tree, so innerText behavior is undefined
   * and may return CSS code or garbled content.
   */
  protected async getTabContent(tabId: number): Promise<{
    content: string
    title: string
    url: string
    selector: string
  }> {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Selectors for non-content areas to temporarily hide
        const hideSelector =
          'nav, footer, header:not(:only-of-type), aside, ' +
          '[role="navigation"], [role="banner"], [role="contentinfo"], ' +
          '.sidebar, .navigation, .menu, .comment, .ad, .advertisement, .social-share, .cookie-banner'

        // Find the main content container in priority order
        const selectors = [
          'article',
          '[role="main"]',
          'main',
          '#content, #main-content, .post-content, .article-content, .entry-content',
        ]

        let el = document.body
        let matchedSelector = 'body'

        for (const sel of selectors) {
          const found = document.querySelector(sel)
          if (found) {
            const text = (found as HTMLElement).innerText?.trim() ?? ''
            if (text.length > 200) {
              el = found as HTMLElement
              matchedSelector = sel
              break
            }
          }
        }

        // Temporarily hide non-content elements so innerText skips them
        const hidden: Array<{ el: HTMLElement; prev: string }> = []
        const toHide = el.querySelectorAll(hideSelector)
        toHide.forEach((node) => {
          const htmlEl = node as HTMLElement
          const prev = htmlEl.style.display
          if (prev !== 'none') {
            hidden.push({ el: htmlEl, prev })
            htmlEl.style.display = 'none'
          }
        })

        // Read innerText from the LIVE element in the DOM
        const content = (el as HTMLElement).innerText ?? ''

        // Restore hidden elements
        hidden.forEach(({ el: htmlEl, prev }) => {
          htmlEl.style.display = prev
        })

        // Clean up whitespace
        const cleaned = content.replace(/\n{3,}/g, '\n\n').trim()

        return {
          title: document.title,
          url: location.href,
          selector: matchedSelector,
          content: cleaned,
        }
      },
    })

    if (!result?.result) {
      throw new Error(`Failed to extract content from tab ${tabId}`)
    }

    const data = result.result as { content: string; title: string; url: string; selector: string }

    // Truncate if too long
    if (data.content.length > MAX_CONTENT_LENGTH) {
      data.content = data.content.slice(0, MAX_CONTENT_LENGTH) + '\n\n[... content truncated]'
    }

    return data
  }
}

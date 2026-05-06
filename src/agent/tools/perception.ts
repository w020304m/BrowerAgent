/**
 * Perception layer: 4 tools for observing page state.
 * All run in background context, using executeScript for DOM operations.
 */

import type { ToolCall, ToolResult } from '@/types/tool'
import type { BridgeService } from '../bridge/bridge-service'
import { resolveTabId, truncate } from './helpers'

const SNAPSHOT_MAX_LEN = 12000

/**
 * Check if an element has framework-specific action attributes.
 * Covers: Alpine.js, HTMX, Vue, Angular, Stimulus, and generic data- attributes.
 * Exported for unit testing; also duplicated inside executeScript (no access to module scope).
 */
export function checkFrameworkActionAttributes(el: Element): boolean {
  // Generic data-action attributes
  if (el.hasAttribute('data-action') || el.hasAttribute('data-toggle') ||
    el.hasAttribute('data-action-type') || el.hasAttribute('data-handler') ||
    el.hasAttribute('data-click') || el.hasAttribute('data-onclick')) {
    return true
  }

  // Check all attributes for framework patterns
  const attrs = el.attributes
  for (let i = 0; i < attrs.length; i++) {
    const name = attrs[i].name

    // Alpine.js: x-on:click*, @click
    if (name === '@click' || name.startsWith('x-on:click')) return true

    // HTMX: hx-get, hx-post, hx-put, hx-delete, hx-patch
    if (name === 'hx-get' || name === 'hx-post' || name === 'hx-put' ||
      name === 'hx-delete' || name === 'hx-patch') return true

    // Vue: v-on:click
    if (name === 'v-on:click') return true

    // Angular: (click), (tap)
    if (name === '(click)' || name === '(tap)') return true
  }

  // data-testid heuristic: contains click/submit/action/toggle
  const testId = el.getAttribute('data-testid')
  if (testId && /\b(click|submit|action|toggle)\b/i.test(testId)) return true

  return false
}

export function registerPerceptionHandlers(bridge: BridgeService): void {
  bridge.register('agent__page_info', handlePageInfo)
  bridge.register('agent__get_element_by_description', handleGetElementByDescription)
  // agent__get_page_screenshot is handled entirely by BridgeClient in sidepanel context
  bridge.register('agent__read_page', handleReadPage)
  bridge.register('agent__select_element', handleSelectElement)
}

// ── Tool: agent__page_info (unified: snapshot/elements/scroll/network) ──

async function handlePageInfo(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const infoType = args.info_type as string

  switch (infoType) {
    case 'snapshot':
      return handleSnapshot(toolCall)
    case 'elements':
      return handleInteractiveElements(toolCall)
    case 'scroll':
      return handleScrollPosition(toolCall)
    case 'network':
      return handleNetworkRequests(toolCall)
    default:
      return {
        toolCallId: toolCall.id,
        content: `Error: unknown info_type "${infoType}". Use snapshot, elements, scroll, or network.`,
        isError: true,
      }
  }
}

// ── Handler: snapshot ──

async function handleSnapshot(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const tabId = await resolveTabId(args.tabId as number | undefined)

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // ── Find interactive elements on the REAL DOM and assign agent IDs ──
      const interactiveSelectors =
        'a, button, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [contenteditable], [onclick]'
      const interactives = document.querySelectorAll(interactiveSelectors)
      let idx = 0
      for (const el of interactives) {
        el.setAttribute('data-agent-id', `a${idx}`)
        idx++
      }

      // Hard cap: stop tagging if standard interactives already exceeded
      const MAX_TOTAL_IDS = 120

      // ── Second pass: detect JS-clickable elements via cursor: pointer ──
      // Only scan viewport-visible elements to avoid ID explosion on complex pages.
      if (idx < MAX_TOTAL_IDS) {
        const vpHeight = window.innerHeight
        const clickCandidateSelectors = 'li, span' // div/td/tr/section/article are too numerous
        const clickCandidates = document.querySelectorAll(clickCandidateSelectors)
        for (const el of clickCandidates) {
          if (idx >= MAX_TOTAL_IDS) break
          if (el.hasAttribute('data-agent-id')) continue
          // Only viewport-visible
          const rect = el.getBoundingClientRect()
          if (rect.bottom <= 0 || rect.top >= vpHeight) continue
          if (rect.width <= 0 || rect.height <= 0) continue
          // Skip oversized containers (> 50% of viewport = not a discrete clickable item)
          if (rect.width > window.innerWidth * 0.5 || rect.height > vpHeight * 0.5) continue
          // Must have cursor: pointer
          const style = window.getComputedStyle(el as HTMLElement)
          if (style.display === 'none' || style.visibility === 'hidden') continue
          if (style.cursor !== 'pointer') continue
          // Skip containers of other interactive children
          if (el.querySelector('a, button, [data-agent-id]')) continue
          // Must have meaningful text
          const text = (el as HTMLElement).innerText?.trim() ?? ''
          const ariaLabel = el.getAttribute('aria-label') ?? ''
          if (text.length === 0 && ariaLabel.length === 0) continue
          // Skip elements whose text is too long (> 200 chars = paragraph, not clickable label)
          if (text.length > 200) continue

          el.setAttribute('data-agent-id', `a${idx}`)
          idx++
        }
      }

      // ── Third pass: detect focusable elements via tabindex ──
      // Only viewport-visible, same cap applies.
      if (idx < MAX_TOTAL_IDS) {
        const vpHeight = window.innerHeight
        const focusable = document.querySelectorAll('[tabindex]:not([tabindex="-1"])')
        for (const el of focusable) {
          if (idx >= MAX_TOTAL_IDS) break
          if (el.hasAttribute('data-agent-id')) continue
          const tag = el.tagName.toLowerCase()
          if (['body', 'html', 'main', 'article', 'section', 'nav'].includes(tag)) continue
          const rect = el.getBoundingClientRect()
          if (rect.bottom <= 0 || rect.top >= vpHeight) continue
          if (rect.width <= 0 || rect.height <= 0) continue
          const style = window.getComputedStyle(el as HTMLElement)
          if (style.display === 'none' || style.visibility === 'hidden') continue

          el.setAttribute('data-agent-id', `a${idx}`)
          idx++
        }
      }

      // ── Fourth pass: detect elements with onclick handlers or framework action attributes ──
      // Catches elements where click behavior is set via addEventListener or
      // DOM property (el.onclick = fn), which are invisible to CSS selector matching.
      // Also detects framework-specific attributes (Alpine, HTMX, Vue, Angular, Stimulus).
      if (idx < MAX_TOTAL_IDS) {
        const vpHeight = window.innerHeight

        /**
         * Check if an element has framework-specific action attributes.
         * Covers: Alpine.js, HTMX, Vue, Angular, Stimulus, and generic data- attributes.
         */
        function checkFrameworkActionAttributes(element: Element): boolean {
          // Generic data-action attributes
          if (element.hasAttribute('data-action') || element.hasAttribute('data-toggle') ||
            element.hasAttribute('data-action-type') || element.hasAttribute('data-handler') ||
            element.hasAttribute('data-click') || element.hasAttribute('data-onclick')) {
            return true
          }

          // Check all attributes for framework patterns
          const attrs = element.attributes
          for (let i = 0; i < attrs.length; i++) {
            const name = attrs[i].name

            // Alpine.js: x-on:click*, @click
            if (name === '@click' || name.startsWith('x-on:click')) return true

            // HTMX: hx-get, hx-post, hx-put, hx-delete, hx-patch
            if (name === 'hx-get' || name === 'hx-post' || name === 'hx-put' ||
              name === 'hx-delete' || name === 'hx-patch') return true

            // Vue: v-on:click
            if (name === 'v-on:click') return true

            // Angular: (click), (tap)
            if (name === '(click)' || name === '(tap)') return true
          }

          // data-testid heuristic: contains click/submit/action/toggle
          const testId = element.getAttribute('data-testid')
          if (testId && /\b(click|submit|action|toggle)\b/i.test(testId)) return true

          return false
        }

        // Scan common container elements that are frequently used as click targets
        const clickTargetSelectors = 'div, span, li, td, i, svg, path, img, label'
        const candidates = document.querySelectorAll(clickTargetSelectors)
        for (const el of candidates) {
          if (idx >= MAX_TOTAL_IDS) break
          if (el.hasAttribute('data-agent-id')) continue
          const tag = el.tagName.toLowerCase()
          // Skip structural containers
          if (['body', 'html', 'main', 'article', 'section', 'nav', 'header', 'footer'].includes(tag)) continue

          // Must be viewport-visible
          const rect = el.getBoundingClientRect()
          if (rect.bottom <= 0 || rect.top >= vpHeight) continue
          if (rect.width <= 0 || rect.height <= 0) continue
          // Skip oversized containers
          if (rect.width > window.innerWidth * 0.5 || rect.height > vpHeight * 0.5) continue
          const style = window.getComputedStyle(el as HTMLElement)
          if (style.display === 'none' || style.visibility === 'hidden') continue

          // Skip containers of other interactive children
          if (el.querySelector('a, button, [data-agent-id]')) continue

          // Must have meaningful text or aria-label
          const text = (el as HTMLElement).innerText?.trim() ?? ''
          const ariaLabel = el.getAttribute('aria-label') ?? ''
          if (text.length === 0 && ariaLabel.length === 0) continue
          // Skip elements whose text is too long
          if (text.length > 200) continue

          // Detection: onclick handler (DOM property), framework action attributes, or click-related class names
          const htmlEl = el as HTMLElement
          const hasOnclick = htmlEl.onclick !== null
          const hasFrameworkAttr = checkFrameworkActionAttributes(el)
          const className = (el.getAttribute('class') ?? '').toLowerCase()
          const hasClickClass = /\b(btn|button|click|action|toggle|interactive)\b/.test(className)

          if (hasOnclick || hasFrameworkAttr || hasClickClass) {
            el.setAttribute('data-agent-id', `a${idx}`)
            idx++
          }
        }
      }

      // ── Helper: infer semantic role from tag + aria attributes ──
      function inferRole(el: Element): string | null {
        const explicitRole = el.getAttribute('role')
        if (explicitRole) return explicitRole
        const tag = el.tagName.toLowerCase()
        const roleMap: Record<string, string> = {
          a: 'link', button: 'button', input: (el as HTMLInputElement).type === 'search' ? 'searchbox' : 'textbox',
          select: 'combobox', textarea: 'textbox', img: 'image',
          h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
          nav: 'navigation', ul: 'list', ol: 'list', table: 'table', form: 'form',
          dialog: 'dialog', video: 'video', audio: 'audio',
        }
        return roleMap[tag] ?? null
      }

      // ── Helper: extract display text ──
      function getElementText(el: Element): string {
        const tag = el.tagName.toLowerCase()
        if (tag === 'img') return el.getAttribute('alt') ?? ''
        if (tag === 'input' || tag === 'textarea') {
          const input = el as HTMLInputElement
          return input.value || input.placeholder || ''
        }
        const text = (el as HTMLElement).innerText?.trim() ?? ''
        return text.length > 100 ? text.slice(0, 100) + '...' : text
      }

      // ── Helper: skip noise elements ──
      function shouldSkip(el: Element): boolean {
        const tag = el.tagName.toLowerCase()
        if (['script', 'style', 'svg', 'noscript', 'iframe', 'path', 'br', 'hr'].includes(tag)) return true
        if (el.getAttribute('hidden') !== null) return true
        if (el.getAttribute('aria-hidden') === 'true') return true
        const style = window.getComputedStyle(el as HTMLElement)
        if (style.display === 'none' || style.visibility === 'hidden') return true
        return false
      }

      // ── Helper: viewport detection ──
      function isInViewport(el: Element): boolean {
        const rect = el.getBoundingClientRect()
        const vpHeight = window.innerHeight
        return rect.bottom > 0 && rect.top < vpHeight
      }

      // ── Helper: build structured text recursively (used for short pages) ──
      function buildStructuredText(
        el: Element, depth: number, viewportOnly: boolean, maxChars: number,
      ): { text: string; collapsedCount: number } {
        const lines: string[] = []
        let charCount = 0
        let collapsedCount = 0

        function walk(node: Element, d: number): void {
          if (charCount >= maxChars) {
            collapsedCount++
            return
          }
          if (shouldSkip(node)) return

          const role = inferRole(node)
          const agentId = node.getAttribute('data-agent-id')
          const hasRoleOrId = role !== null || agentId !== null

          if (hasRoleOrId) {
            // Output this element as a line
            const text = getElementText(node)
            const href = (node as HTMLAnchorElement).href
            const prefix = '  '.repeat(d)
            let line = prefix + '[' + (role ?? 'element')
            if (agentId) line += ' ' + agentId
            line += ']'
            if (text) line += ' "' + text + '"'
            if (href && node.tagName.toLowerCase() === 'a') {
              try {
                const url = new URL(href, location.href)
                line += ' → ' + url.hostname + url.pathname
              } catch { /* skip invalid href */ }
            }
            if (charCount + line.length > maxChars) {
              collapsedCount++
              return
            }
            lines.push(line)
            charCount += line.length + 1 // +1 for newline
          }

          // Recurse children
          for (const child of Array.from(node.children)) {
            if (viewportOnly && !isInViewport(child)) {
              continue
            }
            walk(child, hasRoleOrId ? d + 1 : d)
          }
        }

        walk(el, depth)
        return { text: lines.join('\n'), collapsedCount }
      }

      // ── Helper: build viewport snapshot by collecting visible elements ──
      function buildViewportSnapshot(
        _body: Element, maxChars: number,
      ): { text: string; collapsedCount: number } {
        const vpHeight = window.innerHeight
        const items: Array<{ el: Element; y: number; type: 'interactive' | 'heading' | 'text_hint' }> = []

        // 1. Collect viewport-visible interactive elements
        const interactives = document.querySelectorAll('[data-agent-id]')
        for (const el of interactives) {
          if (shouldSkip(el)) continue
          const rect = el.getBoundingClientRect()
          if (rect.bottom <= 0 || rect.top >= vpHeight) continue
          items.push({ el, y: rect.top, type: 'interactive' })
        }

        // 2. Collect viewport-visible headings
        const headings = document.querySelectorAll('h1,h2,h3,h4,h5,h6')
        for (const el of headings) {
          if (shouldSkip(el)) continue
          const rect = el.getBoundingClientRect()
          if (rect.bottom <= 0 || rect.top >= vpHeight) continue
          items.push({ el, y: rect.top, type: 'heading' })
        }

        // 3. Collect text-dense elements as hints (so agent knows to use read_page)
        const textCandidates = document.querySelectorAll('p, article, section, div')
        for (const el of textCandidates) {
          if (shouldSkip(el)) continue
          const rect = el.getBoundingClientRect()
          if (rect.bottom <= 0 || rect.top >= vpHeight) continue
          // Skip if already an interactive or heading
          if (el.hasAttribute('data-agent-id')) continue
          const tag = el.tagName.toLowerCase()
          if (['h1','h2','h3','h4','h5','h6'].includes(tag)) continue
          // Skip nav/footer/aside — noise
          if (['nav','footer','aside','header'].includes(tag)) continue
          const parentTag = el.parentElement?.tagName.toLowerCase() ?? ''
          if (['nav','footer','aside'].includes(parentTag)) continue
          const textLen = (el as HTMLElement).innerText?.trim().length ?? 0
          // Only hint for elements with meaningful text (> 30 chars)
          if (textLen > 30) {
            items.push({ el, y: rect.top, type: 'text_hint' })
          }
        }

        // 4. Sort by vertical position
        items.sort((a, b) => a.y - b.y)

        // 5. Format output (bounded by maxChars)
        const lines: string[] = []
        let charCount = 0
        let collapsedCount = 0

        for (const item of items) {
          const el = item.el
          if (item.type === 'text_hint') {
            const textLen = (el as HTMLElement).innerText?.trim().length ?? 0
            const line = '[text ~' + textLen + ' chars — use read_page to read]'
            // Text hints are low priority — skip if budget is tight
            if (charCount + line.length > maxChars * 0.8) continue
            lines.push(line)
            charCount += line.length + 1
          } else if (item.type === 'heading') {
            const text = (getElementText(el)).slice(0, 100)
            if (!text) continue
            const line = '[heading] "' + text + '"'
            if (charCount + line.length > maxChars) { collapsedCount++; continue }
            lines.push(line)
            charCount += line.length + 1
          } else {
            const role = inferRole(el)
            const agentId = el.getAttribute('data-agent-id')
            const text = getElementText(el)
            const href = el.tagName.toLowerCase() === 'a' ? (el as HTMLAnchorElement).href : null
            let line = '[' + (role ?? 'element') + ' ' + agentId + ']'
            if (text) line += ' "' + text + '"'
            if (href) {
              try {
                const u = new URL(href, location.href)
                line += ' → ' + u.hostname + u.pathname
              } catch { /* skip invalid href */ }
            }
            if (charCount + line.length > maxChars) { collapsedCount++; continue }
            lines.push(line)
            charCount += line.length + 1
          }
        }

        return { text: lines.join('\n'), collapsedCount }
      }

      // ── Helper: build header metadata ──
      function buildHeader(): string {
        const scrollY = Math.round(window.scrollY)
        const totalH = document.documentElement.scrollHeight
        const vpH = window.innerHeight
        const hasMoreBelow = scrollY + vpH < totalH
        const hasMoreAbove = scrollY > 0

        let position = scrollY + '/' + totalH + 'px'
        position += ' viewport:' + vpH + 'px'
        const indicators: string[] = []
        if (hasMoreAbove) indicators.push('\u25b2more above')
        if (hasMoreBelow) indicators.push('\u25bcmore below')
        if (indicators.length > 0) position += ' [' + indicators.join(' ') + ']'

        let header = '=== ' + document.title + ' ===\n'
        header += 'URL: ' + location.href + '\n'
        header += 'Scroll: ' + position
        return header
      }

      // ── Viewport-only strategy ──
      const body = document.body
      if (!body) return { title: document.title, url: location.href, snapshot: '', interactiveCount: idx }
      const interactiveCount = idx

      const header = buildHeader()
      const BUDGET = 6000

      // Short pages (total height <= 2x viewport) get full content
      const totalH = document.documentElement.scrollHeight
      const vpH = window.innerHeight
      const isShortPage = totalH <= vpH * 2

      const result = isShortPage
        ? buildStructuredText(body, 0, false, BUDGET)
        : buildViewportSnapshot(body, BUDGET)

      let snapshot: string
      const sectionLabel = isShortPage ? 'Full page content' : 'Visible area'
      snapshot = header + '\n\n--- ' + sectionLabel + ' ---\n' + result.text
      if (result.collapsedCount > 0) {
        snapshot += '\n\n--- About ' + result.collapsedCount + ' more regions below ---\n[collapsed: scroll to see more content]'
      }

      // ── Page-level hints: detect content types and suggest read_page ──
      const hints: string[] = []

      // Detect video pages (video player + title but no visible article text in snapshot)
      const hasVideo = !!document.querySelector('video, iframe[src*="player"], iframe[src*="video"], [class*="player"], [class*="video-container"], [id*="player"]')
      if (hasVideo) {
        // Check if there's readable text on the page that snapshot doesn't show
        const pageText = (document.body?.innerText ?? '').trim()
        const snapshotChars = snapshot.replace(/[^a-zA-Z\u4e00-\u9fff]/g, '').length
        const pageChars = pageText.replace(/[^a-zA-Z\u4e00-\u9fff]/g, '').length
        if (pageChars > snapshotChars + 50) {
          hints.push('This page contains a video player with additional text content (description, comments). Use agent__read_page to read the text.')
        }
      }

      // Detect pages with text-heavy content that snapshot doesn't fully reveal
      // (for short pages that go through buildStructuredText which lacks text hints)
      if (isShortPage && hints.length === 0) {
        const allText = document.querySelectorAll('p, article, [class*="content"], [class*="description"], [class*="summary"]')
        let textCharCount = 0
        for (const el of allText) {
          textCharCount += ((el as HTMLElement).innerText?.trim().length ?? 0)
        }
        // If there's substantial text in <p> etc. but snapshot is short, add hint
        if (textCharCount > 200 && result.text.length < textCharCount * 0.5) {
          hints.push('This page has readable text content. Use agent__read_page to read the full text.')
        }
      }

      if (hints.length > 0) {
        snapshot += '\n\n--- Page hints ---\n' + hints.join('\n')
      }

      return { title: document.title, url: location.href, snapshot, interactiveCount }
    },
  })

  const data = result?.result as {
    title: string
    url: string
    snapshot: string
    interactiveCount: number
  } | null

  if (!data) {
    return { toolCallId: toolCall.id, content: 'Failed to capture page snapshot.', isError: true }
  }

  const content = JSON.stringify({
    title: data.title,
    url: data.url,
    snapshot: truncate(data.snapshot, SNAPSHOT_MAX_LEN),
    interactiveCount: data.interactiveCount,
  })

  return { toolCallId: toolCall.id, content, isError: false }
}

// ── Handler: elements ──

async function handleInteractiveElements(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const tabId = await resolveTabId(args.tabId as number | undefined)

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const elements = document.querySelectorAll('[data-agent-id]')
      const items: Array<{
        agentId: string; tag: string; type?: string; text?: string
        placeholder?: string; value?: string; href?: string
        rect: { x: number; y: number; w: number; h: number }
        isVisible: boolean; isDisabled: boolean
      }> = []

      for (const el of elements) {
        const htmlEl = el as HTMLElement
        const rect = htmlEl.getBoundingClientRect()
        const style = window.getComputedStyle(htmlEl)
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0

        const tag = htmlEl.tagName.toLowerCase()
        const item = {
          agentId: htmlEl.getAttribute('data-agent-id') ?? '',
          tag,
          type: (htmlEl as HTMLInputElement).type || undefined,
          text: htmlEl.innerText?.trim().slice(0, 100) || undefined,
          placeholder: (htmlEl as HTMLInputElement).placeholder || undefined,
          value: (htmlEl as HTMLInputElement).value?.slice(0, 100) || undefined,
          href: (htmlEl as HTMLAnchorElement).href || undefined,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
          isVisible,
          isDisabled: (htmlEl as HTMLInputElement).disabled ?? false,
        }
        items.push(item)
      }

      // Sort by vertical position
      items.sort((a, b) => a.rect.y - b.rect.y)
      return items
    },
  })

  const items = result?.result as Array<Record<string, unknown>> | null
  if (!items) {
    return { toolCallId: toolCall.id, content: 'Failed to get interactive elements.', isError: true }
  }

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify(items),
    isError: false,
  }
}

// ── Tool: agent__get_element_by_description ──

async function handleGetElementByDescription(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const description = args.description as string
  if (!description) {
    return { toolCallId: toolCall.id, content: 'Error: description is required', isError: true }
  }

  const tabId = await resolveTabId(args.tabId as number | undefined)

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (desc: string) => {
      const elements = document.querySelectorAll('[data-agent-id]')
      let bestMatch: {
        agentId: string; tag: string; type?: string; text?: string
        placeholder?: string; value?: string; href?: string
        rect: { x: number; y: number; w: number; h: number }
        isVisible: boolean; isDisabled: boolean; score: number
      } | null = null

      const descLower = desc.toLowerCase()

      for (const el of elements) {
        const htmlEl = el as HTMLElement
        const text = (htmlEl.innerText?.trim() ?? '').toLowerCase()
        const placeholder = ((htmlEl as HTMLInputElement).placeholder ?? '').toLowerCase()
        const ariaLabel = (htmlEl.getAttribute('aria-label') ?? '').toLowerCase()
        const title = (htmlEl.getAttribute('title') ?? '').toLowerCase()
        const value = ((htmlEl as HTMLInputElement).value ?? '').toLowerCase()
        // Also check aria-label on child elements (e.g. a div inside an <a>)
        const childAriaLabels = Array.from(htmlEl.querySelectorAll('[aria-label]'))
          .map(c => (c.getAttribute('aria-label') ?? '').toLowerCase())
          .join(' ')

        let score = 0

        // Exact match
        if (text === descLower) score = Math.max(score, 10)
        else if (placeholder === descLower) score = Math.max(score, 10)
        else if (ariaLabel === descLower) score = Math.max(score, 10)
        else if (title === descLower) score = Math.max(score, 10)
        else if (childAriaLabels.includes(descLower)) score = Math.max(score, 10)

        // Starts with
        if (score === 0) {
          if (text.startsWith(descLower)) score = Math.max(score, 7)
          else if (placeholder.startsWith(descLower)) score = Math.max(score, 7)
          else if (ariaLabel.startsWith(descLower)) score = Math.max(score, 7)
          else if (title.startsWith(descLower)) score = Math.max(score, 7)
          else if (childAriaLabels.split(' ').some(l => l.startsWith(descLower))) score = Math.max(score, 7)
        }

        // Contains
        if (score === 0) {
          if (text.includes(descLower)) score = Math.max(score, 4)
          else if (placeholder.includes(descLower)) score = Math.max(score, 4)
          else if (ariaLabel.includes(descLower)) score = Math.max(score, 4)
          else if (title.includes(descLower)) score = Math.max(score, 4)
          else if (value.includes(descLower)) score = Math.max(score, 4)
          else if (childAriaLabels.includes(descLower)) score = Math.max(score, 4)
        }

        if (score > 0) {
          const rect = htmlEl.getBoundingClientRect()
          const style = window.getComputedStyle(htmlEl)
          const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0

          if (!bestMatch || score > bestMatch.score) {
            bestMatch = {
              agentId: htmlEl.getAttribute('data-agent-id') ?? '',
              tag: htmlEl.tagName.toLowerCase(),
              type: (htmlEl as HTMLInputElement).type || undefined,
              text: htmlEl.innerText?.trim().slice(0, 100) || undefined,
              placeholder: (htmlEl as HTMLInputElement).placeholder || undefined,
              value: (htmlEl as HTMLInputElement).value?.slice(0, 100) || undefined,
              href: (htmlEl as HTMLAnchorElement).href || undefined,
              rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
              },
              isVisible,
              isDisabled: (htmlEl as HTMLInputElement).disabled ?? false,
              score,
            }
          }
        }
      }

      return bestMatch
    },
    args: [description],
  })

  const match = result?.result as Record<string, unknown> | null
  if (!match) {
    return {
      toolCallId: toolCall.id,
      content: JSON.stringify({
        error: `No element matching "${description}" found.`,
        hint: 'Call agent__page_info(info_type="snapshot") first to annotate elements with agentIds, then use the agentId from the snapshot.',
      }),
      isError: true,
    }
  }
  return {
    toolCallId: toolCall.id,
    content: JSON.stringify(match),
    isError: false,
  }
}

// ── Handler: scroll ──

async function handleScrollPosition(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const tabId = await resolveTabId(args.tabId as number | undefined)

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      scrollTop: Math.round(window.scrollY),
      scrollLeft: Math.round(window.scrollX),
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      hasMoreBelow: window.scrollY + window.innerHeight < document.documentElement.scrollHeight,
      hasMoreRight: window.scrollX + window.innerWidth < document.documentElement.scrollWidth,
    }),
  })

  const data = result?.result as Record<string, unknown> | null
  if (!data) {
    return { toolCallId: toolCall.id, content: 'Failed to get scroll position.', isError: true }
  }

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify(data),
    isError: false,
  }
}

// ── Handler: network ──

async function handleNetworkRequests(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const urlPattern = args.urlPattern as string | undefined
  const method = args.method as string | undefined
  const tabId = await resolveTabId(args.tabId as number | undefined)

  // Check if the tab is actually loaded (not an error page)
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-error://')) {
      return {
        toolCallId: toolCall.id,
        content: `Cannot inspect network requests: the current page is a browser error page or internal page (URL: ${tab.url || 'unknown'}). Try navigating to a valid website first.`,
        isError: true,
      }
    }
  } catch {
    return {
      toolCallId: toolCall.id,
      content: `Cannot inspect network requests: tab ${tabId} not found or inaccessible. Try calling agent__get_tabs first to find a valid tab.`,
      isError: true,
    }
  }

  try {
    // Use Performance API to retroactively query ALL network requests the page made.
    // This works even if the requests happened before the agent started running.
    // Note: chrome.scripting.executeScript args cannot contain undefined values.
    const scriptArgs = [urlPattern ?? null, method ?? null]
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (filterUrl: string | null, filterMethod: string | null) => {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
        const seen = new Map<string, { url: string; type: string; duration: number; size: number; count: number }>()

        for (const entry of entries) {
          const key = entry.name
          const existing = seen.get(key)
          if (existing) {
            existing.count++
            continue
          }
          seen.set(key, {
            url: entry.name,
            type: entry.initiatorType,
            duration: Math.round(entry.duration),
            size: entry.transferSize ?? 0,
            count: 1,
          })
        }

        let filtered = [...seen.values()]
        if (filterUrl) {
          const lower = filterUrl.toLowerCase()
          filtered = filtered.filter(r => r.url.toLowerCase().includes(lower))
        }
        if (filterMethod) {
          const m = filterMethod.toUpperCase()
          const xhrTypes = ['xmlhttprequest', 'fetch']
          if (m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') {
            filtered = filtered.filter(r => xhrTypes.includes(r.type))
          }
        }
        return filtered.slice(0, 100)
      },
      args: scriptArgs,
    })

    const requests = results?.[0]?.result as Array<Record<string, unknown>> ?? []

    return {
      toolCallId: toolCall.id,
      content: JSON.stringify(requests),
      isError: false,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      toolCallId: toolCall.id,
      content: `Failed to inspect network requests: ${msg}. The page may have restricted access. Try agent__page_info(info_type="snapshot") to see if the page loaded correctly.`,
      isError: true,
    }
  }
}

// ── Tool: agent__get_page_screenshot ──

async function handleGetPageScreenshot(toolCall: ToolCall): Promise<ToolResult> {
  // This handler is a no-op when screenshot is handled by BridgeClient.
  // It only fires if the tool call reaches background (legacy path).
  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ error: 'Screenshot must be executed from sidepanel context' }),
    isError: true,
  }
}

// ── Tool: agent__read_page ──

type ReadPageScope = 'viewport' | 'element' | 'page'

async function handleReadPage(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const scope = (args.scope as ReadPageScope) || 'viewport'
  const maxChars = typeof args.maxChars === 'number' ? args.maxChars : 8000
  const target = args.target as { agentId?: string; selector?: string } | undefined
  let tabId: number
  try {
    tabId = await resolveTabId(args.tabId as number | undefined)
  } catch {
    return { toolCallId: toolCall.id, content: 'Failed to resolve tab. No active tab found.', isError: true }
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (
        _scope: string,
        _target: { agentId?: string; selector?: string } | undefined,
        _maxChars: number,
      ) => {
        const maxChars = Math.min(Math.max(_maxChars, 500), 30000)

        // ── Helpers ──
        function shouldSkip(el: Element): boolean {
          const tag = el.tagName.toLowerCase()
          if (['script', 'style', 'svg', 'noscript', 'iframe', 'path', 'br', 'hr'].includes(tag)) return true
          if (el.getAttribute('hidden') !== null) return true
          if (el.getAttribute('aria-hidden') === 'true') return true
          const style = window.getComputedStyle(el as HTMLElement)
          if (style.display === 'none' || style.visibility === 'hidden') return true
          return false
        }

        function isNoiseContainer(el: Element): boolean {
          const tag = el.tagName.toLowerCase()
          if (['nav', 'footer', 'aside', 'header'].includes(tag)) return true
          if (el.getAttribute('role') === 'navigation') return true
          if (el.getAttribute('role') === 'complementary') return true
          return false
        }

        // ── Viewport mode ──
        function readViewport(): { content: string; contentLength: number; truncated: boolean } {
          const vpHeight = window.innerHeight
          const blocks: Array<{ y: number; text: string }> = []

          // Only query block-level text containers (not span/div which are too numerous)
          const candidates = document.querySelectorAll('p, article, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, pre, figure, figcaption, [role="article"]')
          for (const el of candidates) {
            try {
              if (shouldSkip(el)) continue
              if (isNoiseContainer(el)) continue
              const rect = el.getBoundingClientRect()
              if (rect.bottom <= 0 || rect.top >= vpHeight) continue

              const text = (el as HTMLElement).innerText?.trim() ?? ''
              if (text.length < 10) continue

              blocks.push({ y: rect.top, text })
            } catch {
              // Skip elements that throw on access
            }
          }

          // Sort by visual position
          blocks.sort((a, b) => a.y - b.y)

          // Deduplicate: keep longer text when blocks overlap
          const deduped: string[] = []
          for (const block of blocks) {
            const isDuplicate = deduped.some(existing =>
              existing.includes(block.text) && block.text.length <= existing.length
            )
            if (!isDuplicate) {
              // Remove any existing entries that are fully contained in this new (longer) block
              for (let i = deduped.length - 1; i >= 0; i--) {
                if (block.text.includes(deduped[i]) && deduped[i].length <= block.text.length) {
                  deduped.splice(i, 1)
                }
              }
              deduped.push(block.text)
            }
          }

          let content = deduped.join('\n\n')
          const fullLength = content.length
          let truncated = false
          if (content.length > maxChars) {
            content = content.slice(0, maxChars)
            truncated = true
          }

          return { content, contentLength: fullLength, truncated }
        }

        // ── Element mode ──
        function readElement(): { content: string; contentLength: number; truncated: boolean; found: boolean } {
          let el: Element | null = null
          if (_target?.agentId) {
            el = document.querySelector('[data-agent-id="' + _target.agentId + '"]')
          }
          if (!el && _target?.selector) {
            try { el = document.querySelector(_target.selector) } catch { /* invalid selector */ }
          }
          if (!el) {
            return { content: '', contentLength: 0, truncated: false, found: false }
          }

          const content = (el as HTMLElement).innerText?.trim() ?? ''
          const fullLength = content.length
          let truncated = false
          const result = content.length > maxChars ? (truncated = true, content.slice(0, maxChars)) : content
          return { content: result, contentLength: fullLength, truncated, found: true }
        }

        // ── Page mode ──
        function readPage(): { content: string; contentLength: number; truncated: boolean } {
          // Try to find main content area: article → [role="main"] → main → body
          let mainEl: Element | null = document.querySelector('article')
          if (!mainEl) mainEl = document.querySelector('[role="main"]')
          if (!mainEl) mainEl = document.querySelector('main')
          if (!mainEl) mainEl = document.body

          if (!mainEl) return { content: '', contentLength: 0, truncated: false }

          // Temporarily hide noise elements to get clean innerText
          const hiddenEls: Array<{ el: HTMLElement; prev: string }> = []
          const noiseSelectors = 'nav, footer, aside, [role="navigation"], [role="complementary"], [role="banner"], script, style, noscript, iframe'
          for (const noise of mainEl.querySelectorAll(noiseSelectors)) {
            const htmlNoise = noise as HTMLElement
            hiddenEls.push({ el: htmlNoise, prev: htmlNoise.style.display })
            htmlNoise.style.display = 'none'
          }

          let content: string
          try {
            content = (mainEl as HTMLElement).innerText?.trim() ?? ''
          } finally {
            // ALWAYS restore hidden elements, even if innerText throws
            for (const { el, prev } of hiddenEls) {
              el.style.display = prev
            }
          }

          const fullLength = content.length
          let truncated = false
          const result = content.length > maxChars ? (truncated = true, content.slice(0, maxChars)) : content
          return { content: result, contentLength: fullLength, truncated }
        }

        // ── Execute mode ──
        try {
          switch (_scope) {
            case 'element': return readElement()
            case 'page': return readPage()
            default: return readViewport()
          }
        } catch (e) {
          return { content: 'Error reading page: ' + (e instanceof Error ? e.message : String(e)), contentLength: 0, truncated: false }
        }
      },
      args: [scope, target ?? null, maxChars],
    })

    const data = result?.result as { content: string; contentLength: number; truncated: boolean; found?: boolean } | null

    if (!data) {
      return { toolCallId: toolCall.id, content: 'Failed to read page content. The page may be restricted or no content was found.', isError: true }
    }

    // Element mode with no element found — return clear error
    if (scope === 'element' && data.found === false) {
      return {
        toolCallId: toolCall.id,
        content: JSON.stringify({
          mode: scope,
          content: '',
          contentLength: 0,
          truncated: false,
          error: 'Element not found. Call get_page_snapshot first to annotate elements, or check the selector.',
        }),
        isError: true,
      }
    }

    // Runtime error from inside executeScript
    if (data.content?.startsWith('Error reading page:')) {
      return { toolCallId: toolCall.id, content: JSON.stringify({ mode: scope, ...data }), isError: true }
    }

    // Empty content — not an error, but signal clearly
    if (data.contentLength === 0) {
      return {
        toolCallId: toolCall.id,
        content: JSON.stringify({
          mode: scope,
          content: '',
          contentLength: 0,
          truncated: false,
          hint: 'No text content found in the current scope. Try a different scope or scroll to a content area.',
        }),
        isError: false,
      }
    }

    return {
      toolCallId: toolCall.id,
      content: JSON.stringify({
        mode: scope,
        content: data.content,
        contentLength: data.contentLength,
        truncated: data.truncated,
      }),
      isError: false,
    }
  } catch (e) {
    // executeScript itself threw (tab closed, restricted page, etc.)
    const msg = e instanceof Error ? e.message : String(e)
    return { toolCallId: toolCall.id, content: 'Failed to read page: ' + msg, isError: true }
  }
}

// ── Tool: agent__select_element ──

async function handleSelectElement(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const instruction = args.instruction as string

  if (!instruction) {
    return { toolCallId: toolCall.id, content: 'Error: instruction is required', isError: true }
  }

  const SELECT_ELEMENT_TIMEOUT_MS = 120_000 // 2 minutes

  const tabId = await resolveTabId(args.tabId as number | undefined)

  // Inject the element selection overlay
  const [injectResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (instr: string, toolCallId: string) => {
      // Remove any existing overlay
      const existing = document.getElementById('agent-select-overlay')
      if (existing) existing.remove()

      // Create overlay container
      const overlay = document.createElement('div')
      overlay.id = 'agent-select-overlay'
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 2147483647;
        background: rgba(0, 0, 0, 0.1);
        cursor: crosshair;
        font-family: system-ui, -apple-system, sans-serif;
      `

      // Create instruction banner
      const banner = document.createElement('div')
      banner.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #1a1a1a;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        max-width: 400px;
        text-align: center;
        z-index: 2147483648;
      `
      banner.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px;">🎯 Select an Element</div>
        <div style="font-size: 14px; opacity: 0.9; margin-bottom: 12px;">${instr}</div>
        <button id="agent-select-cancel" style="
          background: #ef4444;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
        ">Cancel</button>
      `
      overlay.appendChild(banner)

      // Track hovered element
      let hoverOutline: HTMLDivElement | null = null

      // Mouse move handler - highlight element under cursor
      const onMouseMove = (e: MouseEvent) => {
        if (hoverOutline) {
          hoverOutline.remove()
          hoverOutline = null
        }

        const target = e.target as HTMLElement
        if (!target || target.id === 'agent-select-overlay' || target.id === 'agent-select-cancel' || target.closest?.('#agent-select-overlay')) {
          return
        }

        const rect = target.getBoundingClientRect()
        hoverOutline = document.createElement('div')
        hoverOutline.style.cssText = `
          position: fixed;
          left: ${rect.left}px;
          top: ${rect.top}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
          border: 2px solid #3b82f6;
          background: rgba(59, 130, 246, 0.1);
          pointer-events: none;
          z-index: 2147483646;
        `
        document.body.appendChild(hoverOutline)
      }

      // Click handler - select element and send result
      const onClick = (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        const target = e.target as HTMLElement
        if (!target || target.id === 'agent-select-cancel' || target.closest?.('#agent-select-overlay')) {
          return
        }

        // Get agentId if exists
        const agentId = target.getAttribute('data-agent-id')

        // Clean up overlay
        overlay.removeEventListener('mousemove', onMouseMove)
        overlay.removeEventListener('click', onClick)
        overlay.remove()
        if (hoverOutline) hoverOutline.remove()

        // Send result to background
        chrome.runtime.sendMessage({
          type: 'agent_select_element_response',
          toolCallId,
          result: agentId ? {
            agentId,
            tag: target.tagName.toLowerCase(),
            text: target.innerText?.trim().slice(0, 100) || undefined,
          } : null,
        }).catch(() => {
          console.error('Failed to send element selection result')
        })
      }

      // Cancel handler
      const onCancel = () => {
        overlay.removeEventListener('mousemove', onMouseMove)
        overlay.removeEventListener('click', onClick)
        overlay.remove()
        if (hoverOutline) hoverOutline.remove()

        chrome.runtime.sendMessage({
          type: 'agent_select_element_response',
          toolCallId,
          result: null,
        }).catch(() => {
          console.error('Failed to send element selection cancel')
        })
      }

      overlay.addEventListener('mousemove', onMouseMove)
      overlay.addEventListener('click', onClick, true)
      document.getElementById('agent-select-cancel')?.addEventListener('click', onCancel)

      document.body.appendChild(overlay)
    },
    args: [instruction, toolCall.id],
  })

  if (!injectResult) {
    return { toolCallId: toolCall.id, content: 'Failed to inject element selection overlay.', isError: true }
  }

  // Send message to sidepanel to show selection dialog
  chrome.runtime.sendMessage({
    type: 'agent_select_element',
    toolCallId: toolCall.id,
    instruction,
  }).catch(() => {
    // Sidepanel may not be open, ignore
  })

  // Wait for user selection or timeout
  const result = await new Promise<{ agentId: string; tag: string; text?: string } | null>((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(null)
    }, SELECT_ELEMENT_TIMEOUT_MS)

    const wrappedResolve = (value: { agentId: string; tag: string; text?: string } | null) => {
      clearTimeout(timeoutId)
      resolve(value)
    }

    const bridge = getBridgeService()
    if (bridge) {
      bridge.registerSelectElementPending(toolCall.id, wrappedResolve)
    }

    // Also clean up overlay on timeout
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const overlay = document.getElementById('agent-select-overlay')
        if (overlay) overlay.remove()
      },
    }).catch(() => {
      // Ignore cleanup errors
    })
  })

  // Clean up resolver
  const bridge = getBridgeService()
  if (bridge) {
    bridge.resolveSelectElement(toolCall.id, null)
  }

  // Send message to sidepanel to close the dialog
  chrome.runtime.sendMessage({
    type: 'agent_select_element_complete',
    toolCallId: toolCall.id,
  }).catch(() => {
    // Sidepanel may not be open, ignore
  })

  if (!result) {
    return {
      toolCallId: toolCall.id,
      content: 'Element selection was cancelled or timed out. You may try again with a clearer instruction, or use agent__get_element_by_description as an alternative.',
      isError: false,
    }
  }

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({
      agentId: result.agentId,
      tag: result.tag,
      text: result.text,
    }),
    isError: false,
  }
}

// Singleton reference for select_element bridge communication
let _bridgeService: BridgeService | null = null

export function setBridgeService(bridge: BridgeService): void {
  _bridgeService = bridge
}

function getBridgeService(): BridgeService | null {
  return _bridgeService
}

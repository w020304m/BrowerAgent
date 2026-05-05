/**
 * Action layer: 6 tools for page interaction.
 * All run in background context, using executeScript for DOM operations.
 */

import type { ToolCall, ToolResult } from '@/types/tool'
import type { BridgeService } from '../bridge/bridge-service'
import { resolveTabId } from './helpers'

export function registerActionHandlers(bridge: BridgeService): void {
  bridge.register('agent__click', handleClick)
  bridge.register('agent__type', handleType)
  bridge.register('agent__select', handleSelect)
  bridge.register('agent__scroll', handleScroll)
  bridge.register('agent__drag_and_drop', handleDragAndDrop)
  bridge.register('agent__wait_for', handleWaitFor)
}

// ── Helper: resolve element by agentId or CSS selector ──

function resolveTargetArg(args: Record<string, unknown>): { agentId?: string; selector?: string } {
  const target = args.target as Record<string, unknown> | undefined
  // Ensure only serializable string values — LLM may send non-string types
  const toString = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v : undefined
  if (target) {
    return { agentId: toString(target.agentId), selector: toString(target.selector) }
  }
  return { agentId: toString(args.agentId), selector: toString(args.selector) }
}

// ── Tool: agent__click ──

async function handleClick(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const { agentId, selector } = resolveTargetArg(args)
  const isHover = (args.hover as boolean) ?? false
  const tabId = await resolveTabId(args.tabId as number | undefined)

  // Hover mode: just dispatch mouseover/mouseenter/mousemove events
  if (isHover) {
    return handleHoverInternal(toolCall, agentId, selector, tabId)
  }

  // Click mode (default)
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (aId: string | undefined, sel: string | undefined) => {
      const resolveElement = (agentId: string | undefined, cssSelector: string | undefined): HTMLElement | null => {
        if (agentId) {
          return document.querySelector(`[data-agent-id="${agentId}"]`) as HTMLElement | null
        }
        if (cssSelector) {
          try {
            return document.querySelector(cssSelector) as HTMLElement | null
          } catch { return null }
        }
        return null
      }

      const el = resolveElement(aId, sel)
      if (!el) return { success: false, error: `Element not found: ${aId ?? sel ?? 'unknown'}. The page may have changed after navigation. Call get_page_snapshot first to get fresh element IDs.` }

      // Detect <a target="_blank"> — popup blocker prevents these in executeScript
      if (el.tagName === 'A') {
        const anchor = el as HTMLAnchorElement
        if (anchor.target === '_blank' && anchor.href) {
          return { success: true, requiresExtensionNavigation: true, href: anchor.href }
        }
      }

      // Scroll into view if needed
      const rect = el.getBoundingClientRect()
      if (rect.y < 0 || rect.y > window.innerHeight || rect.x < 0 || rect.x > window.innerWidth) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' })
      }

      // Simulate click with coordinates
      const updatedRect = el.getBoundingClientRect()
      const x = updatedRect.x + updatedRect.width / 2
      const y = updatedRect.y + updatedRect.height / 2
      el.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }))
      el.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true }))
      el.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }))

      return { success: true, tagName: el.tagName, text: el.innerText?.slice(0, 100) ?? '' }
    },
    args: [agentId ?? null, selector ?? null],
  })

  const r = result?.result as {
    success: boolean; error?: string; tagName?: string; text?: string
    requiresExtensionNavigation?: boolean; href?: string
  } | null

  if (!r?.success) {
    return { toolCallId: toolCall.id, content: r?.error ?? 'Click failed.', isError: true }
  }

  // Handle target="_blank" by opening in new tab from extension context
  if (r.requiresExtensionNavigation && r.href) {
    const newTab = await chrome.tabs.create({ url: r.href })
    return {
      toolCallId: toolCall.id,
      content: JSON.stringify({
        success: true,
        openedNewTab: true,
        tabId: newTab.id,
        url: r.href,
        hint: 'A new tab was opened. Call agent__page_info(info_type="snapshot") or agent__read_page with tabId=' + newTab.id + ' to read the page content.',
      }),
      isError: false,
    }
  }

  // Check if the click likely caused a navigation by comparing URL after a brief delay
  let preClickUrl: string | undefined
  try {
    const preTab = await chrome.tabs.get(tabId)
    preClickUrl = preTab.url
  } catch { /* tab might have closed */ }

  // Brief delay to allow navigation to start
  await new Promise(resolve => setTimeout(resolve, 500))

  let navigated = false
  try {
    const postTab = await chrome.tabs.get(tabId)
    navigated = !!preClickUrl && !!postTab.url && preClickUrl !== postTab.url
  } catch { /* ignore */ }

  if (navigated) {
    return {
      toolCallId: toolCall.id,
      content: JSON.stringify({
        success: true,
        navigated: true,
        hint: 'Page navigated. Call get_page_snapshot to see the new page, then read_page if you need the text content.',
      }),
      isError: false,
    }
  }

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ success: true, tagName: r.tagName, text: r.text }),
    isError: false,
  }
}

// ── Tool: agent__type ──

async function handleType(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const { agentId, selector } = resolveTargetArg(args)
  const text = args.text as string | undefined
  const clear = (args.clear as boolean) ?? false
  const pressEnter = (args.pressEnter as boolean) ?? false
  const keys = args.keys as string | undefined
  const tabId = await resolveTabId(args.tabId as number | undefined)

  // Keys-only mode: press a key without typing text (former agent__press_key)
  if (!text && keys) {
    return handlePressKeyInternal(toolCall, keys, agentId, selector, tabId)
  }

  // Text typing mode (original agent__type behavior)
  if (!text) {
    return { toolCallId: toolCall.id, content: 'Error: text or keys is required', isError: true }
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (aId: string | undefined, sel: string | undefined, txt: string, shouldClear: boolean, shouldEnter: boolean) => {
      const resolveElement = (agentId: string | undefined, cssSelector: string | undefined): HTMLElement | null => {
        if (agentId) return document.querySelector(`[data-agent-id="${agentId}"]`) as HTMLElement | null
        if (cssSelector) {
          try { return document.querySelector(cssSelector) as HTMLElement | null }
          catch { return null }
        }
        return null
      }

      const el = resolveElement(aId, sel) as HTMLInputElement | HTMLTextAreaElement | null
      if (!el) return { success: false, error: `Element not found: ${aId ?? sel ?? 'unknown'}. The page may have changed after navigation. Call agent__page_info(info_type="snapshot") first to get fresh element IDs.` }

      // Focus
      el.focus()

      // Clear if requested
      if (shouldClear) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
          'value'
        )?.set
        if (nativeSetter) nativeSetter.call(el, '')
        else el.value = ''
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }

      // Type character by character
      for (let i = 0; i < txt.length; i++) {
        const char = txt[i]
        el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))

        // Use native input setter for React/Vue compatibility
        const nativeSetter = Object.getOwnPropertyDescriptor(
          el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
          'value'
        )?.set
        if (nativeSetter) {
          nativeSetter.call(el, el.value + char)
        } else {
          el.value += char
        }

        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
      }

      // Press Enter if requested
      if (shouldEnter) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
        el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }))
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }))
      }

      return { success: true, finalValue: el.value.slice(0, 200) }
    },
    args: [agentId ?? null, selector ?? null, text, clear, pressEnter],
  })

  const r = result?.result as { success: boolean; error?: string; finalValue?: string } | null
  if (!r?.success) {
    return { toolCallId: toolCall.id, content: r?.error ?? 'Type failed.', isError: true }
  }

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ success: true, finalValue: r.finalValue }),
    isError: false,
  }
}

// ── Internal: press key logic (used by agent__type with keys param) ──

async function handlePressKeyInternal(
  toolCall: ToolCall,
  key: string,
  agentId: string | undefined,
  selector: string | undefined,
  tabId: number,
): Promise<ToolResult> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (keyArg: string, aId: string | undefined, sel: string | undefined) => {
      // Key mapping
      const keyMap: Record<string, string> = {
        enter: 'Enter', tab: 'Tab', escape: 'Escape', esc: 'Escape',
        backspace: 'Backspace', delete: 'Delete', space: ' ',
        arrowup: 'ArrowUp', arrowdown: 'ArrowDown',
        arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
        pageup: 'PageUp', pagedown: 'PageDown',
        home: 'Home', end: 'End',
      }
      const mappedKey = keyMap[keyArg.toLowerCase()] ?? keyArg

      // Focus target if provided
      if (aId || sel) {
        let targetEl: HTMLElement | null = null
        if (aId) targetEl = document.querySelector(`[data-agent-id="${aId}"]`) as HTMLElement | null
        else if (sel) {
          try { targetEl = document.querySelector(sel) as HTMLElement | null }
          catch { /* invalid */ }
        }
        if (targetEl) targetEl.focus()
      }

      // Dispatch key events on the active element
      const target = document.activeElement ?? document.body
      target.dispatchEvent(new KeyboardEvent('keydown', { key: mappedKey, bubbles: true }))
      target.dispatchEvent(new KeyboardEvent('keypress', { key: mappedKey, bubbles: true }))
      target.dispatchEvent(new KeyboardEvent('keyup', { key: mappedKey, bubbles: true }))

      return { success: true, key: mappedKey }
    },
    args: [key, agentId ?? null, selector ?? null],
  })

  const r = result?.result as Record<string, unknown> | null
  if (!r) {
    return { toolCallId: toolCall.id, content: 'Press key failed: script returned no result', isError: true }
  }
  return {
    toolCallId: toolCall.id,
    content: JSON.stringify(r),
    isError: false,
  }
}

// ── Tool: agent__select ──

async function handleSelect(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const { agentId, selector } = resolveTargetArg(args)
  const value = args.value as string
  const tabId = await resolveTabId(args.tabId as number | undefined)

  if (!value) {
    return { toolCallId: toolCall.id, content: 'Error: value is required', isError: true }
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (aId: string | undefined, sel: string | undefined, val: string) => {
      const resolveElement = (agentId: string | undefined, cssSelector: string | undefined): HTMLElement | null => {
        if (agentId) return document.querySelector(`[data-agent-id="${agentId}"]`) as HTMLElement | null
        if (cssSelector) {
          try { return document.querySelector(cssSelector) as HTMLElement | null }
          catch { return null }
        }
        return null
      }

      const el = resolveElement(aId, sel)
      if (!el) return { success: false, error: `Element not found: ${aId ?? sel ?? 'unknown'}. The page may have changed after navigation. Call get_page_snapshot first to get fresh element IDs.` }

      // Native <select>
      if (el.tagName === 'SELECT') {
        const select = el as HTMLSelectElement
        select.value = val
        select.dispatchEvent(new Event('change', { bubbles: true }))
        return { success: true, selectedValue: select.value }
      }

      // Custom dropdown: click trigger, find matching option
      el.click()
      // Wait briefly for dropdown to render
      const options = document.querySelectorAll('[role="option"], li, [data-option]')
      for (const opt of options) {
        const optText = opt.textContent?.trim() ?? ''
        const optValue = (opt as HTMLElement).dataset?.value ?? opt.getAttribute('value') ?? ''
        if (optText === val || optValue === val) {
          ;(opt as HTMLElement).click()
          return { success: true, selectedValue: optText || optValue }
        }
      }

      return { success: false, error: `Option "${val}" not found in dropdown` }
    },
    args: [agentId ?? null, selector ?? null, value],
  })

  const r = result?.result as { success: boolean; error?: string; selectedValue?: string } | null
  if (!r?.success) {
    return { toolCallId: toolCall.id, content: r?.error ?? 'Select failed.', isError: true }
  }

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ success: true, selectedValue: r.selectedValue }),
    isError: false,
  }
}

// ── Tool: agent__scroll ──

async function handleScroll(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const direction = args.direction as string | undefined
  const amount = (args.amount as number) ?? 300
  const scrollSelector = args.selector as string | undefined
  const toBottom = args.toBottom as boolean | undefined
  const tabId = await resolveTabId(args.tabId as number | undefined)

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (dir: string | undefined, amt: number, sel: string | undefined, bottom: boolean | undefined) => {
      if (bottom) {
        window.scrollTo(0, document.documentElement.scrollHeight)
        return { success: true, scrolledTo: 'bottom' }
      }

      if (sel) {
        try {
          const el = document.querySelector(sel) as HTMLElement | null
          if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'instant' })
            return { success: true, scrolledTo: sel }
          }
        } catch { /* invalid selector */ }
      }

      // Direction-based scroll
      let dx = 0, dy = 0
      switch (dir) {
        case 'up': dy = -amt; break
        case 'down': dy = amt; break
        case 'left': dx = -amt; break
        case 'right': dx = amt; break
        default: dy = amt
      }
      window.scrollBy(dx, dy)
      return { success: true, scrollX: window.scrollX, scrollY: window.scrollY }
    },
    args: [direction ?? null, amount, scrollSelector ?? null, toBottom ?? null],
  })

  const r = result?.result as Record<string, unknown> | null
  if (!r) {
    return { toolCallId: toolCall.id, content: 'Scroll failed: script returned no result', isError: true }
  }
  return {
    toolCallId: toolCall.id,
    content: JSON.stringify(r),
    isError: false,
  }
}

// ── Internal: hover logic (used by agent__click with hover=true) ──

async function handleHoverInternal(
  toolCall: ToolCall,
  agentId: string | undefined,
  selector: string | undefined,
  tabId: number,
): Promise<ToolResult> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (aId: string | undefined, sel: string | undefined) => {
      const resolveElement = (agentId: string | undefined, cssSelector: string | undefined): HTMLElement | null => {
        if (agentId) return document.querySelector(`[data-agent-id="${agentId}"]`) as HTMLElement | null
        if (cssSelector) {
          try { return document.querySelector(cssSelector) as HTMLElement | null }
          catch { return null }
        }
        return null
      }

      const el = resolveElement(aId, sel)
      if (!el) return { success: false, error: `Element not found: ${aId ?? sel ?? 'unknown'}. The page may have changed after navigation. Call agent__page_info(info_type="snapshot") first to get fresh element IDs.` }

      const rect = el.getBoundingClientRect()
      const x = rect.x + rect.width / 2
      const y = rect.y + rect.height / 2

      el.dispatchEvent(new MouseEvent('mouseover', { clientX: x, clientY: y, bubbles: true }))
      el.dispatchEvent(new MouseEvent('mouseenter', { clientX: x, clientY: y, bubbles: false }))
      el.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))

      return { success: true }
    },
    args: [agentId ?? null, selector ?? null],
  })

  const r = result?.result as { success: boolean; error?: string } | null
  if (!r?.success) {
    return { toolCallId: toolCall.id, content: r?.error ?? 'Hover failed.', isError: true }
  }

  return { toolCallId: toolCall.id, content: JSON.stringify({ success: true }), isError: false }
}

// ── Tool: agent__drag_and_drop ──

async function handleDragAndDrop(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const from = args.from as Record<string, string> | undefined
  const to = args.to as Record<string, string> | undefined
  const tabId = await resolveTabId(args.tabId as number | undefined)

  if (!from || !to) {
    return { toolCallId: toolCall.id, content: 'Error: from and to are required', isError: true }
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (fromArg: Record<string, string>, toArg: Record<string, string>) => {
      const resolveElement = (target: Record<string, string>): HTMLElement | null => {
        if (target.agentId) return document.querySelector(`[data-agent-id="${target.agentId}"]`) as HTMLElement | null
        if (target.selector) {
          try { return document.querySelector(target.selector) as HTMLElement | null }
          catch { return null }
        }
        return null
      }

      const fromEl = resolveElement(fromArg)
      const toEl = resolveElement(toArg)

      if (!fromEl) return { success: false, error: 'From element not found' }
      if (!toEl) return { success: false, error: 'To element not found' }

      // HTML5 drag event sequence
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', fromEl.id ?? '')

      fromEl.dispatchEvent(new DragEvent('dragstart', { dataTransfer, bubbles: true }))
      fromEl.dispatchEvent(new DragEvent('drag', { dataTransfer, bubbles: true }))

      const toRect = toEl.getBoundingClientRect()
      toEl.dispatchEvent(new DragEvent('dragenter', {
        clientX: toRect.x + toRect.width / 2,
        clientY: toRect.y + toRect.height / 2,
        dataTransfer, bubbles: true,
      }))
      toEl.dispatchEvent(new DragEvent('dragover', { dataTransfer, bubbles: true }))
      toEl.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true }))
      fromEl.dispatchEvent(new DragEvent('dragend', { dataTransfer, bubbles: true }))

      return { success: true }
    },
    args: [from ?? {}, to ?? {}],
  })

  const r = result?.result as { success: boolean; error?: string } | null
  if (!r?.success) {
    return { toolCallId: toolCall.id, content: r?.error ?? 'Drag and drop failed.', isError: true }
  }

  return { toolCallId: toolCall.id, content: JSON.stringify({ success: true }), isError: false }
}

// ── Tool: agent__wait_for ──

async function handleWaitFor(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const condition = args.condition as string | undefined
  const value = args.value as string | undefined
  const timeout = (args.timeout as number) ?? 5000
  const tabId = await resolveTabId(args.tabId as number | undefined)

  if (!condition) {
    return { toolCallId: toolCall.id, content: 'Error: condition is required', isError: true }
  }

  // Handle networkIdle in background context
  if (condition === 'networkIdle') {
    const idleMs = (args.idleMs as number) ?? 2000
    const startTime = Date.now()
    let lastRequestTime = 0

    while (Date.now() - startTime < timeout) {
      const stored = await chrome.storage.session.get('agent_network_log')
      const requests: Array<{ timestamp: number }> = stored?.agent_network_log ?? []
      const recentRequests = requests.filter((r) => r.timestamp > Date.now() - idleMs)
      if (recentRequests.length === 0 && Date.now() - startTime > 1000) {
        return {
          toolCallId: toolCall.id,
          content: JSON.stringify({ success: true, waitedMs: Date.now() - startTime }),
          isError: false,
        }
      }
      lastRequestTime = recentRequests.length > 0 ? recentRequests[recentRequests.length - 1].timestamp : lastRequestTime
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    return {
      toolCallId: toolCall.id,
      content: JSON.stringify({ success: false, error: 'Timeout waiting for network idle' }),
      isError: false,
    }
  }

  // Handle page-context conditions via executeScript
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (cond: string, val: string | undefined, timeoutMs: number) => {
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        const check = (): boolean => {
          switch (cond) {
            case 'selector':
              return val ? document.querySelector(val) !== null : false
            case 'text':
              return val ? document.body?.innerText.includes(val) ?? false : false
            case 'url':
              return val ? location.href.includes(val) : false
            case 'navigation':
              return document.readyState === 'complete'
            default:
              return false
          }
        }

        if (check()) {
          resolve({ success: true })
          return
        }

        const observer = new MutationObserver(() => {
          if (check()) {
            observer.disconnect()
            clearInterval(pollInterval)
            resolve({ success: true })
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })

        const pollInterval = window.setInterval(() => {
          if (check()) {
            observer.disconnect()
            clearInterval(pollInterval)
            resolve({ success: true })
          }
        }, 200)

        setTimeout(() => {
          observer.disconnect()
          clearInterval(pollInterval)
          resolve({ success: false, error: `Timeout waiting for ${cond}: ${val ?? ''}` })
        }, timeoutMs)
      })
    },
    args: [condition, value ?? null, timeout],
  })

  const r = result?.result as { success: boolean; error?: string } | null
  return {
    toolCallId: toolCall.id,
    content: JSON.stringify(r ?? { success: false }),
    isError: false,
  }
}

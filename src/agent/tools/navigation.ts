/**
 * Navigation layer: 4 tools for tab management.
 * All run in background context using chrome.tabs.* APIs.
 */

import type { ToolCall, ToolResult } from '@/types/tool'
import type { BridgeService } from '../bridge/bridge-service'
import { resolveTabId, waitForTabLoad } from './helpers'

/** Validate that a URL string is well-formed and uses an allowed scheme. */
function validateUrl(url: string): { valid: true } | { valid: false; error: string } {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { valid: false, error: `Invalid URL format: "${url}". URLs must be well-formed (e.g. https://example.com).` }
  }
  const allowedSchemes = ['http:', 'https:']
  if (!allowedSchemes.includes(parsed.protocol)) {
    return { valid: false, error: `URL scheme "${parsed.protocol}" is not allowed. Use http:// or https://.` }
  }
  if (!parsed.hostname || parsed.hostname === '') {
    return { valid: false, error: `URL is missing a hostname: "${url}".` }
  }
  return { valid: true }
}

export function registerNavigationHandlers(bridge: BridgeService): void {
  bridge.register('agent__navigate', handleNavigate)
  bridge.register('agent__navigate_history', handleNavigateHistory)
  bridge.register('agent__open_tab', handleOpenTab)
  bridge.register('agent__switch_tab', handleSwitchTab)
  bridge.register('agent__close_tab', handleCloseTab)
  bridge.register('agent__get_tabs', handleGetTabs)
}

// ── Tool: agent__navigate ──

async function handleNavigate(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const url = args.url as string

  if (!url) {
    return { toolCallId: toolCall.id, content: 'Error: url is required', isError: true }
  }

  const urlCheck = validateUrl(url)
  if (!urlCheck.valid) {
    return { toolCallId: toolCall.id, content: urlCheck.error, isError: true }
  }

  const tabId = await resolveTabId(args.tabId as number | undefined)

  await chrome.tabs.update(tabId, { url })
  await waitForTabLoad(tabId, 10000)

  const tab = await chrome.tabs.get(tabId)
  const finalUrl = tab.url ?? ''

  // Detect error pages (unreachable URLs, DNS failures, etc.)
  if (finalUrl.startsWith('chrome-error://')) {
    return {
      toolCallId: toolCall.id,
      content: JSON.stringify({
        success: false,
        error: `Navigation failed: the page could not be loaded. The URL "${url}" may be unreachable, the site may be down, or the URL may be invalid. Try a different URL or use agent__web_search to find the correct one.`,
        requestedUrl: url,
      }),
      isError: true,
    }
  }

  // Empty URL after navigation means the page didn't load properly
  if (!finalUrl || finalUrl === 'about:blank') {
    return {
      toolCallId: toolCall.id,
      content: JSON.stringify({
        success: false,
        error: `Navigation failed: page loaded but returned an empty URL. The URL "${url}" may be unreachable or blocked. Try a different URL or use agent__web_search to find the correct one.`,
        requestedUrl: url,
      }),
      isError: true,
    }
  }

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ success: true, url: finalUrl, title: tab.title ?? '' }),
    isError: false,
  }
}

// ── Tool: agent__navigate_history ──

async function handleNavigateHistory(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const direction = args.direction as string
  const tabId = await resolveTabId(args.tabId as number | undefined)

  if (direction === 'back') {
    await chrome.tabs.goBack(tabId)
  } else if (direction === 'forward') {
    await chrome.tabs.goForward(tabId)
  } else {
    return {
      toolCallId: toolCall.id,
      content: `Error: invalid direction "${direction}". Use "back" or "forward".`,
      isError: true,
    }
  }

  // Wait briefly — history navigation may not navigate if there's no history
  await new Promise((resolve) => setTimeout(resolve, 500))
  await waitForTabLoad(tabId, 5000)

  const tab = await chrome.tabs.get(tabId)
  if (tab.url?.startsWith('chrome-error://')) {
    return {
      toolCallId: toolCall.id,
      content: JSON.stringify({ success: false, error: 'Navigation resulted in error page' }),
      isError: true,
    }
  }
  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ success: true, url: tab.url ?? '', title: tab.title ?? '' }),
    isError: false,
  }
}

// ── Tool: agent__open_tab ──

async function handleOpenTab(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const url = args.url as string

  if (!url) {
    return { toolCallId: toolCall.id, content: 'Error: url is required', isError: true }
  }

  const urlCheck = validateUrl(url)
  if (!urlCheck.valid) {
    return { toolCallId: toolCall.id, content: urlCheck.error, isError: true }
  }

  const active = (args.active as boolean) ?? true
  const tab = await chrome.tabs.create({ url, active })

  // Wait for the page to finish loading before returning
  if (tab.id) {
    try {
      await waitForTabLoad(tab.id)
    } catch {
      // waitForTabLoad rejects on chrome-error:// — handle below
    }
  }

  // Re-read tab state after load
  const loadedTab = tab.id ? await chrome.tabs.get(tab.id) : tab
  const finalUrl = loadedTab.url ?? ''

  // Detect error pages (unreachable URLs, DNS failures, etc.)
  if (finalUrl.startsWith('chrome-error://')) {
    return {
      toolCallId: toolCall.id,
      content: JSON.stringify({
        success: false,
        error: `Failed to open tab: the page could not be loaded. The URL "${url}" may be unreachable, the site may be down, or the URL may be invalid. Try a different URL or use agent__web_search to find the correct one.`,
        requestedUrl: url,
        tabId: loadedTab.id,
      }),
      isError: true,
    }
  }

  // Empty URL after load means the page didn't load properly
  if (!finalUrl || finalUrl === 'about:blank') {
    return {
      toolCallId: toolCall.id,
      content: JSON.stringify({
        success: false,
        error: `Failed to open tab: page loaded but returned an empty URL. The URL "${url}" may be unreachable or blocked. Try a different URL or use agent__web_search to find the correct one.`,
        requestedUrl: url,
        tabId: loadedTab.id,
      }),
      isError: true,
    }
  }

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ success: true, tabId: loadedTab.id, url: finalUrl }),
    isError: false,
  }
}

// ── Tool: agent__switch_tab ──

async function handleSwitchTab(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const tabId = args.tabId as number

  if (!tabId) {
    return { toolCallId: toolCall.id, content: 'Error: tabId is required', isError: true }
  }

  const tab = await chrome.tabs.get(tabId)
  await chrome.tabs.update(tabId, { active: true })

  if (tab.windowId) {
    await chrome.windows.update(tab.windowId, { focused: true })
  }

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ success: true, tabId, title: tab.title ?? '', url: tab.url ?? '' }),
    isError: false,
  }
}

// ── Tool: agent__close_tab ──

async function handleCloseTab(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  let tabId = args.tabId as number | undefined

  if (tabId == null) {
    tabId = await resolveTabId()
  }

  await chrome.tabs.remove(tabId)
  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ success: true, closedTabId: tabId }),
    isError: false,
  }
}

// ── Tool: agent__get_tabs ──

async function handleGetTabs(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const currentWindow = (args.currentWindow as boolean) ?? true

  const tabs = await chrome.tabs.query({ currentWindow })

  const tabInfos = tabs.map((tab) => ({
    id: tab.id!,
    title: tab.title ?? '',
    url: tab.url ?? '',
    active: tab.active ?? false,
  }))

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify(tabInfos),
    isError: false,
  }
}

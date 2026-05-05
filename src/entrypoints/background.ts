/**
 * Background service worker.
 * Handles IPC messages via MessageRouter, context menus, and MCP OAuth.
 */

import { defineBackground } from 'wxt/sandbox'
import { MessageRouter } from '@/ipc/router'
import type { YoutubeSummarizeNotify, PullModelNotify, McpOAuthStartRequest, McpOAuthDisconnectRequest } from '@/ipc/types'
import { syncStorageService } from '@/storage/index'
import { markPanelReady, markPanelDisconnected, broadcastWhenReady } from '@/services/panel-ready'
import { streamDownload } from '@/services/model-pull-service'
import {
  copilotMenuManager,
  isBuiltinCopilotMenuId,
  isCustomCopilotMenuId,
  mapMenuIdToType,
} from '@/services/copilot-menus'
import { startMcpOAuthFlow, disconnectMcpOAuth } from '@/mcp/oauth-flow'
import { mcpServerRepo } from '@/db/repositories/mcp-server.repository'
import { BridgeService } from '@/agent/bridge/bridge-service'
import { registerAllAgentTools } from '@/agent/tools'

const NETWORK_LOG_KEY = 'agent_network_log'
const MAX_NETWORK_LOG_ENTRIES = 50

/** Start monitoring network requests via webRequest API (if available) */
function startNetworkMonitoring(): void {
  if (!chrome.webRequest) return

  const pushEntry = async (entry: { url: string; method: string; status?: number; timestamp: number }) => {
    try {
      const stored = await chrome.storage.session.get(NETWORK_LOG_KEY)
      const log: Array<Record<string, unknown>> = stored?.[NETWORK_LOG_KEY] ?? []
      log.push(entry)
      // Ring buffer: keep only last MAX_NETWORK_LOG_ENTRIES
      while (log.length > MAX_NETWORK_LOG_ENTRIES) log.shift()
      await chrome.storage.session.set({ [NETWORK_LOG_KEY]: log })
    } catch {
      // storage.session may not be available
    }
  }

  chrome.webRequest.onCompleted.addListener(
    (details) => {
      pushEntry({
        url: details.url,
        method: details.method,
        status: details.statusCode,
        timestamp: details.timeStamp,
      })
    },
    { urls: ['<all_urls>'] }
  )
}

export default defineBackground(() => {
  const router = new MessageRouter()

  // Request handlers
  router.onRequest('check_youtube_summarize_enabled', async () => {
    const enabled = await syncStorageService.get('youtubeSummarizeEnabled', false)
    return { enabled }
  })

  router.onRequest('refresh_custom_copilot_menus', async () => {
    await copilotMenuManager.createCustomMenus()
    return { success: true }
  })

  router.onRequest('refresh_builtin_copilot_menus', async () => {
    await copilotMenuManager.createBuiltinMenus()
    return { success: true }
  })

  router.onRequest('mcp_oauth_start', async (message: McpOAuthStartRequest) => {
    const server = await mcpServerRepo.getById(message.serverId)
    if (!server) {
      return { success: false, error: 'Server not found' }
    }
    const result = await startMcpOAuthFlow(server)
    return { success: result.success, error: result.error }
  })

  router.onRequest('mcp_oauth_disconnect', async (message: McpOAuthDisconnectRequest) => {
    await disconnectMcpOAuth(message.serverId)
    return { success: true }
  })

  // Notify handlers
  router.onNotify('youtube_summarize', async (message: YoutubeSummarizeNotify) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id })
    }

    await broadcastWhenReady({
      from: 'background',
      type: 'yt_summarize',
      text: message.videoTitle,
      url: message.videoUrl,
    })
  })

  router.onNotify('pull_model', async (message: PullModelNotify) => {
    const ollamaUrl = await syncStorageService.get('ollamaBaseUrl', 'http://localhost:11434')
    try {
      for await (const _progress of streamDownload(ollamaUrl, message.modelName)) {
        // Progress can be used for badge updates
      }
    } catch {
      // Pull failed, ignore
    }
  })

  router.onNotify('cancel_download', () => {
    // Cancel handled via AbortController in pull service
  })

  router.onNotify('sidepanel', async (_message, sender) => {
    if (sender.tab?.id) {
      await chrome.sidePanel.open({ tabId: sender.tab.id })
    }
  })

  // Attach the router
  router.attach()

  // Initialize BridgeService for agent tools
  const bridge = new BridgeService()
  registerAllAgentTools(bridge)
  const unsubscribeBridge = bridge.start()

  // Handle keyboard shortcuts (commands)
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'execute_side_panel') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0]
        if (tab?.id) {
          chrome.sidePanel.open({ tabId: tab.id })
        }
      })
    }
  })

  // Handle extension icon click / _execute_action — open sidepanel as full page tab
  chrome.action.onClicked.addListener((tab) => {
    const url = chrome.runtime.getURL('sidepanel.html')
    chrome.tabs.create({ url })
  })

  // Network request monitoring for agent__page_info(info_type="network") tool
  startNetworkMonitoring()

  // Initialize copilot context menus
  copilotMenuManager.createBuiltinMenus().catch(() => {})
  copilotMenuManager.createCustomMenus().catch(() => {})

  // Context menu click handler
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const menuId = String(info.menuItemId)
    if (!isBuiltinCopilotMenuId(menuId) && !isCustomCopilotMenuId(menuId)) return

    const copilotType = mapMenuIdToType(menuId)
    if (!copilotType) return

    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id })
    }

    await broadcastWhenReady({
      from: 'background',
      type: copilotType as 'summary' | 'rephrase' | 'translate' | 'explain' | 'custom',
      text: info.selectionText ?? '',
    })
  })

  // Track panel readiness via pgCopilot port + proxy-fetch handler
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'pgCopilot') {
      markPanelReady()
      port.onDisconnect.addListener(() => {
        markPanelDisconnected()
      })
      return
    }

    // Proxy fetch requests from extension pages.
    // Background SW's fetch() does not send Origin header for same-scheme
    // requests, which avoids 403 from local servers.
    if (port.name === 'proxy-fetch') {
      port.onMessage.addListener(async (msg: { url: string; method: string; headers: Record<string, string>; body?: string }) => {
        const abortController = new AbortController()

        // When the client disconnects (user cancels), abort the in-flight fetch
        port.onDisconnect.addListener(() => {
          abortController.abort()
        })

        try {
          const response = await fetch(msg.url, {
            method: msg.method,
            headers: msg.headers,
            body: msg.method !== 'GET' && msg.method !== 'HEAD' ? msg.body : undefined,
            signal: abortController.signal,
          })

          port.postMessage({
            type: 'response',
            status: response.status,
            statusText: response.statusText,
          })

          if (response.body) {
            const reader = response.body.getReader()
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                port.postMessage({ type: 'chunk', data: Array.from(value) })
              }
            } finally {
              reader.releaseLock()
            }
          }

          port.postMessage({ type: 'done' })
        } catch (err) {
          // Client disconnect / abort — silent
          if (err instanceof DOMException && err.name === 'AbortError') return
          port.postMessage({
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      })
    }
  })
})

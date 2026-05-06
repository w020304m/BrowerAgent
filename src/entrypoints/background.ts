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
    if (command === 'select_element') {
      // Broadcast to sidepanel to trigger element selection
      chrome.runtime.sendMessage({ type: 'trigger_select_element' }).catch(() => {
        // Sidepanel may not be open
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

    // Element selection via long-lived port (avoids MV3 sendMessage timeout)
    if (port.name === 'select-element') {
      port.onMessage.addListener(async (msg: { type: string; tabId: number }) => {
        if (msg.type !== 'select_element_start') return
        const { tabId } = msg

        try {
          // Inject the element selection overlay into the page
          await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              // Clean up any existing overlay
              const existing = document.getElementById('user-select-overlay')
              if (existing) existing.remove()

              // Annotate interactive elements with agent IDs
              const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [contenteditable], [onclick]'
              const interactives = document.querySelectorAll(interactiveSelectors)
              let idx = 0
              for (const el of interactives) {
                if (!el.getAttribute('data-agent-id')) {
                  el.setAttribute('data-agent-id', `a${idx}`)
                  idx++
                }
              }

              const MAX_TOTAL_IDS = 120
              if (idx < MAX_TOTAL_IDS) {
                const vpHeight = window.innerHeight
                const clickCandidates = document.querySelectorAll('li, span, div')
                for (const el of clickCandidates) {
                  if (idx >= MAX_TOTAL_IDS) break
                  if (el.getAttribute('data-agent-id')) continue
                  const rect = el.getBoundingClientRect()
                  if (rect.bottom <= 0 || rect.top >= vpHeight) continue
                  if (rect.width <= 0 || rect.height <= 0) continue
                  if (rect.width > window.innerWidth * 0.5 || rect.height > vpHeight * 0.5) continue
                  const style = window.getComputedStyle(el as HTMLElement)
                  if (style.display === 'none' || style.visibility === 'hidden') continue
                  if (style.cursor !== 'pointer') continue
                  if (el.querySelector('a, button, [data-agent-id]')) continue
                  const text = (el as HTMLElement).innerText?.trim() ?? ''
                  const ariaLabel = el.getAttribute('aria-label') ?? ''
                  if (text.length === 0 && ariaLabel.length === 0) continue
                  if (text.length > 200) continue
                  el.setAttribute('data-agent-id', `a${idx}`)
                  idx++
                }
              }

              // Create overlay
              const overlay = document.createElement('div')
              overlay.id = 'user-select-overlay'
              overlay.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                z-index: 2147483646; pointer-events: none;
              `

              const banner = document.createElement('div')
              banner.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
                color: white; padding: 16px 24px; border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.4); font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                z-index: 2147483647; pointer-events: auto;
                border: 1px solid rgba(59,130,246,0.3); backdrop-filter: blur(10px);
              `
              banner.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;">
                  <div style="width:36px;height:36px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                  </div>
                  <div>
                    <div style="font-weight:600;font-size:15px;margin-bottom:4px;">Select an Element</div>
                    <div style="opacity:0.8;font-size:13px;">Click any element &bull; Press <kbd style="background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;font-family:monospace;">ESC</kbd> to cancel</div>
                  </div>
                </div>
              `
              overlay.appendChild(banner)

              let hoverOutline: HTMLDivElement | null = null

              const cleanup = () => {
                document.removeEventListener('mousemove', onMouseMove, true)
                document.removeEventListener('click', onClick, true)
                document.removeEventListener('keydown', onKeyDown, true)
                window.removeEventListener('keydown', onKeyDown, true)
                overlay.remove()
                if (hoverOutline) hoverOutline.remove()
              }

              const onMouseMove = (e: MouseEvent) => {
                if (hoverOutline) { hoverOutline.remove(); hoverOutline = null }
                const target = e.target as HTMLElement
                if (!target || target.id === 'user-select-overlay' || target.closest?.('#user-select-overlay')) return
                const rect = target.getBoundingClientRect()
                hoverOutline = document.createElement('div')
                hoverOutline.style.cssText = `
                  position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;
                  border:3px solid #3b82f6;background:rgba(59,130,246,0.15);pointer-events:none;
                  z-index:2147483645;box-shadow:0 0 20px rgba(59,130,246,0.6);border-radius:4px;
                `
                document.body.appendChild(hoverOutline)
              }

              const onClick = (e: MouseEvent) => {
                const target = e.target as HTMLElement
                if (!target || target.closest?.('#user-select-overlay')) return
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()

                let agentId = target.getAttribute('data-agent-id')
                if (!agentId) {
                  const annotated = target.closest('[data-agent-id]')
                  if (annotated) agentId = annotated.getAttribute('data-agent-id')
                }
                if (!agentId) {
                  const parent = target.parentElement
                  if (parent) {
                    const siblings = Array.from(parent.children)
                    const si = siblings.indexOf(target)
                    agentId = `${target.tagName.toLowerCase()}${si}`
                  } else {
                    agentId = target.tagName.toLowerCase()
                  }
                  target.setAttribute('data-agent-id', agentId)
                }

                cleanup()
                chrome.runtime.sendMessage({
                  type: 'user_element_selected',
                  result: { agentId, tag: target.tagName.toLowerCase(), text: target.innerText?.trim().slice(0, 100) || undefined },
                }).catch(() => {})
              }

              const onKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape' || e.key === 'Esc') {
                  e.preventDefault(); e.stopPropagation()
                  cleanup()
                  chrome.runtime.sendMessage({ type: 'user_element_selected', result: null }).catch(() => {})
                }
              }

              document.addEventListener('mousemove', onMouseMove, true)
              document.addEventListener('click', onClick, true)
              window.addEventListener('keydown', onKeyDown, true)
              document.addEventListener('keydown', onKeyDown, true)
              document.body.appendChild(overlay)
            },
          })
        } catch (err) {
          console.error('[SelectElement] executeScript failed:', err)
          port.postMessage({ type: 'select_element_result', result: null })
          return
        }

        // Wait for the content script to send back the selection result
        const result = await new Promise<{ agentId: string; tag: string; text?: string } | null>((resolve) => {
          const timeoutId = setTimeout(() => {
            chrome.runtime.onMessage.removeListener(listener)
            // Clean up overlay on timeout
            chrome.scripting.executeScript({
              target: { tabId },
              func: () => { document.getElementById('user-select-overlay')?.remove() },
            }).catch(() => {})
            resolve(null)
          }, 30000)

          const listener = (message: unknown) => {
            if (!message || typeof message !== 'object') return
            const msg = message as Record<string, unknown>
            if (msg.type === 'user_element_selected') {
              clearTimeout(timeoutId)
              chrome.runtime.onMessage.removeListener(listener)
              resolve((msg.result as { agentId: string; tag: string; text?: string } | null) ?? null)
            }
          }
          chrome.runtime.onMessage.addListener(listener)
        })

        port.postMessage({ type: 'select_element_result', result })
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

/**
 * Shared helpers for agent tool execution.
 * These run in the background service worker context.
 * Page-context functions are inlined in executeScript calls (they can't import modules).
 */

/** Resolve tab ID: validate if provided, else use active tab */
export async function resolveTabId(tabId?: number): Promise<number> {
  if (tabId != null) {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (tab?.id) return tab.id
    } catch {
      // Tab no longer valid, fall through to active tab
    }
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!activeTab?.id) throw new Error('No active tab found')
  return activeTab.id
}

/** Wait for tab to reach 'complete' loading status, then wait for network idle */
export async function waitForTabLoad(tabId: number, timeoutMs = 15000): Promise<void> {
  // Phase 1: wait for tab status === 'complete'
  await new Promise<void>((resolve, reject) => {
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        // Check for error page
        chrome.tabs.get(tabId).then(tab => {
          if (tab.url?.startsWith('chrome-error://')) {
            reject(new Error('Navigation failed: error page loaded'))
          } else {
            resolve()
          }
        }).catch(() => resolve())
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }, timeoutMs)
  })

  // Phase 2: inject script to wait for network idle (no requests for 500ms)
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        return new Promise<void>((resolve) => {
          // If PerformanceObserver not available, resolve immediately
          if (typeof PerformanceObserver === 'undefined') {
            resolve()
            return
          }
          let idleTimer: ReturnType<typeof setTimeout> | null = null
          const IDLE_MS = 500

          const observer = new PerformanceObserver(() => {
            if (idleTimer) clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
              observer.disconnect()
              resolve()
            }, IDLE_MS)
          })
          try {
            observer.observe({ entryTypes: ['resource'] })
          } catch {
            resolve()
            return
          }
          // If no resources are loading at all, resolve after a short wait
          idleTimer = setTimeout(() => {
            observer.disconnect()
            resolve()
          }, IDLE_MS)
        })
      },
    })
  } catch {
    // Script injection may fail (e.g. chrome:// pages), ignore
  }
}

/** Truncate string with indicator */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '\n\n[... truncated]'
}

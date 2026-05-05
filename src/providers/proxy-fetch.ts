/**
 * Unified fetch wrapper for all providers.
 *
 * All requests are routed through the background service worker proxy
 * to avoid sidepanel Content Security Policy restrictions.
 *
 * For local server URLs (localhost, 127.0.0.1, etc.), additionally applies
 * declarativeNetRequest to rewrite the Origin header, preventing the 403
 * that local servers (Ollama, LM Studio) return when they see
 * `Origin: chrome-extension://...`.
 *
 * Falls back to direct fetch if the background proxy is unavailable.
 * In test environments, direct fetch is used.
 */

import { withRetry } from './retry'
import { ensureCorsFix } from '@/libs/cors-fix'

// ── Environment detection ────────────────────────────────────────────

function isTestEnvironment(): boolean {
  return typeof process !== 'undefined' && process.env?.NODE_ENV === 'test'
}

// ── Local address detection ──────────────────────────────────────────

const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
])

function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return LOCAL_HOSTNAMES.has(u.hostname)
  } catch {
    return false
  }
}

// ── Background proxy via port ─────────────────────────────────────────

interface PortMessage {
  type: 'response' | 'chunk' | 'done' | 'error'
  status?: number
  statusText?: string
  data?: number[]
  message?: string
}

function proxyFetch(url: string, init: RequestInit): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let port: chrome.runtime.Port
    try {
      port = chrome.runtime.connect({ name: 'proxy-fetch' })
    } catch {
      reject(new Error('Cannot connect to background'))
      return
    }

    let controller!: ReadableStreamDefaultController<Uint8Array>
    let resolved = false

    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) { controller = ctrl },
    })

    // Abort signal support
    if (init.signal) {
      if (init.signal.aborted) {
        port.disconnect()
        reject(new DOMException('The operation was aborted.', 'AbortError'))
        return
      }
      init.signal.addEventListener('abort', () => {
        port.disconnect()
        if (!resolved) {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        } else {
          try { controller.error(new DOMException('Aborted', 'AbortError')) } catch { /* */ }
        }
      }, { once: true })
    }

    port.onMessage.addListener((msg: PortMessage) => {
      switch (msg.type) {
        case 'response':
          resolved = true
          resolve(new Response(stream, {
            status: msg.status ?? 0,
            statusText: msg.statusText ?? '',
          }))
          break
        case 'chunk':
          if (msg.data) controller.enqueue(new Uint8Array(msg.data))
          break
        case 'done':
          controller.close()
          port.disconnect()
          break
        case 'error':
          if (!resolved) {
            reject(new Error(msg.message ?? 'Proxy fetch failed'))
          } else {
            controller.error(new Error(msg.message ?? 'Proxy fetch failed'))
          }
          port.disconnect()
          break
      }
    })

    port.onDisconnect.addListener(() => {
      if (!resolved) {
        reject(new Error('Port disconnected before response'))
      } else {
        try { controller.close() } catch { /* */ }
      }
    })

    // Serialize headers
    const headers: Record<string, string> = {}
    if (init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headers[k] = v })
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) { headers[k] = v }
      } else {
        Object.assign(headers, init.headers as Record<string, string>)
      }
    }

    port.postMessage({
      url,
      method: init.method ?? 'GET',
      headers,
      body: typeof init.body === 'string' ? init.body : undefined,
    })
  })
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Drop-in replacement for `fetch()`.
 *
 * All requests go through the background service worker proxy by default.
 * This avoids sidepanel CSP restrictions that block direct fetch to remote APIs.
 *
 * For local URLs (localhost, 127.0.0.1, etc.):
 * 1. Applies declarativeNetRequest rule to rewrite Origin header
 * 2. Routes through background proxy (DNR rewrites Origin transparently)
 * 3. Throws 'LOCAL_ORIGIN_FORBIDDEN' on 403 so UI can show config guide
 *
 * For remote URLs (api.openai.com, etc.):
 * 1. Routes through background proxy
 * 2. Falls back to direct fetch if proxy is unavailable
 *
 * Both local and remote requests are wrapped with retry logic for
 * transient errors (429, 502, 503, 504, network errors).
 */
export async function smartFetch(url: string, init?: RequestInit): Promise<Response> {
  const mergedInit = init ?? {}

  // In test environments, skip proxy entirely for predictable behavior
  if (isTestEnvironment()) {
    return fetch(url, mergedInit)
  }

  if (isLocalUrl(url)) {
    // Apply DNR rule to rewrite Origin header for this local server.
    // This makes `Origin: chrome-extension://...` become `Origin: http://127.0.0.1`
    // so the local server accepts the request.
    await ensureCorsFix(url)

    try {
      const response = await withRetry(
        () => proxyFetch(url, mergedInit),
        { maxRetries: 2, baseDelay: 500 }
      )
      if (response.status === 403) {
        throw new Error('LOCAL_ORIGIN_FORBIDDEN')
      }
      return response
    } catch (proxyError) {
      if (proxyError instanceof Error && proxyError.message === 'LOCAL_ORIGIN_FORBIDDEN') {
        throw proxyError
      }
      throw new Error(
        `Proxy fetch failed for local URL: ${proxyError instanceof Error ? proxyError.message : String(proxyError)}. ` +
        `Direct fetch sends Origin header causing 403. Ensure background service worker is active.`
      )
    }
  }

  // Remote URLs (OpenAI, Anthropic, Google, etc.) — route through background
  // proxy to avoid sidepanel CSP restrictions. Fall back to direct fetch if
  // the background service worker is unavailable.
  try {
    const response = await withRetry(
      () => proxyFetch(url, mergedInit),
      { maxRetries: 2, baseDelay: 500 }
    )
    return response
  } catch {
    // Background proxy unavailable — try direct fetch as last resort
    return withRetry(() => fetch(url, mergedInit))
  }
}

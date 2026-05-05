/**
 * Type-safe IPC client.
 * Wraps chrome.runtime.sendMessage with proper typing.
 */

import type { RequestMap, IpcNotify, IpcBroadcast } from './types'

/**
 * Send a request message to the background script and wait for a typed response.
 */
export async function sendRequest<T extends keyof RequestMap>(
  type: T,
  payload?: Record<string, unknown>
): Promise<RequestMap[T]> {
  const message = { type, ...payload }
  const response = await chrome.runtime.sendMessage(message)
  return response as RequestMap[T]
}

/**
 * Send a fire-and-forget notify message to the background script.
 */
export function sendNotify(message: IpcNotify): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Fire-and-forget, ignore errors
  })
}

/**
 * Send a message to a specific tab's content script.
 */
export function sendTabMessage(tabId: number, message: unknown): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    // Tab may not have content script loaded
  })
}

/**
 * Listen for broadcast messages from the background script.
 * Returns an unsubscribe function.
 */
export function onBroadcast(
  handler: (message: IpcBroadcast) => void
): () => void {
  const listener = (
    message: unknown,
    sender: chrome.runtime.MessageSender
  ) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'from' in message &&
      (message as { from: string }).from === 'background'
    ) {
      handler(message as IpcBroadcast)
    }
  }

  chrome.runtime.onMessage.addListener(listener)
  return () => chrome.runtime.onMessage.removeListener(listener)
}

/**
 * Open a long-lived port to signal sidepanel is open.
 * Replaces the pgCopilot port from the original project.
 */
export function signalPanelReady(): () => void {
  const port = chrome.runtime.connect({ name: 'pgCopilot' })
  return () => port.disconnect()
}

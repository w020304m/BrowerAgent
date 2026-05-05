/**
 * Background message router.
 * Registers typed handlers for IPC messages, replacing the if-else chain.
 */

import type { AnyIpcMessage, IpcRequest } from './types'
import { isRequest, isBroadcast } from './types'

type RequestHandler<T extends IpcRequest> = (
  message: T,
  sender: chrome.runtime.MessageSender
) => Promise<unknown>

type NotifyHandler<T extends AnyIpcMessage> = (
  message: T,
  sender: chrome.runtime.MessageSender
) => void

interface HandlerEntry {
  request?: RequestHandler<any>
  notify?: NotifyHandler<any>
}

/**
 * Message router for the background script.
 * Register handlers per message type, then attach to chrome.runtime.onMessage.
 */
export class MessageRouter {
  private handlers = new Map<string, HandlerEntry>()

  /**
   * Register a handler for a request message type.
   * The handler should return a response value.
   */
  onRequest<T extends IpcRequest>(
    type: T['type'],
    handler: RequestHandler<T>
  ): this {
    const entry = this.handlers.get(type) ?? {}
    entry.request = handler
    this.handlers.set(type, entry)
    return this
  }

  /**
   * Register a handler for a notify message type.
   * The handler's return value is ignored (fire-and-forget).
   */
  onNotify<T extends AnyIpcMessage>(
    type: T['type'],
    handler: NotifyHandler<T>
  ): this {
    const entry = this.handlers.get(type) ?? {}
    entry.notify = handler
    this.handlers.set(type, entry)
    return this
  }

  /**
   * Attach the router to chrome.runtime.onMessage.
   * Returns the listener function for cleanup.
   */
  attach(): () => void {
    const listener = (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (typeof message !== 'object' || message === null || !('type' in message)) {
        return false
      }

      const msg = message as AnyIpcMessage
      const entry = this.handlers.get(msg.type)

      if (!entry) return false

      if (isRequest(msg) && entry.request) {
        // Request handler — must return response
        entry.request(msg, sender)
          .then(response => sendResponse(response))
          .catch(err => sendResponse({ success: false, error: String(err) }))
        return true // Keep channel open for async response
      }

      if (entry.notify) {
        entry.notify(msg, sender)
      }

      return false
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }
}

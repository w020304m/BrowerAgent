/**
 * BridgeService: background-side message router for agent tool execution.
 * Listens for agent_tool_call messages from the sidepanel,
 * dispatches to registered tool handlers, returns results.
 */

import type { ToolCall, ToolResult } from '@/types/tool'
import type { AgentToolCallMessage, AgentToolResponse } from './types'

type ToolHandler = (toolCall: ToolCall) => Promise<ToolResult>

export class BridgeService {
  private handlers = new Map<string, ToolHandler>()
  private pendingAskUserResolvers = new Map<string, (answer: string) => void>()
  private pendingSelectElementResolvers = new Map<string, (result: { agentId: string; tag: string; text?: string } | null) => void>()

  /** Register a handler for a specific tool name */
  register(toolName: string, handler: ToolHandler): void {
    this.handlers.set(toolName, handler)
  }

  /** Resolve a pending ask_user promise (called when sidepanel responds) */
  resolveAskUser(toolCallId: string, answer: string): void {
    const resolver = this.pendingAskUserResolvers.get(toolCallId)
    if (resolver) {
      resolver(answer)
      this.pendingAskUserResolvers.delete(toolCallId)
    }
  }

  /** Register a pending ask_user promise */
  registerAskUserPending(toolCallId: string, resolver: (answer: string) => void): void {
    this.pendingAskUserResolvers.set(toolCallId, resolver)
  }

  /** Resolve a pending select_element promise (called when content script sends selection) */
  resolveSelectElement(toolCallId: string, result: { agentId: string; tag: string; text?: string } | null): void {
    const resolver = this.pendingSelectElementResolvers.get(toolCallId)
    if (resolver) {
      resolver(result)
      this.pendingSelectElementResolvers.delete(toolCallId)
    }
  }

  /** Register a pending select_element promise */
  registerSelectElementPending(toolCallId: string, resolver: (result: { agentId: string; tag: string; text?: string } | null) => void): void {
    this.pendingSelectElementResolvers.set(toolCallId, resolver)
  }

  /** Handle incoming message from sidepanel */
  async handleMessage(message: unknown): Promise<AgentToolResponse | undefined> {
    if (!message || typeof message !== 'object') return undefined
    const msg = message as Record<string, unknown>

    // Handle agent_tool_call
    if (msg.type === 'agent_tool_call') {
      const { toolCall } = msg as AgentToolCallMessage
      return this.dispatchToolCall(toolCall)
    }

    // Handle agent_ask_user_response
    if (msg.type === 'agent_ask_user_response') {
      const { toolCallId, answer } = msg as { type: string; toolCallId: string; answer: string }
      this.resolveAskUser(toolCallId, answer)
      return undefined
    }

    // Handle agent_select_element_response (from content script)
    if (msg.type === 'agent_select_element_response') {
      const { toolCallId, result } = msg as { type: string; toolCallId: string; result: { agentId: string; tag: string; text?: string } | null }
      this.resolveSelectElement(toolCallId, result)
      return undefined
    }

    // Handle agent_ping
    if (msg.type === 'agent_ping') {
      return { type: 'agent_pong' }
    }

    return undefined
  }

  private async dispatchToolCall(toolCall: ToolCall): Promise<AgentToolResponse> {
    const handler = this.handlers.get(toolCall.name)

    if (!handler) {
      return {
        success: false,
        error: `No handler registered for tool: ${toolCall.name}`,
      }
    }

    try {
      const result = await handler(toolCall)
      return { success: true, result }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /** Start listening on chrome.runtime.onMessage. Returns unsubscribe function. */
  start(): () => void {
    const listener = (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
      const result = this.handleMessage(message)
      if (result) {
        result.then(sendResponse)
        return true // keep channel open for async response
      }
      return false
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }
}

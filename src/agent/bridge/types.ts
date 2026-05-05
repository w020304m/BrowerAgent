/**
 * Bridge message types for agent tool execution.
 * Sidepanel sends AgentToolCallMessage → Background processes → returns AgentToolResponse.
 */

import type { ToolCall, ToolResult } from '@/types/tool'

/** Message from sidepanel → background to execute a tool */
export interface AgentToolCallMessage {
  type: 'agent_tool_call'
  toolCall: ToolCall
}

/** Response from background → sidepanel with tool result */
export interface AgentToolResponse {
  success: boolean
  result?: ToolResult
  error?: string
}

/** Ask-user request from background → sidepanel */
export interface AgentAskUserMessage {
  type: 'agent_ask_user'
  toolCallId: string
  question: string
  options?: string[]
}

/** Ask-user response from sidepanel → background */
export interface AgentAskUserResponse {
  type: 'agent_ask_user_response'
  toolCallId: string
  answer: string
}

/** Progress report from background → sidepanel */
export interface AgentProgressMessage {
  type: 'agent_progress'
  current: number
  total: number
  description?: string
}

/** Special signal in ToolResult.content for agent loop control */
export type AgentSignal =
  | { type: 'task_complete'; result: string }
  | { type: 'task_failed'; reason: string; recoverable?: boolean }

export const SIGNAL_PREFIX = '__AGENT_SIGNAL__:'

export function encodeSignal(signal: AgentSignal): string {
  return SIGNAL_PREFIX + JSON.stringify(signal)
}

export function decodeSignal(content: string): AgentSignal | null {
  if (!content.startsWith(SIGNAL_PREFIX)) return null
  try {
    return JSON.parse(content.slice(SIGNAL_PREFIX.length))
  } catch {
    return null
  }
}

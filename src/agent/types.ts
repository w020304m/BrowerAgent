/**
 * AgentRunner types — status, events, results, and serialization.
 */

import type { ToolCall, ToolResult } from '@/types/tool'
import type { AgentStep } from './context/types'

// ── Agent Run Summary ──

/** Summary of a completed/failed/cancelled agent run, used for task continuation */
export interface AgentRunSummary {
  goal: string
  status: 'completed' | 'failed' | 'cancelled'
  totalSteps: number
  failureReason?: string
  result?: string
  memory: Record<string, unknown>
  toolHistory: string[]
  endedAt: number
}

// ── Agent Status ──

export type AgentStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

// ── Agent Events (emitted to UI) ──

export type AgentEvent =
  | { type: 'status_changed'; status: AgentStatus }
  | { type: 'step_start'; stepNumber: number; toolCall: ToolCall }
  | { type: 'step_end'; stepNumber: number; toolResult: ToolResult; durationMs: number }
  | { type: 'thinking'; content: string }
  | { type: 'error'; error: string; recoverable: boolean }
  | { type: 'progress'; current: number; total: number; description: string }
  | { type: 'task_complete'; result: string }
  | { type: 'task_failed'; reason: string }
  | { type: 'compression'; stepsBefore: number; stepsAfter: number }
  | { type: 'llm_call_start'; attempt: number }
  | { type: 'llm_call_end'; attempt: number; durationMs: number }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'compact'; stepsBefore: number; stepsAfter: number }
  | { type: 'stream_reset' }

export type AgentEventHandler = (event: AgentEvent) => void

// ── Pluggable interfaces (injected by AgentExecutor) ──

/** LLM call result — what the runner needs back */
export interface LLMCallResult {
  content: string
  reasoningContent?: string
  toolCalls?: import('@/types/tool').ToolCall[]
  usageMetadata?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

/** Pluggable LLM caller — lets the executor provide streaming or non-streaming */
export interface IAgentLLMCaller {
  call(
    messages: import('@/types/message').ChatMessage[],
    options?: { signal?: AbortSignal; tools?: import('@/types/tool').ToolDefinition[] },
  ): Promise<LLMCallResult>
}

/** Pluggable tool executor — lets the executor route agent vs MCP tools */
export interface IAgentToolExecutor {
  execute(toolCall: import('@/types/tool').ToolCall, signal?: AbortSignal): Promise<import('@/types/tool').ToolResult>
}

// ── Agent Result ──

export interface AgentResult {
  /** Final status */
  status: 'completed' | 'failed' | 'cancelled'
  /** Total steps executed */
  totalSteps: number
  /** Total wall-clock time in ms */
  totalTimeMs: number
  /** Final result text (for task_complete) */
  result?: string
  /** Failure reason (for task_failed) */
  failureReason?: string
  /** Collected memory from ContextManager */
  memory: Record<string, unknown>
  /** All steps recorded */
  steps: AgentStep[]
}

// ── Serialized State (for persistence) ──

export interface SerializedAgentState {
  version: 1
  task: {
    id: string
    goal: string
    constraints: string[]
    maxSteps: number
    createdAt: number
  }
  steps: AgentStep[]
  summaries: string[]
  memory: Record<string, unknown>
  stepCounter: number
  status: AgentStatus
  log: LogEntry[]
  lastToolName: string | null
  lastToolSuccess: boolean
  /** Error tracking state (restored on deserialize to avoid losing failure context) */
  consecutiveFailures?: number
  lastFailedToolName?: string | null
  consecutiveSameToolFailures?: number
  consecutiveTextResponses?: number
  correctionActive?: boolean
  postCorrectionFailures?: number
}

// ── Logging ──

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: number
  level: LogLevel
  message: string
  data?: unknown
}

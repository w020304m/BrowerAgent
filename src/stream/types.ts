/**
 * Stream processing types.
 */

import type { StreamChunk, ChatResult } from '@/providers/types'
import type { ToolCall } from '@/types/tool'

/** Callbacks for stream processing */
export interface StreamCallbacks {
  /** Called for each content token */
  onToken?: (token: string) => void
  /** Called for each reasoning token */
  onReasoningToken?: (token: string) => void
  /** Called when generation info is received */
  onGenerationInfo?: (info: Record<string, unknown>) => void
  /** Called when stream completes */
  onComplete?: (result: ChatResult) => void
  /** Called on error */
  onError?: (error: Error) => void
  /** Called when tool calls are detected */
  onToolCalls?: (toolCalls: ToolCall[]) => void
}

/** Mutable state tracked during stream processing */
export interface StreamState {
  content: string
  reasoningContent: string
  toolCalls: ToolCall[]
  generationInfo: Record<string, unknown>
  isReasoning: boolean
  usageMetadata?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

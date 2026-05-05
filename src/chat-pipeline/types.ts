/**
 * Chat Pipeline types.
 * Defines the pipeline step interface and chat context.
 */

import type { ChatMessage } from '@/types/message'
import type { IChatProvider, StreamChunk, ModelParams, ChatRequestOptions } from '@/providers/types'
import type { ToolCall, ToolDefinition } from '@/types/tool'
import type { ProviderType } from '@/types/provider'

/** Context passed through pipeline steps */
export interface ChatContext {
  /** The user's input message */
  userInput: string
  /** Chat mode (normal, rag, search, etc.) */
  mode: ChatMode
  /** History ID for persistence */
  historyId: string
  /** Provider type to use */
  providerType: ProviderType
  /** Model ID to use */
  modelId: string
  /** Resolved after model init */
  provider?: IChatProvider
  /** Resolved system prompt */
  systemPrompt?: string
  /** Built message history (before user input) */
  messages: ChatMessage[]
  /** Retrieved context (from RAG, search, tab content, etc.) */
  retrievedContext?: RetrievedContext
  /** Stream chunks from model call */
  streamChunks?: StreamChunk[]
  /** Final result after stream completes */
  result?: {
    content: string
    reasoningContent?: string
    generationInfo?: Record<string, unknown>
    usageMetadata?: {
      promptTokens?: number
      completionTokens?: number
      totalTokens?: number
    }
    toolCalls?: ToolCall[]
  }
  /** Abort signal */
  signal?: AbortSignal
  /** Model parameters */
  params?: ModelParams
  /** Available tools */
  tools?: ToolDefinition[]
  /** Images attached to user message */
  images?: string[]
  /** Source references for citations */
  sources?: SourceReference[]
}

export type ChatMode = 'normal' | 'rag' | 'search' | 'tab' | 'document' | 'vision' | 'copilot' | 'mcp'

export interface RetrievedContext {
  /** The context text to inject */
  text: string
  /** Source references for citations */
  sources: SourceReference[]
}

export interface SourceReference {
  /** Source title */
  title: string
  /** Source URL or file path */
  url?: string
  /** Relevant excerpt */
  excerpt?: string
}

/** Generic pipeline step interface */
export interface IPipelineStep {
  /** Step name for debugging */
  readonly name: string
  /** Execute the step, mutating context */
  execute(context: ChatContext): Promise<void>
}

/** Callbacks for pipeline execution */
export interface PipelineCallbacks {
  /** Called when a stream chunk is received */
  onChunk?: (chunk: StreamChunk) => void
  /** Called when pipeline completes */
  onComplete?: (context: ChatContext) => void
  /** Called on error */
  onError?: (error: Error) => void
}

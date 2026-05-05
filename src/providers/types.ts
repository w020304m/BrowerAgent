/**
 * Provider interfaces and types.
 * These replace LangChain's BaseChatModel, Embeddings, and related types.
 * All providers implement these interfaces with plain fetch + custom parsing.
 */

import type { ChatMessage } from '@/types/message'
import type { ToolDefinition, ToolCallChunk } from '@/types/tool'
import type { ProviderType } from '@/types/provider'

// ==========================================
// Streaming types
// ==========================================

/** A single chunk yielded during streaming */
export interface StreamChunk {
  /** Text content delta */
  content: string
  /** Reasoning/thinking content delta */
  reasoningContent?: string
  /** Partial tool call chunks */
  toolCallChunks?: ToolCallChunk[]
  /** Whether the stream is done */
  done: boolean
  /** Model generation metadata (typically on the final chunk) */
  generationInfo?: Record<string, unknown>
}

// ==========================================
// Non-streaming result
// ==========================================

/** Result from a non-streaming chat call */
export interface ChatResult {
  content: string
  reasoningContent?: string
  toolCalls?: import('@/types/tool').ToolCall[]
  generationInfo?: Record<string, unknown>
  usageMetadata?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

// ==========================================
// Model parameters (unified, Ollama-style)
// ==========================================

/** Unified model parameters. Each provider maps these to its own API format. */
export interface ModelParams {
  temperature?: number
  topP?: number
  topK?: number
  minP?: number
  numCtx?: number
  numPredict?: number
  numGpu?: number
  numGqa?: number
  numBatch?: number
  numKeep?: number
  numThread?: number
  repeatLastN?: number
  repeatPenalty?: number
  tfsZ?: number
  typicalP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  seed?: number
  stop?: string[]
  useMlock?: boolean
  useMMap?: boolean
  f16KV?: boolean
  logitsAll?: boolean
  vocabOnly?: boolean
  penalizeNewline?: boolean
  ropeFrequencyBase?: number
  ropeFrequencyScale?: number
  mirostat?: number
  mirostatEta?: number
  mirostatTau?: number
  keepAlive?: string
  reasoningEffort?: string
  thinking?: boolean | 'low' | 'medium' | 'high'
}

// ==========================================
// Chat request options
// ==========================================

export interface ChatRequestOptions {
  /** AbortController signal for cancellation */
  signal?: AbortSignal
  /** Tools available for the model to call */
  tools?: ToolDefinition[]
}

// ==========================================
// Provider interfaces
// ==========================================

/**
 * Interface for chat model providers.
 * Replaces LangChain's BaseChatModel.
 */
export interface IChatProvider {
  /** Provider type identifier */
  readonly providerType: ProviderType
  /** Model identifier */
  readonly modelId: string

  /** Non-streaming chat call */
  chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions
  ): Promise<ChatResult>

  /** Streaming chat call */
  streamChat(
    messages: ChatMessage[],
    options?: ChatRequestOptions
  ): AsyncGenerator<StreamChunk>
}

/**
 * Interface for embedding providers.
 * Replaces LangChain's Embeddings.
 */
export interface IEmbeddingProvider {
  /** Provider type identifier */
  readonly providerType: ProviderType
  /** Model identifier */
  readonly modelId: string

  /** Generate embeddings for multiple texts */
  embedDocuments(texts: string[]): Promise<number[][]>

  /** Generate embedding for a single text */
  embedQuery(text: string): Promise<number[]>
}

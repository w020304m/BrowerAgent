/**
 * Unified message types for Page Assist Next.
 * Replaces both LangChain message classes (HumanMessage, AIMessage, etc.)
 * and the dual Message/ChatHistory types from the original project.
 */

/** Valid message roles */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

/** Content parts for multimodal messages */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: string }

export type { ToolCall, ToolCallChunk } from './tool'
import type { ToolCall as ToolCallType } from './tool'

/** Reasoning information */
export interface ReasoningInfo {
  content: string
  timeTaken?: number // milliseconds
}

/** Source reference for RAG/search results */
export interface SourceReference {
  type: 'knowledge' | 'web' | 'document' | 'tab'
  url?: string
  title?: string
  content?: string
}

/**
 * Unified chat message.
 * Used across all layers: UI, storage, database, and API communication.
 */
export interface ChatMessage {
  /** Unique message ID */
  id: string
  /** Conversation history this message belongs to */
  historyId: string
  /** Sender role */
  role: MessageRole
  /** Text content */
  content: string
  /** Multimodal content parts (images, etc.) */
  contentParts?: ContentPart[]
  /** Legacy image URLs (base64 data URLs) */
  images?: string[]

  // --- Metadata ---
  /** Timestamp */
  createdAt: number
  /** Model that generated this response */
  modelName?: string
  /** Model avatar URL */
  modelImage?: string
  /** Display name */
  name?: string

  // --- Sources ---
  /** RAG/Search sources */
  sources?: SourceReference[]
  /** Web search metadata */
  search?: import('./chat').WebSearch
  /** Document context */
  documents?: import('./chat').ChatDocument[]

  // --- Reasoning ---
  reasoningContent?: string
  reasoningTimeTaken?: number

  // --- Generation ---
  /** Model generation metadata */
  generationInfo?: Record<string, unknown>
  /** Message type (copilot, preset, etc.) */
  messageType?: string
  /** Message kind */
  messageKind?: import('./chat').ChatMessageKind

  // --- Tool calls ---
  toolCalls?: ToolCallType[]
  toolCallId?: string
  toolName?: string
  toolServerName?: string
  toolArgs?: Record<string, unknown>
  toolError?: boolean
}

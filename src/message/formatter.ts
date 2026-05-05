/**
 * Message format converters.
 * Transforms between ChatMessage, MessageRow (DB), and UIMessage (display).
 */

import type { ChatMessage, MessageRole, ContentPart, ToolCall } from '@/types/message'
import type { MessageRow, HistoryInfo } from '@/db/types'
import type { WebSearch, ChatDocument, ChatMessageKind } from '@/types/chat'

/** UI display message (isBot-based, used by React components) */
export interface UIMessage {
  isBot: boolean
  name: string
  message: string
  sources: unknown[]
  images?: string[]
  search?: WebSearch
  reasoning_time_taken?: number
  id?: string
  messageType?: string
  modelName?: string
  modelImage?: string
  documents?: ChatDocument[]
  generationInfo?: Record<string, unknown>
  messageKind?: ChatMessageKind
  toolCalls?: ToolCall[]
  toolCallId?: string
  toolName?: string
  toolServerName?: string
  toolError?: boolean
}

/**
 * Convert a database MessageRow to a unified ChatMessage.
 */
export function dbRowToChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    historyId: row.history_id,
    role: row.role as MessageRole,
    content: row.content,
    images: row.images,
    createdAt: row.createdAt,
    modelName: row.modelName,
    modelImage: row.modelImage,
    name: row.name,
    sources: row.sources?.map(s => {
      if (typeof s === 'string') {
        try {
          return JSON.parse(s) as import('@/types/message').SourceReference
        } catch {
          return { type: 'web' as const, url: s }
        }
      }
      return s
    }),
    search: row.search,
    documents: row.documents,
    reasoningContent: undefined, // Not stored in DB row directly
    reasoningTimeTaken: row.reasoning_time_taken,
    generationInfo: row.generationInfo,
    messageType: row.messageType,
    messageKind: row.messageKind,
    toolCalls: row.toolCalls,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    toolServerName: row.toolServerName,
    toolError: row.toolError,
  }
}

/**
 * Convert a unified ChatMessage to a database MessageRow.
 */
export function chatMessageToDbRow(msg: ChatMessage): MessageRow {
  return {
    id: msg.id,
    history_id: msg.historyId,
    role: msg.role,
    content: msg.content,
    images: msg.images,
    sources: msg.sources?.map(s => JSON.stringify(s)),
    search: msg.search,
    createdAt: msg.createdAt,
    reasoning_time_taken: msg.reasoningTimeTaken,
    generationInfo: msg.generationInfo,
    messageType: msg.messageType,
    messageKind: msg.messageKind,
    toolCalls: msg.toolCalls,
    toolCallId: msg.toolCallId,
    toolName: msg.toolName,
    toolServerName: msg.toolServerName,
    toolError: msg.toolError,
    modelName: msg.modelName,
    modelImage: msg.modelImage,
    documents: msg.documents,
    name: msg.name ?? (msg.role === 'user' ? 'You' : 'Assistant'),
  }
}

/**
 * Convert a ChatMessage to a UI display message.
 */
export function toUIMessage(msg: ChatMessage): UIMessage {
  return {
    isBot: msg.role === 'assistant' || msg.role === 'system' || msg.role === 'tool',
    name: msg.name ?? (msg.role === 'user' ? 'You' : 'Assistant'),
    message: msg.content,
    sources: msg.sources ?? [],
    images: msg.images,
    search: msg.search,
    reasoning_time_taken: msg.reasoningTimeTaken,
    id: msg.id,
    messageType: msg.messageType,
    modelName: msg.modelName,
    modelImage: msg.modelImage,
    documents: msg.documents,
    generationInfo: msg.generationInfo,
    messageKind: msg.messageKind,
    toolCalls: msg.toolCalls,
    toolCallId: msg.toolCallId,
    toolName: msg.toolName,
    toolServerName: msg.toolServerName,
    toolError: msg.toolError,
  }
}

/**
 * Convert a UI display message back to a ChatMessage.
 */
export function fromUIMessage(msg: UIMessage, historyId: string): ChatMessage {
  return {
    id: msg.id ?? '',
    historyId,
    role: msg.isBot ? 'assistant' : 'user',
    content: msg.message,
    images: msg.images,
    createdAt: Date.now(),
    name: msg.name,
    sources: msg.sources as import('@/types/message').SourceReference[],
    search: msg.search,
    documents: msg.documents,
    reasoningTimeTaken: msg.reasoning_time_taken,
    generationInfo: msg.generationInfo,
    messageType: msg.messageType,
    messageKind: msg.messageKind,
    toolCalls: msg.toolCalls,
    toolCallId: msg.toolCallId,
    toolName: msg.toolName,
    toolServerName: msg.toolServerName,
    toolError: msg.toolError,
    modelName: msg.modelName,
    modelImage: msg.modelImage,
  }
}

/**
 * Convert ChatMessage[] to simple role/content pairs for API history.
 */
export function toAPIHistory(
  messages: ChatMessage[]
): { role: MessageRole; content: string }[] {
  return messages.map(m => ({
    role: m.role,
    content: m.content,
  }))
}

/**
 * Group messages into human/ai conversation pairs.
 * Used for RAG query rewriting.
 */
export function groupMessagesByConversation(
  messages: ChatMessage[]
): { human: string; ai: string }[] {
  const pairs: { human: string; ai: string }[] = []
  let currentHuman = ''

  for (const msg of messages) {
    if (msg.role === 'user') {
      currentHuman = msg.content
    } else if (msg.role === 'assistant' && currentHuman) {
      pairs.push({ human: currentHuman, ai: msg.content })
      currentHuman = ''
    }
  }

  return pairs
}

/**
 * Database row types for all 17 tables.
 * Referenced from the original project's db/dexie/types.ts.
 */

import type { ProviderType } from '@/types/provider'

// === Chat ===

export interface HistoryInfo {
  id: string
  title: string
  is_rag: boolean
  message_source?: 'copilot' | 'web-ui' | 'branch'
  is_pinned?: boolean
  createdAt: number
  doc_id?: string
  last_used_prompt?: { prompt_id?: string; prompt_content?: string }
  model_id?: string
  folder_id?: string
}

export interface MessageRow {
  id: string
  history_id: string
  name: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  images?: string[]
  sources?: string[]
  search?: import('@/types/chat').WebSearch
  createdAt: number
  reasoning_time_taken?: number
  messageType?: string
  messageKind?: import('@/types/chat').ChatMessageKind
  toolCalls?: import('@/types/message').ToolCall[]
  toolCallId?: string
  toolName?: string
  toolServerName?: string
  toolError?: boolean
  generationInfo?: Record<string, unknown>
  modelName?: string
  modelImage?: string
  documents?: import('@/types/chat').ChatDocument[]
}

// === Prompts ===

export interface Prompt {
  id: string
  title: string
  content: string
  is_system: boolean
  createdBy?: string
  createdAt: number
}

// === Share ===

export interface Webshare {
  id: string
  title: string
  url: string
  api_url: string
  share_id: string
  createdAt: number
}

// === Session ===

export interface SessionFile {
  sessionId: string
  retrievalEnabled: boolean
  createdAt: number
}

export interface UserSettings {
  id: string
  user_id: string
  [key: string]: unknown
}

// === Knowledge ===

export interface Knowledge {
  id: string
  db_type: string
  title: string
  status: string
  embedding_model?: string
  systemPrompt?: string
  followupPrompt?: string
  createdAt: number
}

export interface DocumentRow {
  id: string
  db_type: string
  title: string
  status: string
  embedding_model?: string
  createdAt: number
}

export interface VectorData {
  id: string
  vectors: number[]
  [key: string]: unknown
}

// === Models ===

export interface OpenAIModelConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  createdAt: number
  provider: ProviderType
  db_type: string
  headers?: Record<string, string>
}

export interface CustomModel {
  id: string
  model_id: string
  name: string
  model_name: string
  model_image?: string
  provider_id: string
  lookup: string
  model_type: 'chat' | 'embedding'
  db_type: string
}

export interface ModelNickname {
  id: string
  model_id: string
  model_name: string
  model_avatar?: string
}

export interface ModelState {
  id: string
  model_id: string
  is_enabled: boolean
}

export interface ProviderState {
  id: string
  provider_id: string
  is_enabled: boolean
}

// === Memory ===

export interface Memory {
  id: string
  content: string
  createdAt: number
  updatedAt: number
}

// === Folders ===

export interface ProjectFolder {
  id: string
  title: string
  color?: string
  createdAt: number
}

// === MCP ===

export interface McpServerConfig {
  id: string
  name: string
  url?: string
  enabled: boolean
  transport: 'stdio' | 'sse' | 'streamable-http'
  updatedAt: number
  createdAt: number
  toolsLastSyncedAt?: number
  [key: string]: unknown
}

/**
 * Chat-related types shared across UI, hooks, and services.
 */

/** A document reference used in chat context */
export interface ChatDocument {
  title?: string
  url?: string
  type: 'tab' | 'file'
  tabId?: number
  favIconUrl?: string
  filename?: string
  fileSize?: number
}

export type ChatDocuments = ChatDocument[]

/** Web search metadata attached to a message */
export interface WebSearch {
  search_engine: string
  search_url: string
  search_query: string
  search_results: SearchLink[]
}

export interface SearchLink {
  title: string
  link: string
}

/** Message kind discriminator */
export type ChatMessageKind = 'text' | 'assistant_tool_calls' | 'tool_result' | 'status'

/** Queue item mode: supplement injects into current agent run, next_command waits for agent completion */
export type QueueItemMode = 'supplement' | 'next_command'

/** Queue item for deferred message sending during agent execution */
export interface QueueItem {
  id: string
  text: string
  mode: QueueItemMode
  order: number
}

/** Chat mode for the current session */
export type ChatMode = 'normal' | 'rag' | 'search' | 'tab' | 'document' | 'vision' | 'copilot' | 'mcp'

/** Message source */
export type MessageSource = 'copilot' | 'web-ui'

/** Copilot prompt type */
export type CopilotType = 'summary' | 'rephrase' | 'translate' | 'explain' | 'custom'

/** Action info for copilot context menu */
export interface ChatActionInfo {
  type: CopilotType
  text: string
  customPromptId?: string
}

/** Pending MCP approval */
export interface PendingMcpApproval {
  toolName: string
  serverName: string
  serverId: string
  args: Record<string, unknown>
  toolCallId: string
}

/** Uploaded file in chat */
export interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  content?: string
}

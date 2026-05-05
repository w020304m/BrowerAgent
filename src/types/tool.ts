/**
 * Tool types for MCP and function calling.
 * Replaces LangChain's DynamicStructuredTool and tool-related types.
 */

/** Tool definition sent to the model */
export interface ToolDefinition {
  /** Tool name */
  name: string
  /** Tool description */
  description?: string
  /** JSON Schema for parameters */
  parameters?: Record<string, unknown>
}

/** A completed tool call from model response */
export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  type: 'tool_call'
}

/** A partial tool call chunk during streaming */
export interface ToolCallChunk {
  id?: string
  name?: string
  /** Partial JSON string, accumulated across chunks */
  args: string
  index: number
  type: 'tool_call_chunk'
}

/** Tool execution result */
export interface ToolResult {
  toolCallId: string
  content: string
  isError: boolean
}

/** MCP tool call with server info */
export interface McpToolCall extends ToolCall {
  serverName: string
}

/** MCP server configuration stored in DB */
export interface McpServerConfig {
  id: string
  name: string
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  transport: 'stdio' | 'sse' | 'streamable-http'
  enabled: boolean
  headers?: Record<string, string>
  oauth?: {
    clientId?: string
    clientSecret?: string
    authorizationUrl?: string
    tokenUrl?: string
    scopes?: string[]
  }
  toolsLastSyncedAt?: number
  createdAt: number
  updatedAt: number
}

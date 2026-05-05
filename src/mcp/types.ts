/**
 * MCP domain types.
 * Unified types for MCP server connections, tools, OAuth, and action info.
 */

import type { ToolDefinition } from '@/types/tool'

/** MCP tool execution mode */
export type McpToolExecutionMode = 'allow' | 'human_in_loop' | 'disabled'

/** MCP available tool (cached) */
export interface McpAvailableTool {
  name: string
  description?: string
  inputSchema?: unknown
  enabled?: boolean
  executionMode?: McpToolExecutionMode
}

/** MCP OAuth tokens */
export interface McpOAuthTokens {
  accessToken: string
  refreshToken?: string
  tokenType: string
  expiresAt?: number
  scope?: string
}

/** MCP OAuth client registration */
export interface McpOAuthClientRegistration {
  clientId: string
  clientSecret?: string
  registrationAccessToken?: string
  redirectUris?: string[]
}

/** MCP OAuth metadata from discovery */
export interface McpOAuthMetadata {
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint?: string
  issuer?: string
  resourceMetadataUrl?: string
  scopesSupported?: string[]
}

/** MCP remote tool (from server list) */
export interface McpRemoteTool {
  name: string
  description?: string
  inputSchema?: unknown
}

/** MCP header for custom headers */
export interface McpHeader {
  key: string
  value: string
}

/** MCP server connection (transport + client) */
export interface McpServerConnection {
  client: unknown
  transport: unknown
}

/** MCP action info phase */
export type McpActionInfoPhase =
  | 'connecting'
  | 'loading_tools'
  | 'awaiting_approval'
  | 'calling_tool'
  | 'waiting_result'

/** MCP action info for UI state */
export interface McpActionInfo {
  type: 'mcp'
  phase: McpActionInfoPhase
  serverName?: string
  toolName?: string
  toolCount?: number
}

/** MCP connectable server (subset needed for connection) */
export type McpConnectableServer = {
  name: string
  url: string
  authType?: 'none' | 'bearer' | 'oauth'
  bearerToken?: string
  headers?: McpHeader[]
  oauthTokens?: McpOAuthTokens
}

/** MCP tool validation result */
export interface McpToolValidationResult {
  cachedTools: McpAvailableTool[]
  toolsLastSyncedAt: number
  toolsSyncError?: string
}

/** Convert MCP tools to ToolDefinitions with server prefix */
export function toToolDefinitions(
  tools: McpAvailableTool[],
  serverName: string
): ToolDefinition[] {
  return tools
    .filter((tool) => tool.enabled !== false)
    .map((tool) => ({
      name: `${serverName}__${tool.name}`,
      description: tool.description,
      parameters: tool.inputSchema as Record<string, unknown> | undefined,
    }))
}

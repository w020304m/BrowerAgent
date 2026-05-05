/**
 * MCP utility functions.
 * Tool name parsing, header building, content normalization, etc.
 */

import type {
  McpAvailableTool,
  McpHeader,
  McpOAuthTokens,
  McpToolExecutionMode,
} from './types'
import type { McpToolCall } from '@/types/tool'
import type { ChatMessageKind } from '@/types/chat'
import type { McpActionInfo } from './types'

/** Separator for server__tool name format */
export const MCP_TOOL_NAME_SEPARATOR = '__'

/** Check if a message kind is a trace message (tool calls or results) */
export const isTraceMessageKind = (messageKind?: ChatMessageKind): boolean =>
  messageKind === 'assistant_tool_calls' || messageKind === 'tool_result'

/** Check if a message kind is a regular text message */
export const isTextMessageKind = (messageKind?: ChatMessageKind): boolean =>
  !messageKind || messageKind === 'text'

/** Check if a message is a conversational message (not tool-related) */
export const isConversationMessage = ({
  role,
  messageKind,
}: {
  role?: string
  messageKind?: ChatMessageKind
}): boolean => role !== 'tool' && !isTraceMessageKind(messageKind)

/**
 * Parse an MCP tool name into server name and display name.
 * Format: `serverName__toolName`
 */
export const parseMcpToolName = (rawName: string) => {
  const separatorIndex = rawName.indexOf(MCP_TOOL_NAME_SEPARATOR)

  if (separatorIndex === -1) {
    return {
      rawName,
      serverName: undefined as string | undefined,
      displayName: rawName,
    }
  }

  return {
    rawName,
    serverName: rawName.slice(0, separatorIndex),
    displayName: rawName.slice(separatorIndex + MCP_TOOL_NAME_SEPARATOR.length),
  }
}

/** Sanitize MCP headers (filter empty/invalid entries) */
export const sanitizeHeaders = (headers?: McpHeader[]): McpHeader[] =>
  (headers ?? []).filter(
    (header) =>
      header &&
      typeof header.key === 'string' &&
      typeof header.value === 'string' &&
      header.key.trim().length > 0 &&
      header.value.trim().length > 0
  )

/** Get the execution mode for an MCP tool */
export const getMcpToolExecutionMode = (
  tool?: Pick<McpAvailableTool, 'enabled' | 'executionMode'>
): McpToolExecutionMode => {
  if (tool?.executionMode) {
    return tool.executionMode
  }
  if (tool?.enabled === false) {
    return 'disabled'
  }
  return 'human_in_loop'
}

/** Check if an MCP tool is enabled (not disabled) */
export const isMcpToolEnabled = (
  tool?: Pick<McpAvailableTool, 'enabled' | 'executionMode'>
): boolean => getMcpToolExecutionMode(tool) !== 'disabled'

/**
 * Build HTTP headers for MCP server requests.
 * Includes Bearer/OAuth authorization and custom headers.
 */
export const buildMcpHeaders = ({
  authType = 'none',
  bearerToken,
  headers,
  oauthTokens,
}: {
  authType?: 'none' | 'bearer' | 'oauth'
  bearerToken?: string
  headers?: McpHeader[]
  oauthTokens?: McpOAuthTokens
}): Record<string, string> => {
  const result: Record<string, string> = {}

  if (authType === 'bearer' && bearerToken?.trim()) {
    result.Authorization = `Bearer ${bearerToken.trim()}`
  } else if (authType === 'oauth' && oauthTokens?.accessToken) {
    result.Authorization = `Bearer ${oauthTokens.accessToken}`
  }

  for (const header of sanitizeHeaders(headers)) {
    result[header.key.trim()] = header.value.trim()
  }

  return result
}

/** Convert tool calls for storage (add server/display names) */
export const toStoredToolCalls = (
  toolCalls: McpToolCall[] = []
): McpToolCall[] =>
  toolCalls.map((toolCall) => {
    const parsed = parseMcpToolName(toolCall.name)
    return {
      id: toolCall.id,
      name: toolCall.name,
      args: toolCall.args ?? {},
      type: 'tool_call',
      serverName: toolCall.serverName || parsed.serverName || '',
    }
  })

/** Summarize tool calls for display */
export const summarizeToolCalls = (toolCalls: McpToolCall[] = []): string => {
  if (toolCalls.length === 0) {
    return ''
  }
  return toolCalls
    .map(
      (toolCall) =>
        parseMcpToolName(toolCall.name).displayName
    )
    .join(', ')
}

/** Stringify tool arguments for display */
export const stringifyToolArgs = (args: unknown): string => {
  try {
    return JSON.stringify(args ?? {}, null, 2)
  } catch {
    return String(args ?? '')
  }
}

/** Normalize MCP tool output content to a string */
export const normalizeToolContent = (content: unknown): string => {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    const flattened = content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item && typeof item === 'object') {
          if ('text' in item && typeof item.text === 'string') {
            return item.text
          }
          if ('type' in item && typeof item.type === 'string') {
            return JSON.stringify(item, null, 2)
          }
        }
        return String(item ?? '')
      })
      .filter(Boolean)
    return flattened.join('\n\n')
  }

  if (content && typeof content === 'object') {
    try {
      return JSON.stringify(content, null, 2)
    } catch {
      return String(content)
    }
  }

  return String(content ?? '')
}

/** Create MCP action info for UI state */
export const createMcpActionInfo = (
  phase: McpActionInfo['phase'],
  details?: Omit<McpActionInfo, 'type' | 'phase'>
): McpActionInfo => ({
  type: 'mcp',
  phase,
  ...details,
})

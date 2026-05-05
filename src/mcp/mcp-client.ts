/**
 * MCP Client Manager.
 * Manages connections to multiple MCP servers, provides tool listing and execution.
 * Returns ToolDefinition[] for use with IChatProvider, executes tools independently.
 */

import type { ToolDefinition, ToolResult, McpToolCall } from '@/types/tool'
import type { McpAvailableTool, McpConnectableServer, McpServerConnection, McpRemoteTool } from './types'
import { toToolDefinitions } from './types'
import {
  openMcpServerConnection,
  closeMcpServerConnection,
  listRemoteMcpTools,
  toCachedMcpTools,
} from './remote-tools'
import { parseMcpToolName, normalizeToolContent } from './utils'
import { getMcpErrorMessage, isAbortLikeError } from './errors'
import type { McpServerConfig } from '@/types/tool'

export class McpClientManager {
  private connections = new Map<string, McpServerConnection>()
  private servers: McpConnectableServer[]

  constructor(servers: McpConnectableServer[]) {
    this.servers = servers
  }

  /**
   * Get all tools from all connected servers as ToolDefinition[].
   * Uses cached tools from server config if available, otherwise fetches remotely.
   */
  async getTools(
    cachedToolsMap?: Map<string, McpAvailableTool[]>
  ): Promise<ToolDefinition[]> {
    const allTools: ToolDefinition[] = []

    for (const server of this.servers) {
      let tools: McpRemoteTool[]

      // Use cached tools if available and recently synced (within 5 minutes)
      const cachedTools = cachedToolsMap?.get(server.name)
      if (
        cachedTools &&
        cachedTools.length > 0
      ) {
        tools = cachedTools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }))
      } else {
        // Fetch from remote
        const connection = await this.getOrCreateConnection(server.name, server)
        tools = await listRemoteMcpTools(connection.client, server.name)
        this.connections.set(server.name, connection)
      }

      // Filter enabled tools and add server prefix
      const enabledTools = (cachedTools ?? toCachedMcpTools(tools)).filter(
        (t) => t.enabled !== false
      )
      allTools.push(...toToolDefinitions(enabledTools, server.name))
    }

    return allTools
  }

  /**
   * Execute a specific tool call on the appropriate MCP server.
   */
  async executeTool(
    toolCall: McpToolCall,
    signal?: AbortSignal
  ): Promise<ToolResult> {
    const parsed = parseMcpToolName(toolCall.name)
    const serverName = parsed.serverName ?? toolCall.serverName

    if (!serverName) {
      return {
        toolCallId: toolCall.id,
        content: `Error: Cannot determine server for tool "${toolCall.name}"`,
        isError: true,
      }
    }

    const server = this.servers.find((s) => s.name === serverName)
    if (!server) {
      return {
        toolCallId: toolCall.id,
        content: `Error: MCP server "${serverName}" not found`,
        isError: true,
      }
    }

    try {
      const connection = await this.getOrCreateConnection(serverName, server)
      const mcpClient = connection.client as {
        callTool: (
          params: { name: string; arguments?: Record<string, unknown> },
          options?: { signal?: AbortSignal }
        ) => Promise<{ content: unknown[] }>
      }

      const toolName = parsed.displayName ?? toolCall.name
      const args = (toolCall.args ?? {}) as Record<string, unknown>

      const result = await mcpClient.callTool(
        { name: toolName, arguments: args },
        { signal }
      )

      const content = normalizeToolContent(result.content)

      return {
        toolCallId: toolCall.id,
        content,
        isError: false,
      }
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw error
      }
      return {
        toolCallId: toolCall.id,
        content: `Error executing tool "${toolCall.name}": ${getMcpErrorMessage(error)}`,
        isError: true,
      }
    }
  }

  /**
   * Close all server connections.
   */
  async close(): Promise<void> {
    const promises = Array.from(this.connections.entries()).map(
      async ([name, connection]) => {
        try {
          await closeMcpServerConnection(connection)
        } catch (error) {
          // Log but don't throw during cleanup
          console.warn(`Error closing connection to "${name}":`, error)
        }
      }
    )
    this.connections.clear()
    await Promise.all(promises)
  }

  private async getOrCreateConnection(
    serverName: string,
    server: McpConnectableServer
  ): Promise<McpServerConnection> {
    const existing = this.connections.get(serverName)
    if (existing) return existing

    const connection = await openMcpServerConnection(server)
    this.connections.set(serverName, connection)
    return connection
  }
}

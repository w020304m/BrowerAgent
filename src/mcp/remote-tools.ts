/**
 * MCP remote tools.
 * Connects to MCP servers, lists tools, and caches tool schemas.
 * Depends on @modelcontextprotocol/sdk for StreamableHTTP transport.
 */

import { getMcpErrorMessage } from './errors'
import type { McpAvailableTool, McpConnectableServer, McpRemoteTool, McpToolValidationResult, McpServerConnection, McpHeader, McpOAuthTokens } from './types'
import { buildMcpHeaders, getMcpToolExecutionMode, isMcpToolEnabled } from './utils'
import { normalizeMcpToolSchema } from './tool-schema'

const MCP_CLIENT_INFO = {
  name: 'page-assist',
  version: '1',
  description: 'Use your locally running AI models to assist you in your web browsing',
  title: 'BrowserAgent',
}

/**
 * Open a connection to an MCP server.
 * Returns the client and transport for later cleanup.
 */
export async function openMcpServerConnection(
  server: McpConnectableServer
): Promise<McpServerConnection> {
  // Dynamic imports for MCP SDK (browser extension environment)
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  )

  let url: URL
  try {
    url = new URL(server.url)
  } catch {
    throw new Error(`Invalid MCP URL for server "${server.name}"`)
  }

  const headers = buildMcpHeaders({
    authType: server.authType ?? 'none',
    bearerToken: server.bearerToken,
    headers: server.headers,
    oauthTokens: server.oauthTokens,
  })

  const transportInit: Record<string, unknown> = {}
  if (Object.keys(headers).length > 0) {
    transportInit.requestInit = { headers }
  }

  const transport = new StreamableHTTPClientTransport(url, transportInit)

  const client = new Client(MCP_CLIENT_INFO)

  try {
    await client.connect(transport)
  } catch (error) {
    throw new Error(
      `Failed to connect to MCP server "${server.name}": ${getMcpErrorMessage(error)}`
    )
  }

  return { client, transport }
}

/**
 * Close an MCP server connection.
 */
export async function closeMcpServerConnection(
  connection: McpServerConnection
): Promise<void> {
  try {
    const transport = connection.transport as {
      terminateSession?: () => Promise<void>
    }
    await transport.terminateSession?.()
  } catch {
    // Ignore session termination errors during cleanup
  }
  const client = connection.client as { close: () => Promise<void> }
  await client.close()
}

/**
 * List tools from a connected MCP server.
 * Handles pagination via cursor.
 */
export async function listRemoteMcpTools(
  client: unknown,
  serverName: string
): Promise<McpRemoteTool[]> {
  const mcpClient = client as {
    listTools: (params?: { cursor?: string }) => Promise<{
      tools: Array<{ name?: string; description?: string; inputSchema?: unknown }>
      nextCursor?: string
    }>
  }

  const tools: McpRemoteTool[] = []
  let cursor: string | undefined = undefined

  try {
    do {
      const response = await mcpClient.listTools(cursor ? { cursor } : undefined)

      for (const remoteTool of response.tools ?? []) {
        if (!remoteTool?.name) continue
        tools.push({
          name: remoteTool.name,
          description: remoteTool.description ?? undefined,
          inputSchema: remoteTool.inputSchema
            ? normalizeMcpToolSchema(remoteTool.inputSchema)
            : undefined,
        })
      }

      cursor = response.nextCursor
    } while (cursor)
  } catch (error) {
    throw new Error(
      `Failed to load MCP tools from "${serverName}": ${getMcpErrorMessage(error)}`
    )
  }

  return tools
}

/**
 * Convert remote tools to cached tools, preserving existing execution modes.
 */
export function toCachedMcpTools(
  tools: McpRemoteTool[],
  existingTools?: McpAvailableTool[]
): McpAvailableTool[] {
  const existingByName = new Map(
    (existingTools ?? []).map((t) => [t.name, t])
  )

  return tools.map((tool) => {
    const existingTool = existingByName.get(tool.name)
    const executionMode = getMcpToolExecutionMode(existingTool)

    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      enabled: isMcpToolEnabled({ executionMode }),
      executionMode,
    }
  })
}

/**
 * Inspect tools from an MCP server and return cached results.
 * Opens connection, lists tools, closes connection.
 */
export async function inspectMcpServerTools(
  server: McpConnectableServer & { cachedTools?: McpAvailableTool[] }
): Promise<McpToolValidationResult> {
  const connection = await openMcpServerConnection(server)

  try {
    const cachedTools = toCachedMcpTools(
      await listRemoteMcpTools(connection.client, server.name),
      server.cachedTools
    )

    if (cachedTools.length === 0) {
      throw new Error(`No MCP tools were loaded from "${server.name}".`)
    }

    return {
      cachedTools,
      toolsLastSyncedAt: Date.now(),
      toolsSyncError: undefined,
    }
  } finally {
    await closeMcpServerConnection(connection)
  }
}

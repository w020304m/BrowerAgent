/**
 * MCP tool source — wraps existing McpClientManager.
 * Loads tools from MCP servers via the project's McpClientManager.
 * Caches the client across agent runs for connection reuse.
 */

import type { ToolDefinition } from '@/types/tool'
import { McpClientManager } from '@/mcp/mcp-client'
import type { McpConnectableServer } from '@/mcp/types'
import { mcpServerRepo } from '@/db/repositories/mcp-server.repository'
import type { IToolSource, ToolGroup, ToolSourceType } from '../types'

// Module-level cache for connection reuse across agent runs
let cachedClient: McpClientManager | null = null
let cachedServerKey: string = ''

function computeServerKey(servers: McpConnectableServer[]): string {
  return servers.map(s => {
    const auth = s.authType === 'bearer' ? `:bearer:${s.bearerToken?.slice(-8)}` : s.authType === 'oauth' ? ':oauth' : ''
    return `${s.name}@${s.url}${auth}`
  }).sort().join('|')
}

export class McpToolSource implements IToolSource {
  readonly id = 'mcp'
  readonly label = 'MCP Tools'
  readonly type: ToolSourceType = 'mcp'

  private serverNames: string[] = []
  private ownsClient = false

  async loadTools(): Promise<ToolDefinition[]> {
    const servers = await mcpServerRepo.getEnabled()
    this.serverNames = servers.map((s) => s.name)

    const connectable: McpConnectableServer[] = servers
      .filter((s) => s.url)
      .map((s) => {
        const raw = s as unknown as Record<string, unknown>
        const server: McpConnectableServer = {
          name: s.name,
          url: s.url!,
        }
        if (raw.authType)
          server.authType = raw.authType as McpConnectableServer['authType']
        if (raw.bearerToken)
          server.bearerToken = raw.bearerToken as string
        if (raw.oauthTokens)
          server.oauthTokens = raw.oauthTokens as McpConnectableServer['oauthTokens']
        return server
      })

    if (connectable.length === 0) return []

    const key = computeServerKey(connectable)

    // Reuse cached client if servers haven't changed
    if (cachedClient && cachedServerKey === key) {
      this.ownsClient = false
      return cachedClient.getTools()
    }

    // Dispose old client if servers changed
    if (cachedClient) {
      await cachedClient.close().catch(() => {})
      cachedClient = null
    }

    // Create new client
    const client = new McpClientManager(connectable)
    cachedClient = client
    cachedServerKey = key
    this.ownsClient = true
    return client.getTools()
  }

  getGroups(): ToolGroup[] {
    return this.serverNames.map((name) => ({
      id: `mcp__${name.replace(/\s+/g, '_')}`,
      label: name,
      sourceId: this.id,
    }))
  }

  getClient(): McpClientManager | null {
    return cachedClient
  }

  async dispose(): Promise<void> {
    // Don't close the cached client on individual source disposal.
    // The client is reused across runs. It will be closed when:
    // 1. Server config changes (next loadTools() call)
    // 2. closeCachedClient() is called explicitly
  }
}

/**
 * Force-close the cached MCP client.
 * Call this when the extension is shutting down or when a full reset is needed.
 */
export async function closeCachedMcpClient(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close().catch(() => {})
    cachedClient = null
    cachedServerKey = ''
  }
}

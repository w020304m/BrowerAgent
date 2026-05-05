/**
 * MCP server repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { McpServerConfig } from '@/types/tool'
import type { McpAvailableTool } from '@/mcp/types'

export class McpServerRepository extends BaseRepository<McpServerConfig> {
  protected table = db.mcpServers

  /** Get all enabled MCP servers */
  async getEnabled(): Promise<McpServerConfig[]> {
    const all = await this.table.toArray()
    return all.filter((s) => s.enabled)
  }

  /** Update tools sync data for a server */
  async updateToolsSync(
    id: string,
    cachedTools: McpAvailableTool[],
    error?: string
  ): Promise<void> {
    await this.table.update(id, {
      cachedTools,
      toolsLastSyncedAt: Date.now(),
      toolsSyncError: error,
      updatedAt: Date.now(),
    } as Record<string, unknown>)
  }

  /** Update OAuth data for a server */
  async updateOAuthData(
    id: string,
    data: {
      authType: 'none' | 'bearer' | 'oauth'
      oauthTokens?: unknown
      oauthMetadata?: unknown
      oauthClientRegistration?: unknown
    }
  ): Promise<void> {
    await this.table.update(id, {
      ...data,
      updatedAt: Date.now(),
    } as Record<string, unknown>)
  }

  /** Clear OAuth data for a server */
  async clearOAuthData(id: string): Promise<void> {
    await this.table.update(id, {
      authType: 'none',
      oauthTokens: undefined,
      updatedAt: Date.now(),
    } as Record<string, unknown>)
  }
}

export const mcpServerRepo = new McpServerRepository()

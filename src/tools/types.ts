/**
 * Unified tool system types.
 * Tool sources (MCP, builtin, subagent) implement IToolSource.
 */

import type { ToolDefinition } from '@/types/tool'

/** Tool source type */
export type ToolSourceType = 'mcp' | 'builtin' | 'subagent'

/** Tool group definition */
export interface ToolGroup {
  id: string
  label: string
  sourceId: string
}

/** Tool source interface */
export interface IToolSource {
  readonly id: string
  readonly label: string
  readonly type: ToolSourceType

  /** Load all tool definitions from this source */
  loadTools(): Promise<ToolDefinition[]>
  /** Return groups for UI display */
  getGroups(): ToolGroup[]
  /** Release resources */
  dispose(): Promise<void>
}

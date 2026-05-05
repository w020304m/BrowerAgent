/**
 * Builtin tool source — WebAgent tools using BridgeService.
 * Returns ToolDefinition[] from the agent tools system.
 */

import type { ToolDefinition } from '@/types/tool'
import type { IToolSource, ToolGroup, ToolSourceType } from '../types'
import { AGENT_TOOLS, AGENT_GROUPS } from '@/agent/tools/schemas'

export class BuiltinToolSource implements IToolSource {
  readonly id = 'builtin'
  readonly label = 'Built-in Tools'
  readonly type: ToolSourceType = 'builtin'

  async loadTools(): Promise<ToolDefinition[]> {
    return AGENT_TOOLS
  }

  getGroups(): ToolGroup[] {
    return AGENT_GROUPS
  }

  async dispose(): Promise<void> {
    // no-op
  }
}

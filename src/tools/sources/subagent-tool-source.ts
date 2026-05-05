/**
 * SubAgent tool source — stub for future implementation.
 */

import type { ToolDefinition } from '@/types/tool'
import type { IToolSource, ToolGroup, ToolSourceType } from '../types'

export class SubAgentToolSource implements IToolSource {
  readonly id = 'subagent'
  readonly label = 'SubAgent'
  readonly type: ToolSourceType = 'subagent'

  async loadTools(): Promise<ToolDefinition[]> {
    return []
  }

  getGroups(): ToolGroup[] {
    return []
  }

  async dispose(): Promise<void> {
    // no-op
  }
}

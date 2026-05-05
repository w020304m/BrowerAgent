/**
 * ToolRegistry: aggregates tools from multiple IToolSource instances.
 * Applies three-level filtering: source → group → single tool.
 */

import type { ToolDefinition } from '@/types/tool'
import { toolSettings } from '@/storage/tool-settings'
import type { IToolSource, ToolGroup } from './types'
import { TOOL_GROUP_MAP } from '@/agent/tools/schemas'

export class ToolRegistry {
  private readonly sources = new Map<string, IToolSource>()

  registerSource(source: IToolSource): void {
    this.sources.set(source.id, source)
  }

  unregisterSource(sourceId: string): void {
    this.sources.delete(sourceId)
  }

  /**
   * Load tools from all sources, applying three-level filtering.
   * All three levels must pass for a tool to be included.
   */
  async loadAllTools(): Promise<ToolDefinition[]> {
    const [sourceSettings, groupSettings, toolSettingsMap] = await Promise.all([
      toolSettings.getAllSourceSettings(),
      toolSettings.getAllGroupSettings(),
      toolSettings.getAllToolSettings(),
    ])

    const result: ToolDefinition[] = []

    for (const source of this.sources.values()) {
      // Level 1: source enabled?
      if (!sourceSettings[source.id]) continue

      const tools = await source.loadTools()
      const groups = source.getGroups()

      // Build tool → group mapping
      const toolGroupMap = new Map<string, string>()
      for (const group of groups) {
        for (const tool of tools) {
          if (tool.name === group.id || tool.name.startsWith(group.id + '_')) {
            toolGroupMap.set(tool.name, group.id)
          }
        }
      }
      // Merge explicit mappings from agent tool schemas
      for (const [toolName, groupId] of Object.entries(TOOL_GROUP_MAP)) {
        if (!toolGroupMap.has(toolName)) {
          toolGroupMap.set(toolName, groupId)
        }
      }

      for (const tool of tools) {
        // Level 2: group enabled? (skip if no group assigned)
        const groupId = toolGroupMap.get(tool.name)
        if (groupId && !groupSettings[groupId]) continue

        // Level 3: single tool enabled?
        if (toolSettingsMap[tool.name] === false) continue

        result.push(tool)
      }
    }

    return result
  }

  /** Get all groups (for UI display) */
  getAllGroups(): ToolGroup[] {
    const groups: ToolGroup[] = []
    for (const source of this.sources.values()) {
      groups.push(...source.getGroups())
    }
    return groups
  }

  /** Dispose all sources */
  async disposeAll(): Promise<void> {
    const promises = Array.from(this.sources.values()).map((source) =>
      source.dispose().catch(() => {}),
    )
    await Promise.all(promises)
  }
}

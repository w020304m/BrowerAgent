/**
 * Three-level tool settings storage (source → group → single tool).
 * Uses the project's StorageService with chrome.storage.local.
 */

import { localStorageService } from '@/storage/index'
import { AGENT_TOOLS, AGENT_GROUPS, TOOL_GROUP_MAP } from '@/agent/tools/schemas'

const SOURCE_KEY = 'toolSourceSettings'
const GROUP_KEY = 'toolGroupSettings'
const TOOL_KEY = 'singleToolSettings'

const DEFAULT_SOURCE: Record<string, boolean> = {
  mcp: true,
  builtin: true,
}

const DEFAULT_GROUP: Record<string, boolean> = (() => {
  const defaults: Record<string, boolean> = {}
  for (const group of AGENT_GROUPS) {
    defaults[group.id] = true
  }
  return defaults
})()

const DEFAULT_TOOL: Record<string, boolean> = (() => {
  const defaults: Record<string, boolean> = {}
  for (const tool of AGENT_TOOLS) {
    defaults[tool.name] = true
  }
  return defaults
})()

async function readSettings(
  key: string,
  defaults: Record<string, boolean>,
): Promise<Record<string, boolean>> {
  const stored = await localStorageService.get<Record<string, boolean>>(key)
  if (!stored || typeof stored !== 'object') return { ...defaults }
  return { ...defaults, ...stored }
}

async function writeSettings(
  key: string,
  value: Record<string, boolean>,
): Promise<void> {
  await localStorageService.set(key, value)
}

export const toolSettings = {
  // ── Source level ──

  async isSourceEnabled(sourceId: string): Promise<boolean> {
    const all = await this.getAllSourceSettings()
    return all[sourceId] ?? true
  },

  async setSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
    const all = await this.getAllSourceSettings()
    all[sourceId] = enabled
    await writeSettings(SOURCE_KEY, all)
  },

  async getAllSourceSettings(): Promise<Record<string, boolean>> {
    return readSettings(SOURCE_KEY, DEFAULT_SOURCE)
  },

  // ── Group level ──

  async isGroupEnabled(groupId: string): Promise<boolean> {
    const all = await this.getAllGroupSettings()
    return all[groupId] ?? true
  },

  async setGroupEnabled(groupId: string, enabled: boolean): Promise<void> {
    const all = await this.getAllGroupSettings()
    all[groupId] = enabled
    await writeSettings(GROUP_KEY, all)
  },

  async getAllGroupSettings(): Promise<Record<string, boolean>> {
    return readSettings(GROUP_KEY, DEFAULT_GROUP)
  },

  // ── Single tool level ──

  async isToolEnabled(toolName: string): Promise<boolean> {
    const all = await this.getAllToolSettings()
    return all[toolName] ?? true
  },

  async setToolEnabled(toolName: string, enabled: boolean): Promise<void> {
    const all = await this.getAllToolSettings()
    all[toolName] = enabled
    await writeSettings(TOOL_KEY, all)
  },

  async getAllToolSettings(): Promise<Record<string, boolean>> {
    return readSettings(TOOL_KEY, DEFAULT_TOOL)
  },
}

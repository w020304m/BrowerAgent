/**
 * Agent-specific settings stored in chrome.storage.local.
 */

import { localStorageService } from './index'

export interface AgentSettings {
  /** Model context window in tokens. 0 = auto (use numCtx or default 128000) */
  contextWindowTokens: number
}

const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  contextWindowTokens: 0,
}

const STORAGE_KEY = 'agentSettings'

export const agentSettings = {
  async getSettings(): Promise<AgentSettings> {
    const stored = await localStorageService.get<AgentSettings>(STORAGE_KEY)
    return { ...DEFAULT_AGENT_SETTINGS, ...stored }
  },

  async setSettings(settings: Partial<AgentSettings>): Promise<void> {
    const current = await this.getSettings()
    await localStorageService.set(STORAGE_KEY, { ...current, ...settings })
  },

  async getContextWindowTokens(): Promise<number> {
    const settings = await this.getSettings()
    return settings.contextWindowTokens
  },

  async setContextWindowTokens(tokens: number): Promise<void> {
    await this.setSettings({ contextWindowTokens: tokens })
  },
}

/**
 * Per-model and global model settings storage.
 * Manages the 3-layer configuration: session > model > global.
 */

import { localStorageService, syncStorageService } from './index'

/** Structure for persisting last-used model info with provider type */
export interface LastUsedModelInfo {
  providerType: string
  modelId: string
}

/** All configurable model parameters */
export interface ModelSettings {
  keepAlive?: string
  temperature?: number
  topK?: number
  topP?: number
  minP?: number
  numCtx?: number
  numPredict?: number
  numGpu?: number
  numGqa?: number
  numBatch?: number
  numKeep?: number
  numThread?: number
  repeatLastN?: number
  repeatPenalty?: number
  tfsZ?: number
  typicalP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  seed?: number
  stop?: string[]
  useMlock?: boolean
  useMMap?: boolean
  f16KV?: boolean
  logitsAll?: boolean
  vocabOnly?: boolean
  penalizeNewline?: boolean
  ropeFrequencyBase?: number
  ropeFrequencyScale?: number
  mirostat?: number
  mirostatEta?: number
  mirostatTau?: number
  reasoningEffort?: string
  thinking?: boolean | 'low' | 'medium' | 'high'
}

const MODEL_SETTINGS_PREFIX = 'modelSettings:'
const LAST_USED_MODEL_PREFIX = 'lastUsedChatModel-'
const LAST_USED_PROMPT_PREFIX = 'lastUsedChatSystemPrompt-'

// Global model setting keys (stored in sync)
const GLOBAL_MODEL_SETTING_KEYS: (keyof ModelSettings)[] = [
  'keepAlive', 'temperature', 'topK', 'topP', 'minP',
  'numCtx', 'numPredict', 'numGpu', 'numGqa', 'numBatch',
  'numKeep', 'numThread', 'repeatLastN', 'repeatPenalty',
  'tfsZ', 'typicalP', 'frequencyPenalty', 'presencePenalty',
  'seed', 'useMlock', 'useMMap', 'f16KV', 'logitsAll',
  'vocabOnly', 'penalizeNewline', 'ropeFrequencyBase',
  'ropeFrequencyScale', 'mirostat', 'mirostatEta', 'mirostatTau',
  'reasoningEffort', 'thinking'
]

export const modelSettingsStorage = {
  /**
   * Get all global model settings.
   */
  async getGlobalSettings(): Promise<ModelSettings> {
    const settings: ModelSettings = {}
    for (const key of GLOBAL_MODEL_SETTING_KEYS) {
      const value = await syncStorageService.get<unknown>(key)
      if (value !== undefined) {
        ;(settings as Record<string, unknown>)[key] = value
      }
    }
    return settings
  },

  /**
   * Get model-specific settings.
   */
  async getModelSettings(modelId: string): Promise<ModelSettings> {
    const settings = await localStorageService.get<ModelSettings>(
      `${MODEL_SETTINGS_PREFIX}${modelId}`
    )
    return settings ?? {}
  },

  /**
   * Set model-specific settings.
   */
  async setModelSettings(
    modelId: string,
    settings: ModelSettings
  ): Promise<void> {
    await localStorageService.set(
      `${MODEL_SETTINGS_PREFIX}${modelId}`,
      settings
    )
  },

  /**
   * Get the last used model for a chat session.
   * Returns both provider type and model ID.
   */
  async getLastUsedModel(historyId: string): Promise<LastUsedModelInfo | undefined> {
    // Try new format first
    const newFormat = await syncStorageService.get<LastUsedModelInfo>(
      `${LAST_USED_MODEL_PREFIX}${historyId}`
    )
    if (newFormat && typeof newFormat === 'object' && 'modelId' in newFormat) {
      return newFormat
    }

    // Fallback: migrate old string format
    const oldFormat = await syncStorageService.get<string>(
      `${LAST_USED_MODEL_PREFIX}${historyId}`
    )
    if (typeof oldFormat === 'string' && oldFormat) {
      const migrated: LastUsedModelInfo = { providerType: 'ollama', modelId: oldFormat }
      await this.setLastUsedModel(historyId, migrated)
      return migrated
    }

    return undefined
  },

  /**
   * Set the last used model for a chat session.
   * Accepts either a full LastUsedModelInfo object or a legacy string modelId.
   */
  async setLastUsedModel(historyId: string, model: LastUsedModelInfo | string): Promise<void> {
    const value: LastUsedModelInfo = typeof model === 'string'
      ? { providerType: 'ollama', modelId: model }
      : model
    await syncStorageService.set(
      `${LAST_USED_MODEL_PREFIX}${historyId}`,
      value
    )
  },

  /**
   * Get the last used system prompt for a chat session.
   */
  async getLastUsedPrompt(
    historyId: string
  ): Promise<{ prompt_id?: string; prompt_content?: string } | undefined> {
    return syncStorageService.get(`${LAST_USED_PROMPT_PREFIX}${historyId}`)
  },

  /**
   * Set the last used system prompt for a chat session.
   */
  async setLastUsedPrompt(
    historyId: string,
    prompt: { prompt_id?: string; prompt_content?: string }
  ): Promise<void> {
    await syncStorageService.set(
      `${LAST_USED_PROMPT_PREFIX}${historyId}`,
      prompt
    )
  },

  /**
   * Check if restore last model is enabled.
   */
  async isRestoreLastModelEnabled(): Promise<boolean> {
    return syncStorageService.get('restoreLastChatModel', false)
  },

  /**
   * Set restore last model preference.
   */
  async setRestoreLastModelEnabled(enabled: boolean): Promise<void> {
    await syncStorageService.set('restoreLastChatModel', enabled)
  }
}

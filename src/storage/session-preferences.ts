/**
 * Session preferences storage — per-chat-session preferences persisted to chrome.storage.local.
 * Includes model/provider/mode selection and agent run summaries.
 */

import { localStorageService } from './index'
import type { AgentRunSummary } from '@/agent/types'
import type { ChatMode } from '@/chat-pipeline/types'
import type { ProviderType } from '@/types/provider'

// ── Key prefixes ──

const SESSION_PREFS_PREFIX = 'sessionPrefs:'
const AGENT_SUMMARY_PREFIX = 'agentSummary:'
const COMPRESSED_HISTORY_PREFIX = 'compressedHistory:'

// ── Types ──

/** Per-session preferences persisted alongside each chat history */
export interface ChatSessionPreferences {
  providerType: ProviderType
  modelId: string
  providerConfigId: string | null
  mode: ChatMode
  agentEnabled: boolean
  isTemporary?: boolean
  selectedPromptId?: string | null
}

// ── Session Preferences ──

export const sessionPreferencesStorage = {
  async get(historyId: string): Promise<ChatSessionPreferences | undefined> {
    return localStorageService.get<ChatSessionPreferences>(`${SESSION_PREFS_PREFIX}${historyId}`)
  },

  async set(historyId: string, prefs: ChatSessionPreferences): Promise<void> {
    await localStorageService.set(`${SESSION_PREFS_PREFIX}${historyId}`, prefs)
  },

  async remove(historyId: string): Promise<void> {
    await localStorageService.remove(`${SESSION_PREFS_PREFIX}${historyId}`)
  },
}

// ── Agent Run Summary ──

export const agentSummaryStorage = {
  async get(historyId: string): Promise<AgentRunSummary | undefined> {
    return localStorageService.get<AgentRunSummary>(`${AGENT_SUMMARY_PREFIX}${historyId}`)
  },

  async set(historyId: string, summary: AgentRunSummary): Promise<void> {
    await localStorageService.set(`${AGENT_SUMMARY_PREFIX}${historyId}`, summary)
  },

  async remove(historyId: string): Promise<void> {
    await localStorageService.remove(`${AGENT_SUMMARY_PREFIX}${historyId}`)
  },
}

// ── Compressed Conversation History Summary ──

export const compressedHistoryStorage = {
  async get(historyId: string): Promise<string | undefined> {
    return localStorageService.get<string>(`${COMPRESSED_HISTORY_PREFIX}${historyId}`)
  },

  async set(historyId: string, summary: string): Promise<void> {
    await localStorageService.set(`${COMPRESSED_HISTORY_PREFIX}${historyId}`, summary)
  },

  async remove(historyId: string): Promise<void> {
    await localStorageService.remove(`${COMPRESSED_HISTORY_PREFIX}${historyId}`)
  },
}

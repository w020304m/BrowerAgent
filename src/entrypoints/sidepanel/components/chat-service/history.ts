/**
 * History compression and message building utilities
 */

import type { ChatMessage } from '@/types/message'
import { generateId } from '@/types/common'
import { createChatProvider } from '@/providers/factory'
import { getBaseUrl, getApiKey, getHeaders } from './config'
import { compressedHistoryStorage } from '@/storage/session-preferences'

/**
 * Compress conversation history using the current provider.
 * Reuses the same config loading as the normal pipeline so it always works
 * if normal chat works. Returns the summary string on success, or throws.
 */
export async function compressHistory(store: typeof import('@/store/chat-store').useChatStore): Promise<string> {
  const state = store.getState()
  const { providerType, modelId, providerConfigId, messages } = state

  // Filter conversation messages (user + assistant text, no internals)
  const conversationMessages = messages.filter(msg => {
    if (msg.role === 'user' && msg.content) return true
    if (
      msg.role === 'assistant' &&
      msg.content &&
      !msg.toolCalls?.length &&
      !msg.reasoningContent &&
      msg.messageKind !== 'assistant_tool_calls' &&
      msg.messageKind !== 'tool_result' &&
      msg.messageKind !== 'status'
    ) return true
    return false
  })

  if (conversationMessages.length <= 2) {
    throw new Error('Not enough messages to compress')
  }

  const formatted = conversationMessages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  const prompt = [
    'Summarize the following conversation in 3-5 sentences, preserving key decisions, results, and context:',
    '',
    formatted,
  ].join('\n')

  // Load provider config using the SAME functions as the normal pipeline
  const configId = providerConfigId
  const baseUrl = await getBaseUrl(providerType, configId)
  if (!baseUrl) throw new Error(`No base URL configured for provider: ${providerType}`)
  const apiKey = await getApiKey(providerType, configId)
  const headers = await getHeaders(providerType, configId)

  const provider = createChatProvider({
    provider: providerType,
    model: modelId,
    baseUrl,
    apiKey,
    headers,
    params: {},
  })

  const llmMessages: ChatMessage[] = [{
    id: generateId(),
    historyId: '',
    role: 'user',
    content: prompt,
    createdAt: Date.now(),
  }]

  const result = await provider.chat(llmMessages)
  const summary = result.content?.trim()
  if (!summary) throw new Error('LLM returned empty summary')

  // Store compressed summary in Zustand
  store.getState().setCompressedHistorySummary(summary)

  // Persist to storage (survives page reload)
  const historyId = store.getState().historyId
  if (historyId) {
    try {
      await compressedHistoryStorage.set(historyId, summary)
    } catch {
      // Storage write failure is non-critical
    }
  }

  return summary
}

/**
 * Build messages for the normal (non-agent) pipeline.
 * If a compressed history summary exists, replaces the raw message history
 * with a summary pair, keeping the last 2 messages for immediate context.
 */
export function buildMessagesForPipeline(
  allMessages: ChatMessage[],
  excludeId: string,
  store: typeof import('@/store/chat-store').useChatStore,
): ChatMessage[] {
  const filtered = allMessages.filter(m => m.id !== excludeId)
  const compressed = store.getState().compressedHistorySummary

  if (!compressed) return filtered

  // Keep only the last 2 raw messages for continuity, prepend summary
  const recent = filtered.slice(-2)
  return [
    {
      id: '__compressed_summary_user__',
      historyId: '',
      role: 'user',
      content: `Summary of earlier conversation (compressed):\n${compressed}`,
      createdAt: Date.now() - 2,
    },
    {
      id: '__compressed_summary_assistant__',
      historyId: '',
      role: 'assistant',
      content: 'Understood the conversation summary.',
      createdAt: Date.now() - 1,
    },
    ...recent,
  ]
}

/**
 * Database persistence utilities for chat service
 */

import type { ChatMessage } from '@/types/message'
import type { ChatMode } from '@/chat-pipeline/types'
import { chatMessageToDbRow } from '@/message/formatter'
import { messageRepo } from '@/db/repositories/message.repository'
import { chatHistoryRepo } from '@/db/repositories/chat-history.repository'

/**
 * Save a chat message to the database.
 */
export async function saveMessageToDb(msg: ChatMessage): Promise<void> {
  const row = chatMessageToDbRow(msg)
  await messageRepo.add(row)
}

/**
 * Create or update chat history record.
 */
export async function updateChatHistory(historyId: string, lastMessage: string, mode: ChatMode): Promise<void> {
  const existing = await chatHistoryRepo.getById(historyId)
  if (existing) {
    await chatHistoryRepo.update(historyId, {
      last_used_prompt: { prompt_content: lastMessage },
    })
  } else {
    await chatHistoryRepo.add({
      id: historyId,
      title: lastMessage || 'New Chat',
      is_rag: mode === 'rag',
      message_source: 'web-ui',
      is_pinned: false,
      createdAt: Date.now(),
    })
  }
}

/**
 * Message repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { MessageRow } from '../types'

export class MessageRepository extends BaseRepository<MessageRow> {
  protected table = db.messages

  async getByHistoryId(historyId: string): Promise<MessageRow[]> {
    return this.table
      .where('history_id')
      .equals(historyId)
      .sortBy('createdAt')
  }

  async updateMessageContent(id: string, content: string): Promise<void> {
    await this.update(id, { content })
  }

  async deleteByHistoryId(historyId: string): Promise<void> {
    await this.table
      .where('history_id')
      .equals(historyId)
      .delete()
  }

  async getLastAssistantMessage(historyId: string): Promise<MessageRow | undefined> {
    return this.table
      .where('history_id')
      .equals(historyId)
      .filter(m => m.role === 'assistant')
      .reverse()
      .first()
  }

  async deleteMessagesAfterIndex(historyId: string, afterCreatedAt: number): Promise<void> {
    await this.table
      .where('history_id')
      .equals(historyId)
      .filter(m => m.createdAt > afterCreatedAt)
      .delete()
  }

  async countByHistoryId(historyId: string): Promise<number> {
    return this.table
      .where('history_id')
      .equals(historyId)
      .count()
  }

  /**
   * Add multiple messages for a history in bulk.
   */
  async addBulkForHistory(messages: MessageRow[]): Promise<void> {
    await this.bulkAdd(messages)
  }
}

export const messageRepo = new MessageRepository()

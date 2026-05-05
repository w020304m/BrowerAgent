/**
 * Chat history repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { HistoryInfo } from '../types'

export class ChatHistoryRepository extends BaseRepository<HistoryInfo> {
  protected table = db.chatHistories

  async getBySource(source: 'copilot' | 'web-ui'): Promise<HistoryInfo | undefined> {
    return this.table
      .where('message_source')
      .equals(source)
      .reverse()
      .first()
  }

  async searchByTitle(query: string): Promise<HistoryInfo[]> {
    const lower = query.toLowerCase()
    return this.table
      .filter(h => h.title.toLowerCase().includes(lower))
      .toArray()
  }

  async getPaginated(
    offset: number,
    limit: number
  ): Promise<HistoryInfo[]> {
    return this.table
      .orderBy('createdAt')
      .reverse()
      .offset(offset)
      .limit(limit)
      .toArray()
  }

  async updatePinStatus(id: string, isPinned: boolean): Promise<void> {
    await this.update(id, { is_pinned: isPinned })
  }

  async getPinned(): Promise<HistoryInfo[]> {
    return this.table
      .where('is_pinned')
      .equals(1) // Dexie stores boolean as 0/1
      .reverse()
      .sortBy('createdAt')
  }

  async deleteByDateRange(
    range: 'today' | 'yesterday' | 'last7Days' | 'older'
  ): Promise<string[]> {
    const now = Date.now()
    const oneDayMs = 86400000

    let start: number
    let end: number

    switch (range) {
      case 'today':
        start = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        end = now
        break
      case 'yesterday':
        start = new Date(new Date(new Date().setDate(new Date().getDate() - 1)).setHours(0, 0, 0, 0)).getTime()
        end = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        break
      case 'last7Days':
        start = now - 7 * oneDayMs
        end = now
        break
      case 'older':
        start = 0
        end = now - 30 * oneDayMs
        break
    }

    const toDelete = await this.table
      .where('createdAt')
      .between(start, end)
      .filter(h => !h.is_pinned)
      .toArray()

    const ids = toDelete.map(h => h.id)
    await this.bulkDelete(ids)
    return ids
  }

  async countBySource(source: 'copilot' | 'web-ui'): Promise<number> {
    return this.table
      .where('message_source')
      .equals(source)
      .count()
  }
}

export const chatHistoryRepo = new ChatHistoryRepository()

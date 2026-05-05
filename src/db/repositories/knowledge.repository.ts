/**
 * Knowledge base repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { Knowledge } from '../types'

export class KnowledgeRepository extends BaseRepository<Knowledge> {
  protected table = db.knowledge

  async getByStatus(status: string): Promise<Knowledge[]> {
    return this.table
      .where('status')
      .equals(status)
      .toArray()
  }

  async searchByTitle(query: string): Promise<Knowledge[]> {
    const lower = query.toLowerCase()
    return this.table
      .filter(k => k.title.toLowerCase().includes(lower))
      .toArray()
  }
}

export const knowledgeRepo = new KnowledgeRepository()

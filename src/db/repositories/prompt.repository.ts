/**
 * Prompt repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { Prompt } from '../types'

export class PromptRepository extends BaseRepository<Prompt> {
  protected table = db.prompts

  async getSystemPrompts(): Promise<Prompt[]> {
    return this.table
      .filter(p => p.is_system === true)
      .toArray()
  }

  async getUserPrompts(): Promise<Prompt[]> {
    return this.table
      .filter(p => p.is_system === false)
      .toArray()
  }

  async searchByTitle(query: string): Promise<Prompt[]> {
    const lower = query.toLowerCase()
    return this.table
      .filter(p => p.title.toLowerCase().includes(lower))
      .toArray()
  }
}

export const promptRepo = new PromptRepository()

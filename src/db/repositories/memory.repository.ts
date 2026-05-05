/**
 * Memory repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { Memory } from '../types'

export class MemoryRepository extends BaseRepository<Memory> {
  protected table = db.memories
}

export const memoryRepo = new MemoryRepository()

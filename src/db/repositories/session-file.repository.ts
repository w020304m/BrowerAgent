/**
 * Session file repository.
 * Uses sessionId as the primary key (not id).
 */

import { db } from '../schema'
import type { SessionFile } from '../types'

export class SessionFileRepository {
  protected table = db.sessionFiles

  async getAll(): Promise<SessionFile[]> {
    return this.table.toArray()
  }

  async add(item: SessionFile): Promise<string> {
    return this.table.add(item) as unknown as Promise<string>
  }

  async bulkAdd(items: SessionFile[]): Promise<void> {
    await this.table.bulkAdd(items)
  }

  async clear(): Promise<void> {
    await this.table.clear()
  }

  async delete(sessionId: string): Promise<void> {
    await this.table.delete(sessionId)
  }

  async count(): Promise<number> {
    return this.table.count()
  }
}

export const sessionFileRepo = new SessionFileRepository()

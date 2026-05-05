/**
 * Generic base repository with CRUD operations.
 * All specific repositories extend this.
 */

import { type Table, type UpdateSpec, type IndexableType } from 'dexie'

export abstract class BaseRepository<T extends { id: string }> {
  protected abstract table: Table<T>

  async getById(id: string): Promise<T | undefined> {
    return this.table.get(id)
  }

  async getAll(): Promise<T[]> {
    return this.table.toArray()
  }

  async add(item: T): Promise<string> {
    return this.table.add(item) as unknown as Promise<string>
  }

  /** Alias for add() — creates a new record */
  async create(item: T): Promise<string> {
    return this.add(item)
  }

  async put(item: T): Promise<string> {
    return this.table.put(item) as unknown as Promise<string>
  }

  async update(id: string, changes: Partial<T>): Promise<number> {
    return this.table.update(id, changes as unknown as UpdateSpec<T>)
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id)
  }

  async bulkAdd(items: T[]): Promise<void> {
    await this.table.bulkAdd(items)
  }

  async bulkDelete(ids: string[]): Promise<void> {
    await this.table.bulkDelete(ids)
  }

  async count(): Promise<number> {
    return this.table.count()
  }

  async clear(): Promise<void> {
    await this.table.clear()
  }

  async where<K extends keyof T & string>(
    index: K,
    value: T[K]
  ): Promise<T[]> {
    return this.table.where(index).equals(value as IndexableType).toArray()
  }

  async whereFirst<K extends keyof T & string>(
    index: K,
    value: T[K]
  ): Promise<T | undefined> {
    return this.table.where(index).equals(value as IndexableType).first()
  }

  async orderBy<K extends keyof T & string>(index: K): Promise<T[]> {
    return this.table.orderBy(index).toArray()
  }

  async reverseOrderBy<K extends keyof T & string>(index: K): Promise<T[]> {
    return this.table.orderBy(index).reverse().toArray()
  }
}

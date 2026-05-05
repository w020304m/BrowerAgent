/**
 * Typed storage service wrapping @plasmohq/storage.
 * Provides a unified API for extension storage (sync and local).
 */

export type StorageArea = 'local' | 'sync'

export class StorageService {
  private area: StorageArea

  constructor(area: StorageArea = 'local') {
    this.area = area
  }

  /**
   * Get a value from storage.
   * Returns undefined if key does not exist.
   */
  async get<T>(key: string): Promise<T | undefined>

  /**
   * Get a value from storage with a default.
   * Returns defaultValue if key does not exist.
   */
  async get<T>(key: string, defaultValue: T): Promise<T>

  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const result = await chrome.storage[this.area].get(key)
    const value = result[key]
    if (value === undefined) {
      return defaultValue
    }
    return value as T
  }

  /**
   * Set a value in storage.
   */
  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage[this.area].set({ [key]: value })
  }

  /**
   * Set multiple key-value pairs at once.
   */
  async setMultiple(items: Record<string, unknown>): Promise<void> {
    await chrome.storage[this.area].set(items)
  }

  /**
   * Get multiple values from storage.
   * Returns an object with the same keys, values are undefined if not found.
   */
  async getMultiple<K extends string>(
    keys: K[]
  ): Promise<Record<K, unknown>> {
    const result = await chrome.storage[this.area].get(keys)
    return result as Record<K, unknown>
  }

  /**
   * Remove one or more keys from storage.
   */
  async remove(keys: string | string[]): Promise<void> {
    await chrome.storage[this.area].remove(keys)
  }

  /**
   * Clear all data in this storage area.
   */
  async clear(): Promise<void> {
    await chrome.storage[this.area].clear()
  }

  /**
   * Get all key-value pairs from this storage area.
   */
  async getAll(): Promise<Record<string, unknown>> {
    return chrome.storage[this.area].get(null) as Promise<Record<string, unknown>>
  }

  /**
   * Watch a key for changes.
   * Returns an unsubscribe function.
   */
  watch<T>(key: string, callback: (newValue: T | undefined) => void): () => void {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === this.area && key in changes) {
        callback(changes[key].newValue as T | undefined)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => {
      chrome.storage.onChanged.removeListener(listener)
    }
  }
}

/** Singleton for local storage */
export const localStorageService = new StorageService('local')

/** Singleton for sync storage */
export const syncStorageService = new StorageService('sync')

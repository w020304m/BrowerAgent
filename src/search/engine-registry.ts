/**
 * Search engine registry.
 * Provides a central registry for search engine descriptors and factories.
 */

import type { ISearchEngine, SearchEngineConfig } from './types'

/** Describes a search engine type and how to create instances */
export interface SearchEngineDescriptor {
  /** Unique identifier (e.g. 'duckduckgo', 'brave-api') */
  id: string
  /** Human-readable display name */
  label: string
  /** Whether this engine requires an API key */
  requiresApiKey: boolean
  /** Whether this engine requires a base URL */
  requiresBaseUrl: boolean
  /** Factory function to create an engine instance */
  create(config: SearchEngineConfig): ISearchEngine
}

/**
 * Registry of available search engines.
 * Engines are registered at startup and looked up by ID.
 */
class SearchEngineRegistryImpl {
  private readonly engines = new Map<string, SearchEngineDescriptor>()

  /** Register a new engine descriptor */
  register(descriptor: SearchEngineDescriptor): void {
    if (this.engines.has(descriptor.id)) {
      console.warn(`Search engine '${descriptor.id}' is already registered, overwriting.`)
    }
    this.engines.set(descriptor.id, descriptor)
  }

  /** Get a descriptor by ID, or undefined if not found */
  get(id: string): SearchEngineDescriptor | undefined {
    return this.engines.get(id)
  }

  /** Get all registered engine descriptors */
  getAll(): SearchEngineDescriptor[] {
    return Array.from(this.engines.values())
  }

  /** Create an engine instance by ID */
  createEngine(id: string, config: SearchEngineConfig): ISearchEngine {
    const descriptor = this.engines.get(id)
    if (!descriptor) {
      throw new Error(`Unknown search engine: '${id}'. Available: ${Array.from(this.engines.keys()).join(', ')}`)
    }
    return descriptor.create(config)
  }
}

/** Singleton search engine registry */
export const searchEngineRegistry = new SearchEngineRegistryImpl()

/**
 * Search Service.
 * Wraps ISearchEngine with TTL-based caching, optional content fetching,
 * and optional RAG-enhanced search with embeddings and vector similarity.
 */

import type { ISearchEngine, SearchResult } from './types'
import type { IEmbeddingService } from '@/embedding'
import type { IVectorStore } from '@/vector'
import type { ITextSplitter } from '@/types/document'

/** Cache entry storing results alongside their insertion timestamp */
interface CacheEntry {
  results: SearchResult[]
  timestamp: number
}

/** Options for constructing a SearchService */
export interface SearchServiceOptions {
  /** Cache time-to-live in milliseconds (default: 5 minutes) */
  cacheTtl?: number
  /** Maximum number of cached queries (default: 100) */
  maxCacheSize?: number
}

/** Configuration for RAG-enhanced search */
export interface RagConfig {
  /** Embedding service for vectorizing text */
  embeddingService: IEmbeddingService
  /** Vector store for similarity search */
  vectorStore: IVectorStore
  /** Text splitter for chunking page content */
  splitter: ITextSplitter
  /** Number of top results to return from vector search (default: 3) */
  topK?: number
}

/**
 * High-level search service with caching.
 *
 * Usage:
 *   const engine = new SearXNGEngine({ baseUrl: '...' })
 *   const service = new SearchService(engine)
 *   const results = await service.search('hello world')
 */
export class SearchService {
  private readonly engine: ISearchEngine
  private readonly cacheTtl: number
  private readonly maxCacheSize: number
  private readonly cache = new Map<string, CacheEntry>()
  private readonly ragConfig?: RagConfig

  constructor(engine: ISearchEngine, options?: SearchServiceOptions, ragConfig?: RagConfig) {
    this.engine = engine
    this.cacheTtl = options?.cacheTtl ?? 5 * 60 * 1000 // 5 minutes
    this.maxCacheSize = options?.maxCacheSize ?? 100
    this.ragConfig = ragConfig
  }

  /**
   * Search the web, returning cached results when available.
   * @param query - Search query
   * @param maxResults - Maximum number of results (default: 10)
   */
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    const cacheKey = this.buildCacheKey(query, maxResults)
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      return cached
    }

    const results = await this.engine.search(query, maxResults)
    this.addToCache(cacheKey, results)
    return results
  }

  /**
   * Search the web and fetch page content for each result.
   * This is a more expensive operation — use it when full page content is needed
   * for injecting into the chat context.
   *
   * Content fetching is done in parallel with a concurrency limit.
   */
  async searchAndFetchContent(
    query: string,
    maxResults = 5
  ): Promise<SearchResult[]> {
    const results = await this.search(query, maxResults)

    // Fetch content for results that don't already have it
    const withoutContent = results.filter((r) => r.content === undefined)
    await this.fetchContentForResults(withoutContent)

    return results
  }

  /**
   * RAG-enhanced search: search → fetch content → split → embed → vector search.
   * Returns the top-K most relevant chunks from fetched page content.
   * Requires RagConfig to be provided in the constructor.
   */
  async searchEnhanced(
    query: string,
    maxResults = 5
  ): Promise<SearchResult[]> {
    if (!this.ragConfig) {
      throw new Error('RAG config not provided. Pass RagConfig to SearchService constructor.')
    }

    const { embeddingService, vectorStore, splitter, topK = 3 } = this.ragConfig

    // Step 1: Search and fetch full page content
    const results = await this.searchAndFetchContent(query, maxResults)

    // Step 2: Split content into chunks and prepare documents
    const allChunks: Array<{ content: string; url: string; title: string }> = []
    for (const result of results) {
      if (!result.content) continue

      const chunks = splitter.splitText(result.content)
      for (const chunk of chunks) {
        allChunks.push({ content: chunk, url: result.url, title: result.title })
      }
    }

    if (allChunks.length === 0) return results

    // Step 3: Embed all chunks
    const texts = allChunks.map((c) => c.content)
    const vectors = await embeddingService.embedDocuments(texts)

    // Step 4: Add vectors to the store
    const storedVectors = allChunks.map((chunk, i) => ({
      id: `search-${Date.now()}-${i}`,
      vectors: vectors[i],
      pageContent: chunk.content,
      metadata: { url: chunk.url, title: chunk.title },
    }))
    await vectorStore.addVectors(storedVectors)

    // Step 5: Embed query and perform similarity search
    const queryVector = await embeddingService.embedQuery(query)
    const vectorResults = await vectorStore.similaritySearch(queryVector, topK)

    // Step 6: Return as SearchResult[]
    const enhancedResults: SearchResult[] = vectorResults.map((vr: { document: { metadata: Record<string, unknown>; pageContent: string }; score: number }) => ({
      title: (vr.document.metadata.title as string) ?? '',
      url: (vr.document.metadata.url as string) ?? '',
      snippet: vr.document.pageContent,
    }))

    return enhancedResults
  }

  /** Clear the search result cache */
  clearCache(): void {
    this.cache.clear()
  }

  /** Current number of entries in the cache */
  get cacheSize(): number {
    return this.cache.size
  }

  // --- Private helpers ---

  private buildCacheKey(query: string, maxResults: number): string {
    return `${query}::${maxResults}`
  }

  private getFromCache(key: string): SearchResult[] | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    const age = Date.now() - entry.timestamp
    if (age > this.cacheTtl) {
      this.cache.delete(key)
      return undefined
    }

    return entry.results
  }

  private addToCache(key: string, results: SearchResult[]): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(key, {
      results,
      timestamp: Date.now(),
    })
  }

  /**
   * Fetch page content for the given results using simple fetch + text extraction.
   * Populates the `content` field on each result in-place.
   *
   * Concurrency is limited to avoid overwhelming the network.
   */
  private async fetchContentForResults(results: SearchResult[]): Promise<void> {
    const concurrency = 3
    for (let i = 0; i < results.length; i += concurrency) {
      const batch = results.slice(i, i + concurrency)
      await Promise.allSettled(
        batch.map(async (result) => {
          try {
            const response = await fetch(result.url, {
              method: 'GET',
              headers: { 'Accept': 'text/html' },
              signal: AbortSignal.timeout(10_000), // 10 second timeout
            })
            if (response.ok) {
              const html = await response.text()
              result.content = extractTextFromHtml(html)
            }
          } catch {
            // If fetching fails for a URL, leave content undefined
          }
        })
      )
    }
  }
}

/**
 * Minimal HTML-to-text extraction.
 * Strips tags and collapses whitespace — sufficient for injecting
 * page content into chat context.
 */
function extractTextFromHtml(html: string): string {
  return html
    // Remove script and style blocks entirely
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Replace block-level tags with newlines
    .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
    // Remove all remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

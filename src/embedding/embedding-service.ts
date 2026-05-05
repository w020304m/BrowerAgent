/**
 * Embedding Service.
 * Wraps IEmbeddingProvider with caching and batch processing.
 */

import type { IEmbeddingProvider } from '@/providers/types'
import type { EmbeddingResult } from '@/types/embedding'

export interface IEmbeddingService {
  /** Embed a single text, returns embedding vector */
  embedQuery(text: string): Promise<number[]>
  /** Embed multiple texts, returns embedding vectors */
  embedDocuments(texts: string[]): Promise<number[][]>
  /** Embed text and return full result with metadata */
  embedWithResult(text: string): Promise<EmbeddingResult>
  /** Clear the embedding cache */
  clearCache(): void
}

/** Simple LRU-like cache for embeddings keyed by text content */
class EmbeddingCache {
  private cache = new Map<string, number[]>()
  private readonly maxSize: number

  constructor(maxSize = 500) {
    this.maxSize = maxSize
  }

  get(text: string): number[] | undefined {
    return this.cache.get(text)
  }

  set(text: string, embedding: number[]): void {
    if (this.cache.size >= this.maxSize) {
      // Delete oldest entry
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(text, embedding)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

export class EmbeddingService implements IEmbeddingService {
  private readonly provider: IEmbeddingProvider
  private readonly cache: EmbeddingCache
  private readonly batchSize: number

  constructor(provider: IEmbeddingProvider, options?: { cacheSize?: number; batchSize?: number }) {
    this.provider = provider
    this.cache = new EmbeddingCache(options?.cacheSize)
    this.batchSize = options?.batchSize ?? 20
  }

  async embedQuery(text: string): Promise<number[]> {
    const cached = this.cache.get(text)
    if (cached) return cached

    const embedding = await this.provider.embedQuery(text)
    this.cache.set(text, embedding)
    return embedding
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const results: number[][] = new Array(texts.length)
    const toFetch: { index: number; text: string }[] = []

    // Check cache first
    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(texts[i])
      if (cached) {
        results[i] = cached
      } else {
        toFetch.push({ index: i, text: texts[i] })
      }
    }

    // Fetch in batches
    for (let batchStart = 0; batchStart < toFetch.length; batchStart += this.batchSize) {
      const batch = toFetch.slice(batchStart, batchStart + this.batchSize)
      const batchTexts = batch.map(item => item.text)

      const embeddings = await this.provider.embedDocuments(batchTexts)

      for (let j = 0; j < batch.length; j++) {
        const embedding = embeddings[j]
        results[batch[j].index] = embedding
        this.cache.set(batch[j].text, embedding)
      }
    }

    return results
  }

  async embedWithResult(text: string): Promise<EmbeddingResult> {
    const embedding = await this.embedQuery(text)
    return { embedding, text }
  }

  clearCache(): void {
    this.cache.clear()
  }
}

/**
 * Vector Store implementations for RAG.
 * Provides persistent (IndexedDB) and in-memory vector storage
 * with cosine similarity search.
 */

import type { StoredVector, SearchResult } from '@/types/embedding'
import type { Document } from '@/types/document'

/** Vector store interface for similarity search */
export interface IVectorStore {
  /** Add vectors to the store */
  addVectors(vectors: StoredVector[]): Promise<void>
  /** Search for similar vectors */
  similaritySearch(query: number[], k?: number): Promise<SearchResult[]>
  /** Delete vectors by ID */
  delete(ids: string[]): Promise<void>
  /** Delete all vectors for a given source */
  deleteBySource(sourceId: string): Promise<void>
  /** Get count of stored vectors */
  count(): Promise<number>
  /** Clear all vectors */
  clear(): Promise<void>
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`)
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

/**
 * In-memory vector store for temporary sessions.
 * Vectors are lost when the page/worker is closed.
 */
export class InMemoryVectorStore implements IVectorStore {
  private vectors = new Map<string, StoredVector>()

  async addVectors(vectors: StoredVector[]): Promise<void> {
    for (const v of vectors) {
      this.vectors.set(v.id, v)
    }
  }

  async similaritySearch(query: number[], k = 4): Promise<SearchResult[]> {
    const scored: Array<{ vector: StoredVector; score: number }> = []

    for (const vector of this.vectors.values()) {
      const score = cosineSimilarity(query, vector.vectors)
      scored.push({ vector, score })
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ vector, score }) => ({
        document: {
          pageContent: vector.pageContent,
          metadata: vector.metadata,
        },
        score,
      }))
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.vectors.delete(id)
    }
  }

  async deleteBySource(sourceId: string): Promise<void> {
    for (const [id, v] of this.vectors) {
      if (v.metadata.sourceId === sourceId) {
        this.vectors.delete(id)
      }
    }
  }

  async count(): Promise<number> {
    return this.vectors.size
  }

  async clear(): Promise<void> {
    this.vectors.clear()
  }
}

/**
 * Persistent vector store backed by IndexedDB via Dexie.
 */
export class PersistentVectorStore implements IVectorStore {
  private readonly store: VectorStoreBackend

  constructor(store: VectorStoreBackend) {
    this.store = store
  }

  async addVectors(vectors: StoredVector[]): Promise<void> {
    await this.store.bulkPut(vectors)
  }

  async similaritySearch(query: number[], k = 4): Promise<SearchResult[]> {
    const allVectors = await this.store.getAll()
    const scored: Array<{ vector: StoredVector; score: number }> = []

    for (const vector of allVectors) {
      const score = cosineSimilarity(query, vector.vectors)
      scored.push({ vector, score })
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ vector, score }) => ({
        document: {
          pageContent: vector.pageContent,
          metadata: vector.metadata,
        },
        score,
      }))
  }

  async delete(ids: string[]): Promise<void> {
    await this.store.bulkDelete(ids)
  }

  async deleteBySource(sourceId: string): Promise<void> {
    const all = await this.store.getAll()
    const ids = all
      .filter(v => v.metadata.sourceId === sourceId)
      .map(v => v.id)
    await this.store.bulkDelete(ids)
  }

  async count(): Promise<number> {
    return this.store.count()
  }

  async clear(): Promise<void> {
    await this.store.clear()
  }
}

/** Backend interface for persisting vectors — implemented by a Dexie repository */
export interface VectorStoreBackend {
  bulkPut(vectors: StoredVector[]): Promise<void>
  getAll(): Promise<StoredVector[]>
  bulkDelete(ids: string[]): Promise<void>
  count(): Promise<number>
  clear(): Promise<void>
}

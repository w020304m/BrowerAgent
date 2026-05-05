/**
 * Embedding types for RAG.
 */

/** Result of an embedding operation */
export interface EmbeddingResult {
  /** The embedding vector */
  embedding: number[]
  /** The text that was embedded */
  text: string
}

/** Stored vector with its document */
export interface StoredVector {
  id: string
  /** Embedding vector */
  vectors: number[]
  /** Associated document content */
  pageContent: string
  /** Document metadata */
  metadata: Record<string, unknown>
}

/** Similarity search result */
export interface SearchResult {
  document: import('./document').Document
  score: number
}

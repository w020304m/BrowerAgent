/**
 * Knowledge management types.
 */

/** A knowledge base that groups related documents */
export interface KnowledgeBase {
  id: string
  title: string
  description?: string
  embeddingModel: string
  documentCount: number
  createdAt: number
  updatedAt: number
}

/** A document indexed in a knowledge base */
export interface IndexedDocument {
  id: string
  knowledgeBaseId: string
  title: string
  sourceUrl?: string
  chunkCount: number
  status: 'pending' | 'indexing' | 'ready' | 'error'
  createdAt: number
}

/** Progress tracker for indexing operations */
export interface IndexingProgress {
  total: number
  processed: number
  current?: string
}

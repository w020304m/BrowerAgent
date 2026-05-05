/**
 * Knowledge Indexer.
 * Orchestrates document chunking, embedding, and vector storage
 * for RAG retrieval.
 */

import type { Document } from '@/types/document'
import type { StoredVector } from '@/types/embedding'
import type { ITextSplitter } from '@/types/document'
import { RecursiveCharacterSplitter } from '@/splitter/recursive-character-splitter'
import type { IEmbeddingService } from '@/embedding/embedding-service'
import type { IVectorStore } from '@/vector/vector-store'
import type { IndexedDocument, IndexingProgress } from './types'
import { generateId } from '@/types/common'

export interface KnowledgeIndexerConfig {
  /** Text splitter to use (defaults to RecursiveCharacterSplitter) */
  splitter?: ITextSplitter
  /** Embedding service for generating vectors */
  embeddingService: IEmbeddingService
  /** Vector store for persistence */
  vectorStore: IVectorStore
}

export class KnowledgeIndexer {
  private readonly splitter: ITextSplitter
  private readonly embeddingService: IEmbeddingService
  private readonly vectorStore: IVectorStore

  constructor(config: KnowledgeIndexerConfig) {
    this.splitter = config.splitter ?? new RecursiveCharacterSplitter()
    this.embeddingService = config.embeddingService
    this.vectorStore = config.vectorStore
  }

  /**
   * Index documents into the vector store.
   * Splits each document into chunks, embeds them, and stores the vectors.
   */
  async indexDocuments(
    documents: Document[],
    knowledgeBaseId: string,
    onProgress?: (progress: IndexingProgress) => void
  ): Promise<IndexedDocument[]> {
    const results: IndexedDocument[] = []
    const progress: IndexingProgress = { total: documents.length, processed: 0 }

    for (const doc of documents) {
      progress.current = doc.metadata.title as string || 'Unknown'
      onProgress?.(progress)

      const indexed = await this.indexSingleDocument(doc, knowledgeBaseId)
      results.push(indexed)
      progress.processed++
    }

    onProgress?.(progress)
    return results
  }

  private async indexSingleDocument(
    doc: Document,
    knowledgeBaseId: string
  ): Promise<IndexedDocument> {
    const docId = generateId()

    // Split document into chunks
    const chunks = this.splitter.splitDocuments([doc])

    // Embed all chunk texts
    const texts = chunks.map(c => c.pageContent)
    const embeddings = await this.embeddingService.embedDocuments(texts)

    // Create stored vectors
    const vectors: StoredVector[] = chunks.map((chunk, i) => ({
      id: `${docId}_chunk_${i}`,
      vectors: embeddings[i],
      pageContent: chunk.pageContent,
      metadata: {
        ...chunk.metadata,
        knowledgeBaseId,
        documentId: docId,
      },
    }))

    // Store vectors
    await this.vectorStore.addVectors(vectors)

    return {
      id: docId,
      knowledgeBaseId,
      title: (doc.metadata.title as string) ?? 'Untitled',
      sourceUrl: doc.metadata.sourceUrl as string | undefined,
      chunkCount: chunks.length,
      status: 'ready',
      createdAt: Date.now(),
    }
  }

  /**
   * Remove all vectors for a knowledge base.
   */
  async removeKnowledgeBase(knowledgeBaseId: string): Promise<void> {
    await this.vectorStore.deleteBySource(knowledgeBaseId)
  }

  /**
   * Search for relevant chunks in a knowledge base.
   */
  async search(query: string, k = 4): Promise<{ content: string; score: number; metadata: Record<string, unknown> }[]> {
    const queryEmbedding = await this.embeddingService.embedQuery(query)
    const results = await this.vectorStore.similaritySearch(queryEmbedding, k)
    return results.map(r => ({
      content: r.document.pageContent,
      score: r.score,
      metadata: r.document.metadata,
    }))
  }
}

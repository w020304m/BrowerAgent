/**
 * RAG Context Retrieval Step.
 * Retrieves relevant context from the vector store based on the user's query.
 */

import type { IPipelineStep, ChatContext } from '../types'
import type { IEmbeddingService } from '@/embedding/embedding-service'
import type { IVectorStore } from '@/vector/vector-store'

export interface RagContextStepConfig {
  embeddingService: IEmbeddingService
  vectorStore: IVectorStore
  /** Number of documents to retrieve (default: 4) */
  topK?: number
  /** Optional filter by knowledge base ID */
  knowledgeBaseId?: string
}

export class RagContextRetrievalStep implements IPipelineStep {
  readonly name = 'RagContextRetrieval'

  private readonly embeddingService: IEmbeddingService
  private readonly vectorStore: IVectorStore
  private readonly topK: number
  private readonly knowledgeBaseId?: string

  constructor(config: RagContextStepConfig) {
    this.embeddingService = config.embeddingService
    this.vectorStore = config.vectorStore
    this.topK = config.topK ?? 4
    this.knowledgeBaseId = config.knowledgeBaseId
  }

  async execute(context: ChatContext): Promise<void> {
    if (context.mode !== 'rag') return

    // Embed the user's query
    const queryEmbedding = await this.embeddingService.embedQuery(context.userInput)

    // Search for similar documents
    const searchResults = await this.vectorStore.similaritySearch(queryEmbedding, this.topK)

    if (searchResults.length === 0) {
      context.retrievedContext = { text: '', sources: [] }
      return
    }

    // Filter by knowledge base if specified
    const filtered = this.knowledgeBaseId
      ? searchResults.filter(r => r.document.metadata.knowledgeBaseId === this.knowledgeBaseId)
      : searchResults

    // Build context text with numbered references
    const contextParts = filtered.map((result, i) => {
      const title = (result.document.metadata.title as string) ?? `Source ${i + 1}`
      return `[${i + 1}] ${result.document.pageContent}`
    })

    context.retrievedContext = {
      text: contextParts.join('\n\n'),
      sources: filtered.map((result, i) => ({
        title: (result.document.metadata.title as string) ?? `Source ${i + 1}`,
        url: result.document.metadata.sourceUrl as string | undefined,
        excerpt: result.document.pageContent.slice(0, 200),
      })),
    }
  }
}

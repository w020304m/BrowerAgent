/**
 * Document Context Retrieval Step.
 * Injects uploaded document content into the chat context.
 */

import type { IPipelineStep, ChatContext } from '../types'

export interface SessionDocument {
  title: string
  content: string
  sourceUrl?: string
}

export interface DocumentProvider {
  getDocuments(sessionId: string): Promise<SessionDocument[]>
}

export class DocumentContextRetrievalStep implements IPipelineStep {
  readonly name = 'DocumentContextRetrieval'

  constructor(private documentProvider: DocumentProvider) {}

  async execute(context: ChatContext): Promise<void> {
    if (context.mode !== 'document') return

    const documents = await this.documentProvider.getDocuments(context.historyId)

    if (documents.length === 0) {
      context.retrievedContext = { text: '', sources: [] }
      return
    }

    // Build context text from all documents
    const contextParts = documents.map((doc, i) => {
      return `=== ${doc.title} ===\n${doc.content}`
    })

    context.retrievedContext = {
      text: contextParts.join('\n\n'),
      sources: documents.map(doc => ({
        title: doc.title,
        url: doc.sourceUrl,
        excerpt: doc.content.slice(0, 200),
      })),
    }
  }
}

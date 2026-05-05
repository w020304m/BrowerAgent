/**
 * Content extraction types and interfaces.
 * Provides a unified API for extracting text content from various sources
 * (web pages, files, PDFs, etc.).
 */

import type { Document } from '@/types/document'

/** Source types for content extraction */
export type ContentSource =
  | { type: 'tab'; tabId: number }
  | { type: 'url'; url: string }
  | { type: 'file'; file: File }
  | { type: 'text'; content: string; title?: string }

/** Result of content extraction */
export interface ExtractionResult {
  /** Extracted text content */
  content: string
  /** Page/document title */
  title: string
  /** Source URL or identifier */
  sourceUrl?: string
  /** Content type (html, text, pdf, etc.) */
  contentType: string
  /** Metadata from extraction */
  metadata: Record<string, unknown>
}

/**
 * Interface for content extractors.
 * Each extractor handles a specific source type.
 */
export interface IContentExtractor {
  /** Check if this extractor can handle the given source */
  canHandle(source: ContentSource): boolean
  /** Extract content from the source */
  extract(source: ContentSource): Promise<ExtractionResult>
}

/**
 * Registry for content extractors.
 * Finds the right extractor for a given content source.
 */
export class ContentExtractorRegistry {
  private extractors: IContentExtractor[] = []

  /** Register an extractor */
  register(extractor: IContentExtractor): void {
    this.extractors.push(extractor)
  }

  /** Extract content using the first matching extractor */
  async extract(source: ContentSource): Promise<ExtractionResult> {
    const extractor = this.extractors.find(e => e.canHandle(source))
    if (!extractor) {
      throw new Error(`No extractor registered for source type: ${source.type}`)
    }
    return extractor.extract(source)
  }

  /** Extract and convert to Document format */
  async extractAsDocument(source: ContentSource): Promise<Document> {
    const result = await this.extract(source)
    return {
      pageContent: result.content,
      metadata: {
        title: result.title,
        sourceUrl: result.sourceUrl,
        contentType: result.contentType,
        ...result.metadata,
      },
    }
  }

  /** Get all registered extractors */
  getExtractors(): IContentExtractor[] {
    return [...this.extractors]
  }
}

/**
 * Document and loader types.
 * Replaces @langchain/core/documents Document and BaseDocumentLoader.
 */

/** A document with text content and metadata */
export interface Document {
  /** The text content of the document */
  pageContent: string
  /** Arbitrary metadata */
  metadata: Record<string, unknown>
}

/** Loader interface for extracting documents from various sources */
export interface ILoader {
  /** Load and return documents */
  load(): Promise<Document[]>
}

/** Text splitter interface */
export interface ITextSplitter {
  /** Split a single document into smaller chunks */
  splitText(text: string): string[]
  /** Split multiple documents into smaller documents */
  splitDocuments(documents: Document[]): Document[]
}

/**
 * Text content extractor.
 * Handles plain text content provided directly.
 */

import type { IContentExtractor, ExtractionResult, ContentSource } from './types'

/**
 * Extracts content from direct text input.
 * Used for pasted text or pre-extracted content.
 */
export class TextExtractor implements IContentExtractor {
  canHandle(source: ContentSource): boolean {
    return source.type === 'text'
  }

  async extract(source: ContentSource): Promise<ExtractionResult> {
    if (source.type !== 'text') {
      throw new Error('TextExtractor only handles text sources')
    }

    return {
      content: source.content,
      title: source.title ?? 'Pasted Text',
      contentType: 'text/plain',
      metadata: {
        charCount: source.content.length,
        wordCount: source.content.split(/\s+/).filter(Boolean).length,
      },
    }
  }
}

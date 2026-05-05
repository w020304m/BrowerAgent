/**
 * Recursive Character Text Splitter.
 * Splits text using a hierarchy of separators, trying each in turn
 * until chunks fit within the configured size.
 *
 * Replaces LangChain's RecursiveCharacterTextSplitter.
 */

import type { ITextSplitter } from '@/types/document'
import type { Document } from '@/types/document'

/** Default separator hierarchy: try splitting on paragraphs, then lines, then spaces */
const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' ', '']

export interface TextSplitterConfig {
  /** Maximum chunk size in characters (default: 1000) */
  chunkSize?: number
  /** Overlap between consecutive chunks in characters (default: 200) */
  chunkOverlap?: number
  /** Custom separator hierarchy (default: paragraph → line → sentence → space → char) */
  separators?: string[]
}

export class RecursiveCharacterSplitter implements ITextSplitter {
  private readonly chunkSize: number
  private readonly chunkOverlap: number
  private readonly separators: string[]

  constructor(config: TextSplitterConfig = {}) {
    this.chunkSize = config.chunkSize ?? 1000
    this.chunkOverlap = config.chunkOverlap ?? 200
    this.separators = config.separators ?? DEFAULT_SEPARATORS

    if (this.chunkOverlap >= this.chunkSize) {
      throw new Error(`chunkOverlap (${this.chunkOverlap}) must be less than chunkSize (${this.chunkSize})`)
    }
  }

  splitText(text: string): string[] {
    return this.recursiveSplit(text, this.separators)
  }

  splitDocuments(documents: Document[]): Document[] {
    const result: Document[] = []

    for (const doc of documents) {
      const chunks = this.splitText(doc.pageContent)
      for (let i = 0; i < chunks.length; i++) {
        result.push({
          pageContent: chunks[i],
          metadata: {
            ...doc.metadata,
            chunkIndex: i,
            chunkCount: chunks.length,
          },
        })
      }
    }

    return result
  }

  private recursiveSplit(text: string, separators: string[]): string[] {
    const trimmed = text.trim()
    if (trimmed.length <= this.chunkSize) {
      return trimmed ? [trimmed] : []
    }

    // Find the best separator to try
    let separator = separators[separators.length - 1]
    let nextSeparators: string[] = []

    for (let i = 0; i < separators.length; i++) {
      if (trimmed.includes(separators[i])) {
        separator = separators[i]
        nextSeparators = separators.slice(i + 1)
        break
      }
    }

    // Split by the chosen separator
    const splits = this.splitBySeparator(trimmed, separator)
    const goodSplits: string[] = []
    const mergedChunks: string[] = []

    for (const split of splits) {
      if (split.length < this.chunkSize) {
        const prospective = goodSplits.length > 0
          ? goodSplits.join(separator)
          : split

        if (prospective.length <= this.chunkSize) {
          goodSplits.push(split)
        } else {
          // Current good splits exceed chunk size, flush them
          if (goodSplits.length > 0) {
            mergedChunks.push(...this.mergeSplits(goodSplits, separator))
            goodSplits.length = 0
          }

          if (split.length <= this.chunkSize) {
            goodSplits.push(split)
          } else if (nextSeparators.length > 0) {
            mergedChunks.push(...this.recursiveSplit(split, nextSeparators))
          } else {
            // Hard split by character
            mergedChunks.push(...this.hardSplit(split))
          }
        }
      } else {
        // Flush accumulated good splits
        if (goodSplits.length > 0) {
          mergedChunks.push(...this.mergeSplits(goodSplits, separator))
          goodSplits.length = 0
        }

        if (nextSeparators.length > 0) {
          mergedChunks.push(...this.recursiveSplit(split, nextSeparators))
        } else {
          mergedChunks.push(...this.hardSplit(split))
        }
      }
    }

    // Flush remaining good splits
    if (goodSplits.length > 0) {
      mergedChunks.push(...this.mergeSplits(goodSplits, separator))
    }

    return mergedChunks.filter(chunk => chunk.trim().length > 0)
  }

  /**
   * Split text by separator, keeping the separator attached to the
   * preceding chunk (except for the first split).
   */
  private splitBySeparator(text: string, separator: string): string[] {
    if (separator === '') {
      return text.split('')
    }

    const parts = text.split(separator)
    const result: string[] = []

    for (let i = 0; i < parts.length; i++) {
      if (i === 0) {
        result.push(parts[i])
      } else {
        result.push(separator + parts[i])
      }
    }

    return result.filter(part => part.length > 0)
  }

  /**
   * Merge small splits into chunks respecting chunkSize and chunkOverlap.
   */
  private mergeSplits(splits: string[], separator: string): string[] {
    const chunks: string[] = []
    let current = ''

    for (const split of splits) {
      const candidate = current ? current + split : split

      if (candidate.length <= this.chunkSize) {
        current = candidate
      } else {
        if (current) {
          chunks.push(current)
        }
        // Start new chunk with overlap from previous
        current = this.getOverlapTail(current) + split

        // If even with just this split it's too big, hard split
        if (current.length > this.chunkSize) {
          const hardChunks = this.hardSplit(current)
          chunks.push(...hardChunks.slice(0, -1))
          current = hardChunks[hardChunks.length - 1] || ''
        }
      }
    }

    if (current.trim()) {
      chunks.push(current)
    }

    return chunks
  }

  /**
   * Get the tail of a chunk to use as overlap for the next chunk.
   */
  private getOverlapTail(text: string): string {
    if (!text || text.length <= this.chunkOverlap) {
      return text
    }
    return text.slice(-this.chunkOverlap)
  }

  /**
   * Hard split by character when no separator works.
   */
  private hardSplit(text: string): string[] {
    const chunks: string[] = []

    for (let i = 0; i < text.length; i += this.chunkSize - this.chunkOverlap) {
      const chunk = text.slice(i, i + this.chunkSize)
      if (chunk.trim()) {
        chunks.push(chunk)
      }
    }

    return chunks
  }
}

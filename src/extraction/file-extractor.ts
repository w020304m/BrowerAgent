/**
 * File content extractor.
 * Handles text files (TXT, CSV, MD) and provides extension points
 * for binary formats (PDF, DOCX).
 */

import type { IContentExtractor, ExtractionResult, ContentSource } from './types'

/** Supported text file extensions */
const TEXT_EXTENSIONS = new Set(['.txt', '.csv', '.md', '.json', '.xml', '.html', '.yaml', '.yml', '.log'])

/**
 * Extracts content from uploaded files.
 * Handles plain text formats directly. Binary formats (PDF, DOCX)
 * would require additional parsing libraries.
 */
export class FileExtractor implements IContentExtractor {
  canHandle(source: ContentSource): boolean {
    return source.type === 'file'
  }

  async extract(source: ContentSource): Promise<ExtractionResult> {
    if (source.type !== 'file') {
      throw new Error('FileExtractor only handles file sources')
    }

    const file = source.file
    const extension = this.getExtension(file.name)

    // Text-based files
    if (this.isTextFile(extension)) {
      return this.extractTextFile(file)
    }

    // PDF — would need pdf-parse or similar
    if (extension === '.pdf') {
      return this.extractPdf(file)
    }

    // DOCX — would need mammoth or similar
    if (extension === '.docx') {
      return this.extractDocx(file)
    }

    // Fallback: try reading as text
    return this.extractTextFile(file)
  }

  private getExtension(filename: string): string {
    const dotIndex = filename.lastIndexOf('.')
    if (dotIndex === -1) return ''
    return filename.slice(dotIndex).toLowerCase()
  }

  private isTextFile(extension: string): boolean {
    return TEXT_EXTENSIONS.has(extension)
  }

  private async extractTextFile(file: File): Promise<ExtractionResult> {
    const content = await this.readFileAsText(file)
    return {
      content,
      title: file.name,
      contentType: 'text/plain',
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      },
    }
  }

  private async extractPdf(file: File): Promise<ExtractionResult> {
    // PDF extraction requires a parsing library (pdf-parse, pdfjs-dist)
    // For now, return a placeholder that indicates the limitation
    throw new Error(
      `PDF extraction for "${file.name}" requires pdf-parse or pdfjs-dist. ` +
      'Install the dependency and implement PDF parsing.'
    )
  }

  private async extractDocx(file: File): Promise<ExtractionResult> {
    // DOCX extraction requires mammoth or similar
    throw new Error(
      `DOCX extraction for "${file.name}" requires mammoth. ` +
      'Install the dependency and implement DOCX parsing.'
    )
  }

  /** Read a File as text using FileReader (works in both browser and jsdom) */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
      reader.readAsText(file)
    })
  }
}

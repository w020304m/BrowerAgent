/**
 * Ollama NDJSON stream parser.
 * Parses newline-delimited JSON from Ollama /api/chat and /api/generate.
 */

import type { OllamaChatChunk, OllamaGenerateChunk } from './ollama-types'

/**
 * Parse an NDJSON stream from Ollama /api/chat.
 * Yields parsed OllamaChatChunk objects.
 */
export async function* parseOllamaChatStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<OllamaChatChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Split by newlines, process complete lines
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          yield JSON.parse(trimmed)
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer.trim())
      } catch {
        // Skip malformed JSON
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Parse an NDJSON stream from Ollama /api/generate.
 */
export async function* parseOllamaGenerateStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<OllamaGenerateChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          yield JSON.parse(trimmed)
        } catch {
          // Skip
        }
      }
    }

    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer.trim())
      } catch {
        // Skip
      }
    }
  } finally {
    reader.releaseLock()
  }
}

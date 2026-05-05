/**
 * OpenAI SSE stream parser.
 * Parses Server-Sent Events from OpenAI-compatible APIs.
 * Handles "data: {...}" lines and "data: [DONE]" termination.
 */

import type { OpenAIStreamChunk } from './openai-types'

/**
 * Parse an SSE stream from OpenAI-compatible APIs.
 * Yields parsed OpenAIStreamChunk objects.
 */
export async function* parseOpenAIStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<OpenAIStreamChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Split by double newline (SSE event separator)
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const event of events) {
        const lines = event.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6) // Remove "data: " prefix
          if (data === '[DONE]') return

          try {
            yield JSON.parse(data)
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6)
        if (data !== '[DONE]') {
          try {
            yield JSON.parse(data)
          } catch {
            // Skip
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

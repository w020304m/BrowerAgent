/**
 * Anthropic SSE stream parser.
 * Parses Server-Sent Events from the Anthropic Messages API.
 * Handles event types: message_start, content_block_start, content_block_delta,
 * content_block_stop, message_delta, message_stop.
 */

import type { AnthropicSSEEvent } from './anthropic-types'

/**
 * Parse an SSE stream from the Anthropic Messages API.
 * Yields parsed AnthropicSSEEvent objects.
 */
export async function* parseAnthropicStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<AnthropicSSEEvent> {
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

          const data = trimmed.slice(6)
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

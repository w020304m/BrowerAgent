/**
 * Model pull service.
 * Streams model downloads from Ollama with progress tracking.
 */

export interface PullProgress {
  status: string
  completed?: number
  total?: number
}

/**
 * Stream download a model from Ollama.
 * POST /api/pull with NDJSON response for progress.
 */
export async function* streamDownload(
  ollamaUrl: string,
  modelName: string,
  signal?: AbortSignal,
): AsyncGenerator<PullProgress> {
  const response = await fetch(`${ollamaUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Ollama pull failed: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line) as PullProgress
        yield parsed
      } catch {
        // Skip malformed lines
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer) as PullProgress
      yield parsed
    } catch {
      // Skip malformed
    }
  }
}

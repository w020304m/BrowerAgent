/**
 * Ollama Model Service.
 * Handles model listing, pulling, and deletion via Ollama API.
 */

import { smartFetch } from '../proxy-fetch'

export interface OllamaModelInfo {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details: {
    parent_model?: string
    format: string
    family: string
    families?: string[]
    parameter_size: string
    quantization_level: string
  }
}

export interface OllamaModelsResponse {
  models: OllamaModelInfo[]
}

export interface OllamaRunningModel {
  name: string
  model: string
  size: number
  digest: string
  details: OllamaModelInfo['details']
  expires_at?: string
  size_vram?: number
}

export interface OllamaRunningModelsResponse {
  models: OllamaRunningModel[]
}

/**
 * List available models from Ollama.
 */
export async function listOllamaModels(
  baseUrl: string,
  headers?: Record<string, string>
): Promise<OllamaModelInfo[]> {
  const response = await smartFetch(`${baseUrl}/api/tags`, {
    headers: { ...headers },
  })

  if (!response.ok) {
    throw new Error(`Ollama list models error: ${response.status}`)
  }

  const data = await response.json() as OllamaModelsResponse
  return data.models ?? []
}

/**
 * List currently running models from Ollama.
 */
export async function listRunningModels(
  baseUrl: string,
  headers?: Record<string, string>
): Promise<OllamaRunningModel[]> {
  const response = await smartFetch(`${baseUrl}/api/ps`, {
    headers: { ...headers },
  })

  if (!response.ok) {
    return [] // Not critical, return empty
  }

  const data = await response.json() as OllamaRunningModelsResponse
  return data.models ?? []
}

/**
 * Pull a model from Ollama registry.
 * Returns an async generator that yields progress events.
 */
export async function* pullModel(
  baseUrl: string,
  modelName: string,
  headers?: Record<string, string>
): AsyncGenerator<{ status: string; completed?: number; total?: number }> {
  const response = await smartFetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ name: modelName, stream: true }),
  })

  if (!response.ok) {
    throw new Error(`Ollama pull error: ${response.status}`)
  }

  if (!response.body) return

  const reader = response.body.getReader()
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
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Delete a model from Ollama.
 */
export async function deleteModel(
  baseUrl: string,
  modelName: string,
  headers?: Record<string, string>
): Promise<void> {
  const response = await smartFetch(`${baseUrl}/api/delete`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ name: modelName }),
  })

  if (!response.ok) {
    throw new Error(`Ollama delete error: ${response.status}`)
  }
}

/**
 * Ollama API types.
 */

/** Ollama chat request body */
export interface OllamaChatRequest {
  model: string
  messages: OllamaApiMessage[]
  stream?: boolean
  keep_alive?: string | number
  think?: boolean | string
  options?: Record<string, unknown>
  tools?: Array<{
    type: 'function'
    function: {
      name: string
      description?: string
      parameters?: Record<string, unknown>
    }
  }>
}

/** Ollama generate request body (fallback) */
export interface OllamaGenerateRequest {
  model: string
  prompt: string
  stream?: boolean
  keep_alive?: string | number
  options?: Record<string, unknown>
}

/** Ollama API message format */
export interface OllamaApiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  images?: string[]
  tool_calls?: Array<{
    function: {
      name: string
      arguments: Record<string, unknown>
    }
  }>
}

/** Ollama chat stream response chunk */
export interface OllamaChatChunk {
  model: string
  created_at: string
  message: {
    role: string
    content?: string
    thinking?: string
    tool_calls?: Array<{
      function: {
        name: string
        arguments: Record<string, unknown>
      }
    }>
  }
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

/** Ollama generate stream response chunk */
export interface OllamaGenerateChunk {
  model: string
  created_at: string
  response?: string
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

/** Ollama embedding request */
export interface OllamaEmbedRequest {
  model: string
  input: string | string[]
  truncate?: boolean
  options?: Record<string, unknown>
}

/** Ollama embedding response */
export interface OllamaEmbedResponse {
  model: string
  embeddings: number[][]
}

/** Ollama tags response (model list) */
export interface OllamaTagsResponse {
  models: Array<{
    name: string
    model: string
    modified_at: string
    size: number
    digest: string
    details: {
      parent_model: string
      format: string
      family: string
      families: string[]
      parameter_size: string
      quantization_level: string
    }
  }>
}

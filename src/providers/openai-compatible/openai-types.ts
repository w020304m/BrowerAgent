/**
 * OpenAI-compatible API types.
 * Covers OpenAI, OpenRouter, and custom OpenAI-compatible endpoints.
 */

/** OpenAI Chat API request body */
export interface OpenAIChatRequest {
  model: string
  messages: Array<{
    role: string
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | null
    tool_calls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
    tool_call_id?: string
  }>
  stream?: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number
  frequency_penalty?: number
  presence_penalty?: number
  seed?: number
  stop?: string[]
  tools?: Array<{
    type: 'function'
    function: { name: string; description?: string; parameters?: Record<string, unknown> }
  }>
  reasoning?: { method: string }
  /** Provider-specific extra fields */
  [key: string]: unknown
}

/** OpenAI Chat API streaming chunk (SSE) */
export interface OpenAIStreamChunk {
  id?: string
  object?: string
  created?: number
  model?: string
  choices?: Array<{
    index: number
    delta?: {
      role?: string
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
      reasoning_details?: unknown
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/** OpenAI Embedding API request */
export interface OpenAIEmbedRequest {
  model: string
  input: string | string[]
  encoding_format?: 'float' | 'base64'
}

/** OpenAI Embedding API response */
export interface OpenAIEmbedResponse {
  object: string
  model: string
  data: Array<{
    object: string
    embedding: number[]
    index: number
  }>
  usage?: {
    prompt_tokens: number
    total_tokens: number
  }
}

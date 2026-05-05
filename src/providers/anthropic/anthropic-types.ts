/**
 * Anthropic API types.
 * Covers the Messages API format for Claude models.
 */

/** Anthropic Messages API request body */
export interface AnthropicChatRequest {
  model: string
  max_tokens: number
  messages: Array<{
    role: 'user' | 'assistant'
    content: string | AnthropicContentBlock[]
  }>
  system?: string
  stream?: boolean
  temperature?: number
  top_p?: number
  top_k?: number
  stop_sequences?: string[]
  tools?: Array<{
    name: string
    description?: string
    input_schema: Record<string, unknown>
  }>
  /** Extended thinking */
  thinking?: {
    type: 'enabled'
    budget_tokens: number
  }
}

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

/** Anthropic SSE event types */
export type AnthropicSSEEvent =
  | { type: 'message_start'; message: { id: string; model: string; usage: { input_tokens: number } } }
  | { type: 'content_block_start'; index: number; content_block: { type: string; text?: string; id?: string; name?: string; input_schema?: unknown } }
  | { type: 'content_block_delta'; index: number; delta: { type: string; text?: string; partial_json?: string; stop_reason?: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string; stop_sequence?: string }; usage: { output_tokens: number } }
  | { type: 'message_stop' }

/** Anthropic Embedding API (via Voyage AI or similar) */
export interface AnthropicEmbedRequest {
  model: string
  input: string | string[]
  input_type?: string
}

export interface AnthropicEmbedResponse {
  object: string
  model: string
  data: Array<{
    object: string
    embedding: number[]
    index: number
  }>
  usage?: { total_tokens: number }
}

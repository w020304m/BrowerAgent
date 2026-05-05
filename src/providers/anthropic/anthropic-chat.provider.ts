/**
 * Anthropic Chat Provider.
 * Implements IChatProvider using the Anthropic Messages API.
 * Supports extended thinking (Claude 3.5+), tool use, and streaming.
 */

import type { IChatProvider, StreamChunk, ChatResult, ModelParams, ChatRequestOptions } from '../types'
import type { ChatMessage } from '@/types/message'
import { toAnthropicMessages } from '@/message/anthropic-format'
import { parseAnthropicStream } from './anthropic-stream'
import type { AnthropicChatRequest, AnthropicSSEEvent } from './anthropic-types'
import { smartFetch } from '../proxy-fetch'

/**
 * Normalize base URL by ensuring it ends with the given version path.
 * Same logic as openai-chat.provider.ts.
 */
function normalizeBaseUrl(url: string, versionPath: string): string {
  const base = url.replace(/\/$/, '')
  if (/\/v\d+$/.test(base)) return base
  return base + versionPath
}

export interface AnthropicProviderConfig {
  baseUrl: string
  model: string
  headers?: Record<string, string>
  params?: ModelParams
  /** Anthropic API version header */
  apiVersion?: string
}

export class AnthropicChatProvider implements IChatProvider {
  readonly providerType = 'anthropic' as const
  readonly modelId: string

  private baseUrl: string
  private headers: Record<string, string>
  private params: ModelParams
  private apiVersion: string

  constructor(config: AnthropicProviderConfig) {
    this.modelId = config.model
    this.baseUrl = normalizeBaseUrl(config.baseUrl, '/v1')
    this.headers = config.headers ?? {}
    this.params = config.params ?? {}
    this.apiVersion = config.apiVersion ?? '2023-06-01'
  }

  async chat(messages: ChatMessage[], options?: ChatRequestOptions): Promise<ChatResult> {
    let content = ''
    let reasoningContent = ''
    let generationInfo: Record<string, unknown> = {}

    // Index-based accumulator for tool calls (same strategy as processStream)
    const tcAccumulators = new Map<number, { id: string; name: string; argsBuffer: string }>()

    for await (const chunk of this.streamChat(messages, options)) {
      content += chunk.content
      if (chunk.reasoningContent) reasoningContent += chunk.reasoningContent
      if (chunk.generationInfo) generationInfo = { ...generationInfo, ...chunk.generationInfo }
      if (chunk.toolCallChunks) {
        for (const tc of chunk.toolCallChunks) {
          const idx = tc.index
          let acc = tcAccumulators.get(idx)
          if (!acc) {
            acc = { id: '', name: '', argsBuffer: '' }
            tcAccumulators.set(idx, acc)
          }
          if (tc.id) acc.id = tc.id
          if (tc.name) acc.name = tc.name
          acc.argsBuffer += tc.args
        }
      }
    }

    // Finalize tool calls from accumulators
    const toolCalls: import('@/types/tool').ToolCall[] = []
    const sorted = Array.from(tcAccumulators.entries()).sort(([a], [b]) => a - b)
    for (const [, acc] of sorted) {
      if (!acc.id || !acc.name) continue
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(acc.argsBuffer) } catch { /* fallback to empty */ }
      toolCalls.push({ id: acc.id, name: acc.name, args, type: 'tool_call' })
    }

    return {
      content,
      reasoningContent: reasoningContent || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      generationInfo,
    }
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: ChatRequestOptions
  ): AsyncGenerator<StreamChunk> {
    const formatted = toAnthropicMessages(messages)
    const requestBody: AnthropicChatRequest = {
      model: this.modelId,
      max_tokens: this.params.numPredict ?? 4096,
      messages: formatted.messages,
      stream: true,
      ...this.buildParams(formatted.system),
    }

    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters ?? {},
      }))
    }

    const response = await this.fetch('/messages', requestBody, options?.signal)

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`)
    }

    if (!response.body) {
      throw new Error('Anthropic API returned no body')
    }

    // Track tool use accumulation
    let currentToolId = ''
    let currentToolName = ''
    let currentToolArgs = ''

    for await (const event of parseAnthropicStream(response.body)) {
      const mapped = this.mapEvent(event, currentToolId, currentToolName, currentToolArgs)

      // Track tool use state for accumulation
      if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        currentToolId = event.content_block.id ?? ''
        currentToolName = event.content_block.name ?? ''
        currentToolArgs = ''
      }
      if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
        currentToolArgs += event.delta.partial_json ?? ''
      }

      if (mapped) yield mapped
    }
  }

  private mapEvent(
    event: AnthropicSSEEvent,
    toolId: string,
    toolName: string,
    toolArgs: string
  ): StreamChunk | null {
    switch (event.type) {
      case 'message_start':
        return {
          content: '',
          done: false,
          generationInfo: {
            model: event.message?.model,
            message_id: event.message?.id,
          },
        }

      case 'content_block_start': {
        const block = event.content_block
        if (block?.type === 'tool_use') {
          return {
            content: '',
            done: false,
            toolCallChunks: [{
              name: block.name ?? '',
              args: '',
              type: 'tool_call_chunk' as const,
              index: event.index,
              id: block.id ?? '',
            }],
          }
        }
        return null // text block start has no content
      }

      case 'content_block_delta': {
        const delta = event.delta
        if (delta?.type === 'text_delta') {
          return {
            content: delta.text ?? '',
            done: false,
          }
        }
        if (delta?.type === 'thinking_delta') {
          return {
            content: '',
            reasoningContent: delta.text ?? '',
            done: false,
          }
        }
        if (delta?.type === 'input_json_delta') {
          // Accumulate partial JSON for tool calls
          return null // handled via state tracking
        }
        return null
      }

      case 'content_block_stop': {
        // When a tool_use block stops, emit the complete tool call
        if (toolId && toolName) {
          return {
            content: '',
            done: false,
            toolCallChunks: [{
              name: toolName,
              args: toolArgs,
              type: 'tool_call_chunk' as const,
              index: event.index,
              id: toolId,
            }],
          }
        }
        return null
      }

      case 'message_delta':
        return {
          content: '',
          done: true,
          generationInfo: {
            stop_reason: event.delta?.stop_reason,
            stop_sequence: event.delta?.stop_sequence,
            output_tokens: event.usage?.output_tokens,
          },
        }

      case 'message_stop':
        return null

      default:
        return null
    }
  }

  private buildParams(system?: string): Partial<AnthropicChatRequest> {
    const params = this.params
    const result: Partial<AnthropicChatRequest> = {}

    if (system) result.system = system
    if (params.temperature !== undefined) result.temperature = params.temperature
    if (params.topP !== undefined) result.top_p = params.topP
    if (params.topK !== undefined) result.top_k = params.topK
    if (params.stop !== undefined) result.stop_sequences = params.stop

    // Extended thinking
    if (params.thinking === true || typeof params.thinking === 'string') {
      result.thinking = {
        type: 'enabled',
        budget_tokens: typeof params.thinking === 'string'
          ? this.mapThinkingBudget(params.thinking)
          : 10000,
      }
    }

    return result
  }

  private mapThinkingBudget(level: string): number {
    switch (level) {
      case 'low': return 5000
      case 'medium': return 10000
      case 'high': return 32000
      default: return 10000
    }
  }

  private async fetch(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    return smartFetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': this.apiVersion,
        ...this.headers,
      },
      body: JSON.stringify(body),
      signal,
    })
  }
}

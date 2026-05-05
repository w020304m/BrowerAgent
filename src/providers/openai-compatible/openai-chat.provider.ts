/**
 * OpenAI-compatible Chat Provider.
 * Implements IChatProvider using native fetch + SSE stream parsing.
 * Works with OpenAI, OpenRouter, and any OpenAI-compatible endpoint.
 */

import type { IChatProvider, StreamChunk, ChatResult, ModelParams, ChatRequestOptions } from '../types'
import type { ChatMessage } from '@/types/message'
import type { ProviderType } from '@/types/provider'
import { toOpenAIMessages } from '@/message/openai-format'
import { parseOpenAIStream } from './openai-stream'
import type { OpenAIChatRequest, OpenAIStreamChunk } from './openai-types'
import { smartFetch } from '../proxy-fetch'

/**
 * Normalize base URL by ensuring it ends with the given version path.
 *
 * If the user provides `https://api.openai.com`, adds `/v1`.
 * If the user provides `https://api.openai.com/v1`, keeps as-is.
 * If the user provides `https://proxy.com/v4`, keeps as-is (custom version).
 */
function normalizeBaseUrl(url: string, versionPath: string): string {
  const base = url.replace(/\/$/, '')
  // Check if URL already ends with a version-like path (/v1, /v2, /v4, etc.)
  if (/\/v\d+$/.test(base)) return base
  return base + versionPath
}

export interface OpenAIProviderConfig {
  baseUrl: string
  model: string
  headers?: Record<string, string>
  params?: ModelParams
}

export class OpenAIChatProvider implements IChatProvider {
  readonly providerType: ProviderType = 'openai'
  readonly modelId: string

  private baseUrl: string
  private headers: Record<string, string>
  private params: ModelParams

  constructor(config: OpenAIProviderConfig) {
    this.modelId = config.model
    this.baseUrl = normalizeBaseUrl(config.baseUrl, '/v1')
    this.headers = config.headers ?? {}
    this.params = config.params ?? {}
  }

  async chat(messages: ChatMessage[], options?: ChatRequestOptions): Promise<ChatResult> {
    let content = ''
    let reasoningContent = ''
    let generationInfo: Record<string, unknown> = {}
    let usage: ChatResult['usageMetadata']

    // Index-based accumulator for tool calls (same strategy as processStream)
    const tcAccumulators = new Map<number, { id: string; name: string; argsBuffer: string }>()

    for await (const chunk of this.streamChat(messages, options)) {
      content += chunk.content
      if (chunk.reasoningContent) reasoningContent += chunk.reasoningContent
      if (chunk.generationInfo) generationInfo = { ...generationInfo, ...chunk.generationInfo }
      if (chunk.usageMetadata) usage = chunk.usageMetadata
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
      usageMetadata: usage,
    }
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: ChatRequestOptions
  ): AsyncGenerator<StreamChunk & { usageMetadata?: ChatResult['usageMetadata'] }> {
    const openaiMessages = toOpenAIMessages(messages)
    const requestBody: OpenAIChatRequest = {
      model: this.modelId,
      messages: openaiMessages,
      stream: true,
      ...this.buildParams(),
    }

    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
    }

    const response = await this.fetch('/chat/completions', requestBody, options?.signal)

    if (!response.ok) {
      const errorBody = await response.text()
      // Log request details for debugging provider compatibility issues
      console.error(
        `[OpenAI Provider] API error ${response.status}`,
        '\nURL:', `${this.baseUrl}/chat/completions`,
        '\nModel:', this.modelId,
        '\nMessages count:', openaiMessages.length,
        '\nTools count:', requestBody.tools?.length ?? 0,
        '\nFirst message role:', openaiMessages[0]?.role,
        '\nError:', errorBody,
      )
      throw new Error(`OpenAI API error: ${response.status} ${errorBody}`)
    }

    if (!response.body) {
      throw new Error('OpenAI API returned no body')
    }

    for await (const chunk of parseOpenAIStream(response.body)) {
      yield this.mapChunk(chunk)
    }
  }

  private mapChunk(chunk: OpenAIStreamChunk): StreamChunk & { usageMetadata?: ChatResult['usageMetadata'] } {
    const choice = chunk.choices?.[0]
    if (!choice) {
      return { content: '', done: false }
    }

    const delta = choice.delta
    const isDone = choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls'

    // Handle usage metadata (typically on the final chunk)
    let usageMetadata: ChatResult['usageMetadata']
    if (chunk.usage) {
      usageMetadata = {
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
        totalTokens: chunk.usage.total_tokens,
      }
    }

    // Map tool call chunks
    let toolCallChunks: StreamChunk['toolCallChunks']
    if (delta?.tool_calls) {
      toolCallChunks = delta.tool_calls.map(tc => ({
        name: tc.function?.name,
        args: tc.function?.arguments ?? '',
        type: 'tool_call_chunk' as const,
        index: tc.index,
        id: tc.id ?? '',
      }))
    }

    // Extract reasoning content
    const reasoningContent =
      (delta?.reasoning_content ?? delta?.reasoning) ?? undefined

    return {
      content: delta?.content ?? '',
      reasoningContent: reasoningContent as string | undefined,
      done: isDone,
      toolCallChunks,
      generationInfo: isDone ? {
        model: chunk.model,
        finish_reason: choice.finish_reason,
      } : undefined,
      usageMetadata,
    }
  }

  private buildParams(): Partial<OpenAIChatRequest> {
    const params = this.params
    const result: Partial<OpenAIChatRequest> = {}

    if (params.temperature !== undefined) result.temperature = params.temperature
    if (params.topP !== undefined) result.top_p = params.topP
    if (params.numPredict !== undefined && params.numPredict !== -1) {
      result.max_tokens = params.numPredict
    }
    if (params.frequencyPenalty !== undefined) result.frequency_penalty = params.frequencyPenalty
    if (params.presencePenalty !== undefined) result.presence_penalty = params.presencePenalty
    if (params.seed !== undefined) result.seed = params.seed
    if (params.stop !== undefined) result.stop = params.stop

    if (params.reasoningEffort) {
      result.reasoning = { method: params.reasoningEffort }
    }

    return result
  }

  protected async fetch(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    return smartFetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(body),
      signal,
    })
  }
}

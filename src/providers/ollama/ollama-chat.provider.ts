/**
 * Ollama Chat Provider.
 * Implements IChatProvider using native fetch + NDJSON stream parsing.
 * Replaces ChatOllama.ts (~515 lines of LangChain code).
 */

import type { IChatProvider, StreamChunk, ChatResult, ModelParams, ChatRequestOptions } from '../types'
import type { ChatMessage } from '@/types/message'
import { toOllamaMessages } from '@/message/ollama-format'
import { parseOllamaChatStream, parseOllamaGenerateStream } from './ollama-stream'
import { parseKeepAlive, buildOllamaOptions } from './ollama-utils'
import type { OllamaChatRequest, OllamaChatChunk } from './ollama-types'
import { smartFetch } from '../proxy-fetch'

export interface OllamaProviderConfig {
  baseUrl: string
  model: string
  headers?: Record<string, string>
  params?: ModelParams
}

export class OllamaChatProvider implements IChatProvider {
  readonly providerType = 'ollama' as const
  readonly modelId: string

  private baseUrl: string
  private headers: Record<string, string>
  private params: ModelParams

  constructor(config: OllamaProviderConfig) {
    this.modelId = config.model
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.headers = config.headers ?? {}
    this.params = config.params ?? {}
  }

  async chat(messages: ChatMessage[], options?: ChatRequestOptions): Promise<ChatResult> {
    let content = ''
    let reasoningContent = ''
    const toolCalls: import('@/types/tool').ToolCall[] = []
    let generationInfo: Record<string, unknown> = {}

    for await (const chunk of this.streamChat(messages, options)) {
      content += chunk.content
      if (chunk.reasoningContent) reasoningContent += chunk.reasoningContent
      if (chunk.generationInfo) generationInfo = { ...generationInfo, ...chunk.generationInfo }
      if (chunk.toolCallChunks) {
        for (const tc of chunk.toolCallChunks) {
          if (tc.name && tc.id) {
            let args: Record<string, unknown> = {}
            try { args = JSON.parse(tc.args) } catch { /* partial */ }
            toolCalls.push({ id: tc.id, name: tc.name, args, type: 'tool_call' })
          }
        }
      }
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
    const ollamaMessages = toOllamaMessages(messages)
    const requestBody: OllamaChatRequest = {
      model: this.modelId,
      messages: ollamaMessages,
      stream: true,
      ...this.buildExtraParams(options),
    }

    const response = await this.fetch('/api/chat', requestBody, options?.signal)

    if (!response.ok) {
      // If /api/chat returns 404, fall back to /api/generate
      if (response.status === 404) {
        const hasTools = options?.tools && options.tools.length > 0
        if (hasTools) {
          throw new Error(
            'This Ollama version does not support tool calling (/api/chat not available). ' +
            'Please update Ollama to v0.5.0 or later to use agent mode.'
          )
        }
        yield* this.streamGenerateFallback(ollamaMessages, options)
        return
      }
      throw new Error(`Ollama API error: ${response.status} ${await response.text()}`)
    }

    if (!response.body) {
      throw new Error('Ollama API returned no body')
    }

    for await (const chunk of parseOllamaChatStream(response.body)) {
      yield this.mapChatChunk(chunk)
    }
  }

  private async *streamGenerateFallback(
    ollamaMessages: Array<{ role: string; content: string }>,
    options?: ChatRequestOptions
  ): AsyncGenerator<StreamChunk> {
    // Build a simple prompt from messages
    const prompt = ollamaMessages
      .map(m => `${m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'}: ${m.content}`)
      .join('\n\n') + '\n\nAssistant:'

    const response = await this.fetch('/api/generate', {
      model: this.modelId,
      prompt,
      stream: true,
    }, options?.signal)

    if (!response.ok) {
      throw new Error(`Ollama generate API error: ${response.status}`)
    }

    if (!response.body) return

    for await (const chunk of parseOllamaGenerateStream(response.body)) {
      yield {
        content: chunk.response ?? '',
        done: chunk.done,
        generationInfo: chunk.done ? {
          model: chunk.model,
          total_duration: chunk.total_duration,
          load_duration: chunk.load_duration,
          prompt_eval_count: chunk.prompt_eval_count,
          eval_count: chunk.eval_count,
        } : undefined,
      }
    }
  }

  private mapChatChunk(chunk: OllamaChatChunk): StreamChunk {
    if (chunk.done) {
      return {
        content: '',
        done: true,
        generationInfo: {
          model: chunk.model,
          total_duration: chunk.total_duration,
          load_duration: chunk.load_duration,
          prompt_eval_count: chunk.prompt_eval_count,
          prompt_eval_duration: chunk.prompt_eval_duration,
          eval_count: chunk.eval_count,
          eval_duration: chunk.eval_duration,
        },
      }
    }

    return {
      content: chunk.message?.content ?? '',
      reasoningContent: chunk.message?.thinking ?? undefined,
      done: false,
      toolCallChunks: chunk.message?.tool_calls?.map((tc, i) => ({
        name: tc.function.name,
        args: JSON.stringify(tc.function.arguments),
        type: 'tool_call_chunk' as const,
        index: i,
        id: `tc_${i}_${Date.now()}`,
      })),
    }
  }

  private buildExtraParams(options?: ChatRequestOptions): Partial<OllamaChatRequest> {
    const params = this.params
    const result: Partial<OllamaChatRequest> = {}

    if (params.keepAlive) {
      result.keep_alive = parseKeepAlive(params.keepAlive)
    }

    if (params.thinking !== undefined) {
      result.think = params.thinking
    }

    const ollamaOptions = buildOllamaOptions(params)
    if (Object.keys(ollamaOptions).length > 0) {
      result.options = ollamaOptions
    }

    if (options?.tools && options.tools.length > 0) {
      result.tools = options.tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
    }

    return result
  }

  private async fetch(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
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

/**
 * Google AI Chat Provider.
 * Wraps OpenAI-compatible provider since Google AI Studio exposes
 * an OpenAI-compatible endpoint.
 *
 * Reference: ChatGoogleAI.ts - extends ChatOpenAI, removes frequency/presence penalty.
 */

import { OpenAIChatProvider } from '../openai-compatible/openai-chat.provider'
import type { ModelParams, ChatRequestOptions } from '../types'
import type { ChatMessage } from '@/types/message'
import type { OpenAIChatRequest } from '../openai-compatible/openai-types'

export interface GoogleAIProviderConfig {
  baseUrl: string
  model: string
  headers?: Record<string, string>
  params?: ModelParams
}

export class GoogleAIChatProvider extends OpenAIChatProvider {
  readonly providerType = 'google' as const

  constructor(config: GoogleAIProviderConfig) {
    super({
      baseUrl: config.baseUrl,
      model: config.model,
      headers: config.headers,
      params: config.params,
    })
  }

  protected async fetch(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    // Google AI doesn't support frequency/presence penalty, strip them
    const req = body as OpenAIChatRequest
    delete req.frequency_penalty
    delete req.presence_penalty

    return super.fetch(path, req, signal)
  }
}

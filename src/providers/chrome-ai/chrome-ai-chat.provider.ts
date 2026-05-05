/**
 * Chrome AI Chat Provider.
 * Uses the browser's built-in AI (window.ai) API.
 * Supports Gemini Nano and other built-in models.
 *
 * Reference: ChatChromeAi.ts - uses createAITextSession + promptStreaming
 */

import type { IChatProvider, StreamChunk, ChatResult, ModelParams, ChatRequestOptions } from '../types'
import type { ChatMessage } from '@/types/message'

/** Type declarations for Chrome AI API */
interface AITextSession {
  prompt(text: string): Promise<string>
  promptStreaming(text: string): ReadableStream<string>
  destroy(): void
}

interface AI {
  canCreateTextSession(): Promise<'readily' | 'after-download' | 'no'>
  createTextSession(options?: { topK?: number; temperature?: number }): Promise<AITextSession>
}

declare global {
  interface Window {
    ai?: AI
  }
}

export interface ChromeAIProviderConfig {
  model: string
  params?: ModelParams
}

export class ChromeAIChatProvider implements IChatProvider {
  readonly providerType = 'chrome-ai' as const
  readonly modelId: string

  private params: ModelParams
  private session: AITextSession | null = null

  constructor(config: ChromeAIProviderConfig) {
    this.modelId = config.model
    this.params = config.params ?? {}
  }

  async chat(messages: ChatMessage[], options?: ChatRequestOptions): Promise<ChatResult> {
    let content = ''
    for await (const chunk of this.streamChat(messages, options)) {
      content += chunk.content
    }
    return { content }
  }

  async *streamChat(
    messages: ChatMessage[],
    options?: ChatRequestOptions
  ): AsyncGenerator<StreamChunk> {
    const session = await this.getOrCreateSession()

    // Format messages as a simple prompt
    const prompt = this.formatPrompt(messages)

    // Check for abort before starting
    if (options?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    const stream = session.promptStreaming(prompt)

    const reader = (stream as unknown as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        if (options?.signal?.aborted) {
          reader.cancel()
          throw new DOMException('The operation was aborted.', 'AbortError')
        }

        const { done, value } = await reader.read()
        if (done) break

        const text = typeof value === 'string' ? value : decoder.decode(value as Uint8Array, { stream: true })
        if (text) {
          yield {
            content: text,
            done: false,
          }
        }
      }

      yield { content: '', done: true }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Check if Chrome AI is available.
   */
  static async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.ai) return false
    const status = await window.ai.canCreateTextSession()
    return status === 'readily' || status === 'after-download'
  }

  /**
   * Destroy the session to free resources.
   */
  destroy(): void {
    if (this.session) {
      this.session.destroy()
      this.session = null
    }
  }

  private async getOrCreateSession(): Promise<AITextSession> {
    if (!this.session) {
      if (typeof window === 'undefined' || !window.ai) {
        throw new Error('Chrome AI is not available in this environment')
      }

      this.session = await window.ai.createTextSession({
        topK: this.params.topK ?? 120,
        temperature: this.params.temperature ?? 0.8,
      })
    }
    return this.session
  }

  private formatPrompt(messages: ChatMessage[]): string {
    return messages
      .map(m => {
        const role = m.role === 'user' ? 'human' : m.role === 'assistant' ? 'ai' : 'system'
        return `${role}: ${m.content}`
      })
      .join('\n') + '\nai:'
  }
}

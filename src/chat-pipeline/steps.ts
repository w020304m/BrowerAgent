/**
 * Chat Pipeline steps.
 * Each step is a self-contained unit that mutates ChatContext.
 */

import type { ChatContext, IPipelineStep, PipelineCallbacks, ChatMode } from './types'
import type { ChatMessage } from '@/types/message'
import type { ProviderType } from '@/types/provider'
import { createChatProvider } from '@/providers/factory'
import { processStream } from '@/stream/process-stream'
import { generateId } from '@/types/common'
import { resolveModelConfig } from '@/providers/config-resolver'

// ==========================================
// Step 1: Model Initialization
// ==========================================

export class ModelInitStep implements IPipelineStep {
  readonly name = 'ModelInit'

  constructor(
    private getBaseUrl: (providerType: ProviderType) => string | undefined | Promise<string | undefined>,
    private getApiKey: (providerType: ProviderType) => string | undefined | Promise<string | undefined>,
    private getHeaders: (providerType: ProviderType) => Record<string, string> | undefined | Promise<Record<string, string> | undefined>,
  ) {}

  async execute(context: ChatContext): Promise<void> {
    const baseUrl = await this.getBaseUrl(context.providerType)
    if (!baseUrl) {
      throw new Error(`No base URL configured for provider: ${context.providerType}`)
    }

    const apiKey = await this.getApiKey(context.providerType)
    const headers = await this.getHeaders(context.providerType)

    // Resolve model params from 3-layer config
    const resolvedParams = resolveModelConfig({
      sessionSettings: context.params ?? {},      // session-level (highest priority)
      modelSettings: {},                          // model-level (would be loaded from storage)
      globalDefaults: {},                         // global-level (would be loaded from storage)
    })

    context.provider = createChatProvider({
      provider: context.providerType,
      model: context.modelId,
      baseUrl,
      apiKey,
      headers,
      params: resolvedParams,
    })
  }
}

// ==========================================
// Step 2: System Prompt Resolution
// ==========================================

export class SystemPromptStep implements IPipelineStep {
  readonly name = 'SystemPrompt'

  constructor(
    private getSystemPrompt: (mode: ChatMode) => string | undefined | Promise<string | undefined>,
  ) {}

  async execute(context: ChatContext): Promise<void> {
    context.systemPrompt = (await this.getSystemPrompt(context.mode)) ?? ''
  }
}

// ==========================================
// Step 3: Message Building
// ==========================================

export class MessageBuildStep implements IPipelineStep {
  readonly name = 'MessageBuild'

  async execute(context: ChatContext): Promise<void> {
    const messages: ChatMessage[] = []

    // Add system prompt if present
    if (context.systemPrompt) {
      messages.push({
        id: generateId(),
        historyId: context.historyId,
        role: 'system',
        content: context.systemPrompt,
        createdAt: Date.now(),
      })
    }

    // Add existing history
    messages.push(...context.messages)

    // Add context (from RAG/search/etc.) before user message
    if (context.retrievedContext?.text) {
      messages.push({
        id: generateId(),
        historyId: context.historyId,
        role: 'system',
        content: `Context:\n${context.retrievedContext.text}`,
        createdAt: Date.now(),
      })
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      historyId: context.historyId,
      role: 'user',
      content: context.userInput,
      createdAt: Date.now(),
    }

    if (context.images && context.images.length > 0) {
      userMessage.images = context.images
    }

    messages.push(userMessage)
    context.messages = messages
  }
}

// ==========================================
// Step 4: Model Call (with streaming)
// ==========================================

export class ModelCallStep implements IPipelineStep {
  readonly name = 'ModelCall'

  constructor(private callbacks?: PipelineCallbacks) {}

  async execute(context: ChatContext): Promise<void> {
    if (!context.provider) {
      throw new Error('Provider not initialized')
    }

    const options = {
      signal: context.signal,
      tools: context.tools,
    }

    const result = await processStream(
      context.provider,
      context.messages,
      options,
      {
        onToken: (token) => {
          this.callbacks?.onChunk?.({
            content: token,
            done: false,
          })
        },
        onReasoningToken: (token) => {
          this.callbacks?.onChunk?.({
            content: '',
            reasoningContent: token,
            done: false,
          })
        },
        onGenerationInfo: (info) => {
          this.callbacks?.onChunk?.({
            content: '',
            done: false,
            generationInfo: info,
          })
        },
      }
    )

    context.result = {
      content: result.content,
      reasoningContent: result.reasoningContent,
      generationInfo: result.generationInfo,
      usageMetadata: result.usageMetadata,
      toolCalls: result.toolCalls,
    }

    this.callbacks?.onChunk?.({
      content: '',
      done: true,
      generationInfo: result.generationInfo,
    })
  }
}

// ==========================================
// Step 5: Persistence
// ==========================================

export class PersistenceStep implements IPipelineStep {
  readonly name = 'Persistence'

  constructor(
    private saveMessage: (message: ChatMessage) => Promise<void>,
    private updateHistory: (historyId: string, lastMessage: string) => Promise<void>,
  ) {}

  async execute(context: ChatContext): Promise<void> {
    if (!context.result) return

    // Save assistant response
    const assistantMessage: ChatMessage = {
      id: generateId(),
      historyId: context.historyId,
      role: 'assistant',
      content: context.result.content,
      reasoningContent: context.result.reasoningContent,
      createdAt: Date.now(),
      generationInfo: context.result.generationInfo,
    }

    await this.saveMessage(assistantMessage)

    // Save user message (last in context.messages)
    const userMsg = context.messages[context.messages.length - 1]
    if (userMsg?.role === 'user') {
      await this.saveMessage(userMsg)
    }

    // Update history with last message preview
    await this.updateHistory(context.historyId, context.result.content.slice(0, 100))
  }
}

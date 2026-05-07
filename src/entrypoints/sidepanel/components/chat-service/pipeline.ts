/**
 * Normal (non-agent) pipeline execution
 */

import type { ChatMessage } from '@/types/message'
import type { ChatMode } from '@/chat-pipeline/types'
import { ChatPipeline } from '@/chat-pipeline/pipeline'
import { ModelInitStep, SystemPromptStep, MessageBuildStep, ModelCallStep, PersistenceStep } from '@/chat-pipeline/steps'
import { TabContextRetrievalStep } from '@/chat-pipeline/steps/tab-context-step'
import { TabContentExtractor } from '@/extraction/tab-content-extractor'
import { getBaseUrl, getApiKey, getHeaders, getSystemPrompt } from './config'
import { saveMessageToDb, updateChatHistory } from './persistence'
import { buildMessagesForPipeline } from './history'
import { modelSettingsStorage } from '@/storage/model-settings'
import { sessionPreferencesStorage } from '@/storage/session-preferences'

export interface RunNormalPipelineParams {
  text: string
  state: ReturnType<typeof import('@/store/chat-store').useChatStore.getState>
  store: typeof import('@/store/chat-store').useChatStore
  historyId: string
  userMessage: ChatMessage
  abortController: AbortController
  isTemporary: boolean
  images?: string[]
}

/**
 * Run the normal (non-agent) pipeline.
 * This is the original single-shot pipeline execution path.
 */
export async function runNormalPipeline(params: RunNormalPipelineParams): Promise<void> {
  const { text, state, store, historyId, userMessage, abortController, isTemporary, images } = params

  // Build pipeline
  const pipeline = new ChatPipeline({
    onChunk: (chunk) => {
      if (chunk.content) {
        store.getState().appendStreamContent(chunk.content)
      }
      if (chunk.reasoningContent) {
        store.getState().appendStreamReasoning(chunk.reasoningContent)
      }
    },
    onError: (error) => {
      store.getState().setError(error.message)
      store.getState().resetStream()
    },
  })

  // Configure steps with real storage/DB wiring
  const configId = state.providerConfigId
  const modelInit = new ModelInitStep(
    async (providerType) => getBaseUrl(providerType, configId),
    async (providerType) => getApiKey(providerType, configId),
    async (providerType) => getHeaders(providerType, configId),
  )

  const tabContext = new TabContextRetrievalStep(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('No active tab')
    const extractor = new TabContentExtractor()
    const result = await extractor.extract({ type: 'tab', tabId: tab.id })
    return { title: result.title, url: result.sourceUrl ?? '', content: result.content }
  })

  const systemPrompt = new SystemPromptStep(
    async (mode) => getSystemPrompt(mode, state.selectedPromptId),
  )

  const messageBuild = new MessageBuildStep()
  const modelCall = new ModelCallStep({
    onChunk: (chunk) => {
      if (chunk.content) {
        store.getState().appendStreamContent(chunk.content)
      }
      if (chunk.reasoningContent) {
        store.getState().appendStreamReasoning(chunk.reasoningContent)
      }
      if (chunk.generationInfo) {
        store.getState().setStreamingGenerationInfo(chunk.generationInfo)
      }
    },
  })

  const persistence = new PersistenceStep(
    async (msg) => {
      if (!isTemporary) {
        await saveMessageToDb(msg)
      }
    },
    async (hid, lastMsg) => {
      if (!isTemporary) {
        await updateChatHistory(hid, lastMsg, state.mode)
      }
    },
  )

  pipeline
    .addStep(modelInit)
    .addStep(tabContext)
    .addStep(systemPrompt)
    .addStep(messageBuild)
    .addStep(modelCall)
    .addStep(persistence)

  const ctx = await pipeline.execute({
    userInput: text,
    mode: state.mode,
    historyId,
    providerType: state.providerType,
    modelId: state.modelId,
    messages: buildMessagesForPipeline(state.messages, userMessage.id, store),
    signal: abortController.signal,
    images,
  })

  // Store usage metadata from pipeline result (OpenAI-style providers)
  if (ctx.result?.usageMetadata) {
    store.getState().setStreamingGenerationInfo({
      _usageMetadata: ctx.result.usageMetadata,
    })
  }

  // Store sources from pipeline (tab context, RAG, etc.) for display in message
  if (ctx.retrievedContext?.sources && ctx.retrievedContext.sources.length > 0) {
    store.getState().setStreamingSources(
      ctx.retrievedContext.sources.map(s => ({
        type: 'tab' as const,
        title: s.title,
        url: s.url,
        content: s.excerpt,
      }))
    )
  }

  // Persist last used model and session preferences
  if (!isTemporary) {
    try {
      await modelSettingsStorage.setLastUsedModel(historyId, {
        providerType: state.providerType,
        modelId: state.modelId,
      })
      await sessionPreferencesStorage.set(historyId, {
        providerType: state.providerType,
        modelId: state.modelId,
        providerConfigId: state.providerConfigId,
        mode: state.mode,
        agentEnabled: false,
        isTemporary,
        selectedPromptId: state.selectedPromptId,
      })
    } catch {
      // Storage write failure should not block streaming finalization
    }
  }
}

/**
 * Chat service hook.
 * Bridges the Chat Pipeline with the Zustand Chat Store,
 * real database persistence, and storage configuration.
 * Supports agent mode (agentic loop) when agentEnabled is true.
 */

import { useCallback } from 'react'
import { useChatStore } from '@/store/chat-store'
import { ChatPipeline } from '@/chat-pipeline/pipeline'
import { ModelInitStep, SystemPromptStep, MessageBuildStep, ModelCallStep, PersistenceStep } from '@/chat-pipeline/steps'
import { TabContextRetrievalStep } from '@/chat-pipeline/steps/tab-context-step'
import { TabContentExtractor } from '@/extraction/tab-content-extractor'
import type { ChatMessage } from '@/types/message'
import type { ProviderType } from '@/types/provider'
import type { QueueItemMode } from '@/types/chat'
import { generateId } from '@/types/common'
import { chatMessageToDbRow } from '@/message/formatter'
import { messageRepo } from '@/db/repositories/message.repository'
import { chatHistoryRepo } from '@/db/repositories/chat-history.repository'
import { openaiConfigRepo } from '@/db/repositories/openai-config.repository'
import { promptRepo } from '@/db/repositories/prompt.repository'
import { ollamaSettings } from '@/storage/ollama-settings'
import { modelSettingsStorage } from '@/storage/model-settings'
import type { ChatMode, ChatContext } from '@/chat-pipeline/types'
import { createChatProvider } from '@/providers/factory'
import { ToolRegistry } from '@/tools/tool-registry'
import { BuiltinToolSource } from '@/tools/sources/builtin-tool-source'
import { McpToolSource } from '@/tools/sources/mcp-tool-source'
import { BridgeClient } from '@/agent/bridge/bridge-client'
import { AgentExecutor } from '@/agent/AgentExecutor'
import type { AgentRunSummary } from '@/agent/types'
import { toolSettings } from '@/storage/tool-settings'
import { agentSettings } from '@/storage/agent-settings'
import { sessionPreferencesStorage, compressedHistoryStorage } from '@/storage/session-preferences'

// ── Active agent executor reference ──
// Stored at module level so the UI can trigger compact() on the running agent.
let activeAgentExecutor: AgentExecutor | null = null

/**
 * Trigger context compaction on the currently running agent.
 * Returns null if no agent is active.
 */
export async function compactAgent(): Promise<{ stepsBefore: number; stepsAfter: number } | null> {
  if (!activeAgentExecutor) return null
  return activeAgentExecutor.compact()
}

/**
 * Check if an agent is currently running.
 */
export function isAgentRunning(): boolean {
  return activeAgentExecutor !== null
}

/**
 * Compress conversation history using the current provider.
 * Reuses the same config loading as the normal pipeline so it always works
 * if normal chat works. Returns the summary string on success, or throws.
 */
export async function compressHistory(): Promise<string> {
  const store = useChatStore.getState()
  const { providerType, modelId, providerConfigId, messages } = store

  // Filter conversation messages (user + assistant text, no internals)
  const conversationMessages = messages.filter(msg => {
    if (msg.role === 'user' && msg.content) return true
    if (
      msg.role === 'assistant' &&
      msg.content &&
      !msg.toolCalls?.length &&
      !msg.reasoningContent &&
      msg.messageKind !== 'assistant_tool_calls' &&
      msg.messageKind !== 'tool_result' &&
      msg.messageKind !== 'status'
    ) return true
    return false
  })

  if (conversationMessages.length <= 2) {
    throw new Error('Not enough messages to compress')
  }

  const formatted = conversationMessages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')

  const prompt = [
    'Summarize the following conversation in 3-5 sentences, preserving key decisions, results, and context:',
    '',
    formatted,
  ].join('\n')

  // Load provider config using the SAME functions as the normal pipeline
  const configId = providerConfigId
  const baseUrl = await getBaseUrl(providerType, configId)
  if (!baseUrl) throw new Error(`No base URL configured for provider: ${providerType}`)
  const apiKey = await getApiKey(providerType, configId)
  const headers = await getHeaders(providerType, configId)

  const provider = createChatProvider({
    provider: providerType,
    model: modelId,
    baseUrl,
    apiKey,
    headers,
    params: {},
  })

  const llmMessages: ChatMessage[] = [{
    id: generateId(),
    historyId: '',
    role: 'user',
    content: prompt,
    createdAt: Date.now(),
  }]

  const result = await provider.chat(llmMessages)
  const summary = result.content?.trim()
  if (!summary) throw new Error('LLM returned empty summary')

  // Store compressed summary in Zustand
  store.setCompressedHistorySummary(summary)

  // Persist to storage (survives page reload)
  const historyId = store.historyId
  if (historyId) {
    try {
      await compressedHistoryStorage.set(historyId, summary)
    } catch {
      // Storage write failure is non-critical
    }
  }

  return summary
}

/**
 * Build messages for the normal (non-agent) pipeline.
 * If a compressed history summary exists, replaces the raw message history
 * with a summary pair, keeping the last 2 messages for immediate context.
 */
function buildMessagesForPipeline(
  allMessages: ChatMessage[],
  excludeId: string,
  store: typeof useChatStore,
): ChatMessage[] {
  const filtered = allMessages.filter(m => m.id !== excludeId)
  const compressed = store.getState().compressedHistorySummary

  if (!compressed) return filtered

  // Keep only the last 2 raw messages for continuity, prepend summary
  const recent = filtered.slice(-2)
  return [
    {
      id: '__compressed_summary_user__',
      historyId: '',
      role: 'user',
      content: `Summary of earlier conversation (compressed):\n${compressed}`,
      createdAt: Date.now() - 2,
    },
    {
      id: '__compressed_summary_assistant__',
      historyId: '',
      role: 'assistant',
      content: 'Understood the conversation summary.',
      createdAt: Date.now() - 1,
    },
    ...recent,
  ]
}

/**
 * Load base URL for the given provider type.
 * Ollama uses sync storage; others use the openaiConfigRepo (IndexedDB).
 * If configId is provided, look up by ID first; otherwise fall back to first match by provider type.
 */
async function getBaseUrl(providerType: ProviderType, configId?: string | null): Promise<string | undefined> {
  if (providerType === 'ollama') {
    return ollamaSettings.getOllamaURL()
  }

  const configs = await openaiConfigRepo.getAll()
  const config = configId
    ? configs.find(c => c.id === configId)
    : configs.find(c => c.provider === providerType)
  return config?.baseUrl
}

/**
 * Load API key for the given provider type from openaiConfigRepo.
 */
async function getApiKey(providerType: ProviderType, configId?: string | null): Promise<string | undefined> {
  if (providerType === 'ollama') return undefined

  const configs = await openaiConfigRepo.getAll()
  const config = configId
    ? configs.find(c => c.id === configId)
    : configs.find(c => c.provider === providerType)
  return config?.apiKey || undefined
}

/**
 * Load custom headers for the given provider type.
 * Only Ollama supports custom headers via storage.
 */
async function getHeaders(providerType: ProviderType, configId?: string | null): Promise<Record<string, string> | undefined> {
  if (providerType === 'ollama') {
    return ollamaSettings.getCustomHeadersMap()
  }

  const configs = await openaiConfigRepo.getAll()
  const config = configId
    ? configs.find(c => c.id === configId)
    : configs.find(c => c.provider === providerType)
  return config?.headers || undefined
}

/**
 * Load system prompt for the given chat mode.
 * If promptId is provided, use that specific prompt.
 * Otherwise fall back to the first system prompt from the repository.
 */
async function getSystemPrompt(mode: ChatMode, promptId?: string | null): Promise<string | undefined> {
  if (promptId) {
    const prompt = await promptRepo.getById(promptId)
    return prompt?.content || undefined
  }

  const systemPrompts = await promptRepo.getSystemPrompts()
  if (systemPrompts.length === 0) return undefined

  // Use the first system prompt by default
  return systemPrompts[0].content || undefined
}

/**
 * Save a chat message to the database.
 */
async function saveMessageToDb(msg: ChatMessage): Promise<void> {
  const row = chatMessageToDbRow(msg)
  await messageRepo.add(row)
}

/**
 * Create or update chat history record.
 */
async function updateChatHistory(historyId: string, lastMessage: string, mode: ChatMode): Promise<void> {
  const existing = await chatHistoryRepo.getById(historyId)
  if (existing) {
    await chatHistoryRepo.update(historyId, {
      last_used_prompt: { prompt_content: lastMessage },
    })
  } else {
    await chatHistoryRepo.add({
      id: historyId,
      title: lastMessage || 'New Chat',
      is_rag: mode === 'rag',
      message_source: 'web-ui',
      is_pinned: false,
      createdAt: Date.now(),
    })
  }
}

/**
 * Detect if user input is a continuation message (e.g. "继续", "continue").
 * Exported for testing.
 */
export function isContinuationMessage(text: string): boolean {
  const t = text.trim().toLowerCase()
  return ['继续', 'continue', 'go on', 'keep going', '接着', 'resume', '继续吧']
    .some(p => t === p || t.startsWith(p + ' ') || t.startsWith(p + '，') || t.startsWith(p + ','))
}

/**
 * Extract conversation history from store messages for agent context.
 * Filters to only user messages + assistant final answers.
 * Skips internal agent operations (tool calls, tool results, reasoning bubbles).
 * Keeps last 10 messages to avoid context bloat.
 * If compressedHistorySummary is set, returns a summary message pair instead of raw history.
 */
export function extractConversationHistory(
  messages: ChatMessage[],
  compressedHistorySummary?: string | null,
): ChatMessage[] {
  // If a compressed summary exists, use it instead of the raw message history
  if (compressedHistorySummary) {
    return [
      {
        id: '__compressed_summary_user__',
        historyId: '',
        role: 'user',
        content: `Summary of earlier conversation (compressed):\n${compressedHistorySummary}`,
        createdAt: Date.now(),
      },
      {
        id: '__compressed_summary_assistant__',
        historyId: '',
        role: 'assistant',
        content: 'Understood the conversation summary.',
        createdAt: Date.now(),
      },
    ]
  }

  return messages.filter(msg => {
    // Keep user messages with actual content
    if (msg.role === 'user' && msg.content) return true
    // Keep assistant text answers (not tool call cards, not reasoning-only, not tool results)
    if (
      msg.role === 'assistant' &&
      msg.content &&
      !msg.toolCalls?.length &&
      !msg.reasoningContent &&
      msg.messageKind !== 'assistant_tool_calls' &&
      msg.messageKind !== 'tool_result' &&
      msg.messageKind !== 'status'
    ) return true
    return false
  }).slice(-10)
}

/**
 * Build a continuation goal that includes the previous run's context.
 * Exported for testing.
 */
export function buildContinuationGoal(input: string, summary: AgentRunSummary): string {
  const parts: string[] = []
  parts.push(`[续接任务] 用户说："${input}"`)
  parts.push(`原任务：${summary.goal}`)

  const statusMap: Record<string, string> = {
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  parts.push(`上次状态：${statusMap[summary.status] ?? summary.status}（${summary.totalSteps}步）`)

  if (summary.failureReason) {
    parts.push(`失败原因：${summary.failureReason}`)
  }

  if (summary.toolHistory.length > 0) {
    parts.push(`已执行工具：${summary.toolHistory.join(', ')}`)
  }

  const memoryKeys = Object.keys(summary.memory)
  if (memoryKeys.length > 0) {
    const memEntries = memoryKeys.slice(0, 10)
      .map(k => `${k}=${JSON.stringify(summary.memory[k])}`)
      .join(', ')
    parts.push(`关键记忆：${memEntries}`)
  }

  parts.push(`请在此基础上继续完成任务。`)

  return parts.join('\n')
}

/**
 * Run the agentic loop using AgentExecutor.
 * Delegates the entire agent lifecycle to AgentExecutor, which internally
 * manages the AgentRunner, tool routing, event handling, and persistence.
 */
async function runAgenticLoop(params: {
  context: ChatContext
  store: typeof useChatStore
  abortController: AbortController
  isTemporary: boolean
  historyId: string
  providerType: ProviderType
  modelId: string
  mode: ChatMode
}): Promise<void> {
  const { context, store, abortController, isTemporary, historyId, providerType, modelId, mode } = params

  // Use ToolRegistry to load tools from all sources (MCP + builtin)
  const builtinSourceEnabled = await toolSettings.isSourceEnabled('builtin')
  const mcpSourceEnabled = await toolSettings.isSourceEnabled('mcp')
  const registry = new ToolRegistry()
  const bridgeClient = new BridgeClient()
  let mcpSource: McpToolSource | null = null

  // Register MCP source
  if (mcpSourceEnabled) {
    mcpSource = new McpToolSource()
    registry.registerSource(mcpSource)
  }

  // Register builtin source
  if (builtinSourceEnabled) {
    registry.registerSource(new BuiltinToolSource())
  }

  // Load tools with three-level filtering
  const tools = await registry.loadAllTools()

  if (tools.length === 0) {
    // No tools available — run the normal pipeline instead
    await registry.disposeAll()
    await runNormalPipeline({
      text: context.userInput,
      state: store.getState(),
      store,
      historyId,
      userMessage: {
        id: generateId(),
        historyId,
        role: 'user',
        content: context.userInput,
        createdAt: Date.now(),
      },
      abortController,
      isTemporary,
    })
    return
  }

  try {
    // Initialize provider
    const configId = store.getState().providerConfigId
    const baseUrl = await getBaseUrl(providerType, configId)
    if (!baseUrl) throw new Error(`No base URL configured for provider: ${providerType}`)
    const apiKey = await getApiKey(providerType, configId)
    const headers = await getHeaders(providerType, configId)
    const provider = createChatProvider({
      provider: providerType,
      model: modelId,
      baseUrl,
      apiKey,
      headers,
      params: context.params ?? {},
    })

    // Get MCP client (if available)
    const mcpClient = mcpSource?.getClient() ?? null

    // Determine goal and previous run summary for task continuation
    const storeState = store.getState()
    const lastSummary = storeState.lastAgentSummary
    const isContinuation = isContinuationMessage(context.userInput) && !!lastSummary
    const goal = isContinuation
      ? buildContinuationGoal(context.userInput, lastSummary!)
      : context.userInput

    // Extract conversation history: user messages + agent final answers.
    // This lets the agent understand what was discussed before.
    const conversationHistory = extractConversationHistory(
      storeState.messages,
      storeState.compressedHistorySummary,
    )

    // Determine context window tokens for agent
    const agentConfigValues = await agentSettings.getSettings()
    const modelSettings = await modelSettingsStorage.getGlobalSettings()
    const contextWindowTokens = agentConfigValues.contextWindowTokens > 0
      ? agentConfigValues.contextWindowTokens
      : (modelSettings.numCtx ?? 128_000)

    // Load user system prompt if selected
    const selectedPromptId = store.getState().selectedPromptId
    let userSystemPrompt: string | undefined
    if (selectedPromptId) {
      const prompt = await promptRepo.getById(selectedPromptId)
      userSystemPrompt = prompt?.content || undefined
    }

    // Create AgentExecutor — bridges AgentRunner with store UI
    const executor = new AgentExecutor({
      store,
      provider,
      toolSchemas: tools,
      bridgeClient,
      mcpClient,
      abortController,
      historyId,
      isTemporary,
      previousRunSummary: isContinuation ? lastSummary : null,
      conversationHistory,
      userSystemPrompt,
      config: {
        contextConfig: { contextWindowTokens },
      },
    })

    // Store active executor for compact() access from UI
    activeAgentExecutor = executor

    // Persist session preferences early — before executor runs — so that
    // even if the user cancels or the agent fails, the model/mode choice is saved.
    if (!isTemporary) {
      try {
        await modelSettingsStorage.setLastUsedModel(historyId, {
          providerType,
          modelId,
        })
        await sessionPreferencesStorage.set(historyId, {
          providerType,
          modelId,
          providerConfigId: store.getState().providerConfigId,
          mode: params.mode,
          agentEnabled: true,
          isTemporary,
          selectedPromptId: store.getState().selectedPromptId,
        })
      } catch {
        // Storage write failure should not block the agent loop
      }
    }

    // Execute the agent task
    try {
      const result = await executor.execute({
        goal,
        constraints: [
          'Complete the task using the available tools',
        ],
      })

      // AgentExecutor's finalizeUI already stops streaming and flushes content.
      // Only stop if still streaming (e.g. error path before executor finished).
    } finally {
      activeAgentExecutor = null
    }
  } finally {
    await registry.disposeAll()
    store.getState().setAgentActionInfo(null)
    store.getState().setAgentIteration(0)
    // Ensure streaming is always stopped, even on error
    if (store.getState().isStreaming) {
      store.getState().stopStreaming()
    }
  }
}

/**
 * React hook that provides a sendMessage function wired to the pipeline.
 */
export function useChatService() {
  const store = useChatStore

  // Mutable ref to allow recursive calls (queue processing calls sendMessage)
  type SendMessageFn = (text: string, images?: string[]) => Promise<void>
  const sendMessageRef: { current: SendMessageFn | null } = { current: null }

  const sendMessage = useCallback(async (text: string, images?: string[]) => {
    const state = store.getState()

    if (!text.trim()) return

    // Append selected element reference to message content if present
    let finalContent = text
    if (state.selectedElementRef) {
      const el = state.selectedElementRef
      const elementRef = `\n\n[Refers to element: ${el.agentId} <${el.tag}>${el.text ? ` "${el.text}"` : ''}]`
      finalContent = text + elementRef
      // Clear the selected element after using it
      store.getState().setSelectedElementRef(null)
    }

    // If streaming, handle agent context injection or normal block
    if (state.isStreaming) {
      if (state.agentEnabled && state.pendingAskUser) {
        // Agent is waiting for ask_user response — treat as answer
        chrome.runtime.sendMessage({
          type: 'agent_ask_user_response',
          toolCallId: state.pendingAskUser.toolCallId,
          answer: text.trim(),
        }).catch(() => {})
        store.getState().setPendingAskUser(null)
        return
      }

      if (state.agentEnabled && activeAgentExecutor) {
        // Agent is running — add to queue (don't inject or create bubble yet)
        const queueState = store.getState()
        const order = queueState.messageQueue.length
        const id = generateId()
        const defaultMode: QueueItemMode = 'supplement'

        store.getState().addToQueue({ id, text: text.trim(), mode: defaultMode, order })
        return
      }

      // Normal streaming — show a hint that the user needs to wait
      store.getState().setError('Please wait for the current response to finish, or click Stop to cancel.')
      return
    }

    // Generate history ID if new session
    let historyId = state.historyId
    if (!historyId) {
      historyId = generateId()
      store.getState().setHistoryId(historyId)
    }

    // Add user message to store
    const userMessage: ChatMessage = {
      id: generateId(),
      historyId,
      role: 'user',
      content: finalContent,
      images: images && images.length > 0 ? images : undefined,
      createdAt: Date.now(),
    }
    store.getState().addMessage(userMessage)

    const isTemporary = state.isTemporary

    // Debug logging
    console.log('[chat-service] Saving user message:', { historyId, content: finalContent, isTemporary })

    // Persist user message immediately, so it's saved even if agent gets cancelled
    if (!isTemporary) {
      try {
        await messageRepo.add(chatMessageToDbRow(userMessage))
        console.log('[chat-service] User message saved to DB')
      } catch (err) {
        console.error('[chat-service] Failed to save user message:', err)
      }
    }

    // Set up abort controller with 5-minute timeout
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), 5 * 60 * 1000)
    store.getState().setAbortController(abortController)

    // Start streaming
    store.getState().startStreaming()

    try {
      // Branch: agent mode vs normal mode
      if (state.agentEnabled) {
        // Mark agent as busy for the entire cycle (run + queue processing)
        store.getState().setAgentBusy(true)

        // Agent mode: run agentic loop
        await runAgenticLoop({
          context: {
            userInput: text,
            mode: state.mode,
            historyId,
            providerType: state.providerType,
            modelId: state.modelId,
            messages: state.messages.filter(m => m.id !== userMessage.id),
            signal: abortController.signal,
            images: images && images.length > 0 ? images : undefined,
          },
          store,
          abortController,
          isTemporary,
          historyId,
          providerType: state.providerType,
          modelId: state.modelId,
          mode: state.mode,
        })
      } else {
        // Normal mode: single pipeline execution (unchanged behavior)
        await runNormalPipeline({
          text,
          state,
          store,
          historyId,
          userMessage,
          abortController,
          isTemporary,
          images: images && images.length > 0 ? images : undefined,
        })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        store.getState().setError('Request was cancelled.')
      } else {
        const msg = error instanceof Error ? error.message : String(error)
        store.getState().setError(msg)
      }
      store.getState().resetStream()
    } finally {
      clearTimeout(timeoutId)
      store.getState().setAbortController(null)

      // Process queue: send next_command items after agent finishes
      if (state.agentEnabled) {
        try {
          // Snapshot queue and clear immediately to prevent race
          const queueState = store.getState()
          const nextCommands = queueState.messageQueue
            .filter(item => item.mode === 'next_command')
            .sort((a, b) => a.order - b.order)

          // Clear all queue items (supplements were already injected during run)
          store.getState().clearQueue()

          // Send next_command items sequentially
          for (const cmd of nextCommands) {
            if (sendMessageRef.current) {
              try {
                await sendMessageRef.current(cmd.text)
              } catch {
                // Continue with remaining commands even if one fails
              }
            }
          }
        } finally {
          // Always mark agent as not busy, even if queue processing fails
          store.getState().setAgentBusy(false)
        }
      }
    }
  }, []) as SendMessageFn

  // Keep ref in sync
  sendMessageRef.current = sendMessage

  return { sendMessage }
}

/**
 * Run the normal (non-agent) pipeline.
 * This is the original single-shot pipeline execution path.
 */
async function runNormalPipeline(params: {
  text: string
  state: ReturnType<typeof useChatStore.getState>
  store: typeof useChatStore
  historyId: string
  userMessage: ChatMessage
  abortController: AbortController
  isTemporary: boolean
  images?: string[]
}): Promise<void> {
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

  // Stop streaming, finalizing the assistant message
  store.getState().stopStreaming()
}

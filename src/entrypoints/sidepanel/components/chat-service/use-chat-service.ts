/**
 * Main chat service hook
 */

import { useCallback } from 'react'
import { useChatStore } from '@/store/chat-store'
import type { QueueItemMode } from '@/types/chat'
import type { ChatMessage } from '@/types/message'
import type { ProviderType } from '@/types/provider'
import type { ChatMode, ChatContext } from '@/chat-pipeline/types'
import { generateId } from '@/types/common'
import { messageRepo } from '@/db/repositories/message.repository'
import { chatMessageToDbRow } from '@/message/formatter'
import { createChatProvider } from '@/providers/factory'
import { ToolRegistry } from '@/tools/tool-registry'
import { BuiltinToolSource } from '@/tools/sources/builtin-tool-source'
import { McpToolSource } from '@/tools/sources/mcp-tool-source'
import { BridgeClient } from '@/agent/bridge/bridge-client'
import { AgentExecutor } from '@/agent/AgentExecutor'
import { toolSettings } from '@/storage/tool-settings'
import { agentSettings } from '@/storage/agent-settings'
import { modelSettingsStorage } from '@/storage/model-settings'
import { sessionPreferencesStorage } from '@/storage/session-preferences'
import { promptRepo } from '@/db/repositories/prompt.repository'
import { ELEMENT_MARKER_REGEX, ELEMENT_REF_REGEX } from '@/types/element-reference'
import { getBaseUrl, getApiKey, getHeaders } from './config'
import { compactAgent, isAgentRunning, setActiveAgentExecutor, isContinuationMessage, extractConversationHistory, buildContinuationGoal } from './agent'
import { runNormalPipeline } from './pipeline'

export interface UseChatServiceResult {
  sendMessage: (text: string, images?: string[]) => Promise<void>
}

/**
 * Run the agentic loop using AgentExecutor.
 * Delegates the entire agent lifecycle to AgentExecutor, which internally
 * manages the AgentRunner, tool routing, event handling, and persistence.
 */
async function runAgenticLoop(params: {
  context: ChatContext
  store: typeof import('@/store/chat-store').useChatStore
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
      previousRunSummary: isContinuation ? lastSummary : undefined,
      conversationHistory,
      userSystemPrompt,
      config: {
        contextConfig: { contextWindowTokens },
      },
    })

    // Store active executor for compact() access from UI
    setActiveAgentExecutor(executor)

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
      setActiveAgentExecutor(null)
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
export function useChatService(): UseChatServiceResult {
  const store = useChatStore

  // Mutable ref to allow recursive calls (queue processing calls sendMessage)
  type SendMessageFn = (text: string, images?: string[]) => Promise<void>
  const sendMessageRef: { current: SendMessageFn | null } = { current: null }

  const sendMessage = useCallback(async (text: string, images?: string[]) => {
    const state = store.getState()

    if (!text.trim()) return

    // Resolve element markers to full references
    let finalContent = text
    if (state.selectedElements.length > 0) {
      const elements = state.selectedElements
      const elementMap = new Map(elements.map(el => [el.agentId, el]))

      // 1. Replace zero-width markers (appended by handleSubmit) with full references
      finalContent = finalContent.replace(ELEMENT_MARKER_REGEX, (_match, agentId: string) => {
        const el = elementMap.get(agentId)
        if (!el) return ''
        return `[element: ${agentId} <${el.tag}>${el.text ? ` "${el.text}"` : ''}]`
      })

      // 2. Replace @#{agentId} visible references (inserted by clicking tags) with full references
      const referencedAgentIds = new Set<string>()
      finalContent = finalContent.replace(ELEMENT_REF_REGEX, (_match, agentId: string) => {
        const el = elementMap.get(agentId)
        if (!el) return _match // Keep reference if agentId not found
        referencedAgentIds.add(agentId)
        return `[element: ${agentId} <${el.tag}>${el.text ? ` "${el.text}"` : ''}]`
      })

      // Also track zero-width marker references
      let markerMatch: RegExpExecArray | null
      const markerRegex = new RegExp(ELEMENT_MARKER_REGEX.source, 'g')
      while ((markerMatch = markerRegex.exec(text)) !== null) {
        referencedAgentIds.add(markerMatch[1])
      }

      // 3. Append unreferenced elements at the end
      const unreferenced = elements.filter(el => !referencedAgentIds.has(el.agentId))
      if (unreferenced.length > 0) {
        finalContent += unreferenced
          .map(el => `\n[Refers to element: ${el.agentId} <${el.tag}>${el.text ? ` "${el.text}"` : ''}]`)
          .join('')
      }
      store.getState().clearSelectedElements()
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

      if (state.agentEnabled && isAgentRunning()) {
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

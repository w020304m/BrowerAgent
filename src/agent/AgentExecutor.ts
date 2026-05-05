/**
 * AgentExecutor — bridges AgentRunner with chat-service / Zustand store.
 *
 * Responsibilities:
 * 1. Provide IAgentLLMCaller that uses processStream for real-time UI updates
 * 2. Provide IAgentToolExecutor that routes agent tools (BridgeClient) vs MCP tools (McpClientManager)
 * 3. Wire AgentRunner events to Zustand store state updates
 * 4. Handle message persistence (DB + store)
 * 5. Manage MCP tool approval flow
 * 6. Lifecycle: create → run → cleanup
 */

import type { ChatMessage } from '@/types/message'
import type { ToolCall, ToolResult, ToolDefinition } from '@/types/tool'
import type { IChatProvider, ChatRequestOptions } from '@/providers/types'
import type { AgentEvent, AgentResult, IAgentLLMCaller, IAgentToolExecutor, AgentRunSummary } from './types'
import type { AgentPlan } from '@/types/agent-plan'
import type { QueueItem } from '@/types/chat'
import type { AgentConfig } from './AgentConfig'
import type { ChatMode } from '@/chat-pipeline/types'
import type { ProviderType } from '@/types/provider'
import { AgentRunner } from './AgentRunner'
import { BridgeClient } from './bridge/bridge-client'
import { decodeSignal } from './bridge/types'
import { generateId } from '@/types/common'
import { processStream } from '@/stream/process-stream'
import { chatMessageToDbRow } from '@/message/formatter'
import { messageRepo } from '@/db/repositories/message.repository'
import { chatHistoryRepo } from '@/db/repositories/chat-history.repository'
import { waitForMcpToolApproval } from '@/store/mcp-store'
import { mcpSettings } from '@/storage/mcp-settings'
import { getMcpToolExecutionMode, parseMcpToolName } from '@/mcp/utils'
import type { McpToolExecutionMode } from '@/mcp/types'
import { mcpServerRepo } from '@/db/repositories/mcp-server.repository'
import { flushStreamBuffers } from '@/store/chat-store'
import { agentSummaryStorage } from '@/storage/session-preferences'

/** Store interface — the subset of useChatStore that AgentExecutor needs */
export interface AgentStore {
  getState: () => {
    appendStreamContent: (c: string) => void
    appendStreamReasoning: (c: string) => void
    stopStreaming: () => void
    startStreaming: () => void
    addMessage: (msg: ChatMessage) => void
    updateMessage: (id: string, updates: Partial<ChatMessage>) => void
    setAgentIteration: (n: number) => void
    setAgentActionInfo: (info: {
      phase: 'streaming' | 'calling_tool' | 'tool_done' | 'awaiting_approval'
      toolName?: string
      iteration?: number
    } | null) => void
    setStreamingGenerationInfo: (info: Record<string, unknown>) => void
    resetStream: () => void
    setError: (err: string | null) => void
    setLastAgentSummary: (summary: AgentRunSummary | null) => void
    setAgentPlan: (plan: AgentPlan | null) => void
    isStreaming: boolean
    streamingContent: string
    streamingReasoning: string
    streamingGenerationInfo: Record<string, unknown> | null
    lastAgentSummary: AgentRunSummary | null
    messageQueue: QueueItem[]
    drainSupplementQueue: () => QueueItem[]
    removeFromQueue: (id: string) => void
    clearQueue: () => void
  }
}

/** MCP client interface — subset of McpClientManager */
export interface IMcpClient {
  executeTool(tc: ToolCall & { serverName: string }, signal: AbortSignal): Promise<ToolResult>
}

/** Parameters for creating an AgentExecutor */
export interface AgentExecutorParams {
  /** Zustand store for UI state updates */
  store: AgentStore
  /** Chat provider for LLM calls */
  provider: IChatProvider
  /** Tool schemas for the LLM */
  toolSchemas: ToolDefinition[]
  /** BridgeClient for agent tool execution */
  bridgeClient: BridgeClient
  /** MCP client for MCP tool execution (null if MCP disabled) */
  mcpClient: IMcpClient | null
  /** AbortController for cancellation */
  abortController: AbortController
  /** Conversation history ID */
  historyId: string
  /** Whether to persist messages to DB */
  isTemporary: boolean
  /** Agent config overrides */
  config?: Partial<AgentConfig>
  /** Summary from a prior agent run (for task continuation) */
  previousRunSummary?: AgentRunSummary
  /** Conversation history from previous turns (user + assistant final answers) */
  conversationHistory?: ChatMessage[]
  /** User-defined system prompt to prepend before the agent's built-in system prompt */
  userSystemPrompt?: string
}

export class AgentExecutor {
  private store: AgentStore
  private provider: IChatProvider
  private bridgeClient: BridgeClient
  private mcpClient: IMcpClient | null
  private abortController: AbortController
  private historyId: string
  private isTemporary: boolean
  private runner: AgentRunner
  private previousRunSummary: AgentRunSummary | null
  private conversationHistory: ChatMessage[]
  private userSystemPrompt: string | null

  // Track the last step_start tool name for step_end use
  private lastToolName: string = ''

  // Accumulated messages for persistence
  private newMessages: ChatMessage[] = []

  // Cached per-tool execution modes: "serverName__toolName" → mode
  private toolExecutionModes = new Map<string, McpToolExecutionMode>()
  // Server name → server ID mapping for approval persistence
  private serverNameToId = new Map<string, string>()

  constructor(params: AgentExecutorParams) {
    this.store = params.store
    this.provider = params.provider
    this.bridgeClient = params.bridgeClient
    this.mcpClient = params.mcpClient
    this.abortController = params.abortController
    this.historyId = params.historyId
    this.isTemporary = params.isTemporary
    this.previousRunSummary = params.previousRunSummary ?? null
    this.conversationHistory = params.conversationHistory ?? []
    this.userSystemPrompt = params.userSystemPrompt ?? null

    // Build pluggable LLM caller using processStream for real-time UI
    const llmCaller = this.createLLMCaller()

    // Build pluggable tool executor routing agent vs MCP tools
    const toolExecutor = this.createToolExecutor()

    this.runner = new AgentRunner(llmCaller, params.toolSchemas, toolExecutor, params.config, params.provider)

    // Wire runner events to store
    this.runner.onEvent((event) => this.handleEvent(event))
  }

  // ── Public API ──

  getRunner(): AgentRunner {
    return this.runner
  }

  async execute(task: {
    goal: string
    constraints?: string[]
    maxSteps?: number
  }): Promise<AgentResult> {
    // Load per-tool execution modes from DB cached tools
    await this.loadToolExecutionModes()

    try {
      const result = await this.runner.run({
        id: this.historyId,
        goal: task.goal,
        constraints: task.constraints,
        maxSteps: task.maxSteps,
        previousRunSummary: this.previousRunSummary,
        conversationHistory: this.conversationHistory,
        userSystemPrompt: this.userSystemPrompt ?? undefined,
      }, this.abortController.signal)

      // Build and store run summary for task continuation
      const summary = this.buildRunSummary(task.goal, result)
      this.store.getState().setLastAgentSummary(summary)

      // Persist agent summary to storage (non-temporary sessions only)
      // Write failure should not affect the main execution flow.
      if (!this.isTemporary) {
        try {
          await agentSummaryStorage.set(this.historyId, summary)
        } catch {
          // Storage write failure is non-critical
        }
      }

      // Finalize UI state
      this.finalizeUI(result)

      // Persist accumulated messages
      await this.persistMessages(task.goal)

      return result
    } finally {
      this.store.getState().setAgentActionInfo(null)
      this.store.getState().setAgentIteration(0)
      // Clear plan after agent finishes
      this.store.getState().setAgentPlan(null)
    }
  }

  pause(): void {
    this.runner.pause()
  }

  resume(): void {
    this.runner.resume()
  }

  cancel(): void {
    this.runner.cancel()
  }

  /**
   * Force-compact context — user-triggered compression.
   * Compresses all steps except the most recent one into a summary.
   */
  async compact(): Promise<{ stepsBefore: number; stepsAfter: number } | null> {
    return this.runner.compact()
  }

  /**
   * Inject a user message as context supplement during agent execution.
   * The message appears as a correction in the next LLM iteration.
   */
  injectUserMessage(message: string): void {
    this.runner.injectUserMessage(message)
  }

  // ── LLM Caller (streaming) ──

  private createLLMCaller(): IAgentLLMCaller {
    return {
      call: async (messages, options) => {
        const store = this.store.getState()

        // Use processStream for real-time UI updates
        store.setAgentActionInfo({ phase: 'streaming' })

        const result = await processStream(
          this.provider,
          messages,
          options,
          {
            onToken: (token) => store.appendStreamContent(token),
            onReasoningToken: (token) => store.appendStreamReasoning(token),
            onGenerationInfo: (info) => store.setStreamingGenerationInfo(info),
          },
        )

        // Validate tool calls — filter out malformed entries
        const validToolCalls = (result.toolCalls ?? []).filter(
          (tc): tc is ToolCall =>
            tc != null &&
            typeof tc.id === 'string' && tc.id.length > 0 &&
            typeof tc.name === 'string' && tc.name.length > 0,
        )

        // Diagnostic: log when LLM returns empty (no content, no tool calls)
        const hasContent = !!(result.content && result.content.trim())
        const hasToolCalls = validToolCalls.length > 0
        if (!hasContent && !hasToolCalls) {
          const genInfo = result.generationInfo ?? {}
          const promptLen = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0)
          console.warn(
            `[AgentExecutor] LLM returned empty response. ` +
            `provider=${this.provider.providerType} model=${this.provider.modelId} ` +
            `messages=${messages.length} promptChars=${promptLen} ` +
            `genInfo=${JSON.stringify(genInfo)} ` +
            `reasoningLen=${result.reasoningContent?.length ?? 0}`,
          )
        }

        return {
          content: result.content ?? '',
          reasoningContent: result.reasoningContent,
          toolCalls: hasToolCalls ? validToolCalls : undefined,
          usageMetadata: result.usageMetadata,
        }
      },
    }
  }

  // ── Tool Execution Mode Loading ──

  private async loadToolExecutionModes(): Promise<void> {
    this.toolExecutionModes.clear()
    this.serverNameToId.clear()
    const servers = await mcpServerRepo.getEnabled()
    for (const server of servers) {
      this.serverNameToId.set(server.name, server.id)
      const cachedTools = (server as unknown as Record<string, unknown>).cachedTools
      if (!Array.isArray(cachedTools)) continue
      for (const tool of cachedTools as Array<{ name: string; enabled?: boolean; executionMode?: McpToolExecutionMode }>) {
        const fullName = `${server.name}__${tool.name}`
        this.toolExecutionModes.set(fullName, getMcpToolExecutionMode(tool))
      }
    }
  }

  // ── Tool Executor (agent + MCP routing) ──

  private createToolExecutor(): IAgentToolExecutor {
    return {
      execute: async (toolCall, signal) => {
        if (toolCall.name.startsWith('agent__')) {
          return this.bridgeClient.executeTool(toolCall, signal)
        }

        // MCP tool
        if (!this.mcpClient) {
          return {
            toolCallId: toolCall.id,
            content: `Error: MCP client not available for tool "${toolCall.name}"`,
            isError: true,
          }
        }

        // Parse MCP tool name for server info
        const parsed = parseMcpToolName(toolCall.name)

        // Check per-tool execution mode (from cached DB data)
        const mode = this.toolExecutionModes.get(toolCall.name) ?? 'human_in_loop'

        // Disabled tools — skip execution
        if (mode === 'disabled') {
          return {
            toolCallId: toolCall.id,
            content: `Tool "${parsed.displayName}" is disabled.`,
            isError: true,
          }
        }

        // Human-in-loop approval — show dialog and wait
        if (mode === 'human_in_loop') {
          this.store.getState().setAgentActionInfo({
            phase: 'awaiting_approval',
            toolName: toolCall.name,
          })

          const serverId = this.serverNameToId.get(parsed.serverName ?? '') ?? ''
          const approved = await waitForMcpToolApproval({
            toolName: parsed.displayName,
            serverName: parsed.serverName ?? '',
            serverId,
            args: toolCall.args,
            toolCallId: toolCall.id,
          })

          if (!approved) {
            return {
              toolCallId: toolCall.id,
              content: `Tool "${parsed.displayName}" was rejected by the user.`,
              isError: true,
            }
          }
        }

        // mode === 'allow' → execute directly without approval

        return this.mcpClient.executeTool(
          {
            ...toolCall,
            serverName: parsed.serverName ?? '',
          },
          signal ?? this.abortController.signal,
        )
      },
    }
  }

  // ── Event → Store bridge ──

  private handleEvent(event: AgentEvent): void {
    const store = this.store.getState()

    switch (event.type) {
      case 'status_changed':
        // No direct store action — status is internal to runner
        break

      case 'step_start': {
        this.lastToolName = event.toolCall.name
        store.setAgentActionInfo({
          phase: 'calling_tool',
          toolName: event.toolCall.name,
          iteration: event.stepNumber,
        })
        store.setAgentIteration(event.stepNumber)

        // Flush any buffered stream tokens
        flushStreamBuffers()

        // Read current streaming state before resetting
        const currentState = this.store.getState()
        const textContent = currentState.streamingContent || ''
        const reasoningText = currentState.streamingReasoning || ''
        const now = Date.now()

        // Reset streaming state first (without creating an assistant message)
        this.store.getState().resetStream()

        // For terminal tools (task_complete/task_failed), suppress text content
        // bubbles — the narration is redundant with the tool result.
        // But keep reasoning bubbles — they show the model's thought process.
        const isTerminalTool = event.toolCall.name === 'agent__task_complete' || event.toolCall.name === 'agent__task_failed'

        // Reasoning bubble (thinking models) — always show, even for terminal tools
        if (reasoningText) {
          const reasoningMsg: ChatMessage = {
            id: generateId(),
            historyId: this.historyId,
            role: 'assistant',
            content: '',
            reasoningContent: reasoningText,
            modelName: this.provider.modelId || undefined,
            createdAt: now,
          }
          store.addMessage(reasoningMsg)
          this.newMessages.push(reasoningMsg)
        }

        // Text content bubble (non-thinking models output their "thinking" as content)
        if (textContent && !isTerminalTool) {
          const textMsg: ChatMessage = {
            id: generateId(),
            historyId: this.historyId,
            role: 'assistant',
            content: textContent,
            modelName: this.provider.modelId || undefined,
            createdAt: now + 1,
          }
          store.addMessage(textMsg)
          this.newMessages.push(textMsg)
        }

        // Tool call card — skip for terminal tools (task_complete/task_failed)
        // The final result message is shown instead, avoiding triple display.
        if (!isTerminalTool) {
          const toolCallMsg: ChatMessage = {
            id: generateId(),
            historyId: this.historyId,
            role: 'assistant',
            content: '',
            toolCalls: [{
              id: event.toolCall.id,
              name: event.toolCall.name,
              args: event.toolCall.args,
              type: 'tool_call',
            }],
            messageKind: 'assistant_tool_calls',
            createdAt: now + 1,
          }
          store.addMessage(toolCallMsg)
          this.newMessages.push(toolCallMsg)
        }
        break
      }

      case 'step_end': {
        // Terminal tools (task_complete/task_failed) — skip tool result UI card.
        // The final result message is shown in the signal handling below.
        const isTerminalTool = this.lastToolName === 'agent__task_complete' || this.lastToolName === 'agent__task_failed'

        if (!isTerminalTool) {
          // Add tool result as UI message (full content including screenshots for live display)
          const toolUIMsg: ChatMessage = {
            id: generateId(),
            historyId: this.historyId,
            role: 'tool',
            content: event.toolResult.content,
            toolCallId: event.toolResult.toolCallId,
            toolName: this.lastToolName,
            toolError: event.toolResult.isError,
            messageKind: 'tool_result',
            createdAt: Date.now(),
          }

          store.addMessage(toolUIMsg)

          // For successful screenshots, also show the image as an assistant bubble in the conversation
          const isScreenshot = this.lastToolName === 'agent__get_page_screenshot'
          if (isScreenshot && !event.toolResult.isError) {
            try {
              const parsed = JSON.parse(event.toolResult.content)
              if (parsed.screenshot && typeof parsed.screenshot === 'string') {
                const imgMsg: ChatMessage = {
                  id: generateId(),
                  historyId: this.historyId,
                  role: 'assistant',
                  content: '',
                  images: [parsed.screenshot],
                  createdAt: Date.now() + 1,
                }
                store.addMessage(imgMsg)
                // Don't persist the image message (bloated) — it's already in ToolCallCard
              }
            } catch {
              // Not valid JSON, skip image bubble
            }
          }

          // For persistence, strip base64 screenshots to prevent DB bloat
          if (isScreenshot) {
            const persistedMsg: ChatMessage = {
              ...toolUIMsg,
              id: generateId(),
              content: '[Screenshot captured]',
            }
            this.newMessages.push(persistedMsg)
          } else {
            this.newMessages.push(toolUIMsg)
          }
        }

        // Detect plan updates and sync to store
        if (this.lastToolName === 'agent__update_plan' && !event.toolResult.isError) {
          try {
            const parsed = JSON.parse(event.toolResult.content)
            if (parsed?.plan?.items) {
              store.setAgentPlan(parsed.plan as AgentPlan)
            }
          } catch {
            // Not valid JSON, ignore
          }
        }

        store.setAgentActionInfo({
          phase: 'tool_done',
          iteration: event.stepNumber,
        })

        // Check for signals that need UI messaging
        const signal = decodeSignal(event.toolResult.content)
        if (signal?.type === 'task_complete') {
          // Only create a final message if we don't already have one with the same content
          // (step_start may have already flushed the LLM's streamed text as a message)
          const resultText = signal.result
          const alreadyHasFinal = this.newMessages.some(
            (m) => m.role === 'assistant' && m.content && m.content.trim() === resultText.trim(),
          )
          if (!alreadyHasFinal) {
            const genInfo = this.store.getState().streamingGenerationInfo
            const finalMsg: ChatMessage = {
              id: generateId(),
              historyId: this.historyId,
              role: 'assistant',
              content: resultText,
              modelName: this.provider.modelId || undefined,
              generationInfo: genInfo ?? undefined,
              createdAt: Date.now(),
            }
            store.addMessage(finalMsg)
            this.newMessages.push(finalMsg)
          }
          // Do NOT restart streaming — runner is about to exit
          break
        }
        if (signal?.type === 'task_failed') {
          const errorMsg: ChatMessage = {
            id: generateId(),
            historyId: this.historyId,
            role: 'assistant',
            content: `Task failed: ${signal.reason}`,
            modelName: this.provider.modelId || undefined,
            createdAt: Date.now(),
          }
          store.addMessage(errorMsg)
          this.newMessages.push(errorMsg)
          // Do NOT restart streaming — runner is about to exit
          break
        }

        // Re-open streaming for next iteration (only if no terminal signal)
        store.startStreaming()
        break
      }

      case 'thinking':
        // Reasoning is already streamed in real-time via processStream's onReasoningToken.
        // Do NOT append here — that would duplicate the content.
        break

      case 'llm_call_start': {
        store.setAgentActionInfo({ phase: 'streaming' })

        // Drain supplement queue items: create bubbles + inject into agent context
        try {
          const supplements = store.drainSupplementQueue()
          for (const item of supplements) {
            // Show user message bubble in chat
            const userMsg: ChatMessage = {
              id: generateId(),
              historyId: this.historyId,
              role: 'user',
              content: item.text,
              createdAt: Date.now(),
            }
            store.addMessage(userMsg)
            this.newMessages.push(userMsg)

            // Inject as context for the LLM
          this.runner.injectUserMessage(item.text)
        }
        } catch {
          // Queue drain failure shouldn't crash the agent
        }
        break
      }

      case 'stream_reset':
        // Discard accumulated streaming content between LLM iterations.
        // Prevents content from multiple LLM calls piling up in the stream buffer.
        store.resetStream()
        break

      case 'error':
        if (!event.recoverable) {
          store.setError(event.error)
        }
        break

      case 'task_complete':
        // Already handled in step_end via signal
        break

      case 'task_failed':
        // Already handled in step_end via signal
        break

      case 'compact': {
        // Manual compact — inject status bubble
        const compactMsg: ChatMessage = {
          id: generateId(),
          historyId: this.historyId,
          role: 'assistant',
          content: `Compact: ${event.stepsBefore} → ${event.stepsAfter} steps`,
          messageKind: 'status',
          createdAt: Date.now(),
        }
        store.addMessage(compactMsg)
        this.newMessages.push(compactMsg)
        break
      }

      case 'compression': {
        // Auto-compression — inject status bubble
        const compressionMsg: ChatMessage = {
          id: generateId(),
          historyId: this.historyId,
          role: 'assistant',
          content: `Auto-compressed: ${event.stepsBefore} → ${event.stepsAfter} steps`,
          messageKind: 'status',
          createdAt: Date.now(),
        }
        store.addMessage(compressionMsg)
        this.newMessages.push(compressionMsg)
        break
      }

      default:
        // checkpoint, progress, paused, resumed, llm_call_end
        break
    }
  }

  // ── Finalization ──

  private buildRunSummary(goal: string, result: AgentResult): AgentRunSummary {
    return {
      goal,
      status: result.status,
      totalSteps: result.totalSteps,
      failureReason: result.failureReason,
      result: result.result,
      memory: result.memory,
      toolHistory: result.steps.map(s => s.toolCall.name).slice(-20),
      endedAt: Date.now(),
    }
  }

  private finalizeUI(result: AgentResult): void {
    const store = this.store.getState()

    // Flush any remaining streaming content.
    if (store.isStreaming) {
      flushStreamBuffers()
      const currentState = this.store.getState()
      const textContent = currentState.streamingContent || ''
      const reasoningText = currentState.streamingReasoning || ''

      // Reset streaming state first
      this.store.getState().resetStream()

      const now = Date.now()

      // Reasoning bubble (thinking models)
      if (reasoningText) {
        const reasoningMsg: ChatMessage = {
          id: generateId(),
          historyId: this.historyId,
          role: 'assistant',
          content: '',
          reasoningContent: reasoningText,
          modelName: this.provider.modelId || undefined,
          createdAt: now,
        }
        store.addMessage(reasoningMsg)
        this.newMessages.push(reasoningMsg)
      }

      // Text content bubble (non-thinking models)
      if (textContent) {
        const textMsg: ChatMessage = {
          id: generateId(),
          historyId: this.historyId,
          role: 'assistant',
          content: textContent,
          modelName: this.provider.modelId || undefined,
          createdAt: now + 1,
        }
        store.addMessage(textMsg)
        this.newMessages.push(textMsg)
      }
    }

    // Show the final result as a visible message.
    if (result.status === 'completed' && result.result) {
      const alreadyHasResult = this.newMessages.some(
        (m) => m.role === 'assistant' && m.content && m.content.trim() === result.result!.trim(),
      )
      if (!alreadyHasResult) {
        const genInfo = this.store.getState().streamingGenerationInfo
        const finalMsg: ChatMessage = {
          id: generateId(),
          historyId: this.historyId,
          role: 'assistant',
          content: result.result,
          modelName: this.provider.modelId || undefined,
          generationInfo: genInfo ?? undefined,
          createdAt: Date.now(),
        }
        store.addMessage(finalMsg)
        this.newMessages.push(finalMsg)
      }
    }

    if (result.status === 'failed' && result.failureReason) {
      const hasErrorMsg = this.newMessages.some(
        (m) => m.role === 'assistant' && m.content.includes(result.failureReason!),
      )
      if (!hasErrorMsg) {
        store.setError(result.failureReason)
      }
    }

    if (result.status === 'cancelled') {
      const cancelMsg: ChatMessage = {
        id: generateId(),
        historyId: this.historyId,
        role: 'assistant',
        content: `Task cancelled. ${result.totalSteps} steps executed.`,
        messageKind: 'status',
        createdAt: Date.now(),
      }
      store.addMessage(cancelMsg)
      this.newMessages.push(cancelMsg)
    }
  }

  private async persistMessages(userInput: string): Promise<void> {
    if (this.isTemporary) return

    // Batch insert all messages in a single IndexedDB transaction
    if (this.newMessages.length > 0) {
      try {
        const rows = this.newMessages.map((msg) => chatMessageToDbRow(msg))
        await messageRepo.bulkAdd(rows)
      } catch (err) {
        console.error('[AgentExecutor] Failed to persist messages:', err)
      }
    }

    // Update chat history
    try {
      const existing = await chatHistoryRepo.getById(this.historyId)
      if (existing) {
        await chatHistoryRepo.update(this.historyId, {
          last_used_prompt: { prompt_content: userInput.slice(0, 100) },
        })
      } else {
        await chatHistoryRepo.add({
          id: this.historyId,
          title: userInput.slice(0, 100) || 'Agent Task',
          is_rag: false,
          message_source: 'web-ui',
          is_pinned: false,
          createdAt: Date.now(),
        })
      }
    } catch {
      // History update failure is non-critical
    }
  }
}

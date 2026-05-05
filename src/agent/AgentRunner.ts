/**
 * AgentRunner — the main execution loop that ties together ContextManager and tool layers.
 *
 * Core responsibilities:
 * 1. Main run(task) loop: LLM call → parse tool call → execute → record step → repeat
 * 2. Error recovery: 1st fail → tell LLM, 2nd consecutive same tool → ask_user, 3rd → task_failed
 * 3. On failure, auto get_page_snapshot before deciding to ask_user
 * 4. LLM calling with retry and exponential backoff (via pluggable IAgentLLMCaller)
 * 5. Tool execution via pluggable IAgentToolExecutor
 * 6. Pause/resume/cancel via AbortController
 * 7. Serialization/deserialization for chrome.storage persistence
 * 8. Logging system with exportLog()
 */

import type { ToolCall, ToolResult, ToolDefinition } from '@/types/tool'
import type { ChatMessage } from '@/types/message'
import type { IChatProvider } from '@/providers/types'
import type { AgentStep } from './context/types'
import { ContextManager } from './context/ContextManager'
import { BridgeClient } from './bridge/bridge-client'
import { decodeSignal } from './bridge/types'
import { DEFAULT_AGENT_CONFIG, type AgentConfig } from './AgentConfig'
import { selectToolsForStep } from './tools/tool-selector'
import { validateToolParams } from './tools/validators'
import {
  type AgentStatus,
  type AgentEvent,
  type AgentEventHandler,
  type AgentResult,
  type SerializedAgentState,
  type LogEntry,
  type LogLevel,
  type IAgentLLMCaller,
  type IAgentToolExecutor,
  type AgentRunSummary,
} from './types'

export class AgentRunner {
  private config: AgentConfig
  private llmCaller: IAgentLLMCaller
  private toolExecutor: IAgentToolExecutor
  private contextManager: ContextManager | null
  private eventHandlers: AgentEventHandler[] = []

  // ── State ──
  private status: AgentStatus = 'idle'
  private abortController: AbortController | null = null
  private pauseResolve: (() => void) | null = null
  private pausePromise: Promise<void> | null = null

  // ── Error tracking ──
  private consecutiveFailures = 0
  private lastFailedToolName: string | null = null
  private consecutiveSameToolFailures = 0
  private consecutiveTextResponses = 0

  // ── Success loop detection ──
  private lastSuccessfulToolName: string | null = null
  private consecutiveSameToolSuccesses = 0
  private static readonly MAX_SAME_TOOL_SUCCESSES = 3

  // ── Correction backstop ──
  private correctionActive = false
  private postCorrectionFailures = 0
  private static readonly MAX_POST_CORRECTION_ATTEMPTS = 2

  // ── Ask-user timeout loop detection (P0-5) ──
  private consecutiveAskUserTimeouts = 0

  // ── Transient retry flag (prevents infinite recursion) ──
  private _toolRetryAttempt = false

  // ── Cross-turn dedup: track last executed tool call fingerprint ──
  private lastToolCallFingerprint: string | null = null

  // ── Step tracking (for dynamic tool selection) ──
  private lastToolName: string | null = null
  private lastToolSuccess: boolean = true

  // ── Logging ──
  private logEntries: LogEntry[] = []

  // ── Timing ──
  private startTime = 0

  // ── Tool schemas for LLM ──
  private toolSchemas: ToolDefinition[]
  // ── Known tool names for validation ──
  private knownToolNames: Set<string>

  private rawProvider: IChatProvider | null

  constructor(
    llmCaller: IAgentLLMCaller,
    toolSchemas: ToolDefinition[],
    toolExecutor: IAgentToolExecutor,
    config?: Partial<AgentConfig>,
    /** Raw provider for non-streaming internal calls (compression, checkpoint).
     *  Prevents internal LLM output from leaking to UI via processStream. */
    rawProvider?: IChatProvider | null,
  ) {
    this.llmCaller = llmCaller
    this.toolSchemas = toolSchemas
    this.knownToolNames = new Set(toolSchemas.map(t => t.name))
    this.toolExecutor = toolExecutor
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config }
    this.rawProvider = rawProvider ?? null

    // ContextManager is created in run() when we have the task
    this.contextManager = null
  }

  /**
   * Legacy factory: creates a runner with direct provider + bridge client.
   * Useful for simple use-cases where no MCP/streaming is needed.
   */
  static createSimple(
    provider: IChatProvider,
    toolSchemas: ToolDefinition[],
    bridgeClient?: BridgeClient,
    config?: Partial<AgentConfig>,
  ): AgentRunner {
    const bridge = bridgeClient ?? new BridgeClient()
    const llmCaller: IAgentLLMCaller = {
      call: async (messages, options) => {
        const result = await provider.chat(messages, options)
        return {
          content: result.content ?? '',
          reasoningContent: result.reasoningContent,
          toolCalls: result.toolCalls,
        }
      },
    }
    const toolExec: IAgentToolExecutor = {
      execute: async (tc, signal) => bridge.executeTool(tc, signal),
    }
    return new AgentRunner(llmCaller, toolSchemas, toolExec, config)
  }

  // ── Public getters ──

  getStatus(): AgentStatus {
    return this.status
  }

  getContextManager(): ContextManager | null {
    return this.contextManager
  }

  getStepCount(): number {
    return this.contextManager?.getStepCount() ?? 0
  }

  /** Non-null assertion for contextManager — only valid after run() starts */
  private get ctx(): ContextManager {
    if (!this.contextManager) throw new Error('contextManager not initialized')
    return this.contextManager
  }

  // ── Event system ──

  onEvent(handler: AgentEventHandler): () => void {
    this.eventHandlers.push(handler)
    return () => {
      const idx = this.eventHandlers.indexOf(handler)
      if (idx >= 0) this.eventHandlers.splice(idx, 1)
    }
  }

  private emit(event: AgentEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event)
      } catch {
        // Handler errors should not break the agent loop
      }
    }
  }

  // ── Logging ──

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
    }
    this.logEntries.push(entry)

    // Keep log from growing unbounded
    if (this.logEntries.length > 1000) {
      this.logEntries = this.logEntries.slice(-500)
    }
  }

  exportLog(): LogEntry[] {
    return [...this.logEntries]
  }

  clearLog(): void {
    this.logEntries = []
  }

  // ── Main entry point ──

  async run(task: {
    id: string
    goal: string
    constraints?: string[]
    maxSteps?: number
    /** Summary from a prior agent run (for task continuation) */
    previousRunSummary?: AgentRunSummary
    /** Conversation history from previous turns in the same chat session */
    conversationHistory?: ChatMessage[]
    /** User-defined system prompt to prepend before the agent's built-in system prompt */
    userSystemPrompt?: string
  }, externalSignal?: AbortSignal): Promise<AgentResult> {
    if (this.status === 'running') {
      throw new Error('Agent is already running')
    }

    this.startTime = Date.now()
    this.setStatus('running')
    this.abortController = new AbortController()

    // Bridge external signal so user-initiated abort propagates to internal controller
    if (externalSignal) {
      if (externalSignal.aborted) {
        this.abortController.abort()
      } else {
        externalSignal.addEventListener('abort', () => this.abortController!.abort(), { once: true })
      }
    }

    this.consecutiveFailures = 0
    this.lastFailedToolName = null
    this.consecutiveSameToolFailures = 0
    this.consecutiveTextResponses = 0
    this.lastSuccessfulToolName = null
    this.consecutiveSameToolSuccesses = 0
    this.lastToolName = null
    this.lastToolSuccess = true
    this.correctionActive = false
    this.postCorrectionFailures = 0

    this.log('info', 'Agent started', { goal: task.goal, maxSteps: task.maxSteps })

    // Create ContextManager — needs provider for compression/checkpoint LLM calls.
    // Use the llmCaller to build a minimal IChatProvider adapter.
    const provider = new LLMCallerProviderAdapter(this.llmCaller, task.id, this.rawProvider)
    this.contextManager = new ContextManager(
      {
        id: task.id,
        goal: task.goal,
        constraints: task.constraints ?? [],
        maxSteps: task.maxSteps,
      },
      provider,
      this.config.contextConfig,
      task.previousRunSummary,
      task.conversationHistory,
      (stepsBefore, stepsAfter) => {
        this.emit({ type: 'compression', stepsBefore, stepsAfter })
      },
      task.userSystemPrompt,
    )

    // Local alias for type safety (contextManager is non-null after assignment above)
    const ctx = this.contextManager!

    try {
      // Main loop
      while (true) {
        // Check abort
        if (this.abortController.signal.aborted) {
          this.log('info', 'Agent cancelled')
          return this.buildResult('cancelled')
        }

        // Wait if paused
        await this.waitForResume()

        // Check abort again after pause
        if (this.abortController.signal.aborted) {
          return this.buildResult('cancelled')
        }

        // Build messages and call LLM
        const llmResult = await this.callLLMWithRetry()
        if (!llmResult) {
          // Aborted
          return this.buildResult('cancelled')
        }

        // If callLLMWithRetry returned content='' with lastError, retries exhausted
        if (llmResult.lastError) {
          this.log('error', 'LLM call failed after all retries', { lastError: llmResult.lastError })
          return this.buildResult('failed', `LLM call failed: ${llmResult.lastError}`)
        }

        // Calibrate token estimation with actual usage from LLM
        if (llmResult.usageMetadata?.promptTokens) {
          ctx.recordActualTokens(llmResult.usageMetadata.promptTokens)
        }

        // Parse thinking content
        if (llmResult.reasoningContent) {
          this.emit({ type: 'thinking', content: llmResult.reasoningContent })
        }

        // No tool calls — try extracting from text content (weak model fallback)
        if (!llmResult.toolCalls || llmResult.toolCalls.length === 0) {
          const extracted = this.extractToolCallsFromText(llmResult.content ?? '')
          if (extracted.length > 0) {
            this.log('info', `Extracted ${extracted.length} tool calls from text content`)
            llmResult.toolCalls = extracted
            // Fall through to tool execution below — don't enter the text handling block
          }
        }

        // No tool calls — LLM decided to stop. This is the natural end of the loop.
        if (!llmResult.toolCalls || llmResult.toolCalls.length === 0) {
          if (llmResult.content && llmResult.content.trim()) {
            // LLM returned text — this IS the answer
            this.log('info', 'LLM returned text (no tool calls) — accepting as answer')
            this.emit({ type: 'task_complete', result: llmResult.content })
            return this.buildResult('completed', undefined, llmResult.content)
          }

          // Empty response — could be context overflow without explicit error.
          // On 1st empty response: try emergency compact + retry.
          // On 2nd consecutive empty response: give up.
          this.consecutiveTextResponses++
          if (this.consecutiveTextResponses >= 2) {
            this.log('error', 'Too many empty responses, aborting')
            return this.buildResult('failed', 'LLM returned empty response')
          }
          this.log('warn', 'LLM returned empty response, trying emergency compact then retry')
          // Treat empty response as potential context overflow — compact and retry
          try {
            await this.ctx.emergencyCompact()
          } catch {
            // If compact fails, still retry once
          }
          this.emit({ type: 'error', error: 'LLM returned empty response', recoverable: true })
          this.emit({ type: 'stream_reset' })
          continue
        }

        // Got tool calls — reset the text response counter
        this.consecutiveTextResponses = 0

        // Deduplicate and limit tool calls.
        // Small models sometimes emit many duplicate calls (e.g. 30x read_page with same args).
        // Strategy: remove same-name duplicates, then cap at 3 to prevent context explosion.
        const toolCallsToExecute = this.deduplicateToolCalls(llmResult.toolCalls)

        // If task_complete/task_failed is mixed with other tools in the same batch,
        // strip them out — the LLM should only complete after seeing tool results.
        const hasNonTerminal = toolCallsToExecute.some(
          (tc) => tc.name !== 'agent__task_complete' && tc.name !== 'agent__task_failed'
        )
        const filteredCalls = hasNonTerminal
          ? toolCallsToExecute.filter(
              (tc) => tc.name !== 'agent__task_complete' && tc.name !== 'agent__task_failed'
            )
          : toolCallsToExecute

        for (const toolCall of filteredCalls) {
          await this.waitForResume()
          if (this.abortController.signal.aborted) {
            return this.buildResult('cancelled')
          }

          // Cross-turn dedup: skip if identical to the last executed tool call
          const fingerprint = `${toolCall.name}:${JSON.stringify(toolCall.args ?? {})}`
          if (fingerprint === this.lastToolCallFingerprint) {
            this.log('warn', 'Skipping duplicate tool call (same as previous turn)', {
              tool: toolCall.name,
            })
            ctx.injectCorrection(
              `You called ${toolCall.name} with the same arguments as the previous step. ` +
              `Do NOT repeat the same action. Try a different approach or call agent__task_complete if done.`,
            )
            continue
          }
          this.lastToolCallFingerprint = fingerprint

          const stepResult = await this.executeToolCall(toolCall, llmResult.reasoningContent)
          if (stepResult.signal) {
            if (stepResult.signal.type === 'task_complete') {
              this.log('info', 'Task completed', { result: stepResult.signal.result })
              this.emit({ type: 'task_complete', result: stepResult.signal.result })
              return this.buildResult('completed', undefined, stepResult.signal.result)
            }
            if (stepResult.signal.type === 'task_failed') {
              this.log('info', 'Task failed', { reason: stepResult.signal.reason })
              this.emit({ type: 'task_failed', reason: stepResult.signal.reason })
              return this.buildResult('failed', stepResult.signal.reason)
            }
          }

          if (stepResult.shouldAbort) {
            this.log('info', 'Task aborted: max steps reached')
            return this.buildResult('failed', 'Max steps reached')
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.log('error', 'Agent crashed', { error: msg })
      this.emit({ type: 'error', error: msg, recoverable: false })
      return this.buildResult('failed', msg)
    }
  }

  // ── Pause / Resume / Cancel ──

  pause(): void {
    if (this.status !== 'running') return
    this.setStatus('paused')
    this.pausePromise = new Promise<void>((resolve) => {
      this.pauseResolve = resolve
    })
    this.emit({ type: 'paused' })
    this.log('info', 'Agent paused')
  }

  resume(): void {
    if (this.status !== 'paused') return
    this.setStatus('running')
    if (this.pauseResolve) {
      this.pauseResolve()
      this.pauseResolve = null
      this.pausePromise = null
    }
    this.emit({ type: 'resumed' })
    this.log('info', 'Agent resumed')
  }

  cancel(): void {
    if (this.status !== 'running' && this.status !== 'paused') return
    if (this.abortController) {
      this.abortController.abort()
    }
    if (this.pauseResolve) {
      this.pauseResolve()
      this.pauseResolve = null
      this.pausePromise = null
    }
    this.log('info', 'Agent cancellation requested')
  }

  /**
   * Force-compact context — compress all steps except the most recent one.
   * Can be called by user action while the agent is running.
   */
  async compact(): Promise<{ stepsBefore: number; stepsAfter: number } | null> {
    if (this.status !== 'running' && this.status !== 'paused') return null
    if (!this.contextManager) return null

    try {
      const result = await this.contextManager.forceCompact()
      this.emit({
        type: 'compact',
        stepsBefore: result.stepsBefore,
        stepsAfter: result.stepsAfter,
      })
      this.log('info', 'Manual compact', result)
      return result
    } catch {
      return null
    }
  }

  /**
   * Inject a user context supplement during agent execution.
   * The message appears as a correction in the next LLM call, allowing
   * the user to provide additional guidance without disrupting the agent loop.
   */
  injectUserMessage(message: string): void {
    if (this.status !== 'running' && this.status !== 'paused') return
    if (!this.contextManager) return

    this.contextManager.injectCorrection(
      `[User补充信息]: ${message}\n请考虑以上信息继续执行任务。`
    )
    this.log('info', 'User context injected during execution', { message })
  }

  // ── Serialization ──

  serialize(): SerializedAgentState {
    if (!this.contextManager) {
      throw new Error('Cannot serialize: agent has not been started')
    }
    const task = this.contextManager.getTask()
    return {
      version: 1,
      task: {
        id: task.id,
        goal: task.goal,
        constraints: task.constraints,
        maxSteps: task.maxSteps,
        createdAt: task.createdAt,
      },
      steps: this.contextManager.getSteps(),
      summaries: this.contextManager.getSummaries(),
      memory: this.contextManager.getMemory(),
      stepCounter: this.contextManager.getStepCount(),
      status: this.status,
      log: [...this.logEntries],
      lastToolName: this.lastToolName,
      lastToolSuccess: this.lastToolSuccess,
      consecutiveFailures: this.consecutiveFailures,
      lastFailedToolName: this.lastFailedToolName,
      consecutiveSameToolFailures: this.consecutiveSameToolFailures,
      consecutiveTextResponses: this.consecutiveTextResponses,
      correctionActive: this.correctionActive,
      postCorrectionFailures: this.postCorrectionFailures,
    }
  }

  static deserialize(
    state: SerializedAgentState,
    llmCaller: IAgentLLMCaller,
    toolSchemas: ToolDefinition[],
    toolExecutor: IAgentToolExecutor,
    config?: Partial<AgentConfig>,
  ): AgentRunner {
    const runner = new AgentRunner(llmCaller, toolSchemas, toolExecutor, config)

    // Rebuild ContextManager
    const provider = new LLMCallerProviderAdapter(llmCaller, state.task.id)
    runner.contextManager = new ContextManager(
      {
        id: state.task.id,
        goal: state.task.goal,
        constraints: state.task.constraints,
        maxSteps: state.task.maxSteps,
      },
      provider,
      config?.contextConfig,
    )

    // Restore log
    runner.logEntries = [...state.log]
    runner.status = state.status
    runner.lastToolName = state.lastToolName ?? null
    runner.lastToolSuccess = state.lastToolSuccess ?? true

    // Restore error tracking state
    runner.consecutiveFailures = state.consecutiveFailures ?? 0
    runner.lastFailedToolName = state.lastFailedToolName ?? null
    runner.consecutiveSameToolFailures = state.consecutiveSameToolFailures ?? 0
    runner.consecutiveTextResponses = state.consecutiveTextResponses ?? 0
    runner.correctionActive = state.correctionActive ?? false
    runner.postCorrectionFailures = state.postCorrectionFailures ?? 0

    return runner
  }

  /**
   * Legacy deserialize — accepts IChatProvider directly.
   */
  static deserializeSimple(
    state: SerializedAgentState,
    provider: IChatProvider,
    toolSchemas: ToolDefinition[],
    bridgeClient?: BridgeClient,
    config?: Partial<AgentConfig>,
  ): AgentRunner {
    const bridge = bridgeClient ?? new BridgeClient()
    const llmCaller: IAgentLLMCaller = {
      call: async (messages, options) => {
        const result = await provider.chat(messages, options)
        return {
          content: result.content ?? '',
          reasoningContent: result.reasoningContent,
          toolCalls: result.toolCalls,
        }
      },
    }
    const toolExec: IAgentToolExecutor = {
      execute: async (tc, signal) => bridge.executeTool(tc, signal),
    }
    return AgentRunner.deserialize(state, llmCaller, toolSchemas, toolExec, config)
  }

  // ── Private: LLM call with retry ──

  private async callLLMWithRetry(): Promise<{
    content: string
    reasoningContent?: string
    toolCalls?: ToolCall[]
    usageMetadata?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
    lastError?: string
  } | null> {
    const maxRetries = this.config.maxLlmRetries
    let lastError: string | undefined
    let attempt = 0

    while (attempt < maxRetries) {
      attempt++
      // Wait if paused
      await this.waitForResume()
      if (this.abortController?.signal.aborted) return null

      this.emit({ type: 'llm_call_start', attempt })
      const callStart = Date.now()

      try {
        const messages = await this.ctx.buildMessages()

        // Dynamic tool selection — only send relevant tools for this step
        const selectedTools = selectToolsForStep(this.toolSchemas, {
          stepNumber: this.getStepCount(),
          lastToolName: this.lastToolName,
          lastToolSuccess: this.lastToolSuccess,
          consecutiveFailures: this.consecutiveFailures,
        })

        const result = await this.llmCaller.call(messages, {
          signal: this.abortController?.signal,
          tools: selectedTools,
        })

        const callDuration = Date.now() - callStart
        this.emit({ type: 'llm_call_end', attempt, durationMs: callDuration })
        this.log('info', `LLM call succeeded (attempt ${attempt})`, {
          durationMs: callDuration,
        })

        return result
      } catch (err) {
        const callDuration = Date.now() - callStart
        this.emit({ type: 'llm_call_end', attempt, durationMs: callDuration })

        const msg = err instanceof Error ? err.message : String(err)
        lastError = msg

        // Check if it's an abort
        if (this.abortController?.signal.aborted) return null

        // Check for context overflow — trigger emergency compression and retry
        const isContextOverflow =
          msg.includes('context_length_exceeded') ||
          msg.includes('context window') ||
          msg.includes('maximum context') ||
          msg.includes('too many tokens') ||
          msg.includes('reduce the length')

        if (isContextOverflow) {
          this.log('warn', 'Context overflow detected, triggering emergency compression')
          try {
            await this.ctx.emergencyCompact()
          } catch {
            // If emergency compact fails, we'll just retry with the same context
          }
          // Don't count this as a failed attempt — retry with compressed context
          attempt--
          continue
        }

        this.log('warn', `LLM call failed (attempt ${attempt}/${maxRetries})`, { error: msg })
        this.emit({
          type: 'error',
          error: `LLM call failed: ${msg}`,
          recoverable: attempt < maxRetries,
        })

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(
            this.config.backoffBaseMs * Math.pow(2, attempt - 1),
            this.config.backoffMaxMs,
          )
          this.log('info', `Retrying in ${delay}ms`)
          await this.sleep(delay)
        }
      }
    }

    return { content: '', toolCalls: undefined, lastError }
  }

  // ── Private: execute a single tool call ──

  private async executeToolCall(
    toolCall: ToolCall,
    thinkingText?: string,
  ): Promise<{
    signal: ReturnType<typeof decodeSignal>
    shouldAbort: boolean
  }> {
    const stepNumber = this.getStepCount() + 1
    this.emit({ type: 'step_start', stepNumber, toolCall })
    this.log('info', `Executing tool: ${toolCall.name}`, { args: toolCall.args })

    const startTime = Date.now()
    let toolResult: ToolResult

    try {
      // Check if the tool call has valid args (basic validation)
      if (!toolCall.name || !toolCall.id) {
        toolResult = {
          toolCallId: toolCall.id ?? 'unknown',
          content: `Invalid tool call: missing name or id. Got name=${toolCall.name}, id=${toolCall.id}`,
          isError: true,
        }
      } else if (!this.knownToolNames.has(toolCall.name)) {
        // Unknown tool name — report error so LLM corrects itself
        const suggestion = this.findClosestTool(toolCall.name)
        const hint = suggestion
          ? ` Did you mean "${suggestion}"?`
          : ` Available tools: ${[...this.knownToolNames].join(', ')}`
        toolResult = {
          toolCallId: toolCall.id,
          content: `Unknown tool "${toolCall.name}".${hint}`,
          isError: true,
        }
      } else {
        // Zod validation — catch malformed params before execution
        const validation = validateToolParams(toolCall.name, toolCall.args ?? {})
        if (!validation.success) {
          toolResult = {
            toolCallId: toolCall.id,
            content: validation.error,
            isError: true,
          }
        } else {
          // Pre-check: compress context if capacity is low before executing
          if (this.ctx.shouldCompressBeforeToolCall(toolCall.name)) {
            this.log('info', `Compressing context before tool ${toolCall.name} — capacity low`)
            await this.ctx.compress()
          }

          // Use validated data (applies defaults) for execution
          // P0-1: Wrap with timeout to prevent hanging on unresponsive tools
          toolResult = await Promise.race([
            this.toolExecutor.execute({
              ...toolCall,
              args: validation.data as Record<string, unknown>,
            }, this.abortController?.signal),
            new Promise<ToolResult>((resolve) =>
              setTimeout(() => resolve({
                toolCallId: toolCall.id,
                content: `Tool execution timed out after ${this.config.toolTimeoutMs}ms`,
                isError: true,
              }), this.config.toolTimeoutMs)
            ),
          ])

          // Empty result guard — non-terminal tools returning empty content are treated as errors
          if (!toolResult.isError && (!toolResult.content || toolResult.content.trim() === '')) {
            const isTerminal = toolCall.name === 'agent__task_complete' || toolCall.name === 'agent__task_failed'
            if (!isTerminal) {
              toolResult = {
                toolCallId: toolCall.id,
                content: `Tool "${toolCall.name}" returned empty result. The page may not be loaded or the element may not exist. Try agent__page_info(info_type="snapshot") to check the current state.`,
                isError: true,
              }
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
      toolResult = {
        toolCallId: toolCall.id,
        content: `Tool execution error: ${msg}`,
        isError: true,
      }
    }

    // Transient error auto-retry: retry once for known transient errors
    if (toolResult.isError && !this._toolRetryAttempt) {
      const isTransient =
        toolResult.content?.includes('net::ERR_') ||
        toolResult.content?.includes('tab was closed') ||
        toolResult.content?.includes('No tab with id') ||
        toolResult.content?.includes('Could not establish connection') ||
        toolResult.content?.includes('The target was closed')

      if (isTransient) {
        this._toolRetryAttempt = true
        this.log('info', 'Transient error detected, retrying in 200ms')
        await this.sleep(200)
        return this.executeToolCall(toolCall, thinkingText)
      }
    }
    this._toolRetryAttempt = false // Reset on non-transient or second attempt

    // P0-5: Detect consecutive ask_user timeouts to prevent infinite loop
    if (toolResult.content?.includes('did not respond within 60 seconds')) {
      this.consecutiveAskUserTimeouts++
      if (this.consecutiveAskUserTimeouts >= 2) {
        this.ctx.injectCorrection(
          'The user is not responding. Continue with the information you have, or call task_failed.'
        )
        this.consecutiveAskUserTimeouts = 0
      }
    } else if (toolCall.name !== 'agent__ask_user') {
      // Reset on any non-timeout ask_user result
      this.consecutiveAskUserTimeouts = 0
    }

    const durationMs = Date.now() - startTime

    // Check for signals
    const signal = decodeSignal(toolResult.content)

    // Record step in context
    const { shouldAbort } = await this.ctx.addStep(
      toolCall,
      toolResult,
      thinkingText,
      durationMs,
    )

    // Summarize large results to save context space
    const stepIndex = this.ctx.getStepCount() - 1
    await this.ctx.summarizeStepResult(stepIndex)

    this.emit({ type: 'step_end', stepNumber, toolResult, durationMs })

    // Track last tool for dynamic selection
    this.lastToolName = toolCall.name
    this.lastToolSuccess = !toolResult.isError

    // Reset or update failure tracking
    if (toolResult.isError) {
      this.handleToolFailure(toolCall.name)
      // Reset success loop tracking on failure
      this.lastSuccessfulToolName = null
      this.consecutiveSameToolSuccesses = 0
    } else {
      // Success — reset failure tracking
      this.consecutiveFailures = 0
      this.lastFailedToolName = null
      this.consecutiveSameToolFailures = 0
      this.correctionActive = false
      this.postCorrectionFailures = 0

      // Track same-tool success loops
      if (toolCall.name === this.lastSuccessfulToolName) {
        this.consecutiveSameToolSuccesses++
      } else {
        this.lastSuccessfulToolName = toolCall.name
        this.consecutiveSameToolSuccesses = 1
      }
    }

    // Detect success loops — same tool succeeds many times in a row
    if (this.consecutiveSameToolSuccesses >= AgentRunner.MAX_SAME_TOOL_SUCCESSES) {
      this.log('warn', `Tool ${toolCall.name} succeeded ${this.consecutiveSameToolSuccesses} times in a row — nudging to move on`)
      this.ctx.injectCorrection(
        `You have called ${toolCall.name} ${this.consecutiveSameToolSuccesses} times in a row and got results. ` +
        `Stop repeating. Either call agent__task_complete with what you found, or call a different tool for the next step.`
      )
      this.consecutiveSameToolSuccesses = 0
      this.lastSuccessfulToolName = null
    }

    // Check failure threshold — inject correction to guide LLM to ask_user
    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      this.log('warn', 'Max consecutive failures reached, injecting ask_user guidance')
      this.ctx.injectCorrection(
        `Multiple tools have failed ${this.consecutiveFailures} times in a row. ` +
        `Please call agent__ask_user to explain the situation to the user and ask for guidance. ` +
        `Describe what you were trying to do, what went wrong, and what you need from the user. ` +
        `Only call agent__task_failed if the user confirms the task cannot be completed.`,
      )
      // Reset failure tracking so the LLM gets a fresh attempt after asking the user
      this.consecutiveFailures = 0
      this.correctionActive = true
      this.postCorrectionFailures = 0
      return { signal: null, shouldAbort: false }
    }

    // Check consecutive same tool failures
    if (this.consecutiveSameToolFailures >= this.config.maxConsecutiveSameToolFail) {
      this.log('warn', `Tool ${toolCall.name} failed ${this.consecutiveSameToolFailures} times, asking user`)

      // Auto get_page_snapshot before asking user
      if (this.config.autoSnapshotOnFailure) {
        await this.autoSnapshot()
      }

      // Inject a correction telling the LLM to call ask_user instead of task_failed
      this.ctx.injectCorrection(
        `Tool "${toolCall.name}" has failed ${this.consecutiveSameToolFailures} times in a row. ` +
        `You should call agent__ask_user to explain what went wrong and ask the user for guidance. ` +
        `Include the error details in the question so the user can help. ` +
        `Only call agent__task_failed if the user confirms the task cannot be completed.`,
      )

      // Reset the same-tool counter so we don't loop immediately
      this.consecutiveSameToolFailures = 0
      this.lastFailedToolName = null
      this.correctionActive = true
      this.postCorrectionFailures = 0

      return { signal: null, shouldAbort: false }
    }

    // Correction backstop: if correction was injected but tools keep failing,
    // force an ask_user call to prevent infinite loops
    if (this.correctionActive && this.postCorrectionFailures >= AgentRunner.MAX_POST_CORRECTION_ATTEMPTS) {
      this.log('warn', 'Correction backstop triggered: forcing ask_user after post-correction failures')

      const forcedAskUserCall: ToolCall = {
        id: `forced_ask_${Date.now()}`,
        name: 'agent__ask_user',
        args: {
          question: `I've tried multiple approaches but keep encountering errors. The last ${this.postCorrectionFailures} attempts after guidance also failed. Could you provide specific instructions on how to proceed? Error context: ${toolCall.name} failed.`,
        },
        type: 'tool_call',
      }

      const forcedStepNumber = this.getStepCount() + 1
      this.emit({ type: 'step_start', stepNumber: forcedStepNumber, toolCall: forcedAskUserCall })

      try {
        const forcedResult = await this.toolExecutor.execute(forcedAskUserCall, this.abortController?.signal)
        await this.ctx.addStep(forcedAskUserCall, forcedResult, undefined, 0)
        this.emit({ type: 'step_end', stepNumber: forcedStepNumber, toolResult: forcedResult, durationMs: 0 })
      } catch {
        // If forced ask_user fails (e.g. unavailable), just log and continue
        this.log('warn', 'Forced ask_user execution failed')
      }

      // Reset all correction state
      this.correctionActive = false
      this.postCorrectionFailures = 0
      this.consecutiveFailures = 0
    }

    return { signal, shouldAbort }
  }

  // ── Private: tool name suggestion ──

  /**
   * Find the closest matching tool name for an unknown tool name.
   * Returns the corrected name or null if no close match found.
   * Handles common mistakes like "agent__search" → "agent__web_search".
   */
  private findClosestTool(wrongName: string): string | null {
    // Strip prefix for comparison
    const wrongCore = wrongName.replace(/^agent__/, '')

    for (const known of this.knownToolNames) {
      const knownCore = known.replace('agent__', '')
      // Exact core match (e.g. "search" matches "search" in "web_search" containment)
      if (knownCore === wrongCore) return known
      // Substring containment (e.g. "search" is in "web_search")
      if (knownCore.includes(wrongCore) || wrongCore.includes(knownCore)) {
        return known
      }
    }
    return null
  }

  // ── Private: tool call text fallback parsing ──

  /**
   * Extract tool calls from plain text content when the LLM outputs
   * tool call syntax as text instead of structured tool_calls.
   * Handles three patterns:
   * 1. agent__tool_name({...})  — with parentheses
   * 2. agent__tool_name {...}   — without parentheses (common in weak models)
   * 3. ```json\n{"name":"agent__xxx","args":{...}}\n```
   */
  private extractToolCallsFromText(content: string): ToolCall[] {
    const results: ToolCall[] = []
    const seen = new Set<string>()

    const tryAdd = (name: string, argsJson: string) => {
      const key = `${name}:${argsJson}`
      if (seen.has(key)) return
      try {
        const args = JSON.parse(argsJson)
        seen.add(key)
        results.push({
          id: `text_tc_${results.length}_${Date.now()}`,
          name,
          args,
          type: 'tool_call',
        })
      } catch {
        // skip malformed JSON
      }
    }

    // Pattern 1: agent__tool_name({...})  — with parentheses
    const pattern1 = /agent__(\w+)\s*\(\s*(\{[^}]*\})\s*\)/g
    let match: RegExpExecArray | null
    while ((match = pattern1.exec(content)) !== null) {
      tryAdd(`agent__${match[1]}`, match[2])
    }

    // Pattern 2: agent__tool_name {...}  — without parentheses (but not already matched with parens)
    const pattern2 = /agent__(\w+)\s+(\{[^}]*\})/g
    while ((match = pattern2.exec(content)) !== null) {
      tryAdd(`agent__${match[1]}`, match[2])
    }

    // Pattern 3: ```json\n{"name": "agent__xxx", "args": {...}}\n```
    const pattern3 = /```json\s*\n([\s\S]*?)\n```/g
    while ((match = pattern3.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1])
        if (parsed.name?.startsWith('agent__')) {
          const argsJson = JSON.stringify(parsed.args ?? parsed.parameters ?? {})
          tryAdd(parsed.name, argsJson)
        }
      } catch {
        // skip malformed JSON
      }
    }

    return results.slice(0, 3) // Cap at 3
  }

  // ── Private: tool call deduplication ──

  /**
   * Remove duplicate tool calls and cap the total.
   * - Same tool name + same args → keep only the first
   * - Same tool name + different args → allow (e.g. read_page viewport vs element)
   * - Cap at 3 to prevent context explosion
   */
  private deduplicateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    const seen = new Set<string>()
    const unique: ToolCall[] = []

    for (const tc of toolCalls) {
      let argsKey: string
      try {
        argsKey = JSON.stringify(tc.args ?? {})
      } catch {
        argsKey = String(Math.random()) // Unserializable args — treat as unique
      }
      const key = `${tc.name}:${argsKey}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(tc)
      }
      if (unique.length >= 3) break
    }

    return unique
  }

  // ── Private: failure tracking ──

  private handleToolFailure(toolName: string): void {
    this.consecutiveFailures++

    if (this.lastFailedToolName === toolName) {
      this.consecutiveSameToolFailures++
    } else {
      this.consecutiveSameToolFailures = 1
      this.lastFailedToolName = toolName
    }

    // Track post-correction failures for backstop
    if (this.correctionActive) {
      this.postCorrectionFailures++
    }

    this.log('warn', `Tool failed: ${toolName}`, {
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSameTool: this.consecutiveSameToolFailures,
      correctionActive: this.correctionActive,
      postCorrectionFailures: this.postCorrectionFailures,
    })
  }

  // ── Private: auto get snapshot on failure ──

  private async autoSnapshot(): Promise<void> {
    try {
      this.log('info', 'Auto-getting page snapshot before failure decision')
      const snapshotToolCall: ToolCall = {
        id: `auto_snapshot_${Date.now()}`,
        name: 'agent__page_info',
        args: { info_type: 'snapshot' },
        type: 'tool_call',
      }
      const result = await this.toolExecutor.execute(snapshotToolCall, this.abortController?.signal)
      // Record as a silent step so the LLM sees current page state but it doesn't consume step budget
      await this.ctx.addStep(snapshotToolCall, result, undefined, 0, true)
      this.log('info', 'Auto-snapshot complete')
    } catch (err) {
      this.log('warn', 'Auto-snapshot failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── Private: helpers ──

  private setStatus(status: AgentStatus): void {
    this.status = status
    this.emit({ type: 'status_changed', status })
  }

  private async waitForResume(): Promise<void> {
    if (this.pausePromise) {
      await this.pausePromise
    }
  }

  private buildResult(
    status: 'completed' | 'failed' | 'cancelled',
    failureReason?: string,
    result?: string,
  ): AgentResult {
    this.setStatus(status)

    const totalTimeMs = Date.now() - this.startTime

    return {
      status,
      totalSteps: this.contextManager?.getStepCount() ?? 0,
      totalTimeMs,
      result,
      failureReason,
      memory: this.contextManager?.getMemory() ?? {},
      steps: this.contextManager?.getSteps() ?? [],
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/**
 * Adapter: wraps IAgentLLMCaller as an IChatProvider.
 * Used by ContextManager for compression and checkpoint LLM calls.
 *
 * IMPORTANT: When a rawProvider is available, compression/checkpoint calls
 * go directly through the provider's non-streaming chat() — bypassing
 * processStream. This prevents internal LLM output from leaking to the UI.
 */
import type { ChatResult } from '@/providers/types'

class LLMCallerProviderAdapter implements IChatProvider {
  readonly providerType = 'ollama' as const
  readonly modelId = 'agent-internal'

  constructor(
    private caller: IAgentLLMCaller,
    private historyId: string,
    /** Raw provider for non-streaming internal calls (compression, checkpoint).
     *  When provided, chat() bypasses processStream to prevent UI output leakage. */
    private rawProvider?: IChatProvider | null,
  ) {}

  async chat(messages: ChatMessage[], options?: import('@/providers/types').ChatRequestOptions): Promise<ChatResult> {
    // Use raw provider directly for compression/checkpoint — no streaming to UI
    if (this.rawProvider) {
      return this.rawProvider.chat(messages, options)
    }
    // Fallback: use caller (may stream to UI in AgentExecutor context)
    const result = await this.caller.call(messages, {
      signal: options?.signal,
      tools: options?.tools,
    })
    return {
      content: result.content,
      reasoningContent: result.reasoningContent,
      toolCalls: result.toolCalls,
    }
  }

  async *streamChat(messages: ChatMessage[], options?: import('@/providers/types').ChatRequestOptions): AsyncGenerator<import('@/providers/types').StreamChunk> {
    const result = await this.chat(messages, options)
    yield {
      content: result.content ?? '',
      reasoningContent: result.reasoningContent,
      done: true,
    }
  }
}

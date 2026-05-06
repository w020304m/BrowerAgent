/**
 * ContextManager — keeps the agent's context coherent across multi-step tasks.
 *
 * Core responsibilities:
 * 1. Task goal is always at the front, never compressed
 * 2. Auto-compress history when steps exceed threshold (lazy, triggered before buildMessages)
 * 3. Extract and persist key memories from tool results
 * 4. Periodic checkpoint self-checks to detect drift
 * 5. Build coherent message arrays for the LLM
 */

import type { ToolCall, ToolResult } from '@/types/tool'
import type { ChatMessage } from '@/types/message'
import type { IChatProvider } from '@/providers/types'
import type { AgentRunSummary } from '../types'
import { generateId } from '@/types/common'
import type { AgentPlan, PlanItem } from '@/types/agent-plan'
import { getPlanSummary } from '@/types/agent-plan'
import {
  type ContextConfig,
  type TaskDefinition,
  type AgentStep,
  DEFAULT_CONTEXT_CONFIG,
  DEFAULT_MAX_STEPS,
} from './types'
import { trimSnapshot, estimateTokens, truncateForLLM } from './snapshot-trimmer'
import { getDynamicThresholds } from './types'

export class ContextManager {
  private task: TaskDefinition
  private steps: AgentStep[] = []
  private summaries: string[] = []
  private globalMemory: Record<string, unknown> = {}
  private config: ContextConfig
  private provider: IChatProvider
  private compressionPending = false
  private skipCompression = false
  private stepCounter = 0
  private pendingCorrection: string | null = null
  /** Current agent task plan */
  private currentPlan: AgentPlan | null = null
  /** Summary from a prior agent run (for task continuation) */
  private previousRunSummary: AgentRunSummary | null
  /** Conversation history from previous turns in the same chat session */
  private conversationHistory: ChatMessage[]
  /** Summary of conversation history that was pruned to save tokens */
  private compressedConversationSummary: string | null = null

  // ── Token estimation calibration ──
  /** Last actual prompt token count from LLM response */
  private lastActualPromptTokens: number | null = null
  /** Calibration factor: ratio adjustment for estimateTokens */
  private calibrationFactor = 1.0

  /** Callback invoked when compression or compact reduces step count */
  private onCompress?: (stepsBefore: number, stepsAfter: number) => void
  /** User-defined system prompt prepended before the agent's built-in prompt */
  private userSystemPrompt: string | null

  constructor(
    task: Omit<TaskDefinition, 'createdAt' | 'maxSteps'> & { maxSteps?: number },
    provider: IChatProvider,
    config?: Partial<ContextConfig>,
    previousRunSummary?: AgentRunSummary,
    conversationHistory?: ChatMessage[],
    onCompress?: (stepsBefore: number, stepsAfter: number) => void,
    userSystemPrompt?: string,
  ) {
    this.task = {
      ...task,
      createdAt: Date.now(),
      maxSteps: task.maxSteps ?? DEFAULT_MAX_STEPS,
    }
    this.provider = provider
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config }
    this.previousRunSummary = previousRunSummary ?? null
    this.conversationHistory = conversationHistory ?? []
    this.onCompress = onCompress
    this.userSystemPrompt = userSystemPrompt ?? null
  }

  /**
   * Emergency compact — drop oldest 50% of steps to recover from context overflow.
   * Called when the LLM API returns a context-length-exceeded error.
   * Unlike forceCompact (which keeps only the last step), this preserves half the history.
   */
  async emergencyCompact(): Promise<void> {
    if (this.steps.length <= 1) return

    const keepCount = Math.max(1, Math.floor(this.steps.length / 2))
    const dropped = this.steps.slice(0, -keepCount)
    const stepsBefore = this.steps.length
    this.steps = this.steps.slice(-keepCount)

    // Try to summarize dropped steps (non-blocking — failure is ok)
    if (dropped.length > 0) {
      const descriptions = dropped.map(s => this.formatForCompression(s)).join('\n\n')
      const summary = await this.callLLMForText(
        `Summarize these agent steps in 2-3 sentences:\n\n${descriptions}`,
      )
      if (summary) this.summaries.push(summary)
    }

    // Clear any pending compression flag
    this.compressionPending = false
    this.onCompress?.(stepsBefore, this.steps.length)
  }

  // ── Public getters ──

  getTask(): TaskDefinition {
    return this.task
  }

  getSteps(): AgentStep[] {
    return [...this.steps]
  }

  getSummaries(): string[] {
    return [...this.summaries]
  }

  getMemory(): Record<string, unknown> {
    return { ...this.globalMemory }
  }

  getStepCount(): number {
    return this.steps.length
  }

  isCompressionPending(): boolean {
    return this.compressionPending
  }

  // ── Core: addStep ──

  /**
   * Record a tool call + result as a new step.
   * - Auto-extracts memory from tool result
   * - Marks compression as pending if over threshold
   * - Returns a checkpoint result if this is a checkpoint interval step
   * @param silent - If true, don't increment step counter or check limits.
   *                 Used for auto-snapshots that shouldn't consume step budget.
   */
  async addStep(
    toolCall: ToolCall,
    toolResult: ToolResult,
    thinkingText?: string,
    durationMs = 0,
    silent = false,
  ): Promise<{ shouldAbort: boolean }> {
    if (!silent) this.stepCounter++
    const step: AgentStep = {
      stepNumber: this.stepCounter,
      toolCall: {
        id: toolCall.id,
        name: toolCall.name,
        params: toolCall.args,
      },
      toolResult: {
        content: toolResult.content,
        isError: toolResult.isError,
      },
      thinkingText,
      timestamp: Date.now(),
      durationMs,
    }

    this.steps.push(step)

    // Auto-extract memory from result
    this.autoExtractMemory(toolCall, toolResult)

    // Check hard step limit (only non-silent steps count)
    const shouldAbort = !silent && this.stepCounter >= this.task.maxSteps

    // Token-budget based compression trigger:
    // Estimate total context tokens and compress when approaching the limit.
    if (!silent) {
      const estimatedTokens = this.estimateContextTokens()
      const threshold = this.config.contextWindowTokens * this.config.compressThreshold
      if (estimatedTokens > threshold) {
        this.compressionPending = true
      }
    }

    return { shouldAbort }
  }

  // ── Core: compress (lazy, called before buildMessages) ──

  /**
   * Compress old steps into a summary using LLM.
   * Only runs if compressionPending is true.
   * Keeps keepRecentSteps recent steps uncompressed.
   */
  async compress(): Promise<void> {
    if (!this.compressionPending) return
    if (this.steps.length <= this.config.keepRecentSteps) {
      this.compressionPending = false
      return
    }

    const stepsToCompress = this.steps.slice(0, -this.config.keepRecentSteps)
    const recentSteps = this.steps.slice(-this.config.keepRecentSteps)

    // Build step descriptions for the LLM
    const stepDescriptions = stepsToCompress
      .map((s) => this.formatForCompression(s))
      .join('\n\n')

    const summaryPrompt = this.buildCompressPrompt(stepDescriptions)
    const summary = await this.callLLMForText(summaryPrompt)

    if (summary) {
      this.summaries.push(summary)
      // Only discard old steps if summary succeeded
      const stepsBefore = this.steps.length
      this.steps = recentSteps
      this.onCompress?.(stepsBefore, this.steps.length)
    }
    // If summary failed, keep old steps — don't lose data

    this.compressionPending = false
  }

  /**
   * Force-compact all steps except the most recent one.
   * Called by user action (compact button) to reduce context size.
   * Returns the number of steps compressed.
   */
  async forceCompact(): Promise<{ stepsBefore: number; stepsAfter: number }> {
    const stepsBefore = this.steps.length

    if (this.steps.length <= 1) {
      return { stepsBefore, stepsAfter: stepsBefore }
    }

    const stepsToCompress = this.steps.slice(0, -1)
    const recentStep = this.steps.slice(-1)

    // Build descriptions for LLM summarization
    const stepDescriptions = stepsToCompress
      .map((s) => this.formatForCompression(s))
      .join('\n\n')

    // Try to summarize (non-blocking — if LLM fails, we still compact)
    const summaryPrompt = this.buildCompressPrompt(stepDescriptions)
    const summary = await this.callLLMForText(summaryPrompt)

    if (summary) {
      this.summaries.push(summary)
    }

    this.steps = recentStep
    this.compressionPending = false

    const stepsAfter = this.steps.length
    this.onCompress?.(stepsBefore, stepsAfter)

    return { stepsBefore, stepsAfter }
  }

  // ── Core: buildMessages ──

  /**
   * Build the full message array for the next LLM call.
   * Triggers lazy compression first if needed.
   */
  async buildMessages(): Promise<ChatMessage[]> {
    // Lazy compression trigger (skip during token budget recursion to avoid extra LLM calls)
    if (!this.skipCompression) {
      await this.compress()
    }

    const messages: ChatMessage[] = []

    // 1. System prompt — instructions + memory (no task data)
    messages.push({
      id: generateId(),
      historyId: this.task.id,
      role: 'system',
      content: this.buildSystemPrompt(),
      createdAt: Date.now(),
    })

    // 2. Conversation history from previous turns in this chat session.
    //    Includes user messages + agent final answers (not tool internals).
    //    This lets the agent understand the full conversation context.
    for (const msg of this.conversationHistory) {
      messages.push({
        id: generateId(),
        historyId: this.task.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
      })
    }

    // 2b. Compressed conversation summary (from pruned history)
    if (this.compressedConversationSummary) {
      messages.push({
        id: generateId(),
        historyId: this.task.id,
        role: 'user',
        content: `Summary of earlier conversation (compressed due to context limits):\n${this.compressedConversationSummary}`,
        createdAt: Date.now(),
      })
      messages.push({
        id: generateId(),
        historyId: this.task.id,
        role: 'assistant',
        content: 'Understood the conversation summary.',
        createdAt: Date.now(),
      })
    }

    // 3. Current task goal + constraints
    const constraintsText = this.task.constraints.length > 0
      ? `\n\nConstraints:\n${this.task.constraints.map(c => `- ${c}`).join('\n')}`
      : ''
    messages.push({
      id: generateId(),
      historyId: this.task.id,
      role: 'user',
      content: `【User Task】${this.task.goal}\n\nYou must complete the above task. Every step should serve this goal.${constraintsText}`,
      createdAt: Date.now(),
    })

    // 4a. Historical summaries (if compressed steps exist)
    if (this.summaries.length > 0) {
      const summaryText = this.summaries
        .map((s, i) => `[History summary ${i + 1}] ${s}`)
        .join('\n\n')

      messages.push({
        id: generateId(),
        historyId: this.task.id,
        role: 'user',
        content: `Here are summaries of previously executed steps:\n\n${summaryText}`,
        createdAt: Date.now(),
      })

      messages.push({
        id: generateId(),
        historyId: this.task.id,
        role: 'assistant',
        content: 'Understood the execution history, continuing task.',
        createdAt: Date.now(),
      })
    }

    // 4b. Previous run summary (for explicit task continuation only)
    // When user sends "继续" after a failed/cancelled agent run, inject
    // the structured summary as context so the LLM knows what happened before.
    if (this.previousRunSummary) {
      const summaryContent = this.formatSummaryForContext(this.previousRunSummary)
      messages.push({
        id: generateId(),
        historyId: this.task.id,
        role: 'user',
        content: summaryContent,
        createdAt: Date.now(),
      })

      messages.push({
        id: generateId(),
        historyId: this.task.id,
        role: 'assistant',
        content: 'Understood previous execution status, continuing task.',
        createdAt: Date.now(),
      })
    }

    // 4. Recent steps — use raw content for budget estimation, format lazily
    const stepMessages: ChatMessage[] = []
    for (const step of this.steps) {
      // 4a. Assistant message with thinking + structured tool_calls
      stepMessages.push({
        id: generateId(),
        historyId: this.task.id,
        role: 'assistant',
        content: step.thinkingText || '',
        toolCalls: [{
          id: step.toolCall.id,
          name: step.toolCall.name,
          args: step.toolCall.params,
          type: 'tool_call',
        }],
        createdAt: step.timestamp,
      })

      // 4b. Tool result — use raw content initially (formatStepResult is expensive)
      stepMessages.push({
        id: generateId(),
        historyId: this.task.id,
        role: 'tool',
        content: step.toolResult.content,
        toolCallId: step.toolCall.id,
        toolError: step.toolResult.isError,
        createdAt: step.timestamp + 1,
      })
    }

    messages.push(...stepMessages)

    // 5. Scroll loop detection
    const scrollLoopHint = this.detectScrollLoop()
    if (scrollLoopHint && !this.pendingCorrection) {
      messages.push({
        id: generateId(),
        historyId: this.task.id,
        role: 'user',
        content: scrollLoopHint,
        createdAt: Date.now(),
      })
    }

    // 6. Pending correction (if model output text without tool calls)
    if (this.pendingCorrection) {
      messages.push({
        id: generateId(),
        historyId: this.task.id,
        role: 'user',
        content: this.pendingCorrection,
        createdAt: Date.now(),
      })
      this.pendingCorrection = null
    }

    // 7. Token budget check — prune if over limit, then format remaining steps
    const budgeted = await this.applyTokenBudget(messages)

    // Now apply formatStepResult to the tool result messages that survived budgeting
    const toolCallIdsToFormat = new Set(
      this.steps.map(s => s.toolCall.id),
    )
    for (let i = 0; i < budgeted.length; i++) {
      const msg = budgeted[i]
      if (msg.role === 'tool' && msg.toolCallId && toolCallIdsToFormat.has(msg.toolCallId)) {
        const step = this.steps.find(s => s.toolCall.id === msg.toolCallId)
        if (step) {
          budgeted[i] = { ...msg, content: this.formatStepResult(step) }
        }
      }
    }

    return budgeted
  }

  // ── Token budget ──

  private buildReentryCount = 0
  private static readonly MAX_BUILD_REENTRY = 4

  /**
   * Estimate total tokens for a message array.
   * Uses the dual-mode estimator from snapshot-trimmer.
   */
  estimateMessagesTokens(messages: ChatMessage[]): number {
    // Count chars without concatenation (O(n) instead of O(n²))
    let totalChars = 0
    for (const msg of messages) {
      totalChars += (msg.content ?? '').length
      if (msg.reasoningContent) totalChars += msg.reasoningContent.length
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          totalChars += tc.name.length + (tc.args ? JSON.stringify(tc.args).length : 0) + 20
        }
      }
      totalChars += 4 // role overhead per message
    }
    // estimateTokens expects a string; approximate by using length directly
    // ~4 chars per token for English, ~2 for CJK
    const raw = Math.ceil(totalChars / 3.5)
    const calibrated = Math.ceil(raw / this.calibrationFactor)

    // Calibrate using last actual token count if available
    if (this.lastActualPromptTokens !== null) {
      this.calibrateEstimate(raw, this.lastActualPromptTokens)
      this.lastActualPromptTokens = null // Use once
    }

    return calibrated
  }

  /**
   * Apply token budget pruning if contextWindowTokens is set.
   *
   * Strategies (in order, each removes ~reasonable amount then rechecks):
   * 1. Remove oldest step summary
   * 2. Remove previousRunSummary
   * 3. Trim conversation history (remove oldest turns)
   * 4. Remove oldest agent steps (tool call + result pairs)
   *
   * This ensures we always have room for at least one tool call + result cycle.
   * Prevents infinite recursion via MAX_BUILD_REENTRY.
   */
  private async applyTokenBudget(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const budget = this.config.contextWindowTokens
    if (!budget) return messages

    const estimated = this.estimateMessagesTokens(messages)
    // Use 70% of budget as trigger threshold — leave 30% for:
    // - LLM response (reasoning + content)
    // - Next tool call + result
    const threshold = Math.floor(budget * 0.7)

    if (estimated <= threshold) {
      this.buildReentryCount = 0
      return messages
    }

    if (this.buildReentryCount >= ContextManager.MAX_BUILD_REENTRY) {
      this.buildReentryCount = 0
      return messages
    }

    this.buildReentryCount++
    this.skipCompression = true

    // Strategy 1: Remove oldest step summary
    if (this.summaries.length > 0) {
      this.summaries = this.summaries.slice(1)
      const result = await this.buildMessages()
      this.skipCompression = false
      return result
    }

    // Strategy 2: Remove previousRunSummary
    if (this.previousRunSummary) {
      this.previousRunSummary = null
      const result = await this.buildMessages()
      this.skipCompression = false
      return result
    }

    // Strategy 3: Summarize and trim conversation history (instead of dropping)
    if (this.conversationHistory.length > 2) {
      await this.summarizeAndTrimConversation()
      const result = await this.buildMessages()
      this.skipCompression = false
      return result
    }

    // Strategy 4: Remove oldest agent step (tool call + result pair)
    // Each step = 2 messages (assistant with tool_call + tool result)
    if (this.steps.length > 2) {
      this.steps = this.steps.slice(1)
      const result = await this.buildMessages()
      this.skipCompression = false
      return result
    }

    // Can't prune further — truncate largest step results as last resort
    this.buildReentryCount = 0
    for (let i = this.steps.length - 1; i >= 0; i--) {
      if (this.steps[i].toolResult.content.length > 500) {
        this.steps[i].toolResult.content = truncateForLLM(this.steps[i].toolResult.content, 500)
        break // Only truncate one step as last resort
      }
    }
    return messages
  }

  // ── Capacity pre-check (called before tool execution) ──

  /** Tools known to produce large results that need extra capacity */
  private static readonly LARGE_RESULT_TOOLS = new Set([
    'agent__page_info',
    'agent__read_page',
    'agent__web_search',
  ])

  /** Token budget needed for large-result tools (computed from context window) */
  private get largeToolReserve(): number {
    return getDynamicThresholds(this.config.contextWindowTokens).largeToolReserve
  }

  /** Token budget needed for normal tools (computed from context window) */
  private get normalToolReserve(): number {
    return getDynamicThresholds(this.config.contextWindowTokens).normalToolReserve
  }

  /**
   * Record actual prompt token count from LLM response.
   * Uses it to calibrate future token estimation.
   */
  recordActualTokens(actualPromptTokens: number): void {
    this.lastActualPromptTokens = actualPromptTokens
  }

  /**
   * Quick estimate of current context token usage.
   * Used for token-budget based compression triggers.
   * Much cheaper than building full messages and calling estimateTotalTokens.
   */
  private estimateContextTokens(): number {
    // System prompt + summaries
    let totalChars = this.buildSystemPrompt().length
    for (const s of this.summaries) {
      totalChars += s.length
    }
    // All steps (using raw content, not formatted)
    for (const step of this.steps) {
      totalChars += step.toolCall.name.length
      totalChars += JSON.stringify(step.toolCall.params).length
      totalChars += step.toolResult.content.length
      if (step.thinkingText) totalChars += step.thinkingText.length
    }
    // Previous conversation summary
    if (this.compressedConversationSummary) {
      totalChars += this.compressedConversationSummary.length
    }
    // Conversation history
    for (const msg of this.conversationHistory) {
      totalChars += msg.content.length
    }
    // Rough token estimate: ~4 chars per token, with calibration
    const raw = Math.ceil(totalChars / 4)
    return Math.ceil(raw / this.calibrationFactor)
  }

  /**
   * Calibrate estimateTokens using exponential moving average.
   * Called internally by estimateMessagesTokens when we have actual data.
   */
  private calibrateEstimate(estimatedTokens: number, actualTokens: number): void {
    if (actualTokens <= 0) return
    const ratio = estimatedTokens / actualTokens
    // Exponential moving average with alpha=0.3
    // If ratio > 1, we're overestimating → increase calibration factor to reduce future estimates
    this.calibrationFactor = this.calibrationFactor * 0.7 + ratio * 0.3
  }

  /**
   * Estimate remaining token capacity after the current context.
   * Returns the difference between the budget threshold (70%) and current usage.
   * Returns Infinity if no budget is configured.
   */
  estimateRemainingCapacity(): number {
    const budget = this.config.contextWindowTokens
    if (!budget) return Infinity

    // Estimate current context size by building messages (without triggering compression)
    let totalText = this.buildSystemPrompt()
    for (const msg of this.conversationHistory) {
      totalText += msg.content ?? ''
    }
    totalText += this.task.goal
    totalText += this.task.constraints.join('\n')
    for (const s of this.summaries) {
      totalText += s
    }
    for (const step of this.steps) {
      totalText += step.toolCall.name
      totalText += JSON.stringify(step.toolCall.params)
      totalText += this.formatStepResult(step)
      if (step.thinkingText) totalText += step.thinkingText
    }
    if (this.pendingCorrection) {
      totalText += this.pendingCorrection
    }
    if (this.compressedConversationSummary) {
      totalText += this.compressedConversationSummary
    }

    const currentTokens = estimateTokens(totalText)
    const threshold = Math.floor(budget * 0.7)
    return Math.max(0, threshold - currentTokens)
  }

  /**
   * Check if context should be compressed before executing a tool.
   * Large-result tools (snapshot, read_page, web_search, network_requests)
   * need 4000 tokens of headroom; others need 1000.
   */
  shouldCompressBeforeToolCall(toolName: string): boolean {
    const remaining = this.estimateRemainingCapacity()
    const required = ContextManager.LARGE_RESULT_TOOLS.has(toolName)
      ? this.largeToolReserve
      : this.normalToolReserve
    return remaining < required
  }

  /**
   * Summarize the oldest conversation turns before trimming them.
   * Appends the summary to compressedConversationSummary so context
   * is preserved rather than dropped entirely.
   */
  private async summarizeAndTrimConversation(): Promise<void> {
    const removed = this.conversationHistory.slice(0, 2)
    this.conversationHistory = this.conversationHistory.slice(2)

    // Try to summarize the removed turns
    const turnsText = removed
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n')

    const prompt = [
      'Summarize the following conversation in 1-2 sentences, preserving key information and context:',
      '',
      turnsText,
    ].join('\n')

    const summary = await this.callLLMForText(prompt)
    if (summary) {
      const existing = this.compressedConversationSummary ?? ''
      this.compressedConversationSummary = existing
        ? `${existing}\n${summary}`
        : summary
    }
  }

  // ── Step result summarization (Phase 4) ──

  /** Tools that already have special handling in formatStepResult */
  private static readonly TOOLS_WITH_SPECIAL_HANDLING = new Set([
    'agent__page_info',
    'agent__get_page_screenshot',
    'agent__read_page',
  ])

  /** Cache of summarized results to avoid re-summarizing. Bounded to prevent unbounded growth. */
  private summarizedResults = new Map<string, string>()
  private static readonly MAX_SUMMARIZED_CACHE = 50

  private addToSummarizedCache(key: string, value: string): void {
    if (this.summarizedResults.size >= ContextManager.MAX_SUMMARIZED_CACHE) {
      // Evict oldest entry (first inserted)
      const firstKey = this.summarizedResults.keys().next().value
      if (firstKey !== undefined) this.summarizedResults.delete(firstKey)
    }
    this.summarizedResults.set(key, value)
  }

  /**
   * Summarize a large step result using LLM.
   * Only summarizes results > 3000 chars that don't already have special handling.
   * On LLM failure, falls back to truncation.
   */
  async summarizeStepResult(stepIndex: number): Promise<void> {
    const step = this.steps[stepIndex]
    if (!step) return

    // Skip tools with special handling
    if (ContextManager.TOOLS_WITH_SPECIAL_HANDLING.has(step.toolCall.name)) return

    // Skip errors — they should be preserved as-is
    if (step.toolResult.isError) return

    const content = step.toolResult.content
    const RESULT_SUMMARIZE_THRESHOLD = getDynamicThresholds(this.config.contextWindowTokens).resultSummarizeThreshold

    if (content.length <= RESULT_SUMMARIZE_THRESHOLD) return

    // Check cache
    const cacheKey = `${step.stepNumber}:${step.toolCall.name}`
    const cached = this.summarizedResults.get(cacheKey)
    if (cached) {
      step.toolResult.content = cached
      return
    }

    // Try LLM summarization
    const prompt = [
      'Summarize the following tool result concisely, preserving all key data (URLs, IDs, numbers, names, etc.). Keep total length under 2000 characters:',
      '',
      `Tool: ${step.toolCall.name}`,
      `Result content: ${content.slice(0, 6000)}`, // Limit input to prevent context explosion
    ].join('\n')

    const summary = await this.callLLMForText(prompt)
    if (summary && summary.length < content.length) {
      this.addToSummarizedCache(cacheKey, summary)
      step.toolResult.content = summary
    } else {
      // Fallback to truncation
      const truncated = truncateForLLM(content, 2000)
      this.addToSummarizedCache(cacheKey, truncated)
      step.toolResult.content = truncated
    }
  }

  // ── Core: buildSystemPrompt ──

  /**
   * Detect the user's language from the task goal and return a hint
   * for the system prompt. This ensures the agent responds in the
   * same language as the user.
   */
  private detectLanguageHint(): string {
    const goal = this.task.goal
    // CJK characters: Chinese, Japanese, Korean
    const cjkCount = (goal.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) ?? []).length
    const ratio = cjkCount / Math.max(1, goal.length)

    if (ratio > 0.2) {
      return '## Language\n' +
        'The user writes in Chinese/Japanese/Korean. You MUST:\n' +
        '- Respond in the SAME language as the user (Chinese/Japanese/Korean).\n' +
        '- Use task_complete with results in the user\'s language.\n' +
        '- Search in the user\'s language when searching for local content (e.g. use Chinese keywords for Chinese news).\n' +
        '- Your identity is WebAgent (WebAgent浏览器助手). Do NOT claim to be any other AI model.'
    }
    return ''
  }

  buildSystemPrompt(): string {
    const memoryBlock = this.formatMemory()
    const languageHint = this.detectLanguageHint()
    const userPromptBlock = this.userSystemPrompt
      ? `## Custom Instructions\n${this.userSystemPrompt}`
      : ''

    return [
      userPromptBlock,
      'You are WebAgent, a browser automation assistant. You can browse the web, take screenshots, read pages, click, type, search, and navigate.',
      '',
      '## Workflow',
      '1. For page interaction tasks: ALWAYS call agent__page_info(info_type="snapshot") first to see the page and annotate interactive elements with agentIds.',
      '2. Use agentId from snapshot results to interact with elements (click, type, hover).',
      '3. For reading article/body text (NOT interactive elements), use agent__read_page.',
      '4. If element lookup fails, call agent__page_info(info_type="snapshot") again — the page may have changed or elements may not be annotated yet.',
      '5. When a task is fully done, call agent__task_complete with the result.',
      '',
      '## Rules',
      '- For multi-step tasks, you MAY call agent__update_plan ONCE at the start to list subtasks. Do NOT repeatedly call update_plan — focus on executing the actual tools.',
      '- Tool parameters MUST match the schema exactly. target must be an object: {"agentId":"a0"} not a string.',
      '- snapshot shows interactive elements, NOT paragraph text. Use read_page for body text.',
      '- To find API requests a page made, use agent__page_info(info_type="network") with urlPattern like "api/" or "graphql".',
      '- Prefer agentId over CSS selectors.',
      '- Before agent__switch_tab, call agent__get_tabs first. Never guess tab IDs.',
      '- Element not found → re-snapshot. Stuck → agent__ask_user. Error → try alternative approach.',
      '- Do NOT repeat the same tool call with the same arguments. If a tool returned results, use them and move on.',
      '- When the task is done, call agent__task_complete with the result, or simply output the final answer as text.',
      '',
      languageHint,
      memoryBlock ? `## Memory\n${memoryBlock}` : '',
      this.formatPlanSection(),
    ].join('\n')
  }

  // ── Memory extraction ──

  /**
   * Auto-extract memory from tool results.
   * Rules:
   * - navigate → store current_url, page_title
   * - get_interactive_elements → classify page_type
   * - type → store typed_in_{field}
   * - Any result with id/token/email/username fields → store
   */
  autoExtractMemory(toolCall: ToolCall, toolResult: ToolResult): void {
    if (toolResult.isError) return

    const name = toolCall.name
    const args = toolCall.args

    // Try to parse the result content
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(toolResult.content)
    } catch {
      // Not JSON — handle as plain text
    }

    switch (name) {
      case 'agent__navigate': {
        if (parsed) {
          if (parsed.url) this.globalMemory['current_url'] = parsed.url
          if (parsed.title) this.globalMemory['page_title'] = parsed.title
          // Also extract from the args
          if (args.url) this.globalMemory['navigated_to'] = args.url
        }
        break
      }

      case 'agent__page_info': {
        // page_info with info_type= snapshot/elements/scroll/network
        const infoArgs = args as Record<string, unknown>
        if (infoArgs.info_type === 'snapshot' && parsed) {
          if (parsed.url) this.globalMemory['current_url'] = parsed.url
          if (parsed.title) this.globalMemory['page_title'] = parsed.title
          if (typeof parsed.interactiveCount === 'number') {
            this.globalMemory['interactive_count'] = parsed.interactiveCount
          }
          if (typeof parsed.snapshot === 'string') {
            const scrollMatch = parsed.snapshot.match(/Scroll: (\d+)\/(\d+)px/)
            if (scrollMatch) {
              this.globalMemory['scroll_position'] = scrollMatch[1] + '/' + scrollMatch[2] + 'px'
            }
          }
        } else if (infoArgs.info_type === 'elements' && Array.isArray(parsed)) {
          const pageType = classifyPageType(parsed)
          if (pageType) this.globalMemory['page_type'] = pageType
        }
        break
      }

      case 'agent__type': {
        const target = args.target as Record<string, string> | undefined
        const text = args.text as string | undefined
        if (target && text) {
          const field = target.agentId ?? target.selector ?? 'unknown'
          this.globalMemory[`typed_in_${field}`] = text
        }
        break
      }

      case 'agent__read_page': {
        if (parsed) {
          if (typeof parsed.contentLength === 'number') {
            this.globalMemory['last_read_length'] = parsed.contentLength
          }
          if (typeof parsed.mode === 'string') {
            this.globalMemory['last_read_mode'] = parsed.mode
          }
        }
        break
      }

      case 'agent__open_tab': {
        if (parsed?.tabId) this.globalMemory['last_opened_tab_id'] = parsed.tabId
        if (parsed?.url) this.globalMemory['last_opened_url'] = parsed.url
        break
      }

      case 'agent__update_plan': {
        if (parsed?.plan?.items) {
          this.currentPlan = parsed.plan as AgentPlan
        }
        break
      }

      default:
        break
    }

    // Generic extraction: look for id, token, email, username fields in parsed results
    if (parsed && typeof parsed === 'object') {
      extractSensitiveFields(parsed, this.globalMemory)
      // Also check nested data
      if (parsed.data && typeof parsed.data === 'object') {
        extractSensitiveFields(parsed.data as Record<string, unknown>, this.globalMemory)
      }
    }
  }

  // ── Formatting helpers ──

  /**
   * Format a single step for LLM consumption.
   */
  formatForLLM(step: AgentStep): string {
    const paramsStr = formatParams(step.toolCall.params)
    const truncLimit = getDynamicThresholds(this.config.contextWindowTokens).formatForLLMLimit
    const resultStr = step.toolResult.content.length > truncLimit
      ? truncateForLLM(step.toolResult.content, truncLimit)
      : step.toolResult.content

    const lines = [
      `Step ${step.stepNumber}: called ${step.toolCall.name}(${paramsStr})`,
      `Result: ${resultStr}`,
      `Duration: ${step.durationMs}ms`,
    ]

    if (step.toolResult.isError) {
      lines.push('\u26a0 This step failed')
    }

    return lines.join('\n')
  }

  /**
   * Format a step for compression — preserves more detail than formatForLLM.
   * Used when feeding steps to the summarization LLM so it doesn't lose info.
   */
  formatForCompression(step: AgentStep): string {
    const paramsStr = formatParams(step.toolCall.params)
    const truncLimit = getDynamicThresholds(this.config.contextWindowTokens).formatForCompressionLimit
    const resultStr = step.toolResult.content.length > truncLimit
      ? truncateForLLM(step.toolResult.content, truncLimit)
      : step.toolResult.content

    const lines = [
      `Step ${step.stepNumber}: called ${step.toolCall.name}(${paramsStr})`,
      `Result: ${resultStr}`,
      `Duration: ${step.durationMs}ms`,
    ]

    if (step.toolResult.isError) {
      lines.push('\u26a0 This step failed')
    }

    return lines.join('\n')
  }

  /**
   * Format global memory as a readable string for the system prompt.
   */
  formatMemory(): string {
    const keys = Object.keys(this.globalMemory)
    if (keys.length === 0) return '(none)'

    return keys
      .map((key) => {
        const value = this.globalMemory[key]
        const valueStr = typeof value === 'string'
          ? value
          : JSON.stringify(value)
        return `- ${key}: ${valueStr}`
      })
      .join('\n')
  }

  /**
   * Format current plan as a section for the system prompt.
   * Shows task list with status so the LLM tracks its own progress.
   */
  private formatPlanSection(): string {
    if (!this.currentPlan || this.currentPlan.items.length === 0) return ''

    const statusIcon: Record<PlanItem['status'], string> = {
      pending: '○',
      in_progress: '⟳',
      completed: '✓',
      failed: '✗',
    }

    const summary = getPlanSummary(this.currentPlan)
    const taskLines = this.currentPlan.items
      .map(item => `${statusIcon[item.status]} ${item.title}${item.status === 'failed' && item.result ? ` — ${item.result}` : ''}`)
      .join('\n')

    return [
      '',
      '## Task Plan',
      `Progress: ${summary.completed}/${summary.total} completed${summary.failed > 0 ? `, ${summary.failed} failed` : ''}`,
      taskLines,
      '',
      'Update the plan as you work by calling agent__update_plan with updated statuses.',
    ].join('\n')
  }

  /**
   * Inject additional memory entries.
   */
  setMemory(key: string, value: unknown): void {
    this.globalMemory[key] = value
  }

  /**
   * Inject a correction message that will appear as a user message
   * in the next buildMessages() call. Used when the model outputs
   * text without tool calls — the correction prompts the model to use tools.
   * The correction is consumed (cleared) after being included once.
   */
  injectCorrection(message: string): void {
    this.pendingCorrection = message
  }

  /**
   * Detect scroll loop pattern: many consecutive scrolls without
   * any read_page or action in between. Returns a correction message
   * if a loop is detected, null otherwise.
   */
  detectScrollLoop(): string | null {
    const recent = this.steps.slice(-12)
    if (recent.length < 4) return null

    // Count consecutive scrolls at the end
    let consecutiveScrolls = 0
    let hasReadPage = false
    for (let i = recent.length - 1; i >= 0; i--) {
      const name = recent[i].toolCall.name
      if (name === 'agent__scroll') {
        consecutiveScrolls++
      } else if (name === 'agent__read_page') {
        hasReadPage = true
        break
      } else {
        break
      }
    }

    if (consecutiveScrolls >= 4 && !hasReadPage) {
      return [
        'You have scrolled multiple times but have not read any content. The current viewport may have text content not shown in the snapshot.',
        'Suggestion: use agent__read_page(scope="viewport") to read the visible text, rather than continuing to scroll.',
        'If the current area truly has no useful content, you can perform other actions or call task_complete.',
      ].join('\n')
    }

    return null
  }

  // ── Private helpers ──

  /**
   * Format an AgentRunSummary into a concise context message for the LLM.
   * Kept under ~500 characters to avoid token bloat.
   */
  private formatSummaryForContext(summary: AgentRunSummary): string {
    const parts: string[] = []

    parts.push(`【Previous execution status】`)
    parts.push(`Original task: ${summary.goal}`)

    const statusMap: Record<string, string> = {
      completed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
    }
    parts.push(`Status: ${statusMap[summary.status] ?? summary.status}`)
    parts.push(`Steps executed: ${summary.totalSteps}`)

    if (summary.failureReason) {
      parts.push(`Failure reason: ${summary.failureReason}`)
    }

    if (summary.result) {
      const truncatedResult = summary.result.length > 200
        ? summary.result.slice(0, 200) + '...'
        : summary.result
      parts.push(`Previous result: ${truncatedResult}`)
    }

    if (summary.toolHistory.length > 0) {
      parts.push(`Tools executed: ${summary.toolHistory.join(', ')}`)
    }

    const memoryKeys = Object.keys(summary.memory)
    if (memoryKeys.length > 0) {
      const memEntries = memoryKeys
        .slice(0, 10) // limit to 10 entries
        .map(k => `${k}=${JSON.stringify(summary.memory[k])}`)
        .join(', ')
      parts.push(`Memory: ${memEntries}`)
    }

    parts.push(`Please continue completing the task based on this context.`)

    return parts.join('\n')
  }

  /**
   * Format a step's tool result, trimming DOM snapshots if needed.
   */
  private formatStepResult(step: AgentStep): string {
    let content = step.toolResult.content

    // Check if this looks like a DOM snapshot and trim it
    if (step.toolCall.name === 'agent__page_info') {
      // Discard old snapshots — only keep the latest one in full
      if (!this.isLatestLargeResult(step.stepNumber, 'agent__page_info')) {
        try {
          const parsed = JSON.parse(content)
          const scrollInfo = typeof parsed.snapshot === 'string'
            ? (parsed.snapshot.match(/Scroll: ([^\n]+)/)?.[1] ?? '?')
            : '?'
          return `[Old snapshot omitted] title:${parsed.title ?? '?'} URL:${parsed.url ?? '?'} scroll:${scrollInfo}`
        } catch {
          return '[Old snapshot omitted]'
        }
      }

      try {
        const parsed = JSON.parse(content)
        if (parsed.snapshot && typeof parsed.snapshot === 'string') {
          const snapshotTokens = estimateTokens(parsed.snapshot)
          if (snapshotTokens > this.config.maxSnapshotTokens) {
            parsed.snapshot = trimSnapshot(parsed.snapshot, this.config.maxSnapshotTokens)
            content = JSON.stringify(parsed)
          }
        }
      } catch {
        // Not JSON, try trimming raw content
        if (estimateTokens(content) > this.config.maxSnapshotTokens) {
          content = trimSnapshot(content, this.config.maxSnapshotTokens)
        }
      }
      // Snapshot already trimmed above — skip the generic 2000-char truncation
      return content
    }

    // Handle screenshot results — replace base64 with placeholder to avoid context explosion
    if (step.toolCall.name === 'agent__get_page_screenshot') {
      // Preserve error messages so the LLM can see what went wrong
      if (step.toolResult.isError) {
        return truncateForLLM(content, 500)
      }
      return '[Screenshot captured and shown to user as image. Do NOT describe the page in text — the user can see the image. Just call task_complete to finish.]'
    }

    // Handle read_page results — similar trimming strategy
    if (step.toolCall.name === 'agent__read_page') {
      // Discard old read_page results — only keep the latest one in full
      if (!this.isLatestLargeResult(step.stepNumber, 'agent__read_page')) {
        try {
          const parsed = JSON.parse(content)
          return `[Old read omitted] mode:${parsed.mode ?? '?'} truncated:${parsed.truncated ?? false} length:${parsed.contentLength ?? '?'}`
        } catch {
          return '[Old read omitted]'
        }
      }

      try {
        const parsed = JSON.parse(content)
        if (parsed.content && typeof parsed.content === 'string') {
          const contentTokens = estimateTokens(parsed.content)
          if (contentTokens > this.config.maxSnapshotTokens) {
            parsed.content = trimSnapshot(parsed.content, this.config.maxSnapshotTokens)
            content = JSON.stringify(parsed)
          }
        }
      } catch {
        if (estimateTokens(content) > this.config.maxSnapshotTokens) {
          content = trimSnapshot(content, this.config.maxSnapshotTokens)
        }
      }
      return content
    }

    return truncateForLLM(content, getDynamicThresholds(this.config.contextWindowTokens).formatStepResultLimit)
  }

  /**
   * Check if a given step is the latest step of a given tool name.
   * Used to decide whether to keep full content or collapse old results.
   */
  private isLatestLargeResult(stepNumber: number, toolName: string): boolean {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      if (this.steps[i].toolCall.name === toolName) {
        return this.steps[i].stepNumber === stepNumber
      }
    }
    return true
  }

  /**
   * Build the compression prompt.
   */
  private buildCompressPrompt(stepDescriptions: string): string {
    return [
      'Summarize the following agent execution steps. Your summary MUST:',
      '1. First, check if the task has been COMPLETED (goal achieved, task_complete called, or final answer delivered).',
      '2. If task is COMPLETED: state "Task completed: [brief result]" — NO need to preserve further details.',
      '3. If task is NOT completed:',
      '   - List all URLs navigated to and the current page URL',
      '   - Preserve any IDs, usernames, tokens, form values, or extracted data',
      '   - State what actions were taken and their results',
      '   - Describe the current state and what remains',
      '4. Keep the summary under 800 tokens but do NOT omit critical data',
      '',
      'Format as structured bullet points, not prose.',
      '',
      'Step records:',
      stepDescriptions,
    ].join('\n')
  }

  /**
   * Call the LLM and return the text response.
   * Used for compression and checkpoint.
   */
  private static readonly LLM_CALL_TIMEOUT_MS = 600_000 // 10 minutes

  private async callLLMForText(prompt: string): Promise<string> {
    try {
      const messages: ChatMessage[] = [
        {
          id: generateId(),
          historyId: this.task.id,
          role: 'user',
          content: prompt,
          createdAt: Date.now(),
        },
      ]

      // Race the LLM call against a timeout to prevent indefinite blocking
      const result = await Promise.race([
        this.provider.chat(messages),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('LLM call for compression timed out')),
            ContextManager.LLM_CALL_TIMEOUT_MS,
          )
        ),
      ])
      return result.content ?? ''
    } catch {
      return ''
    }
  }
}

// ── Standalone utility functions ──

/**
 * Format tool call parameters as a concise string.
 */
function formatParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params)
  if (entries.length === 0) return ''

  return entries
    .map(([key, value]) => {
      const valStr = typeof value === 'string'
        ? value.length > 50 ? value.slice(0, 50) + '...' : value
        : JSON.stringify(value)
      return `${key}=${valStr}`
    })
    .join(', ')
}

/**
 * Classify page type based on interactive elements.
 */
function classifyPageType(elements: unknown[]): string | null {
  if (!Array.isArray(elements) || elements.length === 0) return null

  const tags = new Set<string>()
  const types = new Set<string>()

  for (const el of elements) {
    if (typeof el !== 'object' || el === null) continue
    const record = el as Record<string, unknown>
    if (record.tag) tags.add(record.tag as string)
    if (record.type) types.add(record.type as string)
  }

  // Login page: has password input
  if (types.has('password')) return 'login_page'

  // Form page: has multiple inputs + submit button
  if (tags.has('input') && tags.has('button') && (types.has('text') || types.has('email'))) {
    return 'form_page'
  }

  // List page: mostly links
  if (tags.has('a') && (elements.length > 5)) return 'list_page'

  return 'general_page'
}

/**
 * Extract sensitive/notable fields from a result object into memory.
 */
function extractSensitiveFields(
  obj: Record<string, unknown>,
  memory: Record<string, unknown>,
): void {
  const sensitivePatterns = [
    /id$/i,
    /^id$/,
    /token/i,
    /email/i,
    /username/i,
    /user_id/i,
    /session/i,
    /csrf/i,
    /key$/i,
  ]

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' || typeof value === 'number') {
      const matches = sensitivePatterns.some((pattern) => pattern.test(key))
      if (matches) {
        memory[`extracted_${key}`] = value
      }
    }
  }
}

// Re-export for convenience
export { trimSnapshot, estimateTokens, truncateForLLM }

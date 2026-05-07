/**
 * Agent-related functions for chat service
 */

import type { ChatMessage } from '@/types/message'
import { useChatStore } from '@/store/chat-store'
import type { AgentRunSummary } from '@/agent/types'

// ── Active agent executor reference ──
// Stored at module level so the UI can trigger compact() on the running agent.
let activeAgentExecutor: import('@/agent/AgentExecutor').AgentExecutor | null = null

/**
 * Set the active agent executor
 */
export function setActiveAgentExecutor(executor: import('@/agent/AgentExecutor').AgentExecutor | null): void {
  activeAgentExecutor = executor
}

/**
 * Get the active agent executor
 */
export function getActiveAgentExecutor(): import('@/agent/AgentExecutor').AgentExecutor | null {
  return activeAgentExecutor
}

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

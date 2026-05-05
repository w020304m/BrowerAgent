/**
 * Reasoning layer: 5 tools for agent loop control.
 * task_complete / task_failed → signal in ToolResult.content
 * ask_user → round-trip to sidepanel
 * report_progress → one-way message to sidepanel
 * update_plan → task plan state update
 */

import type { ToolCall, ToolResult } from '@/types/tool'
import type { BridgeService } from '../bridge/bridge-service'
import type { PlanItem } from '@/types/agent-plan'
import { encodeSignal } from '../bridge/types'

export function registerReasoningHandlers(bridge: BridgeService): void {
  bridge.register('agent__task_complete', handleTaskComplete)
  bridge.register('agent__task_failed', handleTaskFailed)
  bridge.register('agent__ask_user', handleAskUser)
  bridge.register('agent__report_progress', handleReportProgress)
  bridge.register('agent__update_plan', handleUpdatePlan)
}

// ── Tool: agent__task_complete ──

async function handleTaskComplete(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const result = (args.result as string) ?? ''

  if (!result.trim()) {
    return {
      toolCallId: toolCall.id,
      content: 'Error: result is required when calling task_complete. Provide a summary of what was accomplished.',
      isError: true,
    }
  }

  return {
    toolCallId: toolCall.id,
    content: encodeSignal({ type: 'task_complete', result }),
    isError: false,
  }
}

// ── Tool: agent__task_failed ──

async function handleTaskFailed(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const reason = (args.reason as string) ?? 'Unknown error'
  const recoverable = (args.recoverable as boolean) ?? false

  return {
    toolCallId: toolCall.id,
    content: encodeSignal({ type: 'task_failed', reason, recoverable }),
    isError: false,
  }
}

// ── Tool: agent__ask_user ──

async function handleAskUser(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const question = args.question as string

  if (!question) {
    return { toolCallId: toolCall.id, content: 'Error: question is required', isError: true }
  }

  const options = args.options as string[] | undefined
  const ASK_USER_TIMEOUT_MS = 60_000 // 60 seconds

  // Send question to sidepanel and block until user responds, times out, or task is cancelled.
  const answer = await new Promise<string>((resolve) => {
    // Timeout — resolve with sentinel if user doesn't respond
    const timeoutId = setTimeout(() => {
      resolve('__ASK_USER_TIMEOUT__')
    }, ASK_USER_TIMEOUT_MS)

    // Clean up timeout when resolved by any other path
    const originalResolve = resolve
    const wrappedResolve = (value: string) => {
      clearTimeout(timeoutId)
      originalResolve(value)
    }

    // Register wrapped resolver
    const bridge = getBridgeService()
    if (bridge) {
      bridge.registerAskUserPending(toolCall.id, wrappedResolve)
    }

    chrome.runtime.sendMessage({
      type: 'agent_ask_user',
      toolCallId: toolCall.id,
      question,
      options,
    }).catch(() => {
      clearTimeout(timeoutId)
      wrappedResolve('__ASK_USER_UNAVAILABLE__')
    })
  })

  // Clean up resolver from bridge map
  const bridge = getBridgeService()
  if (bridge) {
    bridge.resolveAskUser(toolCall.id, '') // no-op if already resolved, just cleans up map
  }

  // Distinguish: real answer vs timeout vs unavailable vs dismissed
  if (answer === '__ASK_USER_TIMEOUT__') {
    return {
      toolCallId: toolCall.id,
      content: 'The user did not respond within 60 seconds. Decide how to proceed without user input, or call task_failed if you cannot continue.',
      isError: false,
    }
  }

  if (answer === '__ASK_USER_UNAVAILABLE__') {
    return {
      toolCallId: toolCall.id,
      content: 'The user interface is not available. Call task_failed if you cannot proceed.',
      isError: true,
    }
  }

  // Empty string means user dismissed/skipped
  return {
    toolCallId: toolCall.id,
    content: answer || '(user dismissed)',
    isError: false,
  }
}

// ── Tool: agent__report_progress ──

async function handleReportProgress(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const current = (args.current as number) ?? 0
  const total = (args.total as number) ?? 0
  const description = (args.description as string) ?? ''

  // Send progress to sidepanel (fire-and-forget)
  chrome.runtime.sendMessage({
    type: 'agent_progress',
    current,
    total,
    description,
  }).catch(() => {
    // Sidepanel may not be listening
  })

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ success: true }),
    isError: false,
  }
}

// ── Tool: agent__update_plan ──

async function handleUpdatePlan(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const tasks = args.tasks as Array<{ id: string; title: string; status: string; result?: string }> | undefined

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return {
      toolCallId: toolCall.id,
      content: 'Error: tasks array is required and must not be empty.',
      isError: true,
    }
  }

  const validStatuses = new Set(['pending', 'in_progress', 'completed', 'failed'])
  const normalizedTasks: PlanItem[] = []

  for (const t of tasks) {
    if (!t.id || !t.title || !validStatuses.has(t.status)) continue
    normalizedTasks.push({
      id: String(t.id),
      title: String(t.title).slice(0, 50),
      status: t.status as PlanItem['status'],
      result: t.result ? String(t.result) : undefined,
    })
  }

  if (normalizedTasks.length === 0) {
    return {
      toolCallId: toolCall.id,
      content: 'Error: No valid task items. Each needs id, title, and status (pending/in_progress/completed/failed).',
      isError: true,
    }
  }

  const plan = { items: normalizedTasks, updatedAt: Date.now() }

  // Send to sidepanel UI (fire-and-forget)
  chrome.runtime.sendMessage({
    type: 'agent_plan_update',
    plan,
  }).catch(() => {
    // Sidepanel may not be listening
  })

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({ success: true, plan }),
    isError: false,
  }
}

// Singleton reference for ask_user bridge communication
let _bridgeService: BridgeService | null = null

export function setBridgeService(bridge: BridgeService): void {
  _bridgeService = bridge
}

function getBridgeService(): BridgeService | null {
  return _bridgeService
}

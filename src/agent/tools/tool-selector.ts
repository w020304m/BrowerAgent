/**
 * Dynamic tool selection — picks the most relevant tools for each agent step.
 *
 * Instead of sending all 32 tools on every LLM call, this module selects
 * a subset based on what the agent did last, reducing token usage and
 * improving model focus.
 */

import type { ToolDefinition } from '@/types/tool'

// ── Tool group name lists ──

export const TOOL_GROUP_PERCEPTION = [
  'agent__page_info',
  'agent__get_element_by_description',
  'agent__get_page_screenshot',
  'agent__read_page',
] as const

export const TOOL_GROUP_ACTION = [
  'agent__click',
  'agent__type',
  'agent__select',
  'agent__scroll',
  'agent__drag_and_drop',
  'agent__wait_for',
] as const

export const TOOL_GROUP_NAVIGATION = [
  'agent__navigate',
  'agent__navigate_history',
  'agent__open_tab',
  'agent__switch_tab',
  'agent__close_tab',
  'agent__get_tabs',
] as const

export const TOOL_GROUP_MEMORY = [
  'agent__memory',
  'agent__scratchpad',
] as const

/** Tools included in every selection — always available. */
export const TOOL_ALWAYS_INCLUDE = [
  'agent__task_complete',
  'agent__task_failed',
  'agent__ask_user',
  'agent__report_progress',
  'agent__memory',
  'agent__web_search',
  'agent__update_plan',
] as const

// ── Step context ──

export interface StepContext {
  /** Current step number (0-based) */
  stepNumber: number
  /** Tool name from the previous step, null on first step */
  lastToolName: string | null
  /** Whether the previous step succeeded */
  lastToolSuccess: boolean
  /** Current consecutive failure count */
  consecutiveFailures: number
  /** Page type from memory (optional, e.g. 'login_page') */
  pageType?: string
}

// ── Selection logic ──

export function selectToolsForStep(
  allSchemas: ToolDefinition[],
  context: StepContext,
): ToolDefinition[] {
  const selected = new Set<string>(TOOL_ALWAYS_INCLUDE)

  // First step: only give high-probability starting tools to reduce noise for small models.
  // The agent typically needs to navigate, perceive, or search on its first action.
  if (context.stepNumber === 0) {
    TOOL_GROUP_NAVIGATION.forEach((t) => selected.add(t))
    TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
    return allSchemas.filter((s) => selected.has(s.name))
  }

  // Steps 1-2: give everything — agent is still exploring
  if (context.stepNumber <= 2) return [...allSchemas]

  const last = context.lastToolName

  if (last) {
    // Just navigated → need to perceive the new page
    if (
      last === 'agent__navigate' ||
      last === 'agent__navigate_history'
    ) {
      TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
    }

    // Just took a snapshot / inspected elements → ready to act or inspect further
    else if (
      last === 'agent__page_info' ||
      last === 'agent__get_page_screenshot'
    ) {
      TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
      TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
      TOOL_GROUP_NAVIGATION.forEach((t) => selected.add(t))
    }

    // Just clicked/typed → may need to wait, read, or continue
    else if (
      last === 'agent__click' ||
      last === 'agent__type'
    ) {
      TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
      TOOL_GROUP_NAVIGATION.forEach((t) => selected.add(t))
      selected.add('agent__page_info')
      selected.add('agent__read_page')
    }

    // Just waited for something → re-perceive + act
    else if (last === 'agent__wait_for') {
      TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
      TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
    }

    // Just operated memory → resume normal task flow
    else if (last === 'agent__memory' || last === 'agent__scratchpad') {
      TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
      TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
    }

    // Just switched tabs → perceive new page
    else if (
      last === 'agent__open_tab' ||
      last === 'agent__switch_tab' ||
      last === 'agent__close_tab'
    ) {
      TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
      TOOL_GROUP_NAVIGATION.forEach((t) => selected.add(t))
    }

    // scrolled → likely still exploring, may act
    else if (last === 'agent__scroll') {
      TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
      TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
      TOOL_GROUP_NAVIGATION.forEach((t) => selected.add(t))
    }

    // selected / dragged → likely continuing interaction
    else if (
      last === 'agent__select' ||
      last === 'agent__drag_and_drop'
    ) {
      TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
      TOOL_GROUP_NAVIGATION.forEach((t) => selected.add(t))
      selected.add('agent__page_info')
      selected.add('agent__read_page')
    }

    // get_element_by_description → found element, ready to act or read
    else if (last === 'agent__get_element_by_description') {
      TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
      selected.add('agent__read_page')
    }

    // read_page → has content, may need to analyze further, act, or inspect network
    else if (last === 'agent__read_page') {
      TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
      TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
      TOOL_GROUP_NAVIGATION.forEach((t) => selected.add(t))
    }

    // reasoning tools (task_complete/task_failed/ask_user/report_progress)
    // These are terminal or informational, give broad set for next step
    else {
      TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
      TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
    }
  } else {
    // No last tool (shouldn't happen for step > 2, but be safe)
    TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
    TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
  }

  // Consecutive failures → expand tool set for more options
  if (context.consecutiveFailures >= 2) {
    TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
    TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
    selected.add('agent__navigate')
  }

  // Safety net: if fewer than 4 non-ALWAYS tools selected, add perception + action
  const nonAlways = [...selected].filter((t) => !(TOOL_ALWAYS_INCLUDE as readonly string[]).includes(t))
  if (nonAlways.length < 4) {
    TOOL_GROUP_PERCEPTION.forEach((t) => selected.add(t))
    TOOL_GROUP_ACTION.forEach((t) => selected.add(t))
  }

  return allSchemas.filter((s) => selected.has(s.name))
}

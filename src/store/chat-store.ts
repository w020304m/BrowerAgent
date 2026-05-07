/**
 * Chat Store.
 * Manages chat state including messages, current session, and streaming status.
 */

import { create } from 'zustand'
import type { ChatMessage } from '@/types/message'
import type { StreamChunk } from '@/providers/types'
import type { ProviderType } from '@/types/provider'
import type { ChatMode } from '@/chat-pipeline/types'
import type { ToolCall } from '@/types/tool'
import type { AgentRunSummary } from '@/agent/types'
import type { AgentPlan } from '@/types/agent-plan'
import type { QueueItem } from '@/types/chat'

export interface AgentActionInfo {
  phase: 'streaming' | 'calling_tool' | 'tool_done' | 'awaiting_approval'
  toolName?: string
  iteration?: number
}

export interface ChatState {
  /** Current history ID */
  historyId: string | null
  /** Messages for current session */
  messages: ChatMessage[]
  /** Whether the model is currently streaming */
  isStreaming: boolean
  /** Current streaming content (for real-time display) */
  streamingContent: string
  /** Current streaming reasoning content */
  streamingReasoning: string
  /** Tool calls accumulated during streaming */
  streamingToolCalls: ToolCall[]
  /** Selected provider type */
  providerType: ProviderType
  /** Selected model ID */
  modelId: string
  /** Selected provider config instance ID (for multi-provider support) */
  providerConfigId: string | null
  /** Chat mode */
  mode: ChatMode
  /** Whether this is a temporary chat (no DB persistence) */
  isTemporary: boolean
  /** Error message if any */
  error: string | null
  /** AbortController for the current streaming request */
  abortController: AbortController | null
  /** Timestamp when streaming started (for response time calculation) */
  streamingStartTime: number | null
  /** Accumulated generation info from stream chunks */
  streamingGenerationInfo: Record<string, unknown> | null
  /** Sources from pipeline (tab context, RAG, etc.) to attach to assistant message */
  streamingSources: ChatMessage['sources']
  /** Whether agent mode (agentic loop) is enabled */
  agentEnabled: boolean
  /** Current iteration count in the agentic loop */
  agentIteration: number
  /** Agent progress info for UI display */
  agentActionInfo: AgentActionInfo | null
  /** Pending ask_user request from agent */
  pendingAskUser: { toolCallId: string; question: string; options?: string[] } | null
  /** Selected elements for multi-element reference (marker-based) */
  selectedElements: Array<{ id: string; agentId: string; tag: string; text?: string }>
  /** Counter incremented by keyboard shortcut to trigger element selection */
  selectElementTrigger: number
  /** Currently hovered element reference number (for highlighting) */
  hoveredElementRef: number | null
  /** Continuous selection mode is active */
  isContinuousSelectMode: boolean
  /** Elements selected during continuous selection (not yet confirmed) */
  pendingSelectedElements: Array<{ agentId: string; tag: string; text?: string }>
  /** Element panel is expanded (true) or collapsed (false) */
  elementPanelOpen: boolean
  /** Summary of last agent run for task continuation */
  lastAgentSummary: AgentRunSummary | null
  /** Current agent task plan for UI display */
  agentPlan: AgentPlan | null
  /** Message queue for agent mode */
  messageQueue: QueueItem[]
  /** Whether agent is busy (running or processing queue) */
  isAgentBusy: boolean
  /** Compressed summary of conversation history (set by manual compress, replaces old messages in agent context) */
  compressedHistorySummary: string | null
  /** Selected system prompt ID (null = default, no custom prompt) */
  selectedPromptId: string | null

  // Actions
  /** Start a new chat session */
  newChat: () => void
  /** Set the current history ID and load messages */
  setHistoryId: (id: string) => void
  /** Add a message */
  addMessage: (message: ChatMessage) => void
  /** Update a message by ID */
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  /** Set messages (e.g., when loading history) */
  setMessages: (messages: ChatMessage[]) => void
  /** Start streaming */
  startStreaming: () => void
  /** Stop streaming */
  stopStreaming: () => void
  /** Append streaming content */
  appendStreamContent: (content: string) => void
  /** Append streaming reasoning */
  appendStreamReasoning: (content: string) => void
  /** Set streaming tool calls (replaces the list) */
  setStreamingToolCalls: (toolCalls: ToolCall[]) => void
  /** Reset streaming state */
  resetStream: () => void
  /** Set selected model */
  setModel: (providerType: ProviderType, modelId: string, configId?: string) => void
  /** Set chat mode */
  setMode: (mode: ChatMode) => void
  /** Set temporary mode */
  setTemporary: (temporary: boolean) => void
  /** Set error */
  setError: (error: string | null) => void
  /** Remove a message by ID */
  removeMessage: (id: string) => void
  /** Clear all state */
  clear: () => void
  /** Set the abort controller for the current request */
  setAbortController: (controller: AbortController | null) => void
  /** Cancel the current streaming request */
  cancelStreaming: () => void
  /** Accumulate generation info during streaming */
  setStreamingGenerationInfo: (info: Record<string, unknown>) => void
  /** Set sources from pipeline for the assistant message */
  setStreamingSources: (sources: ChatMessage['sources']) => void
  /** Toggle agent mode */
  setAgentEnabled: (enabled: boolean) => void
  /** Set current agent iteration */
  setAgentIteration: (n: number) => void
  /** Set agent action info for UI */
  setAgentActionInfo: (info: AgentActionInfo | null) => void
  /** Set pending ask_user request */
  setPendingAskUser: (pending: { toolCallId: string; question: string; options?: string[] } | null) => void
  /** Add a selected element */
  addSelectedElement: (el: { agentId: string; tag: string; text?: string }) => void
  /** Remove a selected element by id */
  removeSelectedElement: (id: string) => void
  /** Clear all selected elements */
  clearSelectedElements: () => void
  /** Reorder selected elements by ID (for drag-and-drop) */
  reorderSelectedElements: (fromId: string, toId: string) => void
  /** Set hovered element reference number */
  setHoveredElementRef: (ref: number | null) => void
  /** Set continuous selection mode */
  setContinuousSelectMode: (enabled: boolean) => void
  /** Confirm continuous selection, add pending elements to selectedElements */
  confirmContinuousSelection: () => void
  /** Cancel continuous selection, clear pending elements */
  cancelContinuousSelection: () => void
  /** Add pending element during continuous selection */
  addPendingElement: (el: { agentId: string; tag: string; text?: string }) => void
  /** Remove pending element during continuous selection */
  removePendingElement: (agentId: string) => void
  /** Set element panel open/closed state */
  setElementPanelOpen: (open: boolean) => void
  /** Trigger element selection via keyboard shortcut */
  triggerSelectElement: () => void
  /** Set last agent run summary for task continuation */
  setLastAgentSummary: (summary: AgentRunSummary | null) => void
  /** Set agent task plan for UI display */
  setAgentPlan: (plan: AgentPlan | null) => void
  /** Add item to message queue */
  addToQueue: (item: QueueItem) => void
  /** Remove item from message queue */
  removeFromQueue: (id: string) => void
  /** Reorder queue item up or down */
  reorderQueue: (id: string, direction: 'up' | 'down') => void
  /** Toggle queue item mode between supplement and next_command */
  toggleQueueItemMode: (id: string) => void
  /** Clear all queue items */
  clearQueue: () => void
  /** Drain all supplement items from queue, return them, and remove from queue */
  drainSupplementQueue: () => QueueItem[]
  /** Set agent busy state */
  setAgentBusy: (busy: boolean) => void
  /** Set compressed conversation history summary (null to clear) */
  setCompressedHistorySummary: (summary: string | null) => void
  /** Set selected system prompt ID */
  setSelectedPromptId: (id: string | null) => void
}

const initialState = {
  historyId: null,
  messages: [],
  isStreaming: false,
  streamingContent: '',
  streamingReasoning: '',
  streamingToolCalls: [] as ToolCall[],
  providerType: 'ollama' as ProviderType,
  modelId: '',
  providerConfigId: null as string | null,
  mode: 'normal' as ChatMode,
  isTemporary: false,
  error: null,
  abortController: null as AbortController | null,
  streamingStartTime: null as number | null,
  streamingGenerationInfo: null as Record<string, unknown> | null,
  streamingSources: undefined as ChatMessage['sources'],
  agentEnabled: false,
  agentIteration: 0,
  agentActionInfo: null as AgentActionInfo | null,
  pendingAskUser: null as { toolCallId: string; question: string; options?: string[] } | null,
  selectedElements: [] as Array<{ id: string; agentId: string; tag: string; text?: string }>,
  selectElementTrigger: 0,
  hoveredElementRef: null as number | null,
  isContinuousSelectMode: false,
  pendingSelectedElements: [] as Array<{ agentId: string; tag: string; text?: string }>,
  elementPanelOpen: true,
  lastAgentSummary: null as AgentRunSummary | null,
  agentPlan: null as AgentPlan | null,
  messageQueue: [] as QueueItem[],
  isAgentBusy: false,
  compressedHistorySummary: null as string | null,
  selectedPromptId: null as string | null,
}

// ── Stream token batching ──
// Accumulate tokens in a buffer and flush to Zustand state at ~30fps
// to reduce re-renders during streaming.
let _contentBuffer = ''
let _reasoningBuffer = ''
let _flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL_MS = 32 // ~30fps

function flushBuffers(set: (fn: (state: ChatState) => Partial<ChatState>) => void) {
  const contentToFlush = _contentBuffer
  const reasoningToFlush = _reasoningBuffer
  _contentBuffer = ''
  _reasoningBuffer = ''

  if (!contentToFlush && !reasoningToFlush) return

  set((state) => ({
    streamingContent: state.streamingContent + contentToFlush,
    streamingReasoning: state.streamingReasoning + reasoningToFlush,
  }))

  _flushTimer = null
}

function scheduleFlush(set: (fn: (state: ChatState) => Partial<ChatState>) => void) {
  if (_flushTimer !== null) return
  _flushTimer = setTimeout(() => flushBuffers(set), FLUSH_INTERVAL_MS)
}

function flushImmediate(set: (fn: (state: ChatState) => Partial<ChatState>) => void) {
  if (_flushTimer !== null) {
    clearTimeout(_flushTimer)
    _flushTimer = null
  }
  flushBuffers(set)
}

/**
 * Synchronously flush any buffered stream tokens to the store.
 * Called internally by stopStreaming/cancelStreaming/resetStream.
 * Exported for test use.
 */
export function flushStreamBuffers(): void {
  flushImmediate(useChatStore.setState as unknown as (fn: (state: ChatState) => Partial<ChatState>) => void)
}

export const useChatStore = create<ChatState>((set) => ({
  ...initialState,

  newChat: () => {
    _contentBuffer = ''
    _reasoningBuffer = ''
    if (_flushTimer !== null) { clearTimeout(_flushTimer); _flushTimer = null }
    set({
      historyId: null,
      messages: [],
      isStreaming: false,
      streamingContent: '',
      streamingReasoning: '',
      streamingToolCalls: [],
      error: null,
      abortController: null,
      streamingStartTime: null,
      streamingGenerationInfo: null,
      streamingSources: undefined,
      agentIteration: 0,
      agentActionInfo: null,
      pendingAskUser: null,
      selectedElements: [],
      hoveredElementRef: null,
      isContinuousSelectMode: false,
      pendingSelectedElements: [],
      elementPanelOpen: true,
      lastAgentSummary: null,
      agentPlan: null,
      messageQueue: [],
      isAgentBusy: false,
      compressedHistorySummary: null,
      selectedPromptId: null,
    })
  },

  setHistoryId: (id) => set({ historyId: id, lastAgentSummary: null, compressedHistorySummary: null }),

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),

  updateMessage: (id, updates) => set((state) => ({
    messages: state.messages.map(m =>
      m.id === id ? { ...m, ...updates } : m
    ),
  })),

  setMessages: (messages) => set({ messages }),

  startStreaming: () => {
    _contentBuffer = ''
    _reasoningBuffer = ''
    if (_flushTimer !== null) { clearTimeout(_flushTimer); _flushTimer = null }
    set({
      isStreaming: true,
      streamingContent: '',
      streamingReasoning: '',
      streamingToolCalls: [],
      error: null,
      streamingStartTime: Date.now(),
      streamingGenerationInfo: null,
      streamingSources: undefined,
      agentIteration: 0,
      agentActionInfo: null,
    })
  },

  stopStreaming: () => {
    // Flush any remaining buffered tokens before finalizing
    flushImmediate(set)

    set((state) => {
    const responseTimeMs = state.streamingStartTime
      ? Date.now() - state.streamingStartTime
      : undefined

    const hasContent = !!state.streamingContent?.trim()
    const hasReasoning = !!state.streamingReasoning?.trim()
    const hasToolCalls = state.streamingToolCalls.length > 0

    // Skip creating assistant message if there's nothing to show
    if (!hasContent && !hasReasoning && !hasToolCalls) {
      return {
        isStreaming: false,
        messages: state.messages,
        streamingContent: '',
        streamingReasoning: '',
        streamingToolCalls: [],
        streamingStartTime: null,
        streamingGenerationInfo: null,
        streamingSources: undefined,
      }
    }

    // Build generationInfo with response time
    const genInfo: Record<string, unknown> = {
      ...(state.streamingGenerationInfo ?? {}),
    }
    if (responseTimeMs !== undefined) {
      genInfo._responseTimeMs = responseTimeMs
    }

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID?.() ?? Date.now().toString(),
      historyId: state.historyId ?? '',
      role: 'assistant',
      content: state.streamingContent,
      reasoningContent: state.streamingReasoning || undefined,
      toolCalls: hasToolCalls ? state.streamingToolCalls : undefined,
      messageKind: hasToolCalls ? 'assistant_tool_calls' as const : undefined,
      createdAt: Date.now(),
      modelName: state.modelId || undefined,
      generationInfo: Object.keys(genInfo).length > 0 ? genInfo : undefined,
      sources: state.streamingSources,
    }
    return {
      isStreaming: false,
      messages: [...state.messages, assistantMessage],
      streamingContent: '',
      streamingReasoning: '',
      streamingToolCalls: [],
      streamingStartTime: null,
      streamingGenerationInfo: null,
      streamingSources: undefined,
    }
  })
  },

  appendStreamContent: (content) => {
    _contentBuffer += content
    scheduleFlush(set)
  },

  appendStreamReasoning: (content) => {
    _reasoningBuffer += content
    scheduleFlush(set)
  },

  setStreamingToolCalls: (toolCalls) => set({ streamingToolCalls: toolCalls }),

  resetStream: () => {
    _contentBuffer = ''
    _reasoningBuffer = ''
    if (_flushTimer !== null) { clearTimeout(_flushTimer); _flushTimer = null }
    set({
      streamingContent: '',
      streamingReasoning: '',
      streamingToolCalls: [],
      isStreaming: false,
    })
  },

  setModel: (providerType, modelId, configId?) => set({ providerType, modelId, providerConfigId: configId ?? null }),

  setMode: (mode) => set({ mode }),

  setTemporary: (temporary) => set({ isTemporary: temporary }),

  setError: (error) => set({ error }),

  removeMessage: (id) => set((state) => ({
    messages: state.messages.filter(m => m.id !== id),
  })),

  setAbortController: (controller) => set({ abortController: controller }),

  cancelStreaming: () => {
    _contentBuffer = ''
    _reasoningBuffer = ''
    if (_flushTimer !== null) { clearTimeout(_flushTimer); _flushTimer = null }
    set((state) => {
      state.abortController?.abort()
      return {
        isStreaming: false,
        streamingContent: '',
        streamingReasoning: '',
        streamingToolCalls: [],
        abortController: null,
        streamingStartTime: null,
        streamingGenerationInfo: null,
        streamingSources: undefined,
        agentIteration: 0,
        agentActionInfo: null,
      }
    })
  },

  setStreamingGenerationInfo: (info) => set((state) => ({
    streamingGenerationInfo: { ...state.streamingGenerationInfo, ...info },
  })),

  setStreamingSources: (sources) => set({ streamingSources: sources }),

  setAgentEnabled: (enabled) => set({ agentEnabled: enabled }),

  setAgentIteration: (n) => set({ agentIteration: n }),

  setAgentActionInfo: (info) => set({ agentActionInfo: info }),

  setPendingAskUser: (pending) => set({ pendingAskUser: pending }),

  addSelectedElement: (el) => set((s) => ({
    selectedElements: [...s.selectedElements, { ...el, id: crypto.randomUUID() }],
  })),
  removeSelectedElement: (id) => set((s) => ({
    selectedElements: s.selectedElements.filter(e => e.id !== id),
  })),
  clearSelectedElements: () => set({ selectedElements: [] }),

  reorderSelectedElements: (fromId, toId) => set((state) => {
    const elements = [...state.selectedElements]
    const fromIdx = elements.findIndex(e => e.id === fromId)
    const toIdx = elements.findIndex(e => e.id === toId)
    if (fromIdx === -1 || toIdx === -1) return {}

    const [removed] = elements.splice(fromIdx, 1)
    elements.splice(toIdx, 0, removed)

    return { selectedElements: elements }
  }),

  setHoveredElementRef: (ref) => set({ hoveredElementRef: ref }),

  setContinuousSelectMode: (enabled) => set({
    isContinuousSelectMode: enabled,
    pendingSelectedElements: enabled ? [] : [],
  }),

  confirmContinuousSelection: () => set((state) => ({
    selectedElements: [
      ...state.selectedElements,
      ...state.pendingSelectedElements.map(el => ({
        ...el,
        id: crypto.randomUUID(),
      })),
    ],
    pendingSelectedElements: [],
    isContinuousSelectMode: false,
  })),

  cancelContinuousSelection: () => set({
    pendingSelectedElements: [],
    isContinuousSelectMode: false,
  }),

  addPendingElement: (el) => set((state) => ({
    pendingSelectedElements: [...state.pendingSelectedElements, el],
  })),

  removePendingElement: (agentId) => set((state) => ({
    pendingSelectedElements: state.pendingSelectedElements.filter(el => el.agentId !== agentId),
  })),

  setElementPanelOpen: (open) => set({ elementPanelOpen: open }),

  triggerSelectElement: () => set((s) => ({ selectElementTrigger: s.selectElementTrigger + 1 })),

  setLastAgentSummary: (summary) => set({ lastAgentSummary: summary }),

  setAgentPlan: (plan) => set({ agentPlan: plan }),

  addToQueue: (item) => set((state) => ({
    messageQueue: [...state.messageQueue, item],
  })),

  removeFromQueue: (id) => set((state) => ({
    messageQueue: state.messageQueue.filter(item => item.id !== id),
  })),

  reorderQueue: (id, direction) => set((state) => {
    const queue = [...state.messageQueue]
    const idx = queue.findIndex(item => item.id === id)
    if (idx === -1) return {}
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= queue.length) return {}
    const temp = queue[idx]
    queue[idx] = queue[swapIdx]
    queue[swapIdx] = temp
    return { messageQueue: queue }
  }),

  toggleQueueItemMode: (id) => set((state) => ({
    messageQueue: state.messageQueue.map(item =>
      item.id === id
        ? { ...item, mode: item.mode === 'supplement' ? 'next_command' as const : 'supplement' as const }
        : item
    ),
  })),

  clearQueue: () => set({ messageQueue: [] }),

  drainSupplementQueue: () => {
    let supplements: QueueItem[] = []
    set((state) => {
      supplements = state.messageQueue.filter(item => item.mode === 'supplement')
      return { messageQueue: state.messageQueue.filter(item => item.mode !== 'supplement') }
    })
    return supplements
  },

  setAgentBusy: (busy) => set({ isAgentBusy: busy }),

  setCompressedHistorySummary: (summary) => set({ compressedHistorySummary: summary }),

  setSelectedPromptId: (id) => set({ selectedPromptId: id }),

  clear: () => set(initialState),
}))

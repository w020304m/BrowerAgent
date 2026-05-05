/**
 * Unified stream processor.
 * Processes an AsyncGenerator<StreamChunk> from any provider,
 * accumulating state and calling callbacks.
 */

import type { StreamChunk, ChatResult, IChatProvider, ChatRequestOptions } from '@/providers/types'
import type { ChatMessage } from '@/types/message'
import type { ToolCall } from '@/types/tool'
import type { StreamCallbacks, StreamState } from './types'

/**
 * Process a stream from an IChatProvider, calling callbacks as chunks arrive.
 * Returns the accumulated ChatResult when the stream completes.
 */
export async function processStream(
  provider: IChatProvider,
  messages: ChatMessage[],
  options?: ChatRequestOptions,
  callbacks?: StreamCallbacks
): Promise<ChatResult> {
  const state: StreamState = {
    content: '',
    reasoningContent: '',
    toolCalls: [],
    generationInfo: {},
    isReasoning: false,
  }

  // Index-based tool call accumulator for proper partial arg handling
  const tcAccumulators = new Map<number, { id: string; name: string; argsBuffer: string }>()

  try {
    for await (const chunk of provider.streamChat(messages, options)) {
      if (options?.signal?.aborted) {
        break
      }
      processChunk(chunk, state, callbacks, tcAccumulators)
    }

    // Finalize accumulated tool calls from partial chunks
    finalizeToolCalls(state, tcAccumulators)

    const result: ChatResult = {
      content: state.content,
      reasoningContent: state.reasoningContent || undefined,
      toolCalls: state.toolCalls.length > 0 ? state.toolCalls : undefined,
      generationInfo: state.generationInfo,
      usageMetadata: state.usageMetadata,
    }

    // Diagnostic: log when stream produces empty result (no content, no tool calls)
    if (!state.content && state.toolCalls.length === 0) {
      console.warn(
        `[processStream] Empty stream result. ` +
        `provider=${(provider as unknown as { providerType?: string }).providerType ?? 'unknown'} ` +
        `reasoningLen=${state.reasoningContent.length} ` +
        `genInfo=${JSON.stringify(state.generationInfo)} ` +
        `tcAccumulators=${tcAccumulators.size}`,
      )
    }

    callbacks?.onComplete?.(result)
    return result
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    callbacks?.onError?.(error)
    throw error
  }
}

/**
 * Process a single StreamChunk, updating state and calling callbacks.
 */
export function processChunk(
  chunk: StreamChunk,
  state: StreamState,
  callbacks?: StreamCallbacks,
  tcAccumulators?: Map<number, { id: string; name: string; argsBuffer: string }>
): void {
  // Handle content
  if (chunk.content) {
    state.content += chunk.content
    callbacks?.onToken?.(chunk.content)
  }

  // Handle reasoning content
  if (chunk.reasoningContent) {
    state.reasoningContent += chunk.reasoningContent
    state.isReasoning = true
    callbacks?.onReasoningToken?.(chunk.reasoningContent)
  } else if (chunk.content && state.isReasoning) {
    // Reasoning ended when content starts
    state.isReasoning = false
  }

  // Handle tool call chunks — accumulate by index for proper partial args
  if (chunk.toolCallChunks && tcAccumulators) {
    for (const tc of chunk.toolCallChunks) {
      const idx = tc.index
      let acc = tcAccumulators.get(idx)
      if (!acc) {
        acc = { id: '', name: '', argsBuffer: '' }
        tcAccumulators.set(idx, acc)
      }
      if (tc.id) acc.id = tc.id
      if (tc.name) acc.name = tc.name
      acc.argsBuffer += tc.args
    }
  } else if (chunk.toolCallChunks) {
    // Fallback: no accumulator, use direct parsing (for non-agentic callers)
    for (const tc of chunk.toolCallChunks) {
      if (tc.name && tc.id) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.args) } catch { /* partial JSON */ }
        state.toolCalls.push({ id: tc.id, name: tc.name, args, type: 'tool_call' })
      }
    }
    if (state.toolCalls.length > 0) {
      callbacks?.onToolCalls?.(state.toolCalls)
    }
  }

  // Handle generation info
  if (chunk.generationInfo) {
    state.generationInfo = { ...state.generationInfo, ...chunk.generationInfo }
    callbacks?.onGenerationInfo?.(chunk.generationInfo)
  }

  // Handle usage metadata (from extended StreamChunk via OpenAI)
  if ('usageMetadata' in chunk && chunk.usageMetadata) {
    state.usageMetadata = chunk.usageMetadata as StreamState['usageMetadata']
  }
}

/**
 * Finalize accumulated tool calls from partial chunks.
 * Parses the complete argsBuffer for each tool call.
 */
function finalizeToolCalls(
  state: StreamState,
  tcAccumulators: Map<number, { id: string; name: string; argsBuffer: string }>
): void {
  if (tcAccumulators.size === 0) return

  const sorted = Array.from(tcAccumulators.entries()).sort(([a], [b]) => a - b)
  for (const [, acc] of sorted) {
    if (!acc.id || !acc.name) continue
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(acc.argsBuffer) } catch { /* fallback to empty */ }
    state.toolCalls.push({ id: acc.id, name: acc.name, args, type: 'tool_call' })
  }
}

/**
 * Create a mock AsyncGenerator<StreamChunk> from an array of chunks.
 */
export async function* createMockChunkStream(
  chunks: StreamChunk[]
): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk
  }
}

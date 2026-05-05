/**
 * Tool call chunk accumulator.
 * Collects partial tool call chunks from streaming into complete tool calls.
 * Shared between MCP chat service and main chat agentic loop.
 */

import type { ToolCallChunk, McpToolCall } from '@/types/tool'

/** Accumulator for streaming tool call chunks */
interface ToolCallAccumulator {
  id: string
  name: string
  argsBuffer: string
  index: number
}

/**
 * Accumulate tool call chunks from a stream into complete tool calls.
 * Handles partial JSON args by buffering and parsing at the end.
 */
export function accumulateToolCallChunks(
  chunks: ToolCallChunk[]
): McpToolCall[] {
  const accumulators = new Map<number, ToolCallAccumulator>()

  for (const chunk of chunks) {
    const idx = chunk.index
    let acc = accumulators.get(idx)

    if (!acc) {
      acc = {
        id: chunk.id ?? '',
        name: chunk.name ?? '',
        argsBuffer: '',
        index: idx,
      }
      accumulators.set(idx, acc)
    }

    if (chunk.id) acc.id = chunk.id
    if (chunk.name) acc.name = chunk.name
    acc.argsBuffer += chunk.args
  }

  const results: McpToolCall[] = []

  for (const acc of accumulators.values()) {
    if (!acc.id || !acc.name) continue

    let parsedArgs: Record<string, unknown>
    try {
      parsedArgs = acc.argsBuffer ? JSON.parse(acc.argsBuffer) : {}
    } catch {
      parsedArgs = {}
    }

    const parsed = acc.name.includes('__')
      ? acc.name.split('__')
      : [null, acc.name]

    results.push({
      id: acc.id,
      name: acc.name,
      args: parsedArgs,
      type: 'tool_call',
      serverName: parsed.length > 1 ? parsed[0]! : '',
    })
  }

  return results
}

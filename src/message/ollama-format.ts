/**
 * Ollama message format converter.
 * Converts internal ChatMessage[] to Ollama API format.
 *
 * Reference: ChatOllama.ts lines 412-487
 */

import type { ChatMessage, ToolCall } from '@/types/message'

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  images?: string[]
  tool_calls?: Array<{
    function: {
      name: string
      arguments: Record<string, unknown>
    }
  }>
  name?: string
}

/**
 * Convert ChatMessage[] to Ollama API message format.
 */
export function toOllamaMessages(messages: ChatMessage[]): OllamaMessage[] {
  return messages.map((msg, idx) => {
    // Tool messages — must include tool name for Ollama to associate with the preceding tool_call
    if (msg.role === 'tool') {
      // Find the tool name from the preceding assistant message's toolCalls
      const toolName = findToolNameForToolResult(messages, idx, msg.toolCallId)
      return {
        role: 'tool' as const,
        content: msg.content,
        ...(toolName ? { name: toolName } : {}),
      }
    }

    // AI messages with tool calls
    // Ollama standard: assistant messages with tool_calls should have content="".
    // Including thinking text as content confuses many models — they treat the
    // tool result as a user message instead of a tool response.
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant' as const,
        content: '',
        tool_calls: msg.toolCalls.map((tc: ToolCall) => ({
          function: {
            name: tc.name,
            arguments: tc.args,
          },
        })),
      }
    }

    // Standard messages with optional images
    const images: string[] = []

    // Extract images from contentParts
    if (msg.contentParts) {
      for (const part of msg.contentParts) {
        if (part.type === 'image_url' && typeof part.image_url === 'string') {
          // Extract base64 from data URL: "data:image/jpeg;base64,<data>"
          const components = part.image_url.split(',')
          images.push(components[1] ?? components[0])
        }
      }
    }

    // Also include images from the legacy images field
    if (msg.images) {
      for (const imgUrl of msg.images) {
        const components = imgUrl.split(',')
        images.push(components[1] ?? components[0])
      }
    }

    return {
      role: msg.role as OllamaMessage['role'],
      content: msg.content,
      ...(images.length > 0 ? { images } : {}),
    }
  })
}

/**
 * Find the tool name for a tool result message by looking back at the
 * preceding assistant message's toolCalls and matching by toolCallId.
 */
function findToolNameForToolResult(
  messages: ChatMessage[],
  toolMsgIdx: number,
  toolCallId?: string,
): string | undefined {
  // Walk backwards to find the assistant message with tool_calls
  for (let i = toolMsgIdx - 1; i >= 0; i--) {
    const prev = messages[i]
    if (prev.role === 'assistant' && prev.toolCalls) {
      if (toolCallId) {
        const match = prev.toolCalls.find((tc: ToolCall) => tc.id === toolCallId)
        if (match) return match.name
      }
      // Fallback: return the first tool call's name
      if (prev.toolCalls.length > 0) return prev.toolCalls[0].name
    }
  }
  return undefined
}

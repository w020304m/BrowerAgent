/**
 * OpenAI-compatible message format converter.
 * Converts internal ChatMessage[] to OpenAI Chat API format.
 * Also used by OpenRouter, Gemini (OpenAI-compatible), and custom providers.
 *
 * Reference: CustomChatOpenAI.ts lines 182-234
 */

import type { ChatMessage, ToolCall } from '@/types/message'

export interface OpenAIChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string // JSON string
    }
  }>
  tool_call_id?: string
}

/**
 * Convert ChatMessage[] to OpenAI Chat API message format.
 */
export function toOpenAIMessages(messages: ChatMessage[]): OpenAIChatMessage[] {
  return messages.map(msg => {
    // Tool result messages
    if (msg.role === 'tool') {
      return {
        role: 'tool' as const,
        content: msg.content,
        tool_call_id: msg.toolCallId ?? '',
      }
    }

    // AI messages with tool calls
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant' as const,
        content: msg.content || '',
        tool_calls: msg.toolCalls.map((tc: ToolCall) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args),
          },
        })),
      }
    }

    // Multimodal content (text + images)
    const hasImages = (msg.contentParts && msg.contentParts.some(p => p.type === 'image_url'))
      || (msg.images && msg.images.length > 0)

    if (hasImages) {
      const parts: OpenAIChatMessage['content'] = []

      if (msg.content) {
        parts.push({ type: 'text', text: msg.content })
      }

      if (msg.contentParts) {
        for (const part of msg.contentParts) {
          if (part.type === 'image_url') {
            parts.push({
              type: 'image_url',
              image_url: { url: part.image_url },
            })
          }
        }
      }

      if (msg.images) {
        for (const url of msg.images) {
          parts.push({
            type: 'image_url',
            image_url: { url },
          })
        }
      }

      return {
        role: msg.role as OpenAIChatMessage['role'],
        content: parts,
      }
    }

    // Plain text message
    return {
      role: msg.role as OpenAIChatMessage['role'],
      content: msg.content,
    }
  })
}

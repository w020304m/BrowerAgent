/**
 * Anthropic message format converter.
 * Converts internal ChatMessage[] to Anthropic Messages API format.
 *
 * Key differences from OpenAI:
 * - System prompt is extracted to a separate top-level field
 * - Tool results are wrapped in a user message
 * - Images use source blocks with base64 data
 *
 * Reference: CustomChatAnthropic.ts lines 79-203
 */

import type { ChatMessage, ToolCall } from '@/types/message'

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: {
        type: 'base64'
        media_type: string
        data: string
      }
    }
  | {
      type: 'tool_use'
      id: string
      name: string
      input: Record<string, unknown>
    }
  | {
      type: 'tool_result'
      tool_use_id: string
      content: string
      is_error?: boolean
    }

export interface AnthropicFormattedMessages {
  system: string
  messages: AnthropicMessage[]
}

/**
 * Convert ChatMessage[] to Anthropic Messages API format.
 */
export function toAnthropicMessages(
  messages: ChatMessage[]
): AnthropicFormattedMessages {
  let systemPrompt = ''
  const anthropicMessages: AnthropicMessage[] = []

  for (const msg of messages) {
    // Extract system prompt
    if (msg.role === 'system') {
      systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content
      continue
    }

    // Tool result messages → wrap in user message as tool_result block
    if (msg.role === 'tool') {
      anthropicMessages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.toolCallId ?? '',
          content: msg.content,
          ...(msg.toolError ? { is_error: true } : {}),
        }],
      })
      continue
    }

    // AI messages with tool calls → tool_use blocks
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const blocks: AnthropicContentBlock[] = []

      if (msg.content) {
        blocks.push({ type: 'text', text: msg.content })
      }

      for (const tc of msg.toolCalls) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args,
        })
      }

      anthropicMessages.push({
        role: 'assistant',
        content: blocks,
      })
      continue
    }

    // Multimodal content (text + images)
    const hasImages = (msg.contentParts && msg.contentParts.some(p => p.type === 'image_url'))
      || (msg.images && msg.images.length > 0)

    if (hasImages) {
      const blocks: AnthropicContentBlock[] = []

      if (msg.content) {
        blocks.push({ type: 'text', text: msg.content })
      }

      const allImages: string[] = [
        ...(msg.contentParts?.filter((p): p is { type: 'image_url'; image_url: string } => p.type === 'image_url').map(p => p.image_url) ?? []),
        ...(msg.images ?? []),
      ]

      for (const imageUrl of allImages) {
        // Parse data URL: "data:image/png;base64,<data>"
        const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
        if (matches) {
          blocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: matches[1],
              data: matches[2],
            },
          })
        }
      }

      anthropicMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: blocks,
      })
      continue
    }

    // Plain text message
    anthropicMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })
  }

  // Merge consecutive tool_result user messages
  const merged = mergeToolResultMessages(anthropicMessages)

  return {
    system: systemPrompt,
    messages: merged,
  }
}

/**
 * Merge consecutive user messages that contain tool_result blocks.
 * Anthropic requires all tool_results from a single turn to be in one user message.
 */
function mergeToolResultMessages(
  messages: AnthropicMessage[]
): AnthropicMessage[] {
  const result: AnthropicMessage[] = []

  for (const msg of messages) {
    const last = result[result.length - 1]
    if (
      last
      && last.role === 'user'
      && msg.role === 'user'
      && Array.isArray(last.content)
      && Array.isArray(msg.content)
      && last.content.some(b => b.type === 'tool_result')
      && msg.content.some(b => b.type === 'tool_result')
    ) {
      // Merge tool result blocks into the previous user message
      last.content = [...last.content, ...msg.content]
    } else {
      result.push(msg)
    }
  }

  return result
}

/**
 * Detect media type from base64 data URL.
 */
export function detectMediaType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);/)
  return match ? match[1] : 'image/png'
}

/**
 * Vision message builder.
 * Constructs multimodal ChatMessage objects with text and image content.
 */

import type { ChatMessage, ContentPart } from '@/types/message'
import { generateId } from '@/types/common'

export interface VisionMessageParams {
  /** Text content of the message */
  content: string
  /** Base64 data URLs of images */
  images: string[]
  /** History ID for the message */
  historyId: string
}

/**
 * Build a multimodal ChatMessage with text and images.
 * Sets both `contentParts` (structured) and `images` (legacy) for compatibility.
 */
export function buildVisionMessage(params: VisionMessageParams): ChatMessage {
  const contentParts: ContentPart[] = []

  if (params.content) {
    contentParts.push({ type: 'text', text: params.content })
  }

  for (const imageUrl of params.images) {
    contentParts.push({ type: 'image_url', image_url: imageUrl })
  }

  return {
    id: generateId(),
    historyId: params.historyId,
    role: 'user',
    content: params.content,
    contentParts: contentParts.length > 0 ? contentParts : undefined,
    images: params.images.length > 0 ? params.images : undefined,
    createdAt: Date.now(),
  }
}

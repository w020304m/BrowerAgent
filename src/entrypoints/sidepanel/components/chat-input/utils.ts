/**
 * Utility functions for ChatInput components
 */

import type { ChatMessage } from '@/types/message'
import type { ProviderType } from '@/types/provider'
import { ollamaSettings } from '@/storage/ollama-settings'
import { openaiConfigRepo } from '@/db/repositories/openai-config.repository'
import { createChatProvider } from '@/providers/factory'
import { generateId } from '@/types/common'

/**
 * Convert file to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
  })
}

/**
 * Check if the given model likely supports vision (multimodal input)
 *
 * Strategy:
 * 1. chrome-ai → never (Gemini Nano is text-only, no multimodal API)
 * 2. Known vision-capable model name patterns → yes
 * 3. Everything else → no (conservative: reject rather than waste an API call)
 */
export function isLikelyVisionModel(providerType: ProviderType, modelId: string): boolean {
  if (providerType === 'chrome-ai') return false

  const lower = modelId.toLowerCase()

  // Known vision-capable model families / patterns
  const visionPatterns = [
    // OpenAI
    'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision', 'gpt-4.1', 'o1-', 'o3-', 'o4-',
    // Anthropic — all Claude 3+ support vision
    'claude-3', 'claude-4', 'claude-sonnet', 'claude-opus', 'claude-haiku',
    // Google Gemini — all Gemini Pro/Flash/Ultra support vision
    'gemini',
    // Ollama vision models (llava family, bakllava, moondream, etc.)
    'llava', 'bakllava', 'moondream', 'minicpm-v', 'granite-vision',
    // Qwen-VL
    'qwen-vl', 'qwen2-vl', 'qwq',
    // Misc
    'cogvlm', 'internvl', 'phi-3.5-vision', 'pixtral',
    // Llama 3.2 vision
    'llama-3.2-11b', 'llama-3.2-90b', 'llama3.2-11b', 'llama3.2-90b',
    // Mistral Pixtral
    'pixtral',
  ]

  return visionPatterns.some(p => lower.includes(p))
}

/**
 * Extract text from image using OCR
 */
export async function extractTextFromImage(
  file: File,
  providerType: ProviderType,
  modelId: string,
  providerConfigId: string | null
): Promise<{ text?: string; error?: string }> {
  try {
    // Check if model supports vision
    if (!isLikelyVisionModel(providerType, modelId)) {
      return { error: 'OCR Image - This model does not support vision.' }
    }

    // Get provider config
    let baseUrl: string | undefined
    let apiKey: string | undefined
    let headers: Record<string, string> | undefined

    if (providerType === 'ollama') {
      baseUrl = await ollamaSettings.getOllamaURL()
      headers = await ollamaSettings.getCustomHeadersMap()
    } else {
      const configs = await openaiConfigRepo.getAll()
      const config = providerConfigId
        ? configs.find(c => c.id === providerConfigId)
        : configs.find(c => c.provider === providerType)
      baseUrl = config?.baseUrl
      apiKey = config?.apiKey || undefined
      headers = config?.headers || undefined
    }

    if (!baseUrl) {
      return { error: 'OCR Image - Failed to get provider configuration.' }
    }

    const base64 = await fileToBase64(file)
    const provider = createChatProvider({
      provider: providerType,
      model: modelId,
      baseUrl,
      apiKey,
      headers,
      params: {},
    })

    const ocrMessages: ChatMessage[] = [
      {
        id: generateId(),
        historyId: '',
        role: 'user',
        content: 'Extract all text from this image. Output only the extracted text, preserving the original structure and formatting.',
        images: [base64],
        createdAt: Date.now(),
      },
    ]

    const result = await provider.chat(ocrMessages)
    const text = result.content?.trim()
    if (!text) {
      return { error: 'OCR Image - No text was extracted from the image.' }
    }

    return { text }
  } catch {
    return { error: 'OCR Image - Failed to process image.' }
  }
}

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

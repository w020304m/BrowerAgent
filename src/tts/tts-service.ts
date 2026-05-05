/**
 * TTS Service.
 * Orchestrates TTS playback: reads settings, splits text, delegates to provider.
 */

import { removeReasoning } from '@/stream/reasoning'
import { ttsSettings } from '@/storage/tts-settings'
import { BrowserTTSProvider } from './browser-tts-provider'
import { ElevenLabsTTSProvider } from './elevenlabs-tts-provider'
import { OpenAITTSProvider } from './openai-tts-provider'
import type { ITTSProvider } from './provider'
import type { TTSPlaybackCallbacks, ResponseSplitting } from './types'

export class TTSService {
  private currentProvider: ITTSProvider | null = null

  /**
   * Speak the given text using the configured TTS provider.
   * Text is optionally cleaned (reasoning tag removal) and split into segments.
   */
  async speak(fullText: string, callbacks?: TTSPlaybackCallbacks): Promise<void> {
    const settings = await ttsSettings.getAll()

    // Clean reasoning tags if configured
    let text = fullText
    if (settings.removeReasoningTag) {
      text = removeReasoning(text)
    }

    // Split text into segments
    const segments = splitText(text, settings.responseSplitting as ResponseSplitting)

    if (segments.length === 0) {
      callbacks?.onComplete?.()
      return
    }

    // Create provider from settings
    this.currentProvider = TTSService.createProviderFromSettings(settings)

    try {
      for (let i = 0; i < segments.length; i++) {
        if (this.currentProvider.getState() === 'idle' && i > 0) {
          // stopped externally
          break
        }

        callbacks?.onProgress?.(i, segments.length)

        await this.currentProvider.speak(segments[i], {
          voice: settings.voice,
          speed: settings.playbackSpeed,
          onStateChange: callbacks?.onStateChange,
        })
      }
      callbacks?.onComplete?.()
    } catch (error) {
      callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)))
    }
  }

  stop(): void {
    this.currentProvider?.stop()
  }

  pause(): void {
    this.currentProvider?.pause()
  }

  resume(): void {
    this.currentProvider?.resume()
  }

  dispose(): void {
    this.currentProvider?.dispose()
    this.currentProvider = null
  }

  /**
   * Create a provider with explicit settings.
   */
  static createProviderFromSettings(settings: {
    provider: string
    elevenLabsApiKey: string
    elevenLabsVoiceId: string
    elevenLabsModel: string
    openAITTSBaseUrl: string
    openAITTSApiKey: string
    openAITTSModel: string
    openAITTSVoice: string
  }): ITTSProvider {
    switch (settings.provider) {
      case 'elevenlabs':
        return new ElevenLabsTTSProvider(
          settings.elevenLabsApiKey,
          settings.elevenLabsVoiceId,
          settings.elevenLabsModel,
        )
      case 'openai':
        return new OpenAITTSProvider(
          settings.openAITTSBaseUrl,
          settings.openAITTSApiKey,
          settings.openAITTSModel,
          settings.openAITTSVoice,
        )
      case 'browser':
      default:
        return new BrowserTTSProvider()
    }
  }
}

// ==========================================
// Text splitting utilities
// ==========================================

/**
 * Split text into segments based on the splitting strategy.
 */
export function splitText(text: string, strategy: ResponseSplitting): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  switch (strategy) {
    case 'paragraph':
      return splitByParagraph(trimmed)
    case 'sentence':
      return splitBySentence(trimmed)
    case 'punctuation':
    default:
      return splitByPunctuation(trimmed)
  }
}

/**
 * Split text at punctuation marks (., !, ?) with a minimum chunk size.
 */
export function splitByPunctuation(text: string): string[] {
  const chunks: string[] = []
  let current = ''

  for (let i = 0; i < text.length; i++) {
    current += text[i]
    if ('.!?'.includes(text[i]) && current.length >= 50) {
      chunks.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks.filter(Boolean)
}

/**
 * Split text into sentences.
 */
export function splitBySentence(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g)
  if (!sentences) return [text]
  return sentences.map(s => s.trim()).filter(Boolean)
}

/**
 * Split text into paragraphs (double newlines).
 */
export function splitByParagraph(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
}

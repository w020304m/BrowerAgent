/**
 * TTS provider interface.
 * All TTS providers (Browser, ElevenLabs, OpenAI) implement this.
 */

import type { TTSVoice, TTSPlaybackState } from './types'

export interface ITTSProvider {
  readonly providerType: string
  getVoices(): Promise<TTSVoice[]>
  speak(text: string, options: {
    voice?: string
    speed?: number
    onStateChange?: (state: TTSPlaybackState) => void
  }): Promise<void>
  stop(): void
  pause(): void
  resume(): void
  getState(): TTSPlaybackState
  dispose(): void
}

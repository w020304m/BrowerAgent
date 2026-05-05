/**
 * TTS (Text-to-Speech) type definitions.
 */

export type TTSProviderType = 'browser' | 'elevenlabs' | 'openai'
export type TTSPlaybackState = 'idle' | 'playing' | 'paused' | 'loading'
export type ResponseSplitting = 'punctuation' | 'sentence' | 'paragraph'

export interface TTSVoice {
  id: string
  name: string
  lang?: string
}

export interface TTSPlaybackCallbacks {
  onStateChange?: (state: TTSPlaybackState) => void
  onProgress?: (segmentIndex: number, totalSegments: number) => void
  onError?: (error: Error) => void
  onComplete?: () => void
}

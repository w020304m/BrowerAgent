/**
 * OpenAI TTS provider.
 * Uses OpenAI-compatible /audio/speech endpoint, plays audio via AudioContext.
 */

import type { ITTSProvider } from './provider'
import type { TTSVoice, TTSPlaybackState } from './types'

export class OpenAITTSProvider implements ITTSProvider {
  readonly providerType = 'openai'
  private state: TTSPlaybackState = 'idle'
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private aborted = false

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
    private defaultVoice: string,
  ) {}

  async getVoices(): Promise<TTSVoice[]> {
    // OpenAI does not have a voices list endpoint.
    // Return common preset voices.
    return [
      { id: 'alloy', name: 'Alloy' },
      { id: 'echo', name: 'Echo' },
      { id: 'fable', name: 'Fable' },
      { id: 'onyx', name: 'Onyx' },
      { id: 'nova', name: 'Nova' },
      { id: 'shimmer', name: 'Shimmer' },
    ]
  }

  async speak(text: string, options: {
    voice?: string
    speed?: number
    onStateChange?: (state: TTSPlaybackState) => void
  } = {}): Promise<void> {
    this.aborted = false
    this.setState('loading', options.onStateChange)

    const voice = options.voice || this.defaultVoice
    const url = `${this.baseUrl}/audio/speech`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          voice,
          input: text,
          speed: options.speed ?? 1.0,
        }),
      })

      if (!response.ok) {
        throw new Error(`OpenAI TTS error: ${response.status}`)
      }

      if (this.aborted) return

      const arrayBuffer = await response.arrayBuffer()
      if (this.aborted) return

      this.setState('playing', options.onStateChange)
      await this.playAudio(arrayBuffer)
      this.setState('idle', options.onStateChange)
    } catch (error) {
      this.setState('idle', options.onStateChange)
      throw error
    }
  }

  stop(): void {
    this.aborted = true
    if (this.currentSource) {
      try {
        this.currentSource.stop()
      } catch {
        // Source may already be stopped
      }
      this.currentSource = null
    }
    this.state = 'idle'
  }

  pause(): void {
    this.audioContext?.suspend()
    this.state = 'paused'
  }

  resume(): void {
    this.audioContext?.resume()
    this.state = 'playing'
  }

  getState(): TTSPlaybackState {
    return this.state
  }

  dispose(): void {
    this.stop()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }

  private async playAudio(arrayBuffer: ArrayBuffer): Promise<void> {
    this.audioContext = this.audioContext ?? new AudioContext()
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
    const source = this.audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.audioContext.destination)
    this.currentSource = source

    return new Promise((resolve, reject) => {
      source.onended = () => {
        this.currentSource = null
        resolve()
      }
      source.addEventListener('error', () => {
        this.currentSource = null
        reject(new Error('Audio playback error'))
      })
      source.start()
    })
  }

  private setState(state: TTSPlaybackState, callback?: (state: TTSPlaybackState) => void): void {
    this.state = state
    callback?.(state)
  }
}

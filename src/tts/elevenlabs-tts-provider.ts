/**
 * ElevenLabs TTS provider.
 * Uses ElevenLabs API for speech synthesis, plays audio via AudioContext.
 */

import type { ITTSProvider } from './provider'
import type { TTSVoice, TTSPlaybackState } from './types'

export class ElevenLabsTTSProvider implements ITTSProvider {
  readonly providerType = 'elevenlabs'
  private state: TTSPlaybackState = 'idle'
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private aborted = false

  constructor(
    private apiKey: string,
    private voiceId: string,
    private model: string,
  ) {}

  async getVoices(): Promise<TTSVoice[]> {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': this.apiKey,
      },
    })
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`)
    }
    const data = await response.json() as { voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> }
    return (data.voices ?? []).map((v) => ({
      id: v.voice_id,
      name: v.name,
    }))
  }

  async speak(text: string, options: {
    voice?: string
    speed?: number
    onStateChange?: (state: TTSPlaybackState) => void
  } = {}): Promise<void> {
    this.aborted = false
    this.setState('loading', options.onStateChange)

    const voiceId = options.voice || this.voiceId
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: this.model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`ElevenLabs TTS error: ${response.status}`)
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
    // AudioContext suspend
    this.audioContext?.suspend()
    this.state = 'paused'
  }

  resume(): void {
    // AudioContext resume
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

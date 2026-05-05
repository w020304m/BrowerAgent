/**
 * Browser built-in TTS provider.
 * Uses chrome.tts API for speech synthesis.
 * Pause/resume are not supported by chrome.tts.
 */

import type { ITTSProvider } from './provider'
import type { TTSVoice, TTSPlaybackState } from './types'

export class BrowserTTSProvider implements ITTSProvider {
  readonly providerType = 'browser'
  private state: TTSPlaybackState = 'idle'

  async getVoices(): Promise<TTSVoice[]> {
    return new Promise((resolve) => {
      chrome.tts.getVoices((voices) => {
        const mapped: TTSVoice[] = voices
          .filter((v): v is chrome.tts.TtsVoice & { voiceName: string } => !!v.voiceName)
          .map((v) => ({
            id: v.voiceName,
            name: v.voiceName,
            lang: v.lang ?? undefined,
          }))
        resolve(mapped)
      })
    })
  }

  async speak(text: string, options: {
    voice?: string
    speed?: number
    onStateChange?: (state: TTSPlaybackState) => void
  } = {}): Promise<void> {
    this.setState('playing', options.onStateChange)

    return new Promise((resolve, reject) => {
      chrome.tts.speak(text, {
        voiceName: options.voice,
        rate: options.speed ?? 1.0,
        onEvent: (event) => {
          if (event.type === 'end') {
            this.setState('idle', options.onStateChange)
            resolve()
          } else if (event.type === 'error') {
            this.setState('idle', options.onStateChange)
            reject(new Error(event.errorMessage))
          } else if (event.type === 'interrupted') {
            this.setState('idle', options.onStateChange)
            resolve()
          }
        },
      })
    })
  }

  stop(): void {
    chrome.tts.stop()
    this.state = 'idle'
  }

  /** chrome.tts does not support pause */
  pause(): void {
    // no-op
  }

  /** chrome.tts does not support resume */
  resume(): void {
    // no-op
  }

  getState(): TTSPlaybackState {
    return this.state
  }

  dispose(): void {
    this.stop()
  }

  private setState(state: TTSPlaybackState, callback?: (state: TTSPlaybackState) => void): void {
    this.state = state
    callback?.(state)
  }
}

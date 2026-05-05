/**
 * useTTS hook.
 * Manages TTS playback for chat messages.
 */

import { useState, useCallback, useRef } from 'react'
import { TTSService } from '@/tts/tts-service'
import type { TTSPlaybackState } from '@/tts/types'

export function useTTS() {
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null)
  const [ttsState, setTtsState] = useState<TTSPlaybackState>('idle')
  const ttsServiceRef = useRef<TTSService | null>(null)

  const getService = useCallback(() => {
    if (!ttsServiceRef.current) {
      ttsServiceRef.current = new TTSService()
    }
    return ttsServiceRef.current
  }, [])

  const speak = useCallback(async (messageId: string, text: string) => {
    // Stop any current playback
    const service = getService()
    service.stop()

    setPlayingMessageId(messageId)
    setTtsState('loading')

    await service.speak(text, {
      onStateChange: (state) => {
        setTtsState(state)
      },
      onComplete: () => {
        setPlayingMessageId(null)
        setTtsState('idle')
      },
      onError: () => {
        setPlayingMessageId(null)
        setTtsState('idle')
      },
    })
  }, [getService])

  const stop = useCallback(() => {
    const service = getService()
    service.stop()
    setPlayingMessageId(null)
    setTtsState('idle')
  }, [getService])

  return {
    playingMessageId,
    ttsState,
    speak,
    stop,
  }
}

/**
 * useSpeechRecognition hook — wraps the Web Speech API for voice-to-text.
 *
 * Provides:
 * - isListening: whether recognition is active
 * - transcript: the accumulated recognized text
 * - isSupported: whether the browser supports speech recognition
 * - error: last error message if any
 * - startListening(): start recognition
 * - stopListening(): stop recognition
 * - resetTranscript(): clear accumulated transcript
 */

import { useState, useRef, useCallback, useEffect } from 'react'

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent {
  error: string
  message?: string
}

interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const isSupported = typeof window !== 'undefined' && (
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  )

  const getRecognition = useCallback((): SpeechRecognitionInstance | null => {
    if (!isSupported) return null

    const SpeechRecognition = (
      (window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    ) as SpeechRecognitionConstructor | undefined

    if (!SpeechRecognition) return null

    const instance = new SpeechRecognition()
    instance.continuous = false
    instance.interimResults = true
    instance.lang = ''

    instance.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }

      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript)
      }
      // Interim results are shown temporarily via isListening state
    }

    instance.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'no-speech') {
        setError(event.error)
      }
      setIsListening(false)
    }

    instance.onend = () => {
      setIsListening(false)
    }

    return instance
  }, [isSupported])

  const startListening = useCallback(() => {
    if (!isSupported) return

    // Stop previous recognition if any
    if (recognitionRef.current) {
      recognitionRef.current.abort()
    }

    const recognition = getRecognition()
    if (!recognition) return

    recognitionRef.current = recognition
    setError(null)
    setIsListening(true)
    recognition.start()
  }, [isSupported, getRecognition])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  const resetTranscript = useCallback(() => {
    setTranscript('')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [])

  return {
    isListening,
    transcript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  }
}

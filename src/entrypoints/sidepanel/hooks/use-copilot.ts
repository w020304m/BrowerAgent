/**
 * useCopilotBroadcast hook.
 * Listens for broadcast messages from the background script
 * and handles copilot actions (YouTube summarize, selection-based copilot).
 */

import { useEffect, useRef, useCallback } from 'react'
import { onBroadcast } from '@/ipc/client'
import type { IpcBroadcast } from '@/ipc/types'
import type { CopilotType } from '@/types/chat'
import { useChatStore } from '@/store/chat-store'
import { getPrompt } from '@/services/copilot-service'

const COPILOT_TYPES: CopilotType[] = ['summary', 'rephrase', 'translate', 'explain', 'custom']

interface UseCopilotBroadcastOptions {
  onYoutubeSummarize?: (title: string, url: string) => void
}

export function useCopilotBroadcast(options?: UseCopilotBroadcastOptions): void {
  const addMessage = useChatStore((s) => s.addMessage)
  const newChat = useChatStore((s) => s.newChat)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const handleCopilotMessage = useCallback(
    async (message: IpcBroadcast) => {
      if (message.type === 'yt_summarize') {
        const broadcastMsg = message as IpcBroadcast & { url?: string }
        if (optionsRef.current?.onYoutubeSummarize) {
          optionsRef.current.onYoutubeSummarize(message.text, broadcastMsg.url ?? '')
        } else {
          newChat()
          const promptText = `Please summarize this YouTube video: "${message.text}"${broadcastMsg.url ? `\n\nURL: ${broadcastMsg.url}` : ''}`
          addMessage({
            id: crypto.randomUUID?.() ?? Date.now().toString(),
            historyId: '',
            role: 'user',
            content: promptText,
            createdAt: Date.now(),
          })
        }
        return
      }

      // Handle built-in copilot types
      if (COPILOT_TYPES.includes(message.type as CopilotType)) {
        const prompt = await getPrompt(message.type as CopilotType)
        const userText = prompt.replace('{text}', message.text)
        newChat()
        addMessage({
          id: crypto.randomUUID?.() ?? Date.now().toString(),
          historyId: '',
          role: 'user',
          content: userText,
          createdAt: Date.now(),
        })
        return
      }

      // Handle custom copilot prompts (type: "custom_copilot_{id}")
      if (typeof message.type === 'string' && message.type.startsWith('custom_copilot_')) {
        const prompt = await getPrompt(message.type)
        if (prompt) {
          const userText = prompt.replace('{text}', message.text)
          newChat()
          addMessage({
            id: crypto.randomUUID?.() ?? Date.now().toString(),
            historyId: '',
            role: 'user',
            content: userText,
            createdAt: Date.now(),
          })
        }
      }
    },
    [addMessage, newChat]
  )

  useEffect(() => {
    const unsubscribe = onBroadcast(handleCopilotMessage)
    return unsubscribe
  }, [handleCopilotMessage])
}

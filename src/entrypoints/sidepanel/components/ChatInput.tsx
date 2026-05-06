import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat-store'
import { useChatService, compactAgent, isAgentRunning, compressHistory } from './chat-service'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { QueueItem } from '@/types/chat'
import type { ChatMessage } from '@/types/message'
import { syncStorageService } from '@/storage/index'
import { generateId } from '@/types/common'
import { useSpeechRecognition } from '../hooks/use-speech-recognition'
import { ollamaSettings } from '@/storage/ollama-settings'
import { openaiConfigRepo } from '@/db/repositories/openai-config.repository'
import { createChatProvider } from '@/providers/factory'
import type { ProviderType } from '@/types/provider'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
  })
}

export function ChatInput() {
  const [input, setInput] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [compressing, setCompressing] = useState(false)
  const [isSelectingElement, setIsSelectingElement] = useState(false)
  const [showExtraButtons, setShowExtraButtons] = useState(false)
  const isStreaming = useChatStore(s => s.isStreaming)
  const isTemporary = useChatStore(s => s.isTemporary)
  const agentEnabled = useChatStore(s => s.agentEnabled)
  const error = useChatStore(s => s.error)
  const isAgentBusy = useChatStore(s => s.isAgentBusy)
  const messageQueue = useChatStore(s => s.messageQueue)
  const messages = useChatStore(s => s.messages)
  const selectedElementRef = useChatStore(s => s.selectedElementRef)
  const setSelectedElementRef = useChatStore(s => s.setSelectedElementRef)
  const removeFromQueue = useChatStore(s => s.removeFromQueue)
  const reorderQueue = useChatStore(s => s.reorderQueue)
  const toggleQueueItemMode = useChatStore(s => s.toggleQueueItemMode)
  const { sendMessage } = useChatService()
  const { t } = useTranslation(['sidepanel', 'common'])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ocrFileInputRef = useRef<HTMLInputElement>(null)
  const sendOnEnterRef = useRef(true)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debug: log when selectedElementRef changes
  useEffect(() => {
    console.log('[ChatInput] selectedElementRef changed:', selectedElementRef)
  }, [selectedElementRef])

  // Voice recognition
  const { isListening, transcript, isSupported: voiceSupported, startListening, stopListening, resetTranscript } = useSpeechRecognition()
  const [ocrProcessing, setOcrProcessing] = useState(false)

  // Load sendOnEnter preference once
  useEffect(() => {
    syncStorageService.get<boolean>('sendWhenEnter', true).then(v => { sendOnEnterRef.current = v })
  }, [])

  // Append voice transcript to input when it arrives
  useEffect(() => {
    if (transcript) {
      setInput(prev => prev + (prev ? ' ' : '') + transcript)
      resetTranscript()
    }
  }, [transcript, resetTranscript])

  // Agent busy covers the entire cycle: agent running + queue processing
  const agentBusy = agentEnabled && isAgentBusy

  // Unified "busy" flag: agent busy OR normal streaming OR compressing
  const isBusy = agentBusy || (isStreaming && !agentEnabled) || compressing

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  // Close extra buttons when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowExtraButtons(false)
      }
    }
    if (showExtraButtons) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showExtraButtons])

  const handlePaste = async (e: React.ClipboardEvent) => {
    const files = e.clipboardData.files
    if (files.length > 0) {
      e.preventDefault()
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file.type.startsWith('image/')) {
          const base64 = await fileToBase64(file)
          setImages((prev) => [...prev, base64])
        }
      }
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        const base64 = await fileToBase64(files[i])
        setImages((prev) => [...prev, base64])
      }
    }
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleOcrFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setOcrProcessing(true)
    try {
      const store = useChatStore.getState()
      const providerType = store.providerType
      const modelId = store.modelId

      // Check if model supports vision (multimodal)
      if (!isLikelyVisionModel(providerType, modelId)) {
        setError(t('sidepanel:ocrNoVision'))
        return
      }

      const configId = store.providerConfigId

      // Get provider config
      let baseUrl: string | undefined
      let apiKey: string | undefined
      let headers: Record<string, string> | undefined

      if (providerType === 'ollama') {
        baseUrl = await ollamaSettings.getOllamaURL()
        headers = await ollamaSettings.getCustomHeadersMap()
      } else {
        const configs = await openaiConfigRepo.getAll()
        const config = configId
          ? configs.find(c => c.id === configId)
          : configs.find(c => c.provider === providerType)
        baseUrl = config?.baseUrl
        apiKey = config?.apiKey || undefined
        headers = config?.headers || undefined
      }

      if (!baseUrl) {
        setError(t('sidepanel:ocrError'))
        return
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
        setError(t('sidepanel:ocrNoText'))
        return
      }
      setInput(prev => prev + (prev ? '\n' : '') + text)
    } catch {
      setError(t('sidepanel:ocrError'))
    } finally {
      setOcrProcessing(false)
    }
  }

  const handleSubmit = () => {
    if (!input.trim()) return
    if (isStreaming && !agentEnabled) return
    if (compressing) return
    sendMessage(input.trim(), images.length > 0 ? images : undefined)
    setInput('')
    setImages([])
    setSelectedElementRef(null)
  }

  // Start element selection mode
  const handleSelectElement = async () => {
    try {
      setIsSelectingElement(true)

      // Get current active tab (handles tab switching)
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) {
        console.error('[Element Selection] No active tab found')
        setIsSelectingElement(false)
        return
      }

      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        console.error('[Element Selection] Cannot select on internal pages')
        setIsSelectingElement(false)
        return
      }

      console.log('[Element Selection] Starting on tab:', tab.id, tab.url)

      // Inject overlay script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          console.log('[Element Selection Overlay] Injecting overlay...')

          // Clean up any existing overlay first
          const existing = document.getElementById('user-select-overlay')
          if (existing) {
            existing.remove()
          }

          // Annotate elements with agent IDs
          const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [contenteditable], [onclick]'
          const interactives = document.querySelectorAll(interactiveSelectors)
          let idx = 0
          for (const el of interactives) {
            if (!el.getAttribute('data-agent-id')) {
              el.setAttribute('data-agent-id', `a${idx}`)
              idx++
            }
          }

          const MAX_TOTAL_IDS = 120
          if (idx < MAX_TOTAL_IDS) {
            const vpHeight = window.innerHeight
            const clickCandidateSelectors = 'li, span, div'
            const clickCandidates = document.querySelectorAll(clickCandidateSelectors)
            for (const el of clickCandidates) {
              if (idx >= MAX_TOTAL_IDS) break
              if (el.getAttribute('data-agent-id')) continue
              const rect = el.getBoundingClientRect()
              if (rect.bottom <= 0 || rect.top >= vpHeight) continue
              if (rect.width <= 0 || rect.height <= 0) continue
              if (rect.width > window.innerWidth * 0.5 || rect.height > vpHeight * 0.5) continue
              const style = window.getComputedStyle(el as HTMLElement)
              if (style.display === 'none' || style.visibility === 'hidden') continue
              if (style.cursor !== 'pointer') continue
              if (el.querySelector('a, button, [data-agent-id]')) continue
              const text = (el as HTMLElement).innerText?.trim() ?? ''
              const ariaLabel = el.getAttribute('aria-label') ?? ''
              if (text.length === 0 && ariaLabel.length === 0) continue
              if (text.length > 200) continue

              el.setAttribute('data-agent-id', `a${idx}`)
              idx++
            }
          }

          console.log('[Element Selection Overlay] Annotated', idx, 'elements')

          // Create overlay - allow clicks to pass through except for highlighting
          const overlay = document.createElement('div')
          overlay.id = 'user-select-overlay'
          overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 2147483646;
            pointer-events: none;
          `

          // Create improved banner with better styling
          const banner = document.createElement('div')
          banner.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            z-index: 2147483647;
            pointer-events: auto;
            border: 1px solid rgba(59, 130, 246, 0.3);
            backdrop-filter: blur(10px);
          `
          banner.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
              </div>
              <div>
                <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">Select an Element</div>
                <div style="opacity: 0.8; font-size: 13px;">Click any element • Press <kbd style="background: rgba(255,255,255,0.15); padding: 2px 6px; border-radius: 4px; font-family: monospace;">ESC</kbd> to cancel</div>
              </div>
            </div>
          `
          overlay.appendChild(banner)

          let hoverOutline: HTMLDivElement | null = null

          // Define cleanup first (will be used by other functions)
          const cleanup = () => {
            console.log('[Element Selection Overlay] Cleaning up')
            document.removeEventListener('mousemove', onMouseMove, true)
            document.removeEventListener('click', onClick, true)
            document.removeEventListener('keydown', onKeyDown, true)
            window.removeEventListener('keydown', onKeyDown, true)
            document.removeEventListener('keyup', onKeyUp, true)
            window.removeEventListener('keyup', onKeyUp, true)
            overlay.remove()
            if (hoverOutline) hoverOutline.remove()
          }

          const onMouseMove = (e: MouseEvent) => {
            if (hoverOutline) {
              hoverOutline.remove()
              hoverOutline = null
            }

            const target = e.target as HTMLElement
            if (!target || target.id === 'user-select-overlay' || target.closest?.('#user-select-overlay')) {
              return
            }

            const rect = target.getBoundingClientRect()
            hoverOutline = document.createElement('div')
            hoverOutline.style.cssText = `
              position: fixed;
              left: ${rect.left}px;
              top: ${rect.top}px;
              width: ${rect.width}px;
              height: ${rect.height}px;
              border: 3px solid #3b82f6;
              background: rgba(59, 130, 246, 0.15);
              pointer-events: none;
              z-index: 2147483645;
              box-shadow: 0 0 20px rgba(59, 130, 246, 0.6);
              border-radius: 4px;
            `
            document.body.appendChild(hoverOutline)
          }

          const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            if (!target || target.closest?.('#user-select-overlay')) {
              return
            }

            // Prevent default click behavior
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()

            const agentId = target.getAttribute('data-agent-id')
            console.log('[Element Selection Overlay] Clicked element:', agentId, target.tagName)

            // Clean up
            cleanup()

            // Send result
            const result = agentId ? {
              agentId,
              tag: target.tagName.toLowerCase(),
              text: target.innerText?.trim().slice(0, 100) || undefined,
            } : null

            console.log('[Element Selection Overlay] Sending result:', result)
            chrome.runtime.sendMessage({
              type: 'user_element_selected',
              result,
            }).catch((err) => {
              console.error('[Element Selection Overlay] Failed to send result:', err)
            })
          }

          const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
              e.preventDefault()
              e.stopPropagation()
              console.log('[Element Selection Overlay] ESC keydown pressed, canceling')
              cleanup()
              // Send cancel
              chrome.runtime.sendMessage({
                type: 'user_element_selected',
                result: null,
              }).catch((err) => {
                console.error('[Element Selection Overlay] Failed to send cancel:', err)
              })
            }
          }

          const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
              e.preventDefault()
              e.stopPropagation()
              console.log('[Element Selection Overlay] ESC keyup pressed, canceling')
              cleanup()
              // Send cancel
              chrome.runtime.sendMessage({
                type: 'user_element_selected',
                result: null,
              }).catch((err) => {
                console.error('[Element Selection Overlay] Failed to send cancel:', err)
              })
            }
          }

          // Use capture phase to intercept clicks before they reach other elements
          document.addEventListener('mousemove', onMouseMove, true)
          document.addEventListener('click', onClick, true)
          // Add listeners to both window and document for maximum reliability
          window.addEventListener('keydown', onKeyDown, true)
          document.addEventListener('keydown', onKeyDown, true)
          window.addEventListener('keyup', onKeyUp, true)
          document.addEventListener('keyup', onKeyUp, true)

          document.body.appendChild(overlay)
          console.log('[Element Selection Overlay] Overlay injected successfully')
        },
      })

      // Wait for selection result with timeout using a one-time listener
      const result = await new Promise<{ agentId: string; tag: string; text?: string } | null>((resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        const listener = (message: unknown) => {
          console.log('[Element Selection Listener] Received message:', message)
          if (!message || typeof message !== 'object') return
          const msg = message as Record<string, unknown>
          if (msg.type === 'user_element_selected') {
            console.log('[Element Selection Listener] Got user_element_selected:', msg)
            if (timeoutId) clearTimeout(timeoutId)
            chrome.runtime.onMessage.removeListener(listener)
            const result = (msg.result as { agentId: string; tag: string; text?: string } | null) ?? null
            console.log('[Element Selection Listener] Resolving with:', result)
            resolve(result)
          }
        }

        chrome.runtime.onMessage.addListener(listener)
        console.log('[Element Selection] Listener added, waiting for selection...')

        timeoutId = setTimeout(() => {
          console.log('[Element Selection] Timeout reached')
          chrome.runtime.onMessage.removeListener(listener)
          resolve(null)
          // Clean up overlay on timeout
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const overlay = document.getElementById('user-select-overlay')
              if (overlay) overlay.remove()
              console.log('[Element Selection] Overlay cleaned up due to timeout')
            },
          }).catch(() => {})
        }, 30000) // 30 second timeout
      })

      console.log('[Element Selection] Result:', result)
      if (result) {
        console.log('[Element Selection] Setting selected element:', result)
        setSelectedElementRef(result)
      } else {
        console.log('[Element Selection] No result (cancelled or timed out)')
      }
    } catch (err) {
      console.error('[Element Selection] Failed:', err)
    } finally {
      setIsSelectingElement(false)
    }
  }

  const removeSelectedElement = () => {
    setSelectedElementRef(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && sendOnEnterRef.current) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Compress conversation history — blocks all UI during execution
  const handleCompressHistory = async () => {
    if (compressing) return
    setCompressing(true)

    try {
      const conversationCount = messages.filter(msg => {
        if (msg.role === 'user' && msg.content) return true
        if (msg.role === 'assistant' && msg.content && !msg.toolCalls?.length && !msg.reasoningContent && msg.messageKind !== 'assistant_tool_calls' && msg.messageKind !== 'tool_result' && msg.messageKind !== 'status') return true
        return false
      }).length

      if (conversationCount <= 2) return

      // Delegate to chat-service which reuses the same provider pipeline
      await compressHistory()

      // Success indicator — status bubble in chat
      const statusMsg: ChatMessage = {
        id: generateId(),
        historyId: useChatStore.getState().historyId ?? '',
        role: 'assistant',
        content: t('sidepanel:historyCompressed', { count: conversationCount }),
        messageKind: 'status',
        createdAt: Date.now(),
      }
      useChatStore.getState().addMessage(statusMsg)
    } catch {
      useChatStore.getState().setError(t('sidepanel:historyCompressFailed'))
    } finally {
      setCompressing(false)
    }
  }

  // Placeholder logic
  const getPlaceholder = (): string => {
    if (ocrProcessing) return t('sidepanel:ocrProcessing')
    if (compressing) return t('sidepanel:compressingHistory')
    if (isStreaming && !agentEnabled) return t('sidepanel:waitingForResponse')
    return t('sidepanel:placeholder')
  }

  // Textarea disabled when: normal streaming OR compressing OR OCR processing
  const isTextareaDisabled = (isStreaming && !agentEnabled) || compressing || ocrProcessing

  return (
    <div className="border-t border-border px-3 py-2">
      {isTemporary && (
        <div className="mb-2 px-2 py-1.5 text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded border border-dashed border-orange-300 dark:border-orange-700 flex items-center gap-1.5">
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {t('sidepanel:temporaryChatActive')}
        </div>
      )}
      {isListening && (
        <div className="mb-2 px-2 py-1.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {t('sidepanel:voiceListening')}
        </div>
      )}
      {compressing && (
        <div className="mb-2 px-2 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded flex items-center gap-2">
          <svg className="w-3 h-3 flex-shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          {t('sidepanel:compressingHistory')}
        </div>
      )}
      {error && (
        <div className="mb-2 px-2 py-1 text-xs bg-destructive/10 text-destructive rounded">
          {error}
        </div>
      )}

      {/* Queue items UI — shows pending messages waiting for agent */}
      {messageQueue.length > 0 && (
        <div className="mb-2 space-y-1">
          {messageQueue.map((item: QueueItem, idx: number) => (
            <QueueItemRow
              key={item.id}
              item={item}
              index={idx}
              total={messageQueue.length}
              onRemove={() => removeFromQueue(item.id)}
              onMoveUp={() => reorderQueue(item.id, 'up')}
              onMoveDown={() => reorderQueue(item.id, 'down')}
              onToggleMode={() => toggleQueueItemMode(item.id)}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Image previews */}
      {images.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img}
                alt={`attachment ${idx + 1}`}
                className="h-16 w-16 object-cover rounded border"
              />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Selected element preview */}
      {selectedElementRef && (
        <div className="mb-2">
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm">
            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-blue-700 dark:text-blue-300">{selectedElementRef.agentId}</span>
              <span className="text-blue-600 dark:text-blue-400">&lt;{selectedElementRef.tag}&gt;</span>
              {selectedElementRef.text && (
                <span className="text-blue-600 dark:text-blue-400 max-w-[150px] truncate">"{selectedElementRef.text}"</span>
              )}
            </div>
            <button
              type="button"
              onClick={removeSelectedElement}
              className="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
              title="Remove element"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Selecting indicator */}
      {isSelectingElement && (
        <div className="mb-2 px-3 py-2 text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          {t('sidepanel:selectingElement', 'Selecting element... click on the page')}
          <span className="text-xs opacity-70 ml-auto">
            Press <kbd className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900 font-mono">ESC</kbd> to cancel
          </span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={ocrFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleOcrFileSelect}
      />

      {/* Main input container with integrated buttons */}
      <div ref={containerRef} className="relative">
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={getPlaceholder()}
              disabled={isTextareaDisabled}
              rows={1}
              className="flex-1 resize-none pr-24"
            />

            {/* Integrated buttons inside textarea */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              {/* Voice input */}
              {voiceSupported && (
                <Button
                  onClick={isListening ? stopListening : startListening}
                  size="icon"
                  variant="ghost"
                  className={`h-7 w-7 rounded-md ${
                    isListening
                      ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  title={isListening ? t('sidepanel:voiceListening') : t('sidepanel:voiceInput')}
                  disabled={isBusy && !agentBusy}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </Button>
              )}

              {/* Expand/Collapse extra buttons */}
              <Button
                onClick={() => setShowExtraButtons(!showExtraButtons)}
                size="icon"
                variant="ghost"
                className={`h-7 w-7 rounded-md ${
                  showExtraButtons
                    ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title={showExtraButtons ? 'Less' : 'More'}
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${showExtraButtons ? 'rotate-45' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 4v16m8-8H4" />
                </svg>
              </Button>

              {/* Send button - changes to Stop when streaming */}
              {isBusy ? (
                <Button
                  onClick={() => useChatStore.getState().cancelStreaming()}
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7 rounded-md"
                  title={t('sidepanel:stopGenerating', 'Stop')}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  size="icon"
                  variant="default"
                  className="h-7 w-7 rounded-md"
                  disabled={!input.trim() || isTextareaDisabled}
                  title={t('sidepanel:sendMessage', 'Send')}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Extra buttons panel - appears above input when expanded */}
        {showExtraButtons && (
          <div className="absolute bottom-full left-0 right-0 mb-2 p-2 bg-popover border border-border rounded-lg shadow-lg flex flex-wrap gap-2 z-10">
            {/* Select element button */}
            <Button
              onClick={handleSelectElement}
              variant="ghost"
              size="sm"
              className={`h-8 px-3 ${
                selectedElementRef
                  ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                  : isSelectingElement
                    ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : ''
              }`}
              disabled={isBusy || isSelectingElement}
              title={isSelectingElement ? 'Selecting...' : selectedElementRef ? 'Element selected' : 'Select Element (Alt+Shift+E)'}
            >
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
              {isSelectingElement ? 'Selecting...' : selectedElementRef ? 'Element Selected' : 'Select Element'}
              {!isSelectingElement && !selectedElementRef && (
                <kbd className="ml-1.5 px-1 py-0.5 text-xs bg-muted rounded font-mono">⌥⇧E</kbd>
              )}
            </Button>

            {/* OCR button */}
            <Button
              onClick={() => ocrFileInputRef.current?.click()}
              variant="ghost"
              size="sm"
              className="h-8 px-3"
              disabled={isBusy || ocrProcessing}
            >
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="15" y2="17" />
                <polyline points="9 9 10 9 10.5 9" />
              </svg>
              {ocrProcessing ? 'Processing...' : 'OCR Image'}
            </Button>

            {/* Compress button */}
            <Button
              onClick={handleCompressHistory}
              variant="ghost"
              size="sm"
              className="h-8 px-3"
              disabled={compressing || isBusy}
            >
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 14a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6z" />
                <line x1="12" y1="4" x2="12" y2="10" />
              </svg>
              {compressing ? 'Compressing...' : 'Compress History'}
            </Button>

            {/* Compact button - only show when agent is enabled */}
            {agentEnabled && isAgentRunning() && (
              <Button
                onClick={() => compactAgent()}
                variant="ghost"
                size="sm"
                className="h-8 px-3"
                title={t('sidepanel:compactContext', 'Compact context')}
              >
                <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
                Compact
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Heuristic check: does this model likely support vision (multimodal input)?
 *
 * Strategy:
 * 1. chrome-ai → never (Gemini Nano is text-only, no multimodal API)
 * 2. Known vision-capable model name patterns → yes
 * 3. Everything else → no (conservative: reject rather than waste an API call)
 *
 * This avoids sending images to models that can't handle them, which would
 * either error out or silently ignore the image.
 */
function isLikelyVisionModel(providerType: ProviderType, modelId: string): boolean {
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
    'qwen-vl', 'qwen2-vl', 'qwq',  // qwq-vl variants
    // Misc
    'cogvlm', 'internvl', 'phi-3.5-vision', 'pixtral',
    // Llama 3.2 vision
    'llama-3.2-11b', 'llama-3.2-90b', 'llama3.2-11b', 'llama3.2-90b',
    // Mistral Pixtral
    'pixtral',
  ]

  return visionPatterns.some(p => lower.includes(p))
}

/** Single queue item row */
function QueueItemRow({
  item,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
  onToggleMode,
  t,
}: {
  item: QueueItem
  index: number
  total: number
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleMode: () => void
  t: (key: string) => string
}) {
  const isSupplement = item.mode === 'supplement'
  const truncatedText = item.text.length > 40 ? item.text.slice(0, 40) + '...' : item.text

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
      {/* Mode tag — clickable to toggle */}
      <button
        onClick={onToggleMode}
        className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
          isSupplement
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
        }`}
        title={isSupplement ? t('sidepanel:queueSupplement') : t('sidepanel:queueNext')}
      >
        {isSupplement ? t('sidepanel:queueSupplement') : t('sidepanel:queueNext')}
      </button>

      {/* Text */}
      <span className="flex-1 truncate text-gray-700 dark:text-gray-300" title={item.text}>
        {truncatedText}
      </span>

      {/* Move up */}
      <button
        onClick={onMoveUp}
        disabled={index === 0}
        className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
        title="Move up"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Move down */}
      <button
        onClick={onMoveDown}
        disabled={index === total - 1}
        className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
        title="Move down"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"
        title="Remove"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

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
  const isStreaming = useChatStore(s => s.isStreaming)
  const isTemporary = useChatStore(s => s.isTemporary)
  const agentEnabled = useChatStore(s => s.agentEnabled)
  const error = useChatStore(s => s.error)
  const isAgentBusy = useChatStore(s => s.isAgentBusy)
  const messageQueue = useChatStore(s => s.messageQueue)
  const messages = useChatStore(s => s.messages)
  const removeFromQueue = useChatStore(s => s.removeFromQueue)
  const reorderQueue = useChatStore(s => s.reorderQueue)
  const toggleQueueItemMode = useChatStore(s => s.toggleQueueItemMode)
  const { sendMessage } = useChatService()
  const { t } = useTranslation(['sidepanel', 'common'])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ocrFileInputRef = useRef<HTMLInputElement>(null)
  const sendOnEnterRef = useRef(true)

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
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={getPlaceholder()}
          disabled={isTextareaDisabled}
          rows={1}
          className="flex-1 resize-none"
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          size="icon"
          variant="ghost"
          className="flex-shrink-0 h-9 w-9 rounded-lg text-muted-foreground"
          title={t('sidepanel:uploadImage', 'Upload image')}
          disabled={isBusy && !agentBusy}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </Button>
        {/* Voice input button */}
        {voiceSupported && (
          <Button
            onClick={isListening ? stopListening : startListening}
            size="icon"
            variant="ghost"
            className={`flex-shrink-0 h-9 w-9 rounded-lg ${
              isListening
                ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                : 'text-muted-foreground'
            }`}
            title={isListening ? t('sidepanel:voiceListening') : t('sidepanel:voiceInput')}
            disabled={isBusy && !agentBusy}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </Button>
        )}
        {/* OCR button */}
        <Button
          onClick={() => ocrFileInputRef.current?.click()}
          size="icon"
          variant="ghost"
          className="flex-shrink-0 h-9 w-9 rounded-lg text-muted-foreground"
          title={t('sidepanel:ocrExtract')}
          disabled={isBusy || ocrProcessing}
        >
          {ocrProcessing ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="15" y2="17" />
              <polyline points="9 9 10 9 10.5 9" />
            </svg>
          )}
        </Button>
        {/* Compress button — always visible when idle */}
        {!isBusy && messages.length >= 2 && (
          <Button
            onClick={handleCompressHistory}
            size="icon"
            variant="ghost"
            className="flex-shrink-0 h-9 w-9 rounded-lg text-muted-foreground"
            title={t('sidepanel:compressHistory')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </Button>
        )}
        {isBusy && !compressing ? (
          <>
            {agentEnabled && isAgentRunning() && (
              <Button
                onClick={() => compactAgent()}
                size="icon"
                variant="outline"
                className="flex-shrink-0 h-9 w-9 rounded-lg"
                title={t('sidepanel:compactContext', 'Compact context')}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </Button>
            )}
            <Button
              onClick={() => useChatStore.getState().cancelStreaming()}
              size="icon"
              variant="destructive"
              className="flex-shrink-0 h-9 w-9 rounded-lg"
              title={t('sidepanel:stopGenerating')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </Button>
          </>
        ) : !compressing ? (
          <Button
            onClick={handleSubmit}
            disabled={!input.trim()}
            size="icon"
            className="flex-shrink-0 h-9 w-9 rounded-lg"
            title={t('common:send')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Button>
        ) : null}
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

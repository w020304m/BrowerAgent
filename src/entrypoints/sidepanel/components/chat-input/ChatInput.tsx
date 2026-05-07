/**
 * ChatInput - Main input component with all element selection features
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat-store'
import { useChatService, compactAgent, isAgentRunning, compressHistory } from '../chat-service'
import { selectElementViaPort } from '@/ipc/client'
import { Button } from '@/components/ui/button'
import { ChipInput, type ChipInputHandle } from '../ChipInput'
import type { QueueItem } from '@/types/chat'
import { syncStorageService } from '@/storage/index'
import { ELEMENT_TAG_COLORS, createElementMarker } from '@/types/element-reference'
import { fileToBase64 } from './utils'
import { ElementTagsContainer } from './ElementTagsContainer'
import { ImagePreviews } from './ImagePreviews'
import { StatusBubbles } from './StatusBubbles'
import { QueueItemRow } from './QueueItemRow'
import { useSpeechRecognition } from './hooks/use-speech-recognition'
import { generateId } from '@/types/common'

export function ChatInput() {
  const [input, setInput] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [compressing, setCompressing] = useState(false)
  const [isSelectingElement, setIsSelectingElement] = useState(false)
  const [showExtra, setShowExtra] = useState(false)
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ocrFileInputRef = useRef<HTMLInputElement>(null)
  const sendOnEnterRef = useRef(true)
  const containerRef = useRef<HTMLDivElement>(null)

  // Store state
  const isStreaming = useChatStore(s => s.isStreaming)
  const isTemporary = useChatStore(s => s.isTemporary)
  const agentEnabled = useChatStore(s => s.agentEnabled)
  const error = useChatStore(s => s.error)
  const isAgentBusy = useChatStore(s => s.isAgentBusy)
  const messageQueue = useChatStore(s => s.messageQueue)
  const messages = useChatStore(s => s.messages)
  const selectedElements = useChatStore(s => s.selectedElements)
  const hoveredElementRef = useChatStore(s => s.hoveredElementRef)
  const selectElementTrigger = useChatStore(s => s.selectElementTrigger)
  const removeFromQueue = useChatStore(s => s.removeFromQueue)
  const reorderQueue = useChatStore(s => s.reorderQueue)
  const toggleQueueItemMode = useChatStore(s => s.toggleQueueItemMode)

  // Store actions
  const addSelectedElement = useChatStore(s => s.addSelectedElement)
  const removeSelectedElement = useChatStore(s => s.removeSelectedElement)
  const clearSelectedElements = useChatStore(s => s.clearSelectedElements)
  const setHoveredElementRef = useChatStore(s => s.setHoveredElementRef)
  const setError = useChatStore(s => s.setError)

  const { sendMessage } = useChatService()
  const { t } = useTranslation(['sidepanel', 'common'])
  const chipInputRef = useRef<ChipInputHandle>(null)

  const selectedElementsSet = useMemo(
    () => new Set(selectedElements.map(el => el.agentId)),
    [selectedElements],
  )

  const { isListening, transcript, isSupported: voiceSupported, startListening, stopListening, resetTranscript } = useSpeechRecognition()

  useEffect(() => {
    syncStorageService.get<boolean>('sendWhenEnter', true).then(v => { sendOnEnterRef.current = v })
  }, [])

  useEffect(() => {
    if (transcript) {
      setInput(prev => prev + (prev ? ' ' : '') + transcript)
      resetTranscript()
    }
  }, [transcript, resetTranscript])

  const agentBusy = agentEnabled && isAgentBusy
  const isBusy = agentBusy || (isStreaming && !agentEnabled) || compressing

  /**
   * Insert {{agentId}} at cursor position in textarea
   */
  const insertReference = useCallback((agentId: string) => {
    const ref = `{{${agentId}}}`
    const textarea = chipInputRef.current?.textarea
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      setInput(prev => prev.slice(0, start) + ref + prev.slice(end))
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + ref.length
        textarea.focus()
      })
    } else {
      setInput(prev => prev + ref)
    }
  }, [])

  /**
   * Remove element from list AND strip {{agentId}} from input text
   */
  const handleRemoveElement = useCallback((id: string) => {
    // Find agentId BEFORE removing from store (Zustand updates synchronously)
    const el = useChatStore.getState().selectedElements.find(e => e.id === id)
    if (el) {
      const ref = `{{${el.agentId}}}`
      setInput(prev => prev.replace(ref, ''))
    }
    removeSelectedElement(id)
  }, [removeSelectedElement])

  /**
   * Clear all elements from list AND strip all {{...}} from input
   */
  const handleClearAll = useCallback(() => {
    clearSelectedElements()
    setInput(prev => prev.replace(/\{\{[\w-]+\}\}/g, ''))
  }, [clearSelectedElements])

  /**
   * Select a single element (non-continuous). Always passes continuous=false.
   */
  const handleSelectElement = useCallback(async () => {
    try {
      setIsSelectingElement(true)
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        setIsSelectingElement(false)
        return
      }
      // Always false for single select
      const result = await selectElementViaPort(tab.id, false)
      if (result) {
        addSelectedElement(result)
        insertReference(result.agentId)
        requestAnimationFrame(() => { chipInputRef.current?.focus() })
      }
    } catch (err) {
      console.error('[SelectElement] Failed:', err)
    } finally {
      setIsSelectingElement(false)
    }
  }, [addSelectedElement, insertReference])

  // React to Ctrl+Shift+E keyboard shortcut
  useEffect(() => {
    if (selectElementTrigger > 0 && !isBusy && !isSelectingElement) {
      handleSelectElement()
    }
  }, [selectElementTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close extra buttons when clicking outside
  useEffect(() => {
    if (!showExtra) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowExtra(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExtra])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        const base64 = await fileToBase64(files[i])
        setImages(prev => [...prev, base64])
      }
    }
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    if (!input.trim()) return
    if (isStreaming && !agentEnabled) return
    if (compressing) return
    const elementSuffix = selectedElements.length > 0
      ? selectedElements.map(el => createElementMarker(el.agentId)).join('')
      : ''
    sendMessage(input.trim() + elementSuffix, images.length > 0 ? images : undefined)
    setInput('')
    setImages([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Escape' || e.key === 'Esc') && isSelectingElement) {
      e.preventDefault()
      chrome.runtime.sendMessage({ type: 'user_element_selected', result: null }).catch(() => {})
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => { document.getElementById('user-select-overlay')?.remove() },
          }).catch(() => {})
        }
      })
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && sendOnEnterRef.current) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const files = e.clipboardData.files
    if (files.length > 0) {
      e.preventDefault()
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
          const base64 = await fileToBase64(files[i])
          setImages(prev => [...prev, base64])
        }
      }
    }
  }, [])

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
      await compressHistory(useChatStore)
      const statusMsg: import('@/types/message').ChatMessage = {
        id: generateId(),
        historyId: useChatStore.getState().historyId ?? '',
        role: 'assistant',
        content: t('sidepanel:historyCompressed', { count: conversationCount }),
        messageKind: 'status',
        createdAt: Date.now(),
      }
      useChatStore.getState().addMessage(statusMsg)
    } catch {
      setError(t('sidepanel:historyCompressFailed'))
    } finally {
      setCompressing(false)
    }
  }

  const getPlaceholder = (): string => {
    if (ocrProcessing) return t('sidepanel:ocrProcessing')
    if (compressing) return t('sidepanel:compressingHistory')
    if (isStreaming && !agentEnabled) return t('sidepanel:waitingForResponse')
    return t('sidepanel:placeholder')
  }

  const isTextareaDisabled = (isStreaming && !agentEnabled) || compressing || ocrProcessing

  return (
    <div className="border-t border-border px-3 py-2">
      {/* Status indicators */}
      {isTemporary && (
        <div className="mb-2 px-2 py-1.5 text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded border border-dashed border-orange-300 dark:border-orange-700 flex items-center gap-1.5">
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
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
          <svg className="w-3 h-3 flex-shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
          {t('sidepanel:compressingHistory')}
        </div>
      )}
      {error && <div className="mb-2 px-2 py-1 text-xs bg-destructive/10 text-destructive rounded">{error}</div>}

      {/* Queue */}
      {messageQueue.length > 0 && (
        <div className="mb-2 space-y-1">
          {messageQueue.map((item: QueueItem, idx: number) => (
            <QueueItemRow key={item.id} item={item} index={idx} total={messageQueue.length}
              onRemove={() => removeFromQueue(item.id)} onMoveUp={() => reorderQueue(item.id, 'up')}
              onMoveDown={() => reorderQueue(item.id, 'down')} onToggleMode={() => toggleQueueItemMode(item.id)} t={t} />
          ))}
        </div>
      )}

      {/* Element tags */}
      {selectedElements.length > 0 && (
        <ElementTagsContainer
          selectedElements={selectedElements}
          hoveredRef={hoveredElementRef}
          colors={ELEMENT_TAG_COLORS}
          onRemove={handleRemoveElement}
          onInsertRef={insertReference}
          onClearAll={handleClearAll}
        />
      )}

      {/* Selecting indicator */}
      {isSelectingElement && (
        <div className="mb-2 px-3 py-2 text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          {t('sidepanel:selectingElement', 'Selecting element...')}
          <span className="text-xs opacity-70 ml-auto">Press <kbd className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900 font-mono text-[10px]">ESC</kbd> to cancel</span>
        </div>
      )}

      {/* Images */}
      <ImagePreviews images={images} onRemove={removeImage} />

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
      <input ref={ocrFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) setOcrProcessing(true) // simplified — real OCR handled elsewhere
      }} />

      {/* Main input */}
      <div ref={containerRef} className="relative">
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <ChipInput
              ref={chipInputRef}
              value={input}
              onChange={setInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onChipHover={setHoveredElementRef}
              placeholder={getPlaceholder()}
              disabled={isTextareaDisabled}
              validAgentIds={selectedElementsSet}
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none pr-20 overflow-y-auto max-h-[120px] whitespace-pre-wrap break-words"
            />

            {/* Buttons inside textarea */}
            <div className="absolute right-2 bottom-2 flex items-center gap-0.5">
              {voiceSupported && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  type="button"
                  className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${
                    isListening ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                  title={isListening ? t('sidepanel:voiceListening') : t('sidepanel:voiceInput')}
                  disabled={isBusy && !agentBusy}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                </button>
              )}

              {/* Extra actions toggle */}
              <button
                onClick={() => setShowExtra(!showExtra)}
                type="button"
                className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${
                  showExtra ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
                title="More"
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${showExtra ? 'rotate-45' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 4v16m8-8H4" />
                </svg>
              </button>

              {/* Send / Stop */}
              {isBusy ? (
                <button onClick={() => useChatStore.getState().cancelStreaming()} type="button"
                  className="h-6 w-6 rounded flex items-center justify-center bg-destructive text-destructive-foreground"
                  title={t('sidepanel:stopGenerating', 'Stop')}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                </button>
              ) : (
                <button onClick={handleSubmit} type="button"
                  className="h-6 w-6 rounded flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-50"
                  disabled={!input.trim() || isTextareaDisabled}
                  title={t('sidepanel:sendMessage', 'Send')}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Extra actions popup */}
            {showExtra && (
              <div className="absolute bottom-full left-0 right-0 mb-1 p-1 bg-popover border border-border rounded-lg shadow-lg flex flex-wrap gap-0.5 z-10">
                <button onClick={() => { handleSelectElement(); setShowExtra(false) }} type="button" disabled={isBusy || isSelectingElement}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded hover:bg-muted disabled:opacity-50">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                  {isSelectingElement ? '...' : 'Select'}
                  <kbd className="px-1 py-0.5 text-[9px] bg-muted rounded font-mono">⇧⌃E</kbd>
                </button>
                <button onClick={() => { ocrFileInputRef.current?.click(); setShowExtra(false) }} type="button" disabled={isBusy || ocrProcessing}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded hover:bg-muted disabled:opacity-50">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {ocrProcessing ? '...' : 'OCR'}
                </button>
                <button onClick={() => { handleCompressHistory(); setShowExtra(false) }} type="button" disabled={compressing || isBusy}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded hover:bg-muted disabled:opacity-50">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 14a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6z" />
                    <line x1="12" y1="4" x2="12" y2="10" />
                  </svg>
                  {compressing ? '...' : 'Zip'}
                </button>
                {agentEnabled && isAgentRunning() && (
                  <button onClick={() => { compactAgent(); setShowExtra(false) }} type="button"
                    className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded hover:bg-muted">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="4 14 10 14 10 20" />
                      <polyline points="20 10 14 10 14 4" />
                    </svg>
                    Compact
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

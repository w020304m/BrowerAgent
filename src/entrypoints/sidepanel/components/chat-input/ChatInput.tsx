/**
 * ChatInput - Main input component with all element selection features
 *
 * This is the refactored version that imports sub-components and utilities,
 * making the code more maintainable and modular.
 *
 * Key features:
 * - Element selection with auto-insert
 * - Continuous selection mode
 * - Drag-and-drop reordering
 * - Compact collapsible UI
 * - Smart button layout
 * - Reference highlighting
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat-store'
import { useChatService, compactAgent, isAgentRunning, compressHistory } from '../chat-service'
import { selectElementViaPort } from '@/ipc/client'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ChipInput, type ChipInputHandle } from '../ChipInput'
import type { QueueItem } from '@/types/chat'
import { syncStorageService } from '@/storage/index'
import { ELEMENT_TAG_COLORS, createElementMarker } from '@/types/element-reference'
import { extractTextFromImage, fileToBase64 } from './utils'
import { CollapsiblePanel } from './CollapsiblePanel'
import { ElementTagsContainer } from './ElementTagsContainer'
import { ImagePreviews } from './ImagePreviews'
import { SelectingIndicator } from './SelectingIndicator'
import { StatusBubbles } from './StatusBubbles'
import { QueueItemRow } from './QueueItemRow'
import { ContinuousSelectionIndicator } from './ContinuousSelectionIndicator'
import { MoreActionsMenu } from './MoreActionsMenu'
import { useSpeechRecognition } from './hooks/use-speech-recognition'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { generateId } from '@/types/common'

export function ChatInput() {
  const [input, setInput] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [compressing, setCompressing] = useState(false)
  const [isSelectingElement, setIsSelectingElement] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
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
  const pendingElements = useChatStore(s => s.pendingSelectedElements)
  const isContinuousMode = useChatStore(s => s.isContinuousSelectMode)
  const hoveredElementRef = useChatStore(s => s.hoveredElementRef)
  const elementPanelOpen = useChatStore(s => s.elementPanelOpen)

  // Store actions
  const addSelectedElement = useChatStore(s => s.addSelectedElement)
  const removeSelectedElement = useChatStore((s) => s.removeSelectedElement)
  const clearSelectedElements = useChatStore((s) => s.clearSelectedElements)
  const reorderSelectedElements = useChatStore((s) => s.reorderSelectedElements)
  const setHoveredElementRef = useChatStore(s => s.setHoveredElementRef)
  const setElementPanelOpen = useChatStore(s => s.setElementPanelOpen)
  const addPendingElement = useChatStore(s => s.addPendingElement)
  const selectElementTrigger = useChatStore(s => s.selectElementTrigger)
  const removeFromQueue = useChatStore(s => s.removeFromQueue)
  const reorderQueue = useChatStore(s => s.reorderQueue)
  const toggleQueueItemMode = useChatStore(s => s.toggleQueueItemMode)
  const setError = useChatStore((s) => s.setError)

  const { sendMessage } = useChatService()
  const { t } = useTranslation(['sidepanel', 'common'])
  const chipInputRef = useRef<ChipInputHandle>(null)

  // Voice recognition
  const { isListening, transcript, isSupported: voiceSupported, startListening, stopListening, resetTranscript } = useSpeechRecognition()

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

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handle drag end - no need to update references anymore since we use agentId
  const handleDragEnd = useCallback((event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      reorderSelectedElements(String(active.id), String(over.id))
    }
  }, [reorderSelectedElements])

  /**
   * Insert element reference at cursor position using agentId
   */
  const insertReference = useCallback((agentId: string) => {
    const ref = `@#${agentId}`
    const textarea = chipInputRef.current?.textarea
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = input.slice(0, start) + ref + ' ' + input.slice(end)
      setInput(newValue)
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + ref.length + 1
        textarea.focus()
      })
    } else {
      setInput(prev => prev + ref + ' ')
    }
  }, [input])

  /**
   * Confirm continuous selection
   */
  const handleConfirmContinuous = useCallback(() => {
    useChatStore.getState().confirmContinuousSelection()
  }, [])

  /**
   * Cancel continuous selection
   */
  const handleCancelContinuous = useCallback(() => {
    useChatStore.getState().cancelContinuousSelection()
  }, [])

  /**
   * Start element selection mode with auto-insert
   */
  const handleSelectElement = useCallback(async () => {
    try {
      setIsSelectingElement(true)

      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) {
        setError('No active tab found. Please open a webpage.')
        setIsSelectingElement(false)
        return
      }

      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        setError('Cannot select elements on Chrome pages. Please navigate to a regular webpage.')
        setIsSelectingElement(false)
        return
      }

      // Use port-based IPC to avoid MV3 sendMessage timeout
      const result = await selectElementViaPort(tab.id, isContinuousMode)

      // Handle continuous selection completion
      if (isContinuousMode && result?.agentId === '__CONTINUOUS_COMPLETE__') {
        handleConfirmContinuous()
        setIsSelectingElement(false)
        return
      }

      if (result && result.agentId !== '__CONTINUATE_COMPLETE__') {
        // Determine the element index
        const currentCount = isContinuousMode
          ? pendingElements.length
          : selectedElements.length
        const ref = `@#${currentCount + 1}`

        if (isContinuousMode) {
          addPendingElement(result)
        } else {
          addSelectedElement(result)
          insertReference(ref)
        }

        // Focus input after selection
        requestAnimationFrame(() => {
          chipInputRef.current?.focus()
        })
      } else if (!result) {
        setError('No element selected. Please click on an element.')
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(`Selection failed: ${errorMsg}`)
    } finally {
      setIsSelectingElement(false)
    }
  }, [selectedElements.length, pendingElements.length, isContinuousMode, addSelectedElement, addPendingElement, insertReference, handleConfirmContinuous, setError])

  /**
   * Toggle continuous selection mode
   */
  const handleToggleContinuousMode = useCallback(() => {
    const newState = !isContinuousMode
    useChatStore.getState().setContinuousSelectMode(newState)
    if (newState) {
      handleSelectElement()
    }
  }, [isContinuousMode, handleSelectElement])

  // React to keyboard shortcut trigger from Chrome command (via store counter)
  useEffect(() => {
    if (selectElementTrigger > 0 && !isBusy && !isSelectingElement) {
      handleSelectElement()
    }
  }, [selectElementTrigger, isBusy, isSelectingElement, handleSelectElement])

  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false)
      }
    }
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMoreMenu])

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
      const configId = store.providerConfigId

      const result = await extractTextFromImage(file, providerType, modelId, configId)

      if (result.error) {
        setError(result.error)
        return
      }

      if (result.text) {
        setInput(prev => prev + (prev ? '\n' : '') + result.text)
      }
    } finally {
      setOcrProcessing(false)
    }
  }

  const handleSubmit = () => {
    if (!input.trim()) return
    if (isStreaming && !agentEnabled) return
    if (compressing) return

    // Build final text: append element markers so chat-service can resolve them
    const elementSuffix = selectedElements.length > 0
      ? selectedElements.map(el => createElementMarker(el.agentId)).join('')
      : ''
    sendMessage(input.trim() + elementSuffix, images.length > 0 ? images : undefined)
    setInput('')
    setImages([])
    // clearSelectedElements is called by chat-service after resolving
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // ESC during element selection → cancel selection
    if ((e.key === 'Escape' || e.key === 'Esc') && isSelectingElement) {
      e.preventDefault()
      chrome.runtime.sendMessage({ type: 'user_element_selected', result: null }).catch(() => {})
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0]
        if (tab?.id) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
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

  // Handle paste: detect images, let textarea handle text natively
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const files = e.clipboardData.files
    if (files.length > 0) {
      e.preventDefault()
      for (let i = 0; i <files.length; i++) {
        const file = files[i]
        if (file.type.startsWith('image/')) {
          const base64 = await fileToBase64(file)
          setImages((prev) => [...prev, base64])
        }
      }
      return
    }
  }, [])

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
      await compressHistory(useChatStore)

      // Success indicator — status bubble in chat
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

  // Placeholder logic
  const getPlaceholder = (): string => {
    if (ocrProcessing) return t('sidepanel:ocrProcessing')
    if (compressing) return t('sidepanel:compressingHistory')
    if (isStreaming && !agentEnabled) return t('sidepanel:waitingForResponse')
    return t('sidepanel:placeholder')
  }

  // Textarea disabled when: normal streaming OR compressing OR OCR processing
  const isTextareaDisabled = (isStreaming && !agentEnabled) || compressing || ocrProcessing

  // Total count for collapsible panel
  const totalPanelItems = messageQueue.length + selectedElements.length + pendingElements.length

  return (
    <TooltipProvider delayDuration={300}>
      <div className="border-t border-border px-3 py-2">
        {/* Status indicators */}
        <StatusBubbles
          isTemporary={isTemporary}
          isListening={isListening}
          compressing={compressing}
          error={error}
          t={t}
        />

        {/* Collapsible panel for queue and elements */}
        {totalPanelItems > 0 && (
          <CollapsiblePanel
            isOpen={elementPanelOpen}
            onToggle={() => setElementPanelOpen(!elementPanelOpen)}
            totalCount={totalPanelItems}
          >
            {/* Queue items */}
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

            {/* Continuous selection mode indicator */}
            {isContinuousMode && (
              <ContinuousSelectionIndicator
                count={pendingElements.length}
                onConfirm={handleConfirmContinuous}
                onCancel={handleCancelContinuous}
                t={t}
              />
            )}

            {/* Element tags - with drag-and-drop */}
            <ElementTagsContainer
              selectedElements={selectedElements}
              pendingElements={pendingElements}
              hoveredRef={hoveredElementRef}
              colors={ELEMENT_TAG_COLORS}
              onRemove={removeSelectedElement}
              onInsertRef={insertReference}
              onClearAll={() => {
                clearSelectedElements()
                if (isContinuousMode) {
                  handleCancelContinuous()
                }
              }}
              onDragEnd={handleDragEnd}
            />
          </CollapsiblePanel>
        )}

        {/* Selecting indicator */}
        {isSelectingElement && !isContinuousMode && (
          <SelectingIndicator
            onCancel={() => {
              chrome.runtime.sendMessage({ type: 'user_element_selected', result: null }).catch(() => {})
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0]
                if (tab?.id) {
                  chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => { document.getElementById('user-select-overlay')?.remove() },
                  }).catch(() => {})
                }
              })
            }}
            t={t}
          />
        )}

        {/* Image previews */}
        <ImagePreviews images={images} onRemove={removeImage} />

        {/* Hidden file inputs */}
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
              <ChipInput
                ref={chipInputRef}
                value={input}
                onChange={setInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onChipHover={setHoveredElementRef}
                placeholder={getPlaceholder()}
                disabled={isTextareaDisabled}
                elementCount={selectedElements.length}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-y-auto max-h-[120px] whitespace-pre-wrap break-words"
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

                {/* More actions menu */}
                <MoreActionsMenu
                  isOpen={showMoreMenu}
                  onOpenChange={setShowMoreMenu}
                  onSelectElement={handleSelectElement}
                  onToggleContinuousMode={handleToggleContinuousMode}
                  onOCR={() => ocrFileInputRef.current?.click()}
                  onCompress={handleCompressHistory}
                  onCompact={() => agentEnabled && isAgentRunning() && compactAgent()}
                  isBusy={isBusy}
                  isSelecting={isSelectingElement}
                  ocrProcessing={ocrProcessing}
                  compressing={compressing}
                  agentEnabled={agentEnabled}
                  isAgentRunning={isAgentRunning()}
                  t={t}
                />

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
                      <path d="M22 2L11 13M22 2l-7 20-4-9-4 20-7z" />
                    </svg>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

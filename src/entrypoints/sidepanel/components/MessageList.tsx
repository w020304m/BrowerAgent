import React, { useRef, useEffect, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat-store'
import { cn } from '@/lib/utils'
import { useTTS } from '../hooks/use-tts'
import { useChatService } from './chat-service'
import { MessageBubble } from './MessageBubble'
import { filterReasoningContent } from './reasoning-filter'

export function MessageList() {
  const messages = useChatStore(s => s.messages)
  const isStreaming = useChatStore(s => s.isStreaming)
  const streamingContent = useChatStore(s => s.streamingContent)
  const streamingReasoning = useChatStore(s => s.streamingReasoning)
  const removeMessage = useChatStore(s => s.removeMessage)
  const agentActionInfo = useChatStore(s => s.agentActionInfo)
  const agentEnabled = useChatStore(s => s.agentEnabled)
  const setAgentEnabled = useChatStore(s => s.setAgentEnabled)
  const streamingModelId = useChatStore(s => s.modelId)
  const streamingGenerationInfo = useChatStore(s => s.streamingGenerationInfo)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [userScrolledUp, setUserScrolledUp] = useState(false)
  const { t } = useTranslation('sidepanel')
  const { sendMessage } = useChatService()

  /** Strip agent__ prefix and format tool name for display */
  const friendlyToolName = useCallback((name: string | undefined): string => {
    if (!name) return ''
    if (name.startsWith('agent__')) {
      return name.replace('agent__', '').replace(/_/g, ' ')
    }
    // MCP tool: "serverName__toolName"
    return name.replace('__', ': ').replace(/_/g, ' ')
  }, [])

  const { playingMessageId, ttsState, speak, stop } = useTTS()

  // Check if user is near bottom of scroll container
  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  // Handle scroll events
  const handleScroll = useCallback(() => {
    const nearBottom = isNearBottom()
    setShowScrollBtn(!nearBottom)
    setUserScrolledUp(!nearBottom)
  }, [isNearBottom])

  // Auto-scroll only when user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUp) {
      bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
    }
  }, [messages, streamingContent, streamingReasoning, userScrolledUp])

  // When new message arrives (non-streaming), reset scroll state
  useEffect(() => {
    if (!isStreaming) {
      setUserScrolledUp(false)
    }
  }, [isStreaming])

  const scrollToBottom = useCallback(() => {
    setUserScrolledUp(false)
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [])

  // Find the last assistant message ID (exclude status messages)
  const lastAssistantId = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].messageKind !== 'status') return messages[i].id
    }
    return undefined
  }, [messages])

  // Regenerate: remove last assistant message and re-send
  const handleRegenerate = useCallback(async () => {
    if (isStreaming) return

    // Find last user message text
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMsg) return

    // Remove last assistant message and everything after it
    const lastAssistantIdx = [...messages].reverse().findIndex(m => m.role === 'assistant')
    if (lastAssistantIdx === -1) return

    const cutIdx = messages.length - 1 - lastAssistantIdx
    const trimmed = messages.slice(0, cutIdx)
    useChatStore.setState({ messages: trimmed })

    // Re-send the last user message
    await sendMessage(lastUserMsg.content)
  }, [messages, isStreaming, sendMessage])

  // Edit user message: remove it and all subsequent messages, then re-send
  const handleEdit = useCallback(async (messageId: string, newContent: string) => {
    if (isStreaming) return

    const msgIdx = messages.findIndex(m => m.id === messageId)
    if (msgIdx === -1) return

    // Keep messages before the edited one
    const before = messages.slice(0, msgIdx)
    useChatStore.setState({ messages: before })

    // Re-send the edited content
    await sendMessage(newContent)
  }, [messages, isStreaming, sendMessage])

  // Delete a single message
  const handleDelete = useCallback((messageId: string) => {
    removeMessage(messageId)
  }, [removeMessage])

  // Copy to clipboard
  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(() => {})
  }, [])

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 relative" ref={scrollContainerRef} onScroll={handleScroll}>
      {messages.length === 0 && !isStreaming && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-gray-400 dark:text-gray-500">
            <p className="text-2xl font-extrabold tracking-tighter bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-1">WM</p>
            {/* Agent mode toggle */}
            <div className="flex justify-center my-3">
              <button
                onClick={() => setAgentEnabled(!agentEnabled)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                  agentEnabled
                    ? "bg-purple-600 text-white shadow-sm"
                    : "border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-purple-400"
                )}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
                  <circle cx="9" cy="14" r="1" fill="currentColor" />
                  <circle cx="15" cy="14" r="1" fill="currentColor" />
                </svg>
                {agentEnabled && <span>{t('agentMode')}</span>}
              </button>
            </div>
            <p className="text-sm">{t('emptyState')}</p>
          </div>
        </div>
      )}

      {messages.map(msg => (
        <MessageBubble
          key={msg.id}
          role={msg.role}
          content={msg.content}
          images={msg.images}
          reasoningContent={msg.reasoningContent}
          messageKind={msg.messageKind}
          toolCalls={msg.toolCalls}
          toolName={msg.toolName}
          toolServerName={msg.toolServerName}
          toolArgs={msg.toolArgs}
          toolError={msg.toolError}
          sources={msg.sources}
          search={msg.search}
          messageId={msg.id}
          isLastAssistant={msg.id === lastAssistantId}
          isCurrentlyStreaming={false}
          createdAt={msg.createdAt}
          modelName={msg.modelName}
          generationInfo={msg.generationInfo}
          onSpeak={msg.role === 'assistant' ? (text) => speak(msg.id, text) : undefined}
          onStop={playingMessageId === msg.id ? stop : undefined}
          ttsState={playingMessageId === msg.id ? ttsState : undefined}
          onCopy={handleCopy}
          onRegenerate={msg.id === lastAssistantId ? handleRegenerate : undefined}
          onEdit={msg.role === 'user' ? handleEdit : undefined}
          onDelete={handleDelete}
        />
      ))}

      {isStreaming && (
        <>
          {/* Streaming bubble — only show when there's actual content or reasoning */}
          {(streamingContent || streamingReasoning) && (
            <MessageBubble
              role="assistant"
              content={streamingContent}
              reasoningContent={streamingReasoning || undefined}
              isCurrentlyStreaming={true}
              modelName={streamingModelId || undefined}
              generationInfo={streamingGenerationInfo || undefined}
            />
          )}
          {/* Typing indicator when waiting for first token */}
          {!streamingContent && !streamingReasoning && !agentActionInfo && (
            <div className="flex justify-start mb-3">
              <div className="rounded-lg px-4 py-3 bg-gray-100 dark:bg-gray-800">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          {/* Agent action info */}
          {agentActionInfo && (
            <div className="flex justify-start mb-3">
              <div className="rounded-lg px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs flex items-center gap-2">
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>
                  {agentActionInfo.phase === 'streaming' && t('agentStreaming')}
                  {agentActionInfo.phase === 'calling_tool' && t('agentCallingTool', { tool: friendlyToolName(agentActionInfo.toolName) })}
                  {agentActionInfo.phase === 'tool_done' && t('agentToolDone', { tool: friendlyToolName(agentActionInfo.toolName) })}
                  {agentActionInfo.phase === 'awaiting_approval' && t('agentAwaitingApproval', { tool: friendlyToolName(agentActionInfo.toolName) })}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      <div ref={bottomRef} />

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 right-6 z-fixed h-8 w-8 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          title={t('scrollToBottom', 'Scroll to bottom')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </div>
  )
}

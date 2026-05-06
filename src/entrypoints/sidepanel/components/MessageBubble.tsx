import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { marked } from 'marked'
import type { TTSPlaybackState } from '@/tts/types'
import type { ToolCall } from '@/types/tool'
import type { ChatMessageKind } from '@/types/chat'
import type { SourceReference } from '@/types/message'
import type { WebSearch } from '@/types/chat'
import { ToolCallCard } from './ToolCallCard'
import { Citations } from './SourceCard'
import { filterReasoningContent } from './reasoning-filter'

/** Regex matching element references in sent messages */
const ELEMENT_REF_IN_MESSAGE = /\[element:\s*(\S+)\s*<(\w+)>(?:\s*"([^"]*)")?\]|\[Refers to element:\s*(\S+)\s*<(\w+)>(?:\s*"([^"]*)")?\]/g

/**
 * Render user message content with element references shown as inline chips.
 */
function renderUserContent(content: string) {
  const parts: Array<{ type: 'text' | 'element'; text: string; agentId?: string; tag?: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  const regex = new RegExp(ELEMENT_REF_IN_MESSAGE.source, 'g')
  while ((match = regex.exec(content)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: content.slice(lastIndex, match.index) })
    }
    const agentId = match[1] ?? match[4]
    const tag = match[2] ?? match[5]
    const text = match[3] ?? match[6]
    parts.push({ type: 'element', text: '', agentId, tag, text })
    lastIndex = regex.lastIndex
  }
  // Remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', text: content.slice(lastIndex) })
  }

  if (parts.length === 0) {
    // No element refs — render as before
    return content.split('\n').map((line, i, arr) => (
      <React.Fragment key={i}>
        {line}
        {i < arr.length - 1 && <br />}
      </React.Fragment>
    ))
  }

  return parts.map((part, i) => {
    if (part.type === 'text') {
      return part.text.split('\n').map((line, j) => (
        <React.Fragment key={`${i}-${j}`}>
          {line}
          <br />
        </React.Fragment>
      ))
    }
    return (
      <span
        key={`el-${i}`}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded
          bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300
          text-[11px] font-medium align-middle whitespace-nowrap"
      >
        <svg className="w-3 h-3 opacity-60 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
        {part.agentId}
        <span className="opacity-60">&lt;{part.tag}&gt;</span>
        {part.text && <span className="opacity-70 max-w-[80px] truncate">&quot;{part.text}&quot;</span>}
      </span>
    )
  })
}

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  images?: string[]
  reasoningContent?: string
  messageKind?: ChatMessageKind
  toolCalls?: ToolCall[]
  toolName?: string
  toolServerName?: string
  toolArgs?: Record<string, unknown>
  toolError?: boolean
  sources?: SourceReference[]
  search?: WebSearch
  isLastAssistant?: boolean
  isCurrentlyStreaming?: boolean
  messageId?: string
  createdAt?: number
  modelName?: string
  generationInfo?: Record<string, unknown>
  onSpeak?: (text: string) => void
  onStop?: () => void
  ttsState?: TTSPlaybackState
  onCopy?: (content: string) => void
  onRegenerate?: () => void
  onEdit?: (messageId: string, newContent: string) => void
  onDelete?: (messageId: string) => void
}

/** Format timestamp to HH:mm or MM/DD HH:mm */
function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const time = `${h}:${m}`
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return time
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${time}`
}

/** Format full datetime for tooltip */
function formatFullTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString()
}

/** Format duration from milliseconds */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const mins = Math.floor(s / 60)
  const secs = Math.round(s % 60)
  return `${mins}m ${secs}s`
}

/** Extract token info from generationInfo (handles Ollama, OpenAI, Anthropic) */
function getTokenInfo(genInfo: Record<string, unknown> | undefined): {
  prompt?: number
  completion?: number
} {
  if (!genInfo) return {}

  // Ollama: eval_count (completion), prompt_eval_count (prompt)
  const evalCount = typeof genInfo.eval_count === 'number' ? genInfo.eval_count : undefined
  const promptEvalCount = typeof genInfo.prompt_eval_count === 'number' ? genInfo.prompt_eval_count : undefined

  // Anthropic: output_tokens
  const outputTokens = typeof genInfo.output_tokens === 'number' ? genInfo.output_tokens : undefined

  // OpenAI: stored in _usageMetadata
  const usageMeta = genInfo._usageMetadata as { promptTokens?: number; completionTokens?: number } | undefined

  return {
    prompt: promptEvalCount ?? usageMeta?.promptTokens,
    completion: evalCount ?? outputTokens ?? usageMeta?.completionTokens,
  }
}

export function MessageBubble({
  role,
  content,
  images,
  reasoningContent,
  messageKind,
  toolCalls,
  toolName,
  toolServerName,
  toolArgs,
  toolError,
  sources,
  search,
  isLastAssistant,
  isCurrentlyStreaming,
  messageId,
  createdAt,
  modelName,
  generationInfo,
  onSpeak,
  onStop,
  ttsState,
  onCopy,
  onRegenerate,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const isUser = role === 'user'
  const isAssistant = role === 'assistant'
  const isPlaying = ttsState === 'playing' || ttsState === 'loading'
  const canSpeak = isAssistant && onSpeak
  const { t } = useTranslation(['sidepanel', 'common'])

  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(content)
  const editRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus()
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length)
    }
  }, [editing])

  // Extract metadata for assistant messages
  const responseTimeMs = typeof generationInfo?._responseTimeMs === 'number'
    ? generationInfo._responseTimeMs as number
    : undefined
  const tokens = isAssistant ? getTokenInfo(generationInfo) : undefined

  // Status message — centered divider line (e.g. "Task cancelled")
  if (messageKind === 'status') {
    return (
      <div className="flex items-center justify-center my-4 gap-2">
        <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{content}</span>
        <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
      </div>
    )
  }

  // Tool result message
  if (messageKind === 'tool_result') {
    return (
      <div className="flex justify-start mb-3">
        <ToolCallCard
          toolName={toolName ?? 'unknown'}
          serverName={toolServerName}
          args={toolArgs}
          result={content}
          isError={toolError}
        />
      </div>
    )
  }

  // Assistant tool calls
  if (messageKind === 'assistant_tool_calls' && toolCalls && toolCalls.length > 0) {
    return (
      <div className="flex justify-start mb-3 space-y-1">
        {toolCalls.map((tc) => (
          <ToolCallCard
            key={tc.id}
            toolName={tc.name}
            args={tc.args}
          />
        ))}
      </div>
    )
  }

  // Inline edit mode for user messages
  if (editing && isUser) {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[85%] w-full rounded-lg px-3 py-2 bg-blue-600 text-white">
          <textarea
            ref={editRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full bg-transparent text-sm resize-none outline-none placeholder:text-blue-200"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                if (editContent.trim() && messageId && onEdit) {
                  onEdit(messageId, editContent.trim())
                  setEditing(false)
                }
              }
              if (e.key === 'Escape') {
                setEditing(false)
                setEditContent(content)
              }
            }}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => { setEditing(false); setEditContent(content) }}
              className="text-xs px-2 py-1 rounded hover:bg-blue-500 transition-colors"
            >
              {t('sidepanel:cancel')}
            </button>
            <button
              onClick={() => {
                if (editContent.trim() && messageId && onEdit) {
                  onEdit(messageId, editContent.trim())
                  setEditing(false)
                }
              }}
              className="text-xs px-2 py-1 rounded bg-white/20 hover:bg-white/30 transition-colors"
            >
              {t('sidepanel:save')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleCopy = () => {
    if (onCopy) {
      onCopy(content)
    } else {
      navigator.clipboard.writeText(content).catch(() => {})
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Build metadata parts for assistant messages
  const metaParts: string[] = []
  if (modelName) metaParts.push(modelName)
  if (responseTimeMs !== undefined) metaParts.push(formatDuration(responseTimeMs))
  if (tokens?.completion) {
    const parts: string[] = []
    if (tokens.prompt) parts.push(`${tokens.prompt} in`)
    parts.push(`${tokens.completion} out`)
    metaParts.push(parts.join(' / '))
  }
  if (createdAt) metaParts.push(formatTime(createdAt))

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 group`}>
      <div className="max-w-[85%] flex flex-col">
        <div className="relative">
          <div
            className={`rounded-2xl px-3 py-2 text-sm ${
              isUser
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            }`}
          >
            {reasoningContent && (
              <details open={isCurrentlyStreaming} className="mb-2">
                <summary className="text-xs opacity-60 cursor-pointer hover:opacity-80 flex items-center gap-1.5">
                  {isCurrentlyStreaming && (
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
                  )}
                  {isCurrentlyStreaming
                    ? t('common:reasoningThinking', 'Thinking...')
                    : t('common:reasoningDone', 'Thought')
                  }
                </summary>
                <div className={`mt-1 p-2 text-xs bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300 whitespace-pre-wrap ${isCurrentlyStreaming ? 'max-h-40 overflow-y-auto' : ''}`}>
                  {filterReasoningContent(reasoningContent)}
                </div>
              </details>
            )}
            {images && images.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {images.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt={`attachment ${i + 1}`}
                    className="max-h-40 max-w-full rounded object-contain"
                  />
                ))}
              </div>
            )}
            <div className={`markdown-body ${isUser ? '' : 'prose prose-sm dark:prose-invert max-w-none'}`}>
              {isUser ? (
                renderUserContent(content)
              ) : (
                <span dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
              )}
            </div>

            {/* Source citations */}
            {!isUser && sources && sources.length > 0 && (
              <Citations sources={sources} />
            )}

            {/* Search results links */}
            {!isUser && search && search.search_results && search.search_results.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => {
                    const details = document.getElementById(`search-${messageId}`)
                    details?.toggleAttribute('open')
                  }}
                  className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                  </svg>
                  {search.search_engine}: {search.search_query}
                </button>
                <details id={`search-${messageId}`} className="mt-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {search.search_results.map((result, i) => (
                      <a
                        key={i}
                        href={result.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors max-w-[200px]"
                      >
                        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                        </svg>
                        <span className="truncate">{result.title}</span>
                      </a>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>

          {/* Floating action bar — overlays below bubble on hover */}
          <div className={`
            absolute bottom-0 ${isUser ? 'right-0' : 'left-0'}
            translate-y-full
            opacity-0 group-hover:opacity-100
            transition-opacity duration-150 pointer-events-none
            group-hover:pointer-events-auto
            flex items-center gap-0.5
            bg-popover border border-border rounded-md shadow-sm px-1 py-0.5 z-20
          `}>
            {/* Copy — all messages */}
            <ActionButton
              title={copied ? t('sidepanel:copied') : t('sidepanel:copy')}
              onClick={handleCopy}
            >
              {copied ? (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </ActionButton>

            {/* TTS — assistant messages */}
            {canSpeak && (
              <>
                {isPlaying ? (
                  <ActionButton title={t('sidepanel:stop')} onClick={() => onStop?.()}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  </ActionButton>
                ) : (
                  <ActionButton title={t('sidepanel:readAloud')} onClick={() => onSpeak(content)}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                    </svg>
                  </ActionButton>
                )}
              </>
            )}

            {/* Regenerate — last assistant message */}
            {isAssistant && isLastAssistant && onRegenerate && (
              <ActionButton title={t('sidepanel:regenerate')} onClick={onRegenerate}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M1 4v6h6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                </svg>
              </ActionButton>
            )}

            {/* Edit — user messages */}
            {isUser && onEdit && messageId && (
              <ActionButton
                title={t('sidepanel:edit')}
                onClick={() => { setEditContent(content); setEditing(true) }}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </ActionButton>
            )}

            {/* Delete — all messages */}
            {onDelete && messageId && (
              <ActionButton title={t('sidepanel:deleteMessage')} onClick={() => onDelete(messageId)}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </ActionButton>
            )}
          </div>
        </div>

        {/* Metadata line below the bubble */}
        {isAssistant && metaParts.length > 0 && (
          <div
            className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground flex-wrap"
            title={createdAt ? formatFullTime(createdAt) : undefined}
          >
            {metaParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="opacity-40">·</span>}
                <span>{part}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Timestamp for user messages */}
        {isUser && createdAt && (
          <div
            className="text-[11px] text-muted-foreground mt-0.5 text-right"
            title={formatFullTime(createdAt)}
          >
            {formatTime(createdAt)}
          </div>
        )}
      </div>
    </div>
  )
}

/** Render markdown to sanitized HTML */
function renderMarkdown(text: string): string {
  try {
    return marked.parse(text, { async: false }) as string
  } catch {
    return text
  }
}

function ActionButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
      title={title}
    >
      {children}
    </button>
  )
}

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { chatHistoryRepo } from '@/db/repositories/chat-history.repository'
import { useChatStore } from '@/store/chat-store'
import { messageRepo } from '@/db/repositories/message.repository'
import type { HistoryInfo } from '@/db/types'
import type { ChatMessage } from '@/types/message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { sessionPreferencesStorage, agentSummaryStorage, compressedHistoryStorage } from '@/storage/session-preferences'
import { modelSettingsStorage } from '@/storage/model-settings'

const PAGE_SIZE = 20

function groupByDate(histories: HistoryInfo[]): Map<string, HistoryInfo[]> {
  const now = Date.now()
  const DAY = 86_400_000
  const groups = new Map<string, HistoryInfo[]>()

  for (const h of histories) {
    const age = now - h.createdAt
    let group: string
    if (age < DAY) group = 'today'
    else if (age < 2 * DAY) group = 'yesterday'
    else if (age < 7 * DAY) group = 'last7Days'
    else group = 'older'

    const list = groups.get(group) ?? []
    list.push(h)
    groups.set(group, list)
  }

  return groups
}

interface HistorySidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function HistorySidebar({ isOpen, onClose }: HistorySidebarProps) {
  const { t } = useTranslation('sidepanel')
  const historyId = useChatStore(s => s.historyId)
  const setHistoryId = useChatStore(s => s.setHistoryId)
  const setMessages = useChatStore(s => s.setMessages)
  const newChat = useChatStore(s => s.newChat)
  const setModel = useChatStore(s => s.setModel)
  const setMode = useChatStore(s => s.setMode)
  const setAgentEnabled = useChatStore(s => s.setAgentEnabled)
  const setLastAgentSummary = useChatStore(s => s.setLastAgentSummary)
  const setCompressedHistorySummary = useChatStore(s => s.setCompressedHistorySummary)
  const setTemporary = useChatStore(s => s.setTemporary)
  const setSelectedPromptId = useChatStore(s => s.setSelectedPromptId)

  const [histories, setHistories] = useState<HistoryInfo[]>([])
  const [pinned, setPinned] = useState<HistoryInfo[]>([])
  const [offset, setOffset] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load histories
  const loadHistories = useCallback(async () => {
    setLoading(true)
    try {
      if (debouncedQuery) {
        const results = await chatHistoryRepo.searchByTitle(debouncedQuery)
        setHistories(results)
        setPinned([])
        setHasMore(false)
      } else {
        const pinnedHists = await chatHistoryRepo.getPinned()
        const allHists = await chatHistoryRepo.getPaginated(0, PAGE_SIZE)
        setPinned(pinnedHists)
        setHistories(allHists.filter(h => !pinnedHists.some(p => p.id === h.id)))
        setHasMore(allHists.length === PAGE_SIZE)
        setOffset(PAGE_SIZE)
      }
    } finally {
      setLoading(false)
    }
  }, [debouncedQuery])

  useEffect(() => {
    if (isOpen) loadHistories()
  }, [isOpen, loadHistories])

  // Load more
  const loadMore = useCallback(async () => {
    if (!hasMore || debouncedQuery) return
    setLoading(true)
    try {
      const more = await chatHistoryRepo.getPaginated(offset, PAGE_SIZE)
      setHistories(prev => [
        ...prev,
        ...more.filter(h => !pinned.some(p => p.id === h.id)),
      ])
      setHasMore(more.length === PAGE_SIZE)
      setOffset(prev => prev + PAGE_SIZE)
    } finally {
      setLoading(false)
    }
  }, [hasMore, offset, debouncedQuery])

  // Group unpinned by date
  const dateGroups = useMemo(() => {
    if (debouncedQuery) return null
    return groupByDate(histories)
  }, [histories, debouncedQuery])

  const dateOrder = ['today', 'yesterday', 'last7Days', 'older'] as const

  // Select a chat — load messages and restore session preferences
  const handleSelect = useCallback(async (history: HistoryInfo) => {
    if (historyId === history.id) return

    // First, clear the compressed history summary to prevent cross-contamination
    setCompressedHistorySummary(null)

    // Then set the new history ID and load messages
    setHistoryId(history.id)
    const msgs = await messageRepo.getByHistoryId(history.id)

    // Debug logging
    console.log('[HistorySidebar] Loading history:', history.id)
    console.log('[HistorySidebar] Messages loaded:', msgs.length)
    console.log('[HistorySidebar] Messages:', msgs)

    setMessages(msgs as unknown as ChatMessage[])

    // Restore session preferences (model, mode, agent).
    // Wrapped in try/catch so storage failures don't block conversation loading.
    try {
      const prefs = await sessionPreferencesStorage.get(history.id)
      if (prefs && prefs.providerType && prefs.modelId) {
        setModel(prefs.providerType, prefs.modelId, prefs.providerConfigId ?? undefined)
        setMode(prefs.mode ?? 'normal')
        setAgentEnabled(prefs.agentEnabled ?? false)
        setTemporary(prefs.isTemporary ?? false)
        setSelectedPromptId(prefs.selectedPromptId ?? null)
      } else {
        // Fallback: try legacy last-used model, reset agent/mode to defaults
        const lastModel = await modelSettingsStorage.getLastUsedModel(history.id)
        if (lastModel) {
          setModel(lastModel.providerType, lastModel.modelId)
        }
        setAgentEnabled(false)
        setMode('normal')
      }

      // Restore agent run summary for task continuation
      const summary = await agentSummaryStorage.get(history.id)
      setLastAgentSummary(summary ?? null)

      // Restore compressed conversation summary AFTER messages are loaded
      const compressed = await compressedHistoryStorage.get(history.id)
      setCompressedHistorySummary(compressed ?? null)
    } catch {
      // Storage read failure — leave model/mode at current values
    }

    onClose()
  }, [historyId, setHistoryId, setMessages, setModel, setMode, setAgentEnabled, setLastAgentSummary, setCompressedHistorySummary, setSelectedPromptId, setTemporary, onClose])

  // New chat
  const handleNewChat = useCallback(() => {
    // Clear compressed history summary when starting a new chat
    setCompressedHistorySummary(null)
    setLastAgentSummary(null)
    newChat()
  }, [newChat, setCompressedHistorySummary, setLastAgentSummary])

  // Delete — remove history, messages, and session preferences
  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id)
    try {
      await chatHistoryRepo.delete(id)
      await messageRepo.deleteByHistoryId(id)
      // Best-effort cleanup of session prefs and agent summary
      try {
        await sessionPreferencesStorage.remove(id)
        await agentSummaryStorage.remove(id)
        await compressedHistoryStorage.remove(id)
      } catch {
        // Storage cleanup failure is non-critical
      }
      if (historyId === id) {
        newChat()
      }
      loadHistories()
    } finally {
      setDeletingId(null)
    }
  }, [historyId, newChat, loadHistories])

  // Pin/unpin
  const handleTogglePin = useCallback(async (history: HistoryInfo) => {
    await chatHistoryRepo.updatePinStatus(history.id, !history.is_pinned)
    loadHistories()
  }, [loadHistories])

  // Date group label
  const getGroupLabel = (group: string) => {
    const labels: Record<string, string> = {
      today: t('today'),
      yesterday: t('yesterday'),
      last7Days: t('last7Days'),
      older: t('older'),
    }
    return labels[group] ?? group
  }

  if (!isOpen) return null

  return (
    <div className="absolute left-0 top-0 bottom-0 z-dropdown w-64 flex flex-col border-r border-border bg-background shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {t('history')}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6"
          title={t('dismiss')}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('searchHistory')}
          className="h-8 text-xs"
        />
      </div>

      {/* New chat button */}
      <div className="px-3 pb-2">
        <Button
          variant="ghost"
          onClick={handleNewChat}
          className="w-full text-xs text-primary"
          size="sm"
        >
          <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t('newChat')}
        </Button>
      </div>

      {/* Chat list */}
      <ScrollArea className="flex-1">
        <div className="px-3 pb-3 space-y-2">
        {loading && histories.length === 0 && pinned.length === 0 && (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary animate-spin rounded-full" />
          </div>
        )}

        {!loading && histories.length === 0 && pinned.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {t('noHistory')}
          </p>
        )}

        {/* Pinned section */}
        {pinned.length > 0 && !debouncedQuery && (
          <div>
            <h3 className="text-[10px] font-medium uppercase text-muted-foreground px-1 mb-1">
              {t('pinned')}
            </h3>
            {pinned.map(h => (
              <ChatItem
                key={h.id}
                history={h}
                isActive={h.id === historyId}
                onSelect={handleSelect}
                onDelete={handleDelete}
                onTogglePin={handleTogglePin}
                isDeleting={deletingId === h.id}
              />
            ))}
          </div>
        )}

        {/* Date-grouped or search results */}
        {debouncedQuery ? (
          <div>
            <h3 className="text-[10px] font-medium uppercase text-muted-foreground px-1 mb-1">
              {histories.length} results
            </h3>
            {histories.map(h => (
              <ChatItem
                key={h.id}
                history={h}
                isActive={h.id === historyId}
                onSelect={handleSelect}
                onDelete={handleDelete}
                isDeleting={deletingId === h.id}
              />
            ))}
          </div>
        ) : dateGroups ? (
          dateOrder.map(group => {
            const items = dateGroups.get(group)
            if (!items || items.length === 0) return null
            return (
              <div key={group}>
                <h3 className="text-[10px] font-medium uppercase text-muted-foreground px-1 mb-1">
                  {getGroupLabel(group)}
                </h3>
                {items.map(h => (
                  <ChatItem
                    key={h.id}
                    history={h}
                    isActive={h.id === historyId}
                    onSelect={handleSelect}
                    onDelete={handleDelete}
                    onTogglePin={handleTogglePin}
                    isDeleting={deletingId === h.id}
                  />
                ))}
              </div>
            )
          })
        ) : null}

        {/* Load more */}
        {hasMore && !debouncedQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={loadMore}
            disabled={loading}
            className="w-full text-xs text-primary"
          >
            {loading ? t('loading') : t('loadMore')}
          </Button>
        )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface ChatItemProps {
  history: HistoryInfo
  isActive: boolean
  onSelect: (h: HistoryInfo) => void
  onDelete: (id: string) => void
  onTogglePin?: (h: HistoryInfo) => void
  isDeleting: boolean
}

function ChatItem({ history, isActive, onSelect, onDelete, onTogglePin, isDeleting }: ChatItemProps) {
  const [showActions, setShowActions] = useState(false)

  return (
    <div
      className={`group relative flex items-start gap-1.5 rounded px-2 py-1.5 cursor-pointer text-xs transition-colors ${
        isActive
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-accent text-foreground'
      }`}
      onClick={() => onSelect(history)}
      onContextMenu={(e) => {
        e.preventDefault()
        setShowActions(prev => !prev)
      }}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium leading-tight">{history.title || 'Untitled'}</p>
        <p className="text-[10px] opacity-60 mt-0.5">
          {formatTime(history.createdAt)}
        </p>
      </div>

      {/* Actions dropdown */}
      {showActions && (
        <div className="absolute right-1 top-1 z-20 rounded border border-border bg-popover shadow-sm py-0.5 min-w-[80px]">
          {onTogglePin && (
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(history); setShowActions(false) }}
              className="w-full text-left px-2 py-1 text-xs hover:bg-accent rounded"
            >
              {history.is_pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(history.id); setShowActions(false) }}
            className="w-full text-left px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded"
          >
            {isDeleting ? '...' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const isYesterday = new Date(now.getTime() - 86_400_000).toDateString() === date.toDateString()
  if (isYesterday) return 'Yesterday'

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

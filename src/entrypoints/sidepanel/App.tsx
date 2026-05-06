import React, { useState, useCallback, useEffect } from 'react'
import '@/i18n'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat-store'
import { ModelSelector } from './components/ModelSelector'
import { MessageList } from './components/MessageList'
import { ChatInput } from './components/ChatInput'
import { HistorySidebar } from './components/HistorySidebar'
import { ModeSelector } from './components/ModeSelector'
import { AskUserDialog } from './components/AskUserDialog'
import { AgentPlanCard } from './components/AgentPlanCard'
import { PromptSelector } from './components/PromptSelector'
import { useCopilotBroadcast } from './hooks/use-copilot'
import { Button } from '@/components/ui/button'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { themeStorage, resolveTheme, applyThemeClass } from '@/storage/theme-storage'
import type { ThemeMode } from '@/storage/theme-storage'

export default function SidepanelApp() {
  const newChat = useChatStore(s => s.newChat)
  const isTemporary = useChatStore(s => s.isTemporary)
  const setTemporary = useChatStore(s => s.setTemporary)
  const error = useChatStore(s => s.error)
  const setError = useChatStore(s => s.setError)
  const triggerSelectElement = useChatStore(s => s.triggerSelectElement)
  const setPendingAskUser = useChatStore(s => s.setPendingAskUser)
  const setAgentPlan = useChatStore(s => s.setAgentPlan)
  const agentEnabled = useChatStore(s => s.agentEnabled)
  const { t } = useTranslation('sidepanel')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  useCopilotBroadcast()

  // Theme management
  useEffect(() => {
    // Load saved theme on mount
    themeStorage.get().then(mode => {
      setThemeMode(mode)
      applyThemeClass(resolveTheme(mode))
    })

    // Listen for system preference changes when in 'system' mode
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      applyThemeClass(resolveTheme('system'))
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const cycleTheme = useCallback(() => {
    const next: ThemeMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light'
    setThemeMode(next)
    applyThemeClass(resolveTheme(next))
    themeStorage.set(next)
  }, [themeMode])

  // Listen for agent_ask_user and agent_plan_update messages from background
  useEffect(() => {
    const listener = (message: unknown) => {
      if (!message || typeof message !== 'object') return
      const msg = message as Record<string, unknown>
      if (msg.type === 'agent_ask_user') {
        setPendingAskUser({
          toolCallId: msg.toolCallId as string,
          question: msg.question as string,
          options: msg.options as string[] | undefined,
        })
      }
      if (msg.type === 'agent_plan_update' && msg.plan) {
        setAgentPlan(msg.plan as import('@/types/agent-plan').AgentPlan)
      }
      if (msg.type === 'trigger_select_element') {
        triggerSelectElement()
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [setPendingAskUser, setAgentPlan, triggerSelectElement])

  const isOllamaOriginError = error === 'LOCAL_ORIGIN_FORBIDDEN'

  const handleCopyCommand = useCallback((cmd: string) => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [])

  return (
    <TooltipProvider delayDuration={300}>
    <div className={`relative flex h-screen bg-background text-foreground overflow-hidden ${
      isTemporary ? 'border-t-2 border-orange-400' : ''
    }`}>
      {/* History Sidebar — absolute overlay so it doesn't push main content */}
      <HistorySidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-extrabold tracking-tighter bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent select-none">
              WM
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(prev => !prev)}
                  className="h-8 w-8"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('history')}</TooltipContent>
            </Tooltip>
            <ModelSelector />
            <ModeSelector />
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Agent status badge */}
            {agentEnabled && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[10px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                Agent
              </div>
            )}
            {/* System prompt selector */}
            <PromptSelector />
            {/* Overflow menu: Theme + Settings + Temporary chat */}
            <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className={`h-8 w-8 ${isTemporary ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : ''}`}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-1 z-30">
                {/* Theme toggle */}
                <button
                  onClick={() => { cycleTheme() }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {themeMode === 'light' ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                  ) : themeMode === 'dark' ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  )}
                  <span>{themeMode === 'light' ? t('themeLight') : themeMode === 'dark' ? t('themeDark') : t('themeSystem')}</span>
                </button>
                {/* Settings */}
                <button
                  onClick={() => { setOverflowOpen(false); chrome.runtime.openOptionsPage() }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{t('settings')}</span>
                </button>
                {/* Temporary chat toggle */}
                <button
                  onClick={() => { setTemporary(!isTemporary) }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className={isTemporary ? 'text-orange-600 dark:text-orange-400' : ''}>
                    {isTemporary ? t('temporaryChatOn') : t('temporaryChat')}
                  </span>
                </button>
              </PopoverContent>
            </Popover>
            {/* New chat */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={newChat}
                  className="h-8 w-8"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('newChat')}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Messages */}
        <AgentPlanCard />
        <MessageList />

        {/* Ollama 403 Origin Error Guide */}
        {isOllamaOriginError && (
          <div className="mx-3 mb-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
            <div className="flex items-start justify-between">
              <p className="font-medium text-destructive">{t('ollamaOriginTitle')}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                className="text-destructive/60 hover:text-destructive h-auto p-0 text-lg leading-none"
              >
                &times;
              </Button>
            </div>
            <p className="mt-1 text-destructive/80 text-xs">{t('ollamaOriginDesc')}</p>
            <div className="mt-2 space-y-2">
              <div>
                <p className="text-xs text-destructive/70 mb-0.5">{t('ollamaOriginWindows')}</p>
                <div className="flex items-center gap-1">
                  <code className="flex-1 px-2 py-1 bg-background rounded text-xs font-mono select-all">
                    $env:OLLAMA_ORIGINS="*"; ollama serve
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopyCommand('$env:OLLAMA_ORIGINS="*"; ollama serve')}
                    className="text-xs"
                  >
                    {copied ? t('copiedCommand') : t('copy')}
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-xs text-destructive/70 mb-0.5">{t('ollamaOriginMacLinux')}</p>
                <div className="flex items-center gap-1">
                  <code className="flex-1 px-2 py-1 bg-background rounded text-xs font-mono select-all">
                    OLLAMA_ORIGINS=* ollama serve
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopyCommand('OLLAMA_ORIGINS=* ollama serve')}
                    className="text-xs"
                  >
                    {copied ? t('copiedCommand') : t('copy')}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-destructive/70">{t('ollamaOriginAfter')}</p>
              <p className="text-xs text-destructive/60">{t('ollamaOriginEnvVar')}</p>
            </div>
          </div>
        )}

        {/* Input */}
        <ChatInput />
      </div>

      {/* Agent ask_user dialog */}
      <AskUserDialog />
    </div>
    </TooltipProvider>
  )
}

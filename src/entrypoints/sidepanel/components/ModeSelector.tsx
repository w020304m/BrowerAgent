import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat-store'
import type { ChatMode } from '@/chat-pipeline/types'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

const MODES: { value: ChatMode; icon: string }[] = [
  { value: 'normal', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { value: 'rag', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { value: 'search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { value: 'tab', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
  { value: 'document', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { value: 'vision', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' },
  { value: 'mcp', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { value: 'copilot', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
]

const modeLabelKey: Record<ChatMode, string> = {
  normal: 'modeNormal',
  rag: 'modeRag',
  search: 'modeSearch',
  tab: 'modeTab',
  document: 'modeDocument',
  vision: 'modeVision',
  mcp: 'modeMcp',
  copilot: 'modeCopilot',
}

export function ModeSelector() {
  const { t } = useTranslation('sidepanel')
  const mode = useChatStore(s => s.mode)
  const setMode = useChatStore(s => s.setMode)
  const agentEnabled = useChatStore(s => s.agentEnabled)
  const setAgentEnabled = useChatStore(s => s.setAgentEnabled)
  const [open, setOpen] = useState(false)

  const currentMode = MODES.find(m => m.value === mode) ?? MODES[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xs ${
            agentEnabled ? 'text-purple-600 dark:text-purple-400' : ''
          }`}
          title={t(modeLabelKey[mode])}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={currentMode.icon} />
          </svg>
          {agentEnabled && (
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-48 p-0 z-30"
      >
        <div className="py-1">
          {MODES.map(m => (
            <button
              key={m.value}
              onClick={() => { setMode(m.value); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                mode === m.value
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={m.icon} />
              </svg>
              {t(modeLabelKey[m.value])}
            </button>
          ))}
        </div>

        {/* Separator + Agent toggle */}
        <div className="border-t border-gray-200 dark:border-gray-600 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93V12h3.75a2.5 2.5 0 0 1 2.5 2.5v1.75c1.85.35 3.25 1.98 3.25 3.93a4 4 0 1 1-7.25-2.33V14.5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0-.5.5v3.35A4 4 0 1 1 3 20.18c0-1.95 1.4-3.58 3.25-3.93V14.5A2.5 2.5 0 0 1 8.75 12h3.5V9.93A4.002 4.002 0 0 1 12 2z" />
            </svg>
            {t('agentMode')}
          </div>
          <button
            onClick={() => setAgentEnabled(!agentEnabled)}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              agentEnabled ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                agentEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

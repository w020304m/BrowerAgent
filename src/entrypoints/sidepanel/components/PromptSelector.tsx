import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat-store'
import { promptRepo } from '@/db/repositories/prompt.repository'
import type { Prompt } from '@/db/types'
import { Button } from '@/components/ui/button'

export function PromptSelector() {
  const { t } = useTranslation('sidepanel')
  const selectedPromptId = useChatStore(s => s.selectedPromptId)
  const setSelectedPromptId = useChatStore(s => s.setSelectedPromptId)
  const [open, setOpen] = useState(false)
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  // Load prompts when popover opens
  useEffect(() => {
    if (!open) return
    const load = async () => {
      const [system, user] = await Promise.all([
        promptRepo.getSystemPrompts(),
        promptRepo.getUserPrompts(),
      ])
      setPrompts([...system, ...user])
    }
    load()
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = (id: string | null) => {
    setSelectedPromptId(id === selectedPromptId ? null : id)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(prev => !prev)}
        className={`h-8 w-8 relative ${selectedPromptId ? 'text-blue-600 dark:text-blue-400' : ''}`}
        title={t('selectPrompt')}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {selectedPromptId && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
        )}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-popover shadow-md py-1 max-h-64 overflow-y-auto">
          {/* Default option */}
          <button
            onClick={() => handleSelect(null)}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent ${
              !selectedPromptId ? 'font-medium text-primary' : 'text-foreground'
            }`}
          >
            {t('noPrompt')}
          </button>
          {prompts.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No prompts configured
            </div>
          )}
          {prompts.map(p => (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent truncate ${
                selectedPromptId === p.id ? 'font-medium text-primary' : 'text-foreground'
              }`}
              title={p.content}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

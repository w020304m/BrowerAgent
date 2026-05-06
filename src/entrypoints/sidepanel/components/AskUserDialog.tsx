import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat-store'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'

export function AskUserDialog() {
  const pendingAskUser = useChatStore((s) => s.pendingAskUser)
  const setPendingAskUser = useChatStore((s) => s.setPendingAskUser)
  const [textInput, setTextInput] = useState('')
  const { t } = useTranslation('sidepanel')

  const sendResponse = useCallback((answer: string) => {
    if (!pendingAskUser) return
    chrome.runtime.sendMessage({
      type: 'agent_ask_user_response',
      toolCallId: pendingAskUser.toolCallId,
      answer,
    }).catch(() => {})
    setPendingAskUser(null)
    setTextInput('')
  }, [pendingAskUser, setPendingAskUser])

  const handleDismiss = useCallback(() => {
    // Dismiss = cancel the entire agent task, not just skip the question
    if (!pendingAskUser) return
    // Return empty string — the agent sees "(user dismissed)" and will task_failed
    chrome.runtime.sendMessage({
      type: 'agent_ask_user_response',
      toolCallId: pendingAskUser.toolCallId,
      answer: '',
    }).catch(() => {})
    setPendingAskUser(null)
    setTextInput('')
  }, [pendingAskUser, setPendingAskUser])

  const handleOptionClick = useCallback((option: string) => {
    sendResponse(option)
  }, [sendResponse])

  const handleTextSubmit = useCallback(() => {
    if (textInput.trim()) {
      sendResponse(textInput.trim())
    }
  }, [textInput, sendResponse])

  const hasOptions = pendingAskUser?.options && pendingAskUser.options.length > 0

  return (
    <AlertDialog open={!!pendingAskUser} onOpenChange={(open) => { if (!open) handleDismiss() }}>
      <AlertDialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {t('agentAskTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm whitespace-pre-wrap break-words">
            {pendingAskUser?.question}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-3 my-4">
          {hasOptions && (
            <div className="flex flex-col gap-2">
              {pendingAskUser!.options!.map((option, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm transition-colors break-words hyphens-auto text-wrap overflow-hidden"
                  onClick={() => handleOptionClick(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTextSubmit() }}
              placeholder={hasOptions ? t('agentAskCustomInput') : t('agentAskPlaceholder')}
              className="flex-1"
              autoFocus={!hasOptions}
            />
            <button
              type="button"
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors whitespace-nowrap"
              onClick={handleTextSubmit}
              disabled={!textInput.trim()}
            >
              {t('agentAskSend')}
            </button>
          </div>
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={handleDismiss} className="w-full sm:w-auto">
            {t('agentAskDismiss')}
          </AlertDialogCancel>
          {hasOptions && (
            <AlertDialogAction onClick={() => sendResponse('')} className="w-full sm:w-auto">
              {t('agentAskSkip')}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

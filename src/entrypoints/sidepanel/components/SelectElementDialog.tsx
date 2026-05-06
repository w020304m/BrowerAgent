import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat-store'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

export function SelectElementDialog() {
  const pendingSelectElement = useChatStore((s) => s.pendingSelectElement)
  const setPendingSelectElement = useChatStore((s) => s.setPendingSelectElement)
  const { t } = useTranslation('sidepanel')

  const handleCancel = useCallback(() => {
    if (!pendingSelectElement) return
    // Send cancel message to background
    chrome.runtime.sendMessage({
      type: 'agent_select_element_response',
      toolCallId: pendingSelectElement.toolCallId,
      result: null,
    }).catch(() => {})
    setPendingSelectElement(null)
  }, [pendingSelectElement, setPendingSelectElement])

  return (
    <AlertDialog open={!!pendingSelectElement} onOpenChange={(open) => { if (!open) handleCancel() }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            {t('selectElementTitle', 'Select Element')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm whitespace-pre-wrap">
            {pendingSelectElement?.instruction}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <div className="flex items-center gap-3 p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" />
              </svg>
            </div>
            <div className="flex-1 text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                {t('selectElementInstruction', 'Click on an element in the page to select it')}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                {t('selectElementHint', 'The page overlay is active. Hover over elements to highlight them, then click to select.')}
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <Button variant="destructive" onClick={handleCancel}>
            {t('selectElementCancel', 'Cancel')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * StatusBubbles - Display status indicators
 *
 * Shows various status indicators like:
 * - Temporary chat mode
 * - Voice recording
 * - Compressing history
 * - Error messages
 */

import type { StatusBubblesProps } from './types'

export function StatusBubbles({
  isTemporary,
  isListening,
  compressing,
  error,
  t,
}: StatusBubblesProps) {
  return (
    <>
      {isTemporary && (
        <div className="mb-2 px-2 py-1.5 text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded border border-dashed border-orange-300 dark:border-orange-700 flex items-center gap-1.5">
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
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
          <svg className="w-3 h-3 flex-shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          {t('sidepanel:compressingHistory')}
        </div>
      )}
      {error && (
        <div className="mb-2 px-2 py-1 text-xs bg-destructive/10 text-destructive rounded">
          {error}
        </div>
      )}
    </>
  )
}

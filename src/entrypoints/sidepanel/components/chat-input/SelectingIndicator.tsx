/**
 * SelectingIndicator - Shows element selection in progress
 *
 * Displayed when user is actively selecting an element from the page
 */

import type { SelectingIndicatorProps } from './types'

export function SelectingIndicator({ onCancel, t }: SelectingIndicatorProps) {
  return (
    <div className="mb-2 px-3 py-2 text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800 flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
      {t('sidepanel:selectingElement')}
      <span className="text-xs opacity-70 ml-auto">
        Press <kbd className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900 font-mono">ESC</kbd> to cancel
      </span>
    </div>
  )
}

/**
 * ContinuousSelectionIndicator - Shows continuous selection mode
 *
 * Displayed when user is in continuous element selection mode
 * Shows count of selected elements and controls to finish/cancel
 */

import type { ContinuousSelectionIndicatorProps } from './types'

export function ContinuousSelectionIndicator({
  count,
  onConfirm,
  onCancel,
  t,
}: ContinuousSelectionIndicatorProps) {
  return (
    <div className="mb-2 px-3 py-2 text-sm bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 rounded border border-purple-200 dark:border-purple-800 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
        <span>Continuous Selection ({count})</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onConfirm}
          className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
        >
          Done
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

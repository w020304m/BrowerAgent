/**
 * QueueItemRow - Single queue item component
 *
 * Displays a single queued message with controls for:
 * - Mode toggle (supplement/next_command)
 * - Move up/down
 * - Remove
 */

import type { QueueItemRowProps } from './types'

export function QueueItemRow({
  item,
  index,
  total,
  onRemove,
  onMoveUp,
  onMoveDown,
  onToggleMode,
  t,
}: QueueItemRowProps) {
  const isSupplement = item.mode === 'supplement'
  const truncatedText = item.text.length > 40 ? item.text.slice(0, 40) + '...' : item.text

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
      {/* Mode tag — clickable to toggle */}
      <button
        onClick={onToggleMode}
        className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
          isSupplement
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
        }`}
        title={isSupplement ? t('sidepanel:queueSupplement') : t('sidepanel:queueNext')}
      >
        {isSupplement ? t('sidepanel:queueSupplement') : t('sidepanel:queueNext')}
      </button>

      {/* Text */}
      <span className="flex-1 truncate text-gray-700 dark:text-gray-300" title={item.text}>
        {truncatedText}
      </span>

      {/* Move up */}
      <button
        onClick={onMoveUp}
        disabled={index === 0}
        className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
        title="Move up"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Move down */}
      <button
        onClick={onMoveDown}
        disabled={index === total - 1}
        className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
        title="Move down"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"
        title="Remove"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

/**
 * CollapsiblePanel - Collapsible panel component
 *
 * Displays content in a collapsible panel with a toggle button
 * Shows item count and expand/collapse animation
 */

import type { CollapsiblePanelProps } from './types'

export function CollapsiblePanel({ isOpen, onToggle, totalCount, children }: CollapsiblePanelProps) {
  return (
    <div className={`transition-all duration-200 ${isOpen ? 'mb-2' : 'mb-0'}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded transition-colors"
      >
        <span>{totalCount} item{totalCount !== 1 ? 's' : ''}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div
        className={`transition-all duration-200 overflow-hidden ${
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

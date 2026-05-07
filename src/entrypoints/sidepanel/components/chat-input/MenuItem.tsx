/**
 * MenuItem - Menu item component for MoreActionsMenu
 *
 * Simple menu item with icon, label, and optional keyboard shortcut
 */

import type { MenuItemProps } from './types'

export function MenuItem({ icon, label, shortcut, onClick, disabled }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between px-3 py-2 text-sm rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="flex items-center gap-2">
        {icon === 'target' && (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
        )}
        {icon === 'file-image' && (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )}
        {icon === 'compress' && (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 14a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6z" />
            <line x1="12" y1="4" x2="12" y2="10" />
          </svg>
        )}
        {icon === 'minimize' && (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        )}
        {label}
      </span>
      {shortcut && (
        <kbd className="px-1.5 py-0.5 text-[10px] bg-muted rounded font-mono opacity-70">
          {shortcut}
        </kbd>
      )}
    </button>
  )
}

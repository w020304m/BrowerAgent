/**
 * MoreActionsMenu - Popover menu for additional actions
 *
 * Contains:
 * - Select element / Continuous mode toggle
 * - OCR Image
 * - Compress History
 * - Compact Context (agent only)
 */

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MenuItem } from './MenuItem'
import type { MoreActionsMenuProps } from './types'

export function MoreActionsMenu({
  isOpen,
  onOpenChange,
  onSelectElement,
  onToggleContinuousMode,
  onOCR,
  onCompress,
  onCompact,
  isBusy,
  isSelecting,
  ocrProcessing,
  compressing,
  agentEnabled,
  isAgentRunning,
  t,
}: MoreActionsMenuProps) {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`h-7 w-7 rounded-md ${
            isOpen
              ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1 z-30">
        {/* Select element / Continuous mode */}
        <MenuItem
          icon="target"
          label={isSelecting ? 'Selecting...' : 'Select Element'}
          shortcut="Ctrl+Shift+E"
          onClick={onSelectElement}
          disabled={isBusy || isSelecting}
        />

        {/* Toggle continuous mode */}
        <MenuItem
          icon="target"
          label="Enter Continuous Mode"
          onClick={onToggleContinuousMode}
          disabled={isBusy || isSelecting}
        />

        {/* OCR */}
        <MenuItem
          icon="file-image"
          label={ocrProcessing ? 'Processing...' : 'OCR Image'}
          onClick={onOCR}
          disabled={isBusy || ocrProcessing}
        />

        {/* Compress history */}
        <MenuItem
          icon="compress"
          label={compressing ? 'Compressing...' : 'Compress History'}
          onClick={onCompress}
          disabled={compressing || isBusy}
        />

        {/* Compact context (agent only) */}
        {agentEnabled && isAgentRunning && onCompact && (
          <MenuItem
            icon="minimize"
            label="Compact Context"
            onClick={onCompact}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

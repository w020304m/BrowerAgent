/**
 * Type definitions for ChatInput components
 */

import type { ChatMessage } from '@/types/message'
import type { QueueItem } from '@/types/chat'

/**
 * Props for SortableElementChip component
 */
export interface SortableElementChipProps {
  el: { id: string; agentId: string; tag: string; text?: string }
  idx: number
  colors: readonly string[]
  onRemove: () => void
  onInsertRef: () => void
  hoveredRef: string | null
}

/**
 * Props for CollapsiblePanel component
 */
export interface CollapsiblePanelProps {
  isOpen: boolean
  onToggle: () => void
  totalCount: number
  children: React.ReactNode
}

/**
 * Props for MenuItem component
 */
export interface MenuItemProps {
  icon: string
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
}

/**
 * Props for QueueItemRow component
 */
export interface QueueItemRowProps {
  item: QueueItem
  index: number
  total: number
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleMode: () => void
  t: (key: string) => string
}

/**
 * Props for QueueItemsList component
 */
export interface QueueItemsListProps {
  messageQueue: QueueItem[]
  onRemove: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  onToggleMode: (id: string) => void
  t: (key: string) => string
}

/**
 * Props for ContinuousSelectionIndicator component
 */
export interface ContinuousSelectionIndicatorProps {
  count: number
  onConfirm: () => void
  onCancel: () => void
  t: (key: string) => string
}

/**
 * Props for ElementTagsContainer component
 */
export interface ElementTagsContainerProps {
  selectedElements: Array<{ id: string; agentId: string; tag: string; text?: string }>
  pendingElements: Array<{ agentId: string; tag: string; text?: string }>
  colors: readonly string[]
  hoveredRef: string | null
  onRemove: (id: string) => void
  onInsertRef: (agentId: string) => void
  onClearAll: () => void
  onDragEnd: (event: { active: { id: string | number }; over: { id: string | number } | null }) => void
}

/**
 * Props for SelectingIndicator component
 */
export interface SelectingIndicatorProps {
  onCancel: () => void
  t: (key: string) => string
}

/**
 * Props for MoreActionsMenu component
 */
export interface MoreActionsMenuProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSelectElement: () => void
  onToggleContinuousMode: () => void
  onOCR: () => void
  onCompress: () => void
  onCompact?: () => void
  isBusy: boolean
  isSelecting: boolean
  ocrProcessing: boolean
  compressing: boolean
  agentEnabled: boolean
  isAgentRunning: boolean
  t: (key: string) => string
}

/**
 * Props for ImagePreviews component
 */
export interface ImagePreviewsProps {
  images: string[]
  onRemove: (index: number) => void
}

/**
 * Props for StatusBubbles component
 */
export interface StatusBubblesProps {
  isTemporary: boolean
  isListening: boolean
  compressing: boolean
  error: string | null
  t: (key: string) => string
}

/**
 * OCR file input result
 */
export interface OcrFileResult {
  text: string
  error?: string
}

/**
 * File selection handler
 */
export type FileSelectHandler = (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>

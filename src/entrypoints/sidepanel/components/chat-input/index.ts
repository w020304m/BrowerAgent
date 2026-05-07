/**
 * ChatInput module - All components and utilities
 *
 * This module contains all components and utilities for the ChatInput feature.
 * The main ChatInput component is now split into smaller, more maintainable pieces.
 */

// Main component
export { ChatInput } from './ChatInput'

// Sub-components
export { CollapsiblePanel } from './CollapsiblePanel'
export { ContinuousSelectionIndicator } from './ContinuousSelectionIndicator'
export { ElementTagsContainer } from './ElementTagsContainer'
export { ImagePreviews } from './ImagePreviews'
export { MenuItem } from './MenuItem'
export { MoreActionsMenu } from './MoreActionsMenu'
export { QueueItemRow } from './QueueItemRow'
export { SelectingIndicator } from './SelectingIndicator'
export { SortableElementChip } from './SortableElementChip'
export { StatusBubbles } from './StatusBubbles'

// Utilities
export { fileToBase64, isLikelyVisionModel, extractTextFromImage, truncateText, formatFileSize } from './utils'

// Types
export type {
  CollapsiblePanelProps,
  ContinuousSelectionIndicatorProps,
  ElementTagsContainerProps,
  ImagePreviewsProps,
  MenuItemProps,
  MoreActionsMenuProps,
  QueueItemRowProps,
  SelectingIndicatorProps,
  SortableElementChipProps,
  StatusBubblesProps,
} from './types'

// Constants
export {
  COLLAPSIBLE_PANEL_MAX_HEIGHT,
  MAX_TOTAL_IDS,
  SELECTION_TIMEOUT_MS,
  IMAGE_PREVIEW_SIZE,
  ELEMENT_TEXT_TRUNCATE_LENGTH,
  AGENT_ID_TRUNCATE_LENGTH,
  QUEUE_TEXT_TRUNCATE_LENGTH,
  ELEMENT_TAG_COLORS,
} from './constants'

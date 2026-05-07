/**
 * Element Reference Types
 *
 * Shared types and utilities for element reference system.
 * Used across ChatInput, chat-service, and message processing.
 */

/**
 * Element reference selected from the page
 */
export interface SelectedElement {
  id: string
  agentId: string
  tag: string
  text?: string
}

/**
 * Zero-width marker format for element references
 * These are invisible but parseable markers appended to user messages
 */
export const ELEMENT_MARKER_REGEX = /​​\[(\w+)\]​​/g

/**
 * User-visible reference format using agentId: @#{agentId}
 * Examples: @#btn-submit, @#main-content, @#card-123
 */
export const ELEMENT_REF_REGEX = /@#([\w-]+)/g

/**
 * Build the zero-width marker string for an element reference.
 * Uses zero-width characters to be invisible but parseable.
 */
export function createElementMarker(agentId: string): string {
  return `​​[${agentId}]​​`
}

/**
 * Color palette for element tags (5-color cycle)
 */
export const ELEMENT_TAG_COLORS = [
  'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
  'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
  'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
  'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
  'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300',
] as const

/**
 * Chip colors for @#N references in input
 */
export const CHIP_COLORS = [
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },   // blue
  { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },   // emerald
  { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },   // amber
  { bg: '#fff1f2', border: '#fecdd3', text: '#be123c' },   // rose
  { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },   // violet
] as const

/**
 * Error types for element selection
 */
export enum ElementSelectionError {
  NO_ACTIVE_TAB = 'NO_ACTIVE_TAB',
  CHROME_PAGE = 'CHROME_PAGE',
  SIDE_PANEL_NOT_READY = 'SIDE_PANEL_NOT_READY',
  TIMEOUT = 'TIMEOUT',
  CANNOT_ACCESS = 'CANNOT_ACCESS',
  NO_ELEMENT_SELECTED = 'NO_ELEMENT_SELECTED',
}

/**
 * Get user-friendly error message for element selection failures
 */
export function getElementSelectionErrorMessage(error: ElementSelectionError | string): string {
  const errorMap: Record<ElementSelectionError, string> = {
    [ElementSelectionError.NO_ACTIVE_TAB]: 'No active tab found. Please open a webpage.',
    [ElementSelectionError.CHROME_PAGE]: 'Cannot select elements on Chrome pages. Please navigate to a regular webpage.',
    [ElementSelectionError.SIDE_PANEL_NOT_READY]: 'Sidepanel not ready. Please open the sidepanel and try again.',
    [ElementSelectionError.TIMEOUT]: 'Selection timed out. Please try again.',
    [ElementSelectionError.CANNOT_ACCESS]: 'Cannot access this page. Try selecting on a regular webpage.',
    [ElementSelectionError.NO_ELEMENT_SELECTED]: 'No element selected. Please click on an element.',
  }

  if (typeof error === 'string') {
    return errorMap[error as ElementSelectionError] || error
  }

  return errorMap[error] || 'Element selection failed. Please try again.'
}

/**
 * Handle element selection error and return appropriate message
 */
export function handleElementSelectError(err: unknown, context: string): string {
  console.error(`[SelectElement] ${context}:`, err)

  let errorType: ElementSelectionError | string = 'UNKNOWN_ERROR'

  if (err instanceof Error) {
    if (err.message.includes('Receiving end does not exist')) {
      errorType = ElementSelectionError.SIDE_PANEL_NOT_READY
    } else if (err.message.includes('Cannot access') || err.message.includes('Could not connect')) {
      errorType = ElementSelectionError.CANNOT_ACCESS
    } else if (err.message.includes('timeout') || err.message.includes('timed out')) {
      errorType = ElementSelectionError.TIMEOUT
    }
  }

  return getElementSelectionErrorMessage(errorType)
}

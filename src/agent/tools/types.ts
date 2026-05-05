/**
 * Shared types for agent tools.
 */

/** Interactive element info */
export interface InteractiveElement {
  agentId: string
  tag: string
  type?: string
  text?: string
  placeholder?: string
  value?: string
  href?: string
  rect: { x: number; y: number; w: number; h: number }
  isVisible: boolean
  isDisabled: boolean
}

/** Page snapshot result */
export interface PageSnapshot {
  title: string
  url: string
  snapshot: string
  interactiveCount: number
}

/** Scroll position */
export interface ScrollPosition {
  scrollTop: number
  scrollLeft: number
  scrollHeight: number
  scrollWidth: number
  viewportHeight: number
  viewportWidth: number
  hasMoreBelow: boolean
  hasMoreRight: boolean
}

/** Network request */
export interface NetworkRequest {
  url: string
  method: string
  status?: number
  responseSize?: number
  timestamp: number
}

/** Tab info */
export interface TabInfo {
  id: number
  title: string
  url: string
  active: boolean
}

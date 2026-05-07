/**
 * ModelSelector module - Provider and model selection component
 *
 * This module contains the ModelSelector component split into smaller, maintainable pieces.
 */

// Main component
export { ModelSelector } from './ModelSelector'

// Constants
export { PROVIDERS, KNOWN_CONTEXT_LENGTHS } from './constants'

// Utilities
export { formatSize, formatContextLength, parseContextLength, lookupKnownContextLength } from './utils'

// Context length detection
export { fetchOllamaContextLength, fetchOpenAIContextLength, detectContextLength } from './context-length'

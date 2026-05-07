/**
 * Utility functions for ModelSelector component
 */

import { KNOWN_CONTEXT_LENGTHS } from './constants'

/**
 * Format model size in bytes to human-readable format (GB or MB)
 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return ''
  const gb = bytes / (1024 * 1024 * 1024)
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

/**
 * Format context length for display: 1M, 200K, 8192
 */
export function formatContextLength(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000
    return m === Math.floor(m) ? `${m}M` : `${m.toFixed(1)}M`
  }
  if (tokens >= 1000) {
    const k = tokens / 1000
    return k === Math.floor(k) ? `${k}K` : `${k.toFixed(1)}K`
  }
  return String(tokens)
}

/**
 * Parse user input to token count. Accepts: "1M", "200K", "128000", "1.5M", "8k", "0.5m", "2097152"
 */
export function parseContextLength(raw: string): number {
  const s = raw.trim().toUpperCase()
  if (!s) return 0

  // Match number + optional suffix (K/M/B/T or no suffix)
  const match = s.match(/^(\d+(?:\.\d+)?)\s*([KMBT])?$/)
  if (!match) {
    // Try plain number without suffix
    const plain = parseInt(s, 10)
    return isNaN(plain) || plain <= 0 ? 0 : plain
  }

  const num = parseFloat(match[1])
  const suffix = match[2]

  if (isNaN(num) || num <= 0) return 0

  switch (suffix) {
    case 'M': return Math.floor(num * 1_000_000)
    case 'K': return Math.floor(num * 1_000)
    case 'B': return Math.floor(num * 1_000_000_000)
    case 'T': return Math.floor(num * 1_000_000_000_000)
    default: return Math.floor(num) // raw token count like "128000"
  }
}

/**
 * Try to match a model ID against known context lengths
 */
export function lookupKnownContextLength(modelId: string): number | undefined {
  const lower = modelId.toLowerCase()
  for (const [key, value] of Object.entries(KNOWN_CONTEXT_LENGTHS)) {
    if (lower.startsWith(key) || lower.includes(key)) return value
  }
  return undefined
}

/**
 * DOM snapshot trimming utility.
 * Reduces snapshot size by line-based truncation for structured text format.
 *
 * Token estimation uses dual-mode: CJK text ~1.5 chars/token,
 * English text ~4 chars/token, mixed uses linear interpolation.
 */

const CHARS_PER_TOKEN_ENGLISH = 4
const CHARS_PER_TOKEN_CJK = 1.5

// CJK Unicode ranges
const CJK_RANGES = /[\u4E00-\u9FFF\u3400-\u4DBF\u{20000}-\u{2A6DF}\u{2A700}-\u{2B73F}\u{2B740}-\u{2B81F}\u{2B820}-\u{2CEAF}\u{2CEB0}-\u{2EBEF}\u{30000}-\u{3134F}\u3000-\u303F\uFF00-\uFFEF\uAC00-\uD7AF\u3040-\u309F\u30A0-\u30FF]/gu

/**
 * Detect CJK character ratio in a text sample.
 */
function detectCjkRatio(text: string): number {
  if (text.length === 0) return 0
  const matches = text.match(CJK_RANGES)
  return matches ? matches.length / text.length : 0
}

/**
 * Estimate token count from character length.
 * Uses dual-mode estimation: samples first 2000 chars to detect CJK ratio,
 * then interpolates between English (~4 chars/token) and CJK (~1.5 chars/token).
 */
export function estimateTokens(text: string): number {
  const sample = text.slice(0, 2000)
  const cjkRatio = detectCjkRatio(sample)
  const effectiveCharsPerToken =
    CHARS_PER_TOKEN_ENGLISH * (1 - cjkRatio) + CHARS_PER_TOKEN_CJK * cjkRatio
  return Math.ceil(text.length / effectiveCharsPerToken)
}

/**
 * Trim a structured text snapshot to fit within a token budget.
 *
 * Strategy:
 * 1. Split by lines
 * 2. Accumulate lines until budget is reached
 * 3. Add truncation indicator with remaining line count
 */
export function trimSnapshot(text: string, maxTokens: number): string {
  // Use conservative estimate for trimming: assume ~3 chars/token (middle ground)
  const maxChars = maxTokens * 3

  if (text.length <= maxChars) return text

  const lines = text.split('\n')
  let result = ''
  let keptCount = 0

  for (const line of lines) {
    if (result.length + line.length + 1 > maxChars) break
    result += (keptCount > 0 ? '\n' : '') + line
    keptCount++
  }

  const omittedCount = lines.length - keptCount
  if (omittedCount > 0) {
    result += `\n[${omittedCount} lines omitted]`
  }

  return result
}

/**
 * Truncate text content within a step result for LLM context.
 * Returns the truncated text with an indicator.
 */
export function truncateForLLM(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '...(full result stored in memory)'
}

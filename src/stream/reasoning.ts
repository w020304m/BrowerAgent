/**
 * Reasoning tag detection and handling.
 * Detects and processes <think/>, <reasoning/>, and <thought/> tags
 * that some models emit for chain-of-thought reasoning.
 *
 * Supports various formats:
 * - Proper: <think >content</think >
 * - Shorthand open: <think content</think >
 * - No GT close: <think content</think rest
 *
 * Reference: page-assist/src/libs/reasoning.ts
 */

export type ReasoningTag = 'think' | 'reasoning' | 'thought'

/** Reasoning state for tracking open/closed tags */
export interface ReasoningState {
  started: boolean
  ended: boolean
  tagName: ReasoningTag | null
  content: string
}

/**
 * Known reasoning tag names.
 */
export const REASONING_TAGS: ReasoningTag[] = ['think', 'reasoning', 'thought']

/**
 * Detect if text contains a reasoning opening tag.
 * Matches both `<think >` and `<think ` (shorthand, no closing >).
 */
export function detectReasoningStart(text: string): ReasoningTag | null {
  for (const tag of REASONING_TAGS) {
    if (text.includes(`<${tag}>`) || text.includes(`<${tag} `)) {
      return tag
    }
  }
  return null
}

/**
 * Detect if text contains a reasoning closing tag.
 * Matches `</think >` or `</think ` (followed by space or >).
 */
export function detectReasoningEnd(text: string, tagName: ReasoningTag): boolean {
  return new RegExp(`</${tagName}(?:\\s|>|$)`, 'i').test(text)
}

/**
 * Parse reasoning content from a text block.
 * Extracts content between reasoning tags and separates it from main content.
 */
export function parseReasoning(text: string): {
  reasoningContent: string
  mainContent: string
  tagName: ReasoningTag | null
} {
  for (const tag of REASONING_TAGS) {
    // Open tag patterns (tried in order of specificity):
    // 1. Proper with attributes: <think attr=""> (has closing >)
    // 2. Proper bare: <think > (has closing >)
    // 3. Shorthand: <think (followed by space, no >)
    const bareOpenRegex = new RegExp(`<${tag}\\s*>`, 'i')
    const attrOpenRegex = new RegExp(`<${tag}\\s+[^>]*>`, 'i')
    const shorthandOpenRegex = new RegExp(`<${tag}(\\s)`, 'i')
    // Close tag: </think > or </think > or </think\n or </think (end of string)
    // Close tag: </think > or </think > or </think (end of string)
    // Uses lookahead so the space after </think is not consumed
    const closeRegex = new RegExp(`</${tag}\\s*>|</${tag}(?=\\s|$)`, 'i')

    // Try shorthand first: <think content (no closing > on open tag)
    // This avoids greedy matching by proper regex
    let openMatch = text.match(shorthandOpenRegex)
    if (openMatch) {
      return extractReasoningContent(text, openMatch, closeRegex, tag)
    }

    // Try proper bare tag: <think >
    openMatch = text.match(bareOpenRegex)
    if (openMatch) {
      return extractReasoningContent(text, openMatch, closeRegex, tag)
    }

    // Try proper with attributes: <think attr="val">
    openMatch = text.match(attrOpenRegex)
    if (openMatch) {
      return extractReasoningContent(text, openMatch, closeRegex, tag)
    }
  }

  return {
    reasoningContent: '',
    mainContent: text,
    tagName: null,
  }
}

function extractReasoningContent(
  text: string,
  openMatch: RegExpMatchArray,
  closeRegex: RegExp,
  tag: ReasoningTag
): { reasoningContent: string; mainContent: string; tagName: ReasoningTag } {
  const beforeOpen = text.slice(0, openMatch.index)
  const afterOpen = text.slice(openMatch.index! + openMatch[0].length)
  const closeMatch = afterOpen.match(closeRegex)

  if (closeMatch) {
    const reasoningContent = afterOpen.slice(0, closeMatch.index)
    const afterClose = afterOpen.slice(closeMatch.index! + closeMatch[0].length)
    const remaining = parseReasoning(afterClose)
    return {
      reasoningContent: reasoningContent + (remaining.reasoningContent ? '\n' + remaining.reasoningContent : ''),
      mainContent: beforeOpen + remaining.mainContent,
      tagName: tag,
    }
  }

  // Unclosed tag — reasoning still in progress
  return {
    reasoningContent: afterOpen,
    mainContent: beforeOpen,
    tagName: tag,
  }
}

/**
 * Remove all reasoning blocks from text.
 */
export function removeReasoning(text: string): string {
  return parseReasoning(text).mainContent
}

/**
 * Check if reasoning has started based on accumulated text.
 */
export function isReasoningStarted(text: string): boolean {
  return detectReasoningStart(text) !== null
}

/**
 * Check if reasoning has ended (tag is closed) based on accumulated text.
 */
export function isReasoningEnded(text: string): boolean {
  for (const tag of REASONING_TAGS) {
    const properOpenRegex = new RegExp(`<${tag}(?:\\s[^>]*)?\\s*>`, 'i')
    const shorthandOpenRegex = new RegExp(`<${tag}\\s`, 'i')
    const closeRegex = new RegExp(`</${tag}(?:\\s*>|\\s+|$)`, 'i')
    if ((properOpenRegex.test(text) || shorthandOpenRegex.test(text)) && closeRegex.test(text)) {
      return true
    }
  }
  return false
}

/**
 * Merge reasoning content extracted from tags into the reasoning state.
 */
export function mergeReasoningContent(
  text: string,
  existingReasoning: string
): {
  content: string
  reasoningContent: string
} {
  const parsed = parseReasoning(text)
  return {
    content: parsed.mainContent,
    reasoningContent: existingReasoning + parsed.reasoningContent,
  }
}

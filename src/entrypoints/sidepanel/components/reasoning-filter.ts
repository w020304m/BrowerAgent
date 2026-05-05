/**
 * Post-processing filter for LLM reasoning content.
 *
 * Models (especially smaller ones) mention tool names like "agent__get_page_snapshot"
 * in chain-of-thought reasoning. This strips internal prefixes so users see
 * readable names without a mapping table — just clean up the syntax noise.
 *
 * Strategy: strip prefixes, convert underscores to spaces. No hardcoded labels.
 * "agent__get_page_snapshot" → "get page snapshot"
 * "github__create_issue"     → "github: create issue"
 */

export function filterReasoningContent(text: string): string {
  if (!text) return text

  let result = text

  // 1. agent__ prefix → strip, convert underscores to spaces
  //    agent__get_page_snapshot → get page snapshot
  result = result.replace(/\bagent__([a-z_]+)/g, (_m, name) => {
    return name.replace(/_/g, ' ')
  })

  // 2. MCP server__tool patterns → "server: tool"
  //    github__create_issue → github: create issue
  result = result.replace(/\b([a-zA-Z][a-zA-Z0-9]*)__([a-z][a-z0-9_]*)\b/g, (_m, server, tool) => {
    if (server === 'agent') return _m // already handled above
    return `${server}: ${tool.replace(/_/g, ' ')}`
  })

  return result
}

/**
 * Search layer: web search tool that uses the project's search infrastructure.
 * Runs in background context, uses searchEngineRegistry + searchSettings.
 * Falls back to DuckDuckGo if the primary engine returns no results.
 */

import type { ToolCall, ToolResult } from '@/types/tool'
import type { BridgeService } from '../bridge/bridge-service'
import type { ISearchEngine } from '@/search/types'
import { searchEngineRegistry } from '@/search'
import { searchSettings } from '@/storage/search-settings'
import { DuckDuckGoEngine } from '@/search/engines/duckduckgo-engine'

export function registerSearchHandlers(bridge: BridgeService): void {
  bridge.register('agent__web_search', handleWebSearch)
}

/**
 * Build a search engine instance from the user's configured settings.
 */
async function createSearchEngineFromSettings(): Promise<{ engine: ISearchEngine; provider: string; hasApiKey: boolean }> {
  const provider = await searchSettings.getProvider()

  const config: { type: string; baseUrl?: string; apiKey?: string } = {
    type: provider,
  }

  let hasApiKey = false

  switch (provider) {
    case 'searxng':
      config.baseUrl = await searchSettings.getSearxngURL()
      break
    case 'google':
      config.baseUrl = await searchSettings.getGoogleDomain()
      break
    case 'brave-api':
      config.apiKey = await searchSettings.getBraveApiKey()
      hasApiKey = !!config.apiKey
      break
    case 'tavily':
      config.apiKey = await searchSettings.getTavilyApiKey()
      hasApiKey = !!config.apiKey
      break
    case 'exa':
      config.apiKey = await searchSettings.getExaAPIKey()
      hasApiKey = !!config.apiKey
      break
    case 'kagi':
      config.apiKey = await searchSettings.getKagiApiKey()
      hasApiKey = !!config.apiKey
      break
    case 'perplexity':
      config.apiKey = await searchSettings.getPerplexityApiKey()
      hasApiKey = !!config.apiKey
      break
    case 'firecrawl':
      config.apiKey = await searchSettings.getFirecrawlAPIKey()
      hasApiKey = !!config.apiKey
      break
    default:
      hasApiKey = true // scraping engines don't need keys
  }

  const engine = searchEngineRegistry.createEngine(provider, config)
  return { engine, provider, hasApiKey }
}

function formatResults(results: { title: string; url: string; snippet: string }[]): string {
  return results.map((r, i) =>
    `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
  ).join('\n\n')
}

async function handleWebSearch(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  // Fallback: small models often send "description" or "q" instead of "query"
  const rawQuery = (args.query as string) || (args.description as string) || (args.q as string) || ''
  const query = rawQuery.trim()
  const maxResults = (args.maxResults as number) ?? 8

  if (!query) {
    return { toolCallId: toolCall.id, content: 'Error: query is required', isError: true }
  }

  try {
    const { engine, provider, hasApiKey } = await createSearchEngineFromSettings()

    // Warn if API key is missing for engines that need one
    if (!hasApiKey) {
      return {
        toolCallId: toolCall.id,
        content: `Search failed: No API key configured for "${provider}". Please add an API key in Settings > Search.`,
        isError: true,
      }
    }

    let results: { title: string; url: string; snippet: string }[] = []
    let usedProvider = provider
    let duckDuckGoFallback: DuckDuckGoEngine | null = null

    try {
      results = await engine.search(query, maxResults)
    } catch (engineErr) {
      // Primary engine failed — try DuckDuckGo fallback
      const errMsg = engineErr instanceof Error ? engineErr.message : String(engineErr)
      if (provider !== 'duckduckgo') {
        try {
          duckDuckGoFallback = new DuckDuckGoEngine()
          results = await duckDuckGoFallback.search(query, maxResults)
          usedProvider = `duckduckgo (fallback, ${provider} error: ${errMsg})`
        } catch {
          // Fallback also failed — report original error
          return {
            toolCallId: toolCall.id,
            content: `Search error: ${provider} failed (${errMsg}), DuckDuckGo fallback also failed.`,
            isError: true,
          }
        }
      } else {
        return {
          toolCallId: toolCall.id,
          content: `Search error: ${errMsg}`,
          isError: true,
        }
      }
    }

    // If primary engine returns nothing, also fall back
    if (results.length === 0 && provider !== 'duckduckgo') {
      try {
        if (!duckDuckGoFallback) duckDuckGoFallback = new DuckDuckGoEngine()
        results = await duckDuckGoFallback.search(query, maxResults)
        usedProvider = 'duckduckgo (fallback)'
      } catch {
        // Fallback failed too
      }
    }

    const formatted = formatResults(results)

    if (!formatted) {
      return {
        toolCallId: toolCall.id,
        content: `No results found for "${query}" (engine: ${usedProvider}). Try using agent__navigate to open a search engine directly.`,
        isError: false,
      }
    }

    return {
      toolCallId: toolCall.id,
      content: formatted,
      isError: false,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      toolCallId: toolCall.id,
      content: `Search error: ${msg}`,
      isError: true,
    }
  }
}

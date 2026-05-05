/**
 * Search module entry point.
 * Registers all search engines and exports the registry, service, and types.
 */

import { searchEngineRegistry, type SearchEngineDescriptor } from './engine-registry'
import type { ISearchEngine, SearchResult, SearchEngineConfig } from './types'

// Engine implementations
import { DuckDuckGoEngine } from './engines/duckduckgo-engine'
import { GoogleEngine } from './engines/google-engine'
import { SearXNGEngine } from './engines/searxng-engine'
import { BingEngine } from './engines/bing-engine'
import { BraveEngine } from './engines/brave-engine'
import { BraveAPIEngine } from './engines/brave-api-engine'
import { TavilyEngine } from './engines/tavily-engine'
import { ExaEngine } from './engines/exa-engine'
import { BaiduEngine } from './engines/baidu-engine'
import { SogouEngine } from './engines/sogou-engine'
import { StartpageEngine } from './engines/startpage-engine'
import { StractEngine } from './engines/stract-engine'
import { KagiEngine } from './engines/kagi-engine'
import { PerplexityEngine } from './engines/perplexity-engine'
import { FirecrawlEngine } from './engines/firecrawl-engine'
import { OllamaSearchEngine } from './engines/ollama-engine'

// ── Register all engines ─────────────────────────────────────────────

// P0 — No API key required
searchEngineRegistry.register({
  id: 'duckduckgo',
  label: 'DuckDuckGo',
  requiresApiKey: false,
  requiresBaseUrl: false,
  create: () => new DuckDuckGoEngine(),
})

searchEngineRegistry.register({
  id: 'google',
  label: 'Google',
  requiresApiKey: false,
  requiresBaseUrl: false,
  create: (config) => new GoogleEngine({ domain: config.baseUrl }),
})

searchEngineRegistry.register({
  id: 'searxng',
  label: 'SearXNG',
  requiresApiKey: false,
  requiresBaseUrl: true,
  create: (config) => new SearXNGEngine({
    baseUrl: config.baseUrl ?? '',
    jsonMode: true,
  }),
})

// P1 — HTML scraping (no API key)
searchEngineRegistry.register({
  id: 'bing',
  label: 'Bing',
  requiresApiKey: false,
  requiresBaseUrl: false,
  create: () => new BingEngine(),
})

searchEngineRegistry.register({
  id: 'brave',
  label: 'Brave',
  requiresApiKey: false,
  requiresBaseUrl: false,
  create: () => new BraveEngine(),
})

// P1 — API-based
searchEngineRegistry.register({
  id: 'brave-api',
  label: 'Brave API',
  requiresApiKey: true,
  requiresBaseUrl: false,
  create: (config) => new BraveAPIEngine({ apiKey: config.apiKey ?? '' }),
})

searchEngineRegistry.register({
  id: 'tavily',
  label: 'Tavily',
  requiresApiKey: true,
  requiresBaseUrl: false,
  create: (config) => new TavilyEngine({ apiKey: config.apiKey ?? '' }),
})

searchEngineRegistry.register({
  id: 'exa',
  label: 'Exa',
  requiresApiKey: true,
  requiresBaseUrl: false,
  create: (config) => new ExaEngine({ apiKey: config.apiKey ?? '' }),
})

// P2 — Other engines
searchEngineRegistry.register({
  id: 'baidu',
  label: 'Baidu',
  requiresApiKey: false,
  requiresBaseUrl: false,
  create: () => new BaiduEngine(),
})

searchEngineRegistry.register({
  id: 'sogou',
  label: 'Sogou',
  requiresApiKey: false,
  requiresBaseUrl: false,
  create: () => new SogouEngine(),
})

searchEngineRegistry.register({
  id: 'startpage',
  label: 'Startpage',
  requiresApiKey: false,
  requiresBaseUrl: false,
  create: () => new StartpageEngine(),
})

searchEngineRegistry.register({
  id: 'stract',
  label: 'Stract',
  requiresApiKey: false,
  requiresBaseUrl: false,
  create: () => new StractEngine(),
})

searchEngineRegistry.register({
  id: 'kagi',
  label: 'Kagi',
  requiresApiKey: true,
  requiresBaseUrl: false,
  create: (config) => new KagiEngine({ apiKey: config.apiKey ?? '' }),
})

searchEngineRegistry.register({
  id: 'perplexity',
  label: 'Perplexity',
  requiresApiKey: true,
  requiresBaseUrl: false,
  create: (config) => new PerplexityEngine({ apiKey: config.apiKey ?? '' }),
})

searchEngineRegistry.register({
  id: 'firecrawl',
  label: 'Firecrawl',
  requiresApiKey: true,
  requiresBaseUrl: false,
  create: (config) => new FirecrawlEngine({ apiKey: config.apiKey ?? '' }),
})

searchEngineRegistry.register({
  id: 'ollama-search',
  label: 'Ollama Search',
  requiresApiKey: true,
  requiresBaseUrl: false,
  create: (config) => new OllamaSearchEngine({ apiKey: config.apiKey ?? '' }),
})

// ── Exports ──────────────────────────────────────────────────────────

export { searchEngineRegistry } from './engine-registry'
export type { SearchEngineDescriptor } from './engine-registry'
export { SearchService } from './search-service'
export type { SearchServiceOptions } from './search-service'
export type { ISearchEngine, SearchResult, SearchEngineConfig } from './types'

// Re-export individual engine classes for direct usage
export { DuckDuckGoEngine } from './engines/duckduckgo-engine'
export { GoogleEngine } from './engines/google-engine'
export { SearXNGEngine } from './engines/searxng-engine'
export { BingEngine } from './engines/bing-engine'
export { BraveEngine } from './engines/brave-engine'
export { BraveAPIEngine } from './engines/brave-api-engine'
export { TavilyEngine } from './engines/tavily-engine'
export { ExaEngine } from './engines/exa-engine'
export { BaiduEngine } from './engines/baidu-engine'
export { SogouEngine } from './engines/sogou-engine'
export { StartpageEngine } from './engines/startpage-engine'
export { StractEngine } from './engines/stract-engine'
export { KagiEngine } from './engines/kagi-engine'
export { PerplexityEngine } from './engines/perplexity-engine'
export { FirecrawlEngine } from './engines/firecrawl-engine'
export { OllamaSearchEngine } from './engines/ollama-engine'

/**
 * Web Search module types.
 */

/** A single search result from a search engine */
export interface SearchResult {
  /** Title of the page */
  title: string
  /** URL of the page */
  url: string
  /** Short snippet/summary from the search engine */
  snippet: string
  /** Full page content (optional, populated by content fetching) */
  content?: string
}

/** Configuration for creating a search engine instance */
export interface SearchEngineConfig {
  /** Engine type identifier (e.g. 'searxng') */
  type: string
  /** Base URL of the search engine API */
  baseUrl?: string
  /** API key if the engine requires authentication */
  apiKey?: string
}

/** Interface that all search engine implementations must satisfy */
export interface ISearchEngine {
  /**
   * Perform a web search.
   * @param query - The search query string
   * @param maxResults - Maximum number of results to return (default: 10)
   * @returns Array of search results
   */
  search(query: string, maxResults?: number): Promise<SearchResult[]>
}

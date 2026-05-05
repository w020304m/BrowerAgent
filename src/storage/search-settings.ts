/**
 * Search engine settings and API keys.
 */

import { syncStorageService, localStorageService } from './index'

export interface SearchSettings {
  provider: string
  isSimple: boolean
  isVisitWebsite: boolean
  totalResults: number
  searxngURL: string
  searxngJSONMode: boolean
  googleDomain: string
  domainFilterList: string[]
  blockedDomainList: string[]
  isDefaultOn: boolean
}

export const searchSettings = {
  async getProvider(): Promise<string> {
    return syncStorageService.get('searchProvider', 'duckduckgo')
  },

  async setProvider(provider: string): Promise<void> {
    await syncStorageService.set('searchProvider', provider)
  },

  async isSimpleSearch(): Promise<boolean> {
    return syncStorageService.get('isSimpleInternetSearch', true)
  },

  async setSimpleSearch(simple: boolean): Promise<void> {
    await syncStorageService.set('isSimpleInternetSearch', simple)
  },

  async isVisitWebsite(): Promise<boolean> {
    return syncStorageService.get('isVisitSpecificWebsite', true)
  },

  async setVisitWebsite(visit: boolean): Promise<void> {
    await syncStorageService.set('isVisitSpecificWebsite', visit)
  },

  async getTotalResults(): Promise<number> {
    return syncStorageService.get('totalSearchResults', 2)
  },

  async setTotalResults(total: number): Promise<void> {
    await syncStorageService.set('totalSearchResults', total)
  },

  async getSearxngURL(): Promise<string> {
    return syncStorageService.get('searxngURL', '')
  },

  async setSearxngURL(url: string): Promise<void> {
    await syncStorageService.set('searxngURL', url)
  },

  async isSearxngJSONMode(): Promise<boolean> {
    return syncStorageService.get('searxngJSONMode', false)
  },

  async setSearxngJSONMode(mode: boolean): Promise<void> {
    await syncStorageService.set('searxngJSONMode', mode)
  },

  async getGoogleDomain(): Promise<string> {
    return localStorageService.get('searchGoogleDomain', 'google.com')
  },

  async setGoogleDomain(domain: string): Promise<void> {
    await localStorageService.set('searchGoogleDomain', domain)
  },

  async getDomainFilterList(): Promise<string[]> {
    const raw = await syncStorageService.get<string>('domainFilterList')
    if (!raw) return []
    try {
      return JSON.parse(raw as string)
    } catch {
      return []
    }
  },

  async setDomainFilterList(list: string[]): Promise<void> {
    await syncStorageService.set('domainFilterList', JSON.stringify(list))
  },

  async getBlockedDomainList(): Promise<string[]> {
    const raw = await syncStorageService.get<string>('blockedDomainList')
    if (!raw) return []
    try {
      return JSON.parse(raw as string)
    } catch {
      return []
    }
  },

  async setBlockedDomainList(list: string[]): Promise<void> {
    await syncStorageService.set('blockedDomainList', JSON.stringify(list))
  },

  async isDefaultOn(): Promise<boolean> {
    return syncStorageService.get('defaultInternetSearchOn', false)
  },

  async setDefaultOn(on: boolean): Promise<void> {
    await syncStorageService.set('defaultInternetSearchOn', on)
  },

  // --- API Keys (all in local storage for security) ---

  async getBraveApiKey(): Promise<string> {
    return localStorageService.get('braveApiKey', '')
  },
  async setBraveApiKey(key: string): Promise<void> {
    await localStorageService.set('braveApiKey', key)
  },

  async getTavilyApiKey(): Promise<string> {
    return localStorageService.get('tavilyApiKey', '')
  },
  async setTavilyApiKey(key: string): Promise<void> {
    await localStorageService.set('tavilyApiKey', key)
  },

  async getExaAPIKey(): Promise<string> {
    return localStorageService.get('exaAPIKey', '')
  },
  async setExaAPIKey(key: string): Promise<void> {
    await localStorageService.set('exaAPIKey', key)
  },

  async getKagiApiKey(): Promise<string> {
    return localStorageService.get('kagiApiKey', '')
  },
  async setKagiApiKey(key: string): Promise<void> {
    await localStorageService.set('kagiApiKey', key)
  },

  async getPerplexityApiKey(): Promise<string> {
    return localStorageService.get('perplexityApiKey', '')
  },
  async setPerplexityApiKey(key: string): Promise<void> {
    await localStorageService.set('perplexityApiKey', key)
  },

  async getFirecrawlAPIKey(): Promise<string> {
    return localStorageService.get('firecrawlAPIKey', '')
  },
  async setFirecrawlAPIKey(key: string): Promise<void> {
    await localStorageService.set('firecrawlAPIKey', key)
  },

  /**
   * Get all search settings at once.
   */
  async getAll(): Promise<SearchSettings> {
    const [
      provider, isSimple, isVisitWebsite, totalResults,
      searxngURL, searxngJSONMode, googleDomain,
      domainFilterList, blockedDomainList, isDefaultOn
    ] = await Promise.all([
      this.getProvider(),
      this.isSimpleSearch(),
      this.isVisitWebsite(),
      this.getTotalResults(),
      this.getSearxngURL(),
      this.isSearxngJSONMode(),
      this.getGoogleDomain(),
      this.getDomainFilterList(),
      this.getBlockedDomainList(),
      this.isDefaultOn()
    ])
    return {
      provider, isSimple, isVisitWebsite, totalResults,
      searxngURL, searxngJSONMode, googleDomain,
      domainFilterList, blockedDomainList, isDefaultOn
    }
  }
}

/**
 * Ollama-specific settings.
 */

import { syncStorageService, localStorageService } from './index'

export interface CustomHeader {
  key: string
  value: string
}

export const ollamaSettings = {
  async getOllamaURL(): Promise<string> {
    return syncStorageService.get('ollamaURL', 'http://127.0.0.1:11434')
  },

  async setOllamaURL(url: string): Promise<void> {
    // Normalize localhost to 127.0.0.1
    const normalized = url.replace('localhost', '127.0.0.1').replace(/\/$/, '')
    await syncStorageService.set('ollamaURL', normalized)
  },

  async isOllamaEnabled(): Promise<boolean> {
    return syncStorageService.get('checkOllamaStatus', true)
  },

  async setOllamaEnabled(enabled: boolean): Promise<void> {
    await syncStorageService.set('checkOllamaStatus', enabled)
  },

  async getDefaultModel(): Promise<string | undefined> {
    return syncStorageService.get('defaultModel')
  },

  async setDefaultModel(model: string): Promise<void> {
    await syncStorageService.set('defaultModel', model)
  },

  async getSelectedModel(): Promise<string | undefined> {
    return syncStorageService.get('selectedModel')
  },

  async setSelectedModel(model: string): Promise<void> {
    await syncStorageService.set('selectedModel', model)
  },

  async askForModelSelectionEveryTime(): Promise<boolean> {
    return syncStorageService.get('askForModelSelectionEveryTime', true)
  },

  async setAskForModelSelectionEveryTime(ask: boolean): Promise<void> {
    await syncStorageService.set('askForModelSelectionEveryTime', ask)
  },

  async getCustomHeaders(): Promise<CustomHeader[]> {
    return localStorageService.get('customOllamaHeaders', [])
  },

  async setCustomHeaders(headers: CustomHeader[]): Promise<void> {
    await localStorageService.set('customOllamaHeaders', headers)
  },

  /**
   * Get custom headers as a Record<string, string> for HTTP requests.
   */
  async getCustomHeadersMap(): Promise<Record<string, string>> {
    const headers = await this.getCustomHeaders()
    const map: Record<string, string> = {}
    for (const h of headers) {
      map[h.key] = h.value
    }
    return map
  },

  async isUrlRewriteEnabled(): Promise<boolean> {
    return localStorageService.get('urlRewriteEnabled', false)
  },

  async getRewriteUrl(): Promise<string> {
    return localStorageService.get('rewriteUrl', 'http://127.0.0.1:11434')
  },

  async getAdvancedSettings(): Promise<{
    isEnableRewriteUrl: boolean
    rewriteUrl: string
    autoCORSFix: boolean
  }> {
    const [isEnableRewriteUrl, rewriteUrl, autoCORSFix] = await Promise.all([
      this.isUrlRewriteEnabled(),
      this.getRewriteUrl(),
      localStorageService.get('autoCORSFix', true)
    ])
    return { isEnableRewriteUrl, rewriteUrl, autoCORSFix }
  },

  async isAutoCORSFixEnabled(): Promise<boolean> {
    return localStorageService.get('autoCORSFix', true)
  }
}

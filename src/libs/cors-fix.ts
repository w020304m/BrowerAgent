/**
 * CORS fix for local server requests.
 *
 * Chrome MV3 extensions send `Origin: chrome-extension://...` for all fetch()
 * requests, including to localhost servers. Local servers like Ollama and
 * LM Studio reject these with 403.
 *
 * This module uses declarativeNetRequest.updateDynamicRules to SET the Origin
 * header to match the target server's own origin, making the request appear
 * same-origin to the server.
 *
 * Ported from the original page-assist project's urlRewriteRuntime().
 */

import { ollamaSettings } from '@/storage/ollama-settings'

const DNR_RULE_ID = 1

// Cache the last applied domain to avoid redundant DNR updates
let lastAppliedDomain: string | null = null

/**
 * Ensure the declarativeNetRequest rule is set to rewrite the Origin header
 * for the given URL's domain. Skips the DNR update if the domain hasn't changed.
 *
 * @param targetUrl - Any URL pointing to the local server
 */
export async function ensureCorsFix(targetUrl: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.declarativeNetRequest) {
    return
  }

  try {
    const url = new URL(targetUrl)
    const hostname = url.hostname

    // Skip if already applied for this domain
    if (lastAppliedDomain === hostname) return

    const autoCORSFix = await ollamaSettings.isAutoCORSFixEnabled()
    if (!autoCORSFix) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [DNR_RULE_ID],
          addRules: [],
        })
        lastAppliedDomain = null
      } catch { /* ignore */ }
      return
    }

    // Set Origin to the target server's own origin so it looks same-origin
    const origin = `${url.protocol}//${url.hostname}`

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID],
      addRules: [
        {
          id: DNR_RULE_ID,
          priority: 1,
          condition: {
            requestDomains: [hostname],
          },
          action: {
            type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
            requestHeaders: [
              {
                header: 'Origin',
                operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
                value: origin,
              },
            ],
          },
        },
      ],
    })

    lastAppliedDomain = hostname
  } catch {
    // DNR may not be available in all contexts (e.g. tests, Firefox)
  }
}

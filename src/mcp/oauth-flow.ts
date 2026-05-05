/**
 * MCP OAuth flow.
 * Manages the full OAuth PKCE flow for MCP servers using chrome.tabs.
 */

import {
  generatePkce,
  discoverOAuthFromMcpServer,
  registerOAuthClient,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshOAuthTokens,
  isOAuthTokenExpired,
  getOAuthRedirectUri,
} from './oauth'
import { inspectMcpServerTools } from './remote-tools'
import { mcpServerRepo } from '@/db/repositories/mcp-server.repository'
import type { McpServerConfig } from '@/types/tool'
import type { McpOAuthTokens, McpOAuthClientRegistration, McpOAuthMetadata } from './types'

// === Types ===

interface PendingOAuthFlow {
  serverId: string
  state: string
  codeVerifier: string
  redirectUri: string
  tabId: number
  metadata: McpOAuthMetadata
  clientRegistration: McpOAuthClientRegistration
}

// === State ===

let pendingFlow: PendingOAuthFlow | null = null

const generateState = (): string => {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

// === Public API ===

/**
 * Start the MCP OAuth flow for a server.
 * 1. Discover OAuth metadata
 * 2. Register client (if needed)
 * 3. Open authorization tab
 * 4. Monitor tab for callback
 */
export async function startMcpOAuthFlow(
  server: McpServerConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const discovery = await discoverOAuthFromMcpServer(server.url ?? '')
    const metadata = discovery.metadata

    const pageShareUrl = (await import('@/storage/index')).syncStorageService
    const shareUrl = (await pageShareUrl.get<string>('pageShareUrl')) ?? 'https://pageassist.xyz'
    const redirectUri = await getOAuthRedirectUri(shareUrl)

    let clientRegistration = server.oauth as { clientId?: string; clientSecret?: string } | undefined

    // Try dynamic client registration if no existing registration
    if (!clientRegistration?.clientId && metadata.registrationEndpoint) {
      clientRegistration = await registerOAuthClient(
        metadata.registrationEndpoint,
        redirectUri,
        `BrowserAgent - ${server.name}`
      )

      await mcpServerRepo.updateOAuthData(server.id, {
        authType: 'oauth',
        oauthMetadata: metadata,
        oauthClientRegistration: clientRegistration,
      })
    }

    if (!clientRegistration?.clientId) {
      return {
        success: false,
        error:
          'No client registration available. The server does not support dynamic client registration. Please configure OAuth client credentials manually.',
      }
    }

    const { codeVerifier, codeChallenge } = await generatePkce()
    const state = generateState()

    const authUrl = buildAuthorizationUrl({
      metadata,
      clientRegistration: clientRegistration as McpOAuthClientRegistration,
      redirectUri,
      codeChallenge,
      state,
      scopes: metadata.scopesSupported,
    })

    const tab = await chrome.tabs.create({ url: authUrl })

    pendingFlow = {
      serverId: server.id,
      state,
      codeVerifier,
      redirectUri,
      tabId: tab.id!,
      metadata,
      clientRegistration: clientRegistration as McpOAuthClientRegistration,
    }

    startTabMonitoring(redirectUri)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Ensure fresh OAuth tokens for a server.
 * Refreshes expired tokens if possible.
 */
export async function ensureFreshOAuthTokens(
  server: McpServerConfig
): Promise<McpServerConfig | null> {
  const serverData = server as unknown as Record<string, unknown>
  if (serverData.authType !== 'oauth' || !serverData.oauthTokens) return null

  const tokens = serverData.oauthTokens as McpOAuthTokens
  if (!isOAuthTokenExpired(tokens)) {
    return server
  }

  if (
    !tokens.refreshToken ||
    !serverData.oauthMetadata ||
    !serverData.oauthClientRegistration
  ) {
    return null
  }

  try {
    const newTokens = await refreshOAuthTokens({
      metadata: serverData.oauthMetadata as McpOAuthMetadata,
      clientRegistration: serverData.oauthClientRegistration as McpOAuthClientRegistration,
      refreshToken: tokens.refreshToken,
    })

    await mcpServerRepo.updateOAuthData(server.id, {
      authType: 'oauth',
      oauthTokens: newTokens,
    })

    // Return updated server
    const updated = await mcpServerRepo.getById(server.id)
    return updated ?? null
  } catch {
    return null
  }
}

/**
 * Disconnect OAuth for a server.
 */
export async function disconnectMcpOAuth(serverId: string): Promise<void> {
  await mcpServerRepo.clearOAuthData(serverId)
}

// === Tab monitoring ===

function startTabMonitoring(redirectUri: string): void {
  const listener = async (
    tabId: number,
    changeInfo: { url?: string; status?: string }
  ) => {
    if (!pendingFlow) {
      chrome.tabs.onUpdated.removeListener(listener)
      return
    }

    if (tabId !== pendingFlow.tabId) return
    if (!changeInfo.url) return
    if (!changeInfo.url.startsWith(redirectUri)) return

    const url = new URL(changeInfo.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    chrome.tabs.onUpdated.removeListener(listener)

    if (error) {
      const errorDesc = url.searchParams.get('error_description') ?? error
      pendingFlow = null
      console.error('MCP OAuth error:', errorDesc)
      return
    }

    if (!code || state !== pendingFlow.state) {
      pendingFlow = null
      return
    }

    try {
      const tokens = await exchangeCodeForTokens({
        metadata: pendingFlow.metadata,
        clientRegistration: pendingFlow.clientRegistration,
        code,
        redirectUri: pendingFlow.redirectUri,
        codeVerifier: pendingFlow.codeVerifier,
      })

      await mcpServerRepo.updateOAuthData(pendingFlow.serverId, {
        authType: 'oauth',
        oauthTokens: tokens,
        oauthMetadata: pendingFlow.metadata,
        oauthClientRegistration: pendingFlow.clientRegistration,
      })

      // Close auth tab
      try {
        await chrome.tabs.remove(tabId)
      } catch {
        // Tab might already be closed
      }

      // Fetch tools to verify connection
      try {
        const server = await mcpServerRepo.getById(pendingFlow.serverId)
        if (server) {
          const validation = await inspectMcpServerTools(server as unknown as Parameters<typeof inspectMcpServerTools>[0])
          await mcpServerRepo.updateToolsSync(
            pendingFlow.serverId,
            validation.cachedTools,
            validation.toolsSyncError
          )
        }
      } catch (toolErr) {
        console.error('MCP OAuth: tools fetch after auth failed:', toolErr)
      }
    } catch (err) {
      console.error('MCP OAuth token exchange failed:', err)
    } finally {
      pendingFlow = null
    }
  }

  chrome.tabs.onUpdated.addListener(listener)

  // Clean up if tab is closed before redirect
  const closeListener = (closedTabId: number) => {
    if (pendingFlow && closedTabId === pendingFlow.tabId) {
      pendingFlow = null
      chrome.tabs.onUpdated.removeListener(listener)
      chrome.tabs.onRemoved.removeListener(closeListener)
    }
  }
  chrome.tabs.onRemoved.addListener(closeListener)
}

// === For testing ===

export function resetPendingFlow(): void {
  pendingFlow = null
}

export function getPendingFlow(): PendingOAuthFlow | null {
  return pendingFlow
}

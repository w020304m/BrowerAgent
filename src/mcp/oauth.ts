/**
 * MCP OAuth PKCE core.
 * Implements OAuth 2.0 PKCE flow for MCP servers.
 * Uses only fetch + crypto.subtle, zero external dependencies.
 */

import type { McpOAuthTokens, McpOAuthClientRegistration, McpOAuthMetadata } from './types'

// === Utility functions ===

const generateRandomString = (length: number): string => {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

const base64UrlEncode = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Clean trailing slashes from a URL */
function cleanUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

const fetchJson = async (url: string): Promise<Record<string, unknown>> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.json() as Promise<Record<string, unknown>>
}

// === PKCE ===

export const generatePkce = async (): Promise<{
  codeVerifier: string
  codeChallenge: string
}> => {
  const codeVerifier = generateRandomString(64)
  const encoded = new TextEncoder().encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const codeChallenge = base64UrlEncode(digest)
  return { codeVerifier, codeChallenge }
}

// === Discovery ===

export interface OAuthDiscoveryResult {
  metadata: McpOAuthMetadata
}

const discoverFromPrmUrl = async (
  prmUrl: string
): Promise<OAuthDiscoveryResult> => {
  const prm = await fetchJson(prmUrl)

  const authServers: string[] = (prm.authorization_servers as string[]) ?? []
  if (authServers.length === 0) {
    throw new Error('No authorization servers found in protected resource metadata')
  }

  const authServerBase = cleanUrl(authServers[0])

  let authMeta: Record<string, unknown>
  try {
    authMeta = await fetchJson(
      `${authServerBase}/.well-known/openid-configuration`
    )
  } catch {
    authMeta = await fetchJson(
      `${authServerBase}/.well-known/oauth-authorization-server`
    )
  }

  if (!authMeta.authorization_endpoint || !authMeta.token_endpoint) {
    throw new Error('Authorization server metadata missing required endpoints')
  }

  return {
    metadata: {
      authorizationEndpoint: authMeta.authorization_endpoint as string,
      tokenEndpoint: authMeta.token_endpoint as string,
      registrationEndpoint: (authMeta.registration_endpoint as string) ?? undefined,
      issuer: (authMeta.issuer as string) ?? undefined,
      resourceMetadataUrl: prmUrl,
      scopesSupported: ((prm.scopes_supported ?? authMeta.scopes_supported) as string[]) ?? undefined,
    },
  }
}

/**
 * Discover OAuth metadata from an MCP server URL.
 * Probes the server for 401 response with WWW-Authenticate header,
 * then follows resource_metadata URL to find the auth server.
 */
export const discoverOAuthFromMcpServer = async (
  mcpServerUrl: string
): Promise<OAuthDiscoveryResult> => {
  const serverUrl = cleanUrl(mcpServerUrl)
  try {
    const probeResponse = await fetch(serverUrl, { method: 'POST' })

    if (probeResponse.status === 401) {
      const wwwAuth = probeResponse.headers.get('WWW-Authenticate') ?? ''
      const resourceMetadataMatch = wwwAuth.match(
        /resource_metadata="([^"]+)"/
      )

      if (resourceMetadataMatch) {
        return await discoverFromPrmUrl(resourceMetadataMatch[1])
      }
    }
  } catch {
    // Probe failed, try well-known URL directly
  }

  const origin = new URL(serverUrl).origin
  const prmUrl = `${origin}/.well-known/oauth-protected-resource`
  return await discoverFromPrmUrl(prmUrl)
}

/**
 * Discover OAuth from a 401 WWW-Authenticate header.
 */
export const discoverOAuthFrom401 = async (
  wwwAuthenticate: string
): Promise<OAuthDiscoveryResult | null> => {
  const resourceMetadataMatch = wwwAuthenticate.match(
    /resource_metadata="([^"]+)"/
  )
  if (!resourceMetadataMatch) {
    return null
  }

  const prmUrl = resourceMetadataMatch[1]
  const prm = await fetchJson(prmUrl)

  const authServers: string[] = (prm.authorization_servers as string[]) ?? []
  if (authServers.length === 0) {
    return null
  }

  const authServerBase = cleanUrl(authServers[0])

  let authMeta: Record<string, unknown>
  try {
    authMeta = await fetchJson(
      `${authServerBase}/.well-known/openid-configuration`
    )
  } catch {
    authMeta = await fetchJson(
      `${authServerBase}/.well-known/oauth-authorization-server`
    )
  }

  if (!authMeta.authorization_endpoint || !authMeta.token_endpoint) {
    return null
  }

  return {
    metadata: {
      authorizationEndpoint: authMeta.authorization_endpoint as string,
      tokenEndpoint: authMeta.token_endpoint as string,
      registrationEndpoint: (authMeta.registration_endpoint as string) ?? undefined,
      issuer: (authMeta.issuer as string) ?? undefined,
      resourceMetadataUrl: prmUrl,
      scopesSupported: ((prm.scopes_supported ?? authMeta.scopes_supported) as string[]) ?? undefined,
    },
  }
}

// === Client Registration ===

/**
 * Register a new OAuth client via Dynamic Client Registration (DCR).
 */
export const registerOAuthClient = async (
  registrationEndpoint: string,
  redirectUri: string,
  clientName: string = 'BrowserAgent'
): Promise<McpOAuthClientRegistration> => {
  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Dynamic client registration failed: ${text}`)
  }

  const data = (await response.json()) as Record<string, unknown>

  return {
    clientId: data.client_id as string,
    clientSecret: (data.client_secret as string) ?? undefined,
    registrationAccessToken: (data.registration_access_token as string) ?? undefined,
    redirectUris: (data.redirect_uris as string[]) ?? undefined,
  }
}

// === Authorization ===

/**
 * Build the OAuth authorization URL with PKCE parameters.
 */
export const buildAuthorizationUrl = ({
  metadata,
  clientRegistration,
  redirectUri,
  codeChallenge,
  state,
  scopes,
}: {
  metadata: McpOAuthMetadata
  clientRegistration: McpOAuthClientRegistration
  redirectUri: string
  codeChallenge: string
  state: string
  scopes?: string[]
}): string => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientRegistration.clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  })

  if (scopes && scopes.length > 0) {
    params.set('scope', scopes.join(' '))
  }

  return `${metadata.authorizationEndpoint}?${params.toString()}`
}

/**
 * Exchange an authorization code for tokens.
 */
export const exchangeCodeForTokens = async ({
  metadata,
  clientRegistration,
  code,
  redirectUri,
  codeVerifier,
}: {
  metadata: McpOAuthMetadata
  clientRegistration: McpOAuthClientRegistration
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<McpOAuthTokens> => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: clientRegistration.clientId,
  })

  if (clientRegistration.clientSecret) {
    body.set('client_secret', clientRegistration.clientSecret)
  }

  const response = await fetch(metadata.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed: ${text}`)
  }

  const data = (await response.json()) as Record<string, unknown>

  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? undefined,
    tokenType: (data.token_type as string) ?? 'Bearer',
    expiresAt: typeof data.expires_in === 'number'
      ? Date.now() + data.expires_in * 1000
      : undefined,
    scope: (data.scope as string) ?? undefined,
  }
}

/**
 * Refresh OAuth tokens using a refresh token.
 */
export const refreshOAuthTokens = async ({
  metadata,
  clientRegistration,
  refreshToken,
}: {
  metadata: McpOAuthMetadata
  clientRegistration: McpOAuthClientRegistration
  refreshToken: string
}): Promise<McpOAuthTokens> => {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientRegistration.clientId,
  })

  if (clientRegistration.clientSecret) {
    body.set('client_secret', clientRegistration.clientSecret)
  }

  const response = await fetch(metadata.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`)
  }

  const data = (await response.json()) as Record<string, unknown>

  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? refreshToken,
    tokenType: (data.token_type as string) ?? 'Bearer',
    expiresAt: typeof data.expires_in === 'number'
      ? Date.now() + data.expires_in * 1000
      : undefined,
    scope: (data.scope as string) ?? undefined,
  }
}

// === Token expiry ===

/** Check if OAuth tokens are expired (with 60s buffer) */
export const isOAuthTokenExpired = (tokens?: McpOAuthTokens): boolean => {
  if (!tokens?.accessToken) return true
  if (!tokens.expiresAt) return false
  return Date.now() > tokens.expiresAt - 60_000
}

/** Check if OAuth tokens are valid (not expired) */
export const hasValidOAuthTokens = (tokens?: McpOAuthTokens): boolean => {
  if (!tokens?.accessToken) return false
  return !isOAuthTokenExpired(tokens)
}

// === Redirect URI ===

/**
 * Get the OAuth redirect URI.
 * Uses the page share URL + /mcp/oauth/callback path.
 */
export const getOAuthRedirectUri = async (pageShareUrl: string): Promise<string> => {
  const base = cleanUrl(pageShareUrl)
  return `${base}/mcp/oauth/callback`
}

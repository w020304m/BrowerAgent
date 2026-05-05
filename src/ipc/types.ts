/**
 * IPC message type definitions.
 * Replaces the untyped chrome.runtime.sendMessage calls with a type-safe system.
 *
 * Message directions:
 * - Request: Any context → Background (expects response)
 * - Notify: Any context → Background (fire-and-forget)
 * - Broadcast: Background → All extension pages (fire-and-forget)
 * - Tab: Background → Specific content script tab (fire-and-forget)
 */

// ==========================================
// Request messages (expect response)
// ==========================================

export interface CheckYoutubeEnabledRequest {
  type: 'check_youtube_summarize_enabled'
}
export interface CheckYoutubeEnabledResponse {
  enabled: boolean
}

export interface RefreshCustomCopilotMenusRequest {
  type: 'refresh_custom_copilot_menus'
}
export interface RefreshCustomCopilotMenusResponse {
  success: boolean
}

export interface RefreshBuiltinCopilotMenusRequest {
  type: 'refresh_builtin_copilot_menus'
}
export interface RefreshBuiltinCopilotMenusResponse {
  success: boolean
}

export interface McpOAuthStartRequest {
  type: 'mcp_oauth_start'
  serverId: string
}
export interface McpOAuthStartResponse {
  success: boolean
  error?: string
}

export interface McpOAuthDisconnectRequest {
  type: 'mcp_oauth_disconnect'
  serverId: string
}
export interface McpOAuthDisconnectResponse {
  success: boolean
}

/** Map from request type to response type */
export interface RequestMap {
  'check_youtube_summarize_enabled': CheckYoutubeEnabledResponse
  'refresh_custom_copilot_menus': RefreshCustomCopilotMenusResponse
  'refresh_builtin_copilot_menus': RefreshBuiltinCopilotMenusResponse
  'mcp_oauth_start': McpOAuthStartResponse
  'mcp_oauth_disconnect': McpOAuthDisconnectResponse
}

/** Union of all request types */
export type IpcRequest =
  | CheckYoutubeEnabledRequest
  | RefreshCustomCopilotMenusRequest
  | RefreshBuiltinCopilotMenusRequest
  | McpOAuthStartRequest
  | McpOAuthDisconnectRequest

// ==========================================
// Notify messages (fire-and-forget to background)
// ==========================================

export interface PullModelNotify {
  type: 'pull_model'
  modelName: string
}

export interface CancelDownloadNotify {
  type: 'cancel_download'
}

export interface YoutubeSummarizeNotify {
  type: 'youtube_summarize'
  videoTitle: string
  videoUrl: string
}

export interface SidepanelOpenNotify {
  type: 'sidepanel'
}

/** Union of all notify types */
export type IpcNotify =
  | PullModelNotify
  | CancelDownloadNotify
  | YoutubeSummarizeNotify
  | SidepanelOpenNotify

// ==========================================
// Broadcast messages (background → all pages)
// ==========================================

export type CopilotType = 'summary' | 'rephrase' | 'translate' | 'explain' | 'custom' | 'yt_summarize'

export interface CopilotBroadcast {
  from: 'background'
  type: CopilotType
  text: string
}

export interface CustomCopilotBroadcast {
  from: 'background'
  type: `custom_copilot_${string}`
  text: string
}

/** Union of all broadcast types */
export type IpcBroadcast = CopilotBroadcast | CustomCopilotBroadcast

// ==========================================
// Tab messages (background → content script)
// ==========================================

export interface YoutubeSettingChangedTabMessage {
  type: 'youtube_summarize_setting_changed'
  enabled: boolean
}

/** Union of all tab message types */
export type IpcTabMessage = YoutubeSettingChangedTabMessage

// ==========================================
// All message types union
// ==========================================

export type AnyIpcMessage = IpcRequest | IpcNotify | IpcBroadcast | IpcTabMessage

// ==========================================
// Type guards
// ==========================================

export function isRequest(msg: AnyIpcMessage): msg is IpcRequest {
  return msg.type in requestTypeSet
}

export function isNotify(msg: AnyIpcMessage): msg is IpcNotify {
  return msg.type in notifyTypeSet
}

export function isBroadcast(msg: AnyIpcMessage): msg is IpcBroadcast {
  return 'from' in msg && msg.from === 'background'
}

const requestTypeSet: Record<string, true> = {
  'check_youtube_summarize_enabled': true,
  'refresh_custom_copilot_menus': true,
  'refresh_builtin_copilot_menus': true,
  'mcp_oauth_start': true,
  'mcp_oauth_disconnect': true,
}

const notifyTypeSet: Record<string, true> = {
  'pull_model': true,
  'cancel_download': true,
  'youtube_summarize': true,
  'sidepanel': true,
}

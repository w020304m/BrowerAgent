/**
 * Provider configuration types.
 * Defines all supported AI model providers.
 */

/** Supported provider types */
export type ProviderType =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openrouter'
  | 'ollama2'   // secondary Ollama instance via OpenAI-compatible config
  | 'chrome-ai'

/** Provider connection configuration */
export interface ProviderConfig {
  /** Which provider type */
  provider: ProviderType
  /** API base URL */
  baseUrl?: string
  /** API key */
  apiKey?: string
  /** Custom headers */
  headers?: Record<string, string>
  /** Auto-fix CORS by proxying through background script */
  fixCors?: boolean
}

/** Model info as stored in the custom models table */
export interface CustomModelInfo {
  id: string
  modelId: string
  name: string
  modelName: string
  modelImage?: string
  providerId: string
  provider: ProviderType
  modelType: 'chat' | 'embedding'
}

/** Model info returned from listing (e.g. Ollama /api/tags) */
export interface ModelInfo {
  /** Model identifier (e.g. "llama3.2:latest") */
  id: string
  /** Display name */
  name: string
  /** Model family */
  family?: string
  /** Model size in bytes */
  size?: number
  /** Quantization level */
  quantization?: string
  /** Provider that serves this model */
  provider: ProviderType
  /** Custom avatar URL */
  avatar?: string
  /** Custom nickname */
  nickname?: string
  /** Whether the model is enabled */
  enabled?: boolean
  /** Whether the model supports vision */
  supportsVision?: boolean
  /** Model image URL for display */
  modelImage?: string
  /** Context window length in tokens (from model metadata) */
  contextLength?: number
}

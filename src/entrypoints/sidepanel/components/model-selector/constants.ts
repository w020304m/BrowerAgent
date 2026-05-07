/**
 * Constants for ModelSelector component
 */

import type { ProviderType } from '@/types/provider'

export const PROVIDERS: { value: ProviderType; label: string }[] = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google AI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'chrome-ai', label: 'Chrome AI' },
]

/** Known context lengths for popular models (tokens) */
export const KNOWN_CONTEXT_LENGTHS: Record<string, number> = {
  // Only major provider-specific models that differ from 128K default
  'claude-': 200000,
  'gemini-2': 1048576,
  'gemini-1.5-pro': 2097152,
  'o1': 200000,
  'o3': 200000,
  'llama-4': 1048576,
  'gpt-4-': 128000,
  'gpt-3.5': 16385,
}

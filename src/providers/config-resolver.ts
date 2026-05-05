/**
 * Model configuration resolver.
 * Merges 3 layers of model settings: session > model > global.
 * Replaces the inline config merge in the original pageAssistModel() factory.
 */

import type { ModelParams } from './types'

export interface ModelConfigLayers {
  /** Settings from current chat session (Zustand store) — highest priority */
  sessionSettings: Partial<ModelParams>
  /** Per-model settings from storage */
  modelSettings: Partial<ModelParams>
  /** Global default settings from storage */
  globalDefaults: Partial<ModelParams>
}

/**
 * Merge 3 layers of model configuration.
 * Priority: sessionSettings > modelSettings > globalDefaults
 */
export function resolveModelConfig(layers: ModelConfigLayers): ModelParams {
  const allKeys = new Set<keyof ModelParams>()

  const sessionSettings = layers.sessionSettings ?? {}
  const modelSettings = layers.modelSettings ?? {}
  const globalDefaults = layers.globalDefaults ?? {}

  // Collect all keys that have values in any layer
  for (const key of Object.keys(sessionSettings) as (keyof ModelParams)[]) {
    if (sessionSettings[key] !== undefined) allKeys.add(key)
  }
  for (const key of Object.keys(modelSettings) as (keyof ModelParams)[]) {
    if (modelSettings[key] !== undefined) allKeys.add(key)
  }
  for (const key of Object.keys(globalDefaults) as (keyof ModelParams)[]) {
    if (globalDefaults[key] !== undefined) allKeys.add(key)
  }

  const result: ModelParams = {}
  for (const key of allKeys) {
    const value =
      sessionSettings[key] ??
      modelSettings[key] ??
      globalDefaults[key]
    if (value !== undefined) {
      ;(result as Record<string, unknown>)[key] = value
    }
  }

  return result
}

/**
 * Normalize thinking parameter based on model type.
 * Some providers require string levels, others use boolean.
 */
export function normalizeThinking(
  thinking: boolean | 'low' | 'medium' | 'high' | undefined,
  modelId?: string | null
): boolean | 'low' | 'medium' | 'high' | undefined {
  if (thinking === undefined) return undefined
  return thinking
}

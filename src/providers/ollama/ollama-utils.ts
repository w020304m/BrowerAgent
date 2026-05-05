/**
 * Ollama utility functions.
 */

import type { ModelParams } from '../types'

/**
 * Parse keepAlive parameter to seconds.
 * Accepts: number (seconds), string with units ("5m", "1h", "24h")
 */
export function parseKeepAlive(value: string | number | undefined): number | string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return undefined

  const match = value.match(/^(\d+)\s*(s|m|h)?$/i)
  if (!match) return value

  const num = parseInt(match[1], 10)
  const unit = (match[2] || 's').toLowerCase()

  switch (unit) {
    case 'h': return num * 3600
    case 'm': return num * 60
    default: return num
  }
}

/**
 * Build Ollama request options from ModelParams.
 */
export function buildOllamaOptions(params: ModelParams): Record<string, unknown> {
  const options: Record<string, unknown> = {}

  // Map camelCase to snake_case for Ollama API
  const mapping: Record<string, string> = {
    temperature: 'temperature',
    topP: 'top_p',
    topK: 'top_k',
    minP: 'min_p',
    numCtx: 'num_ctx',
    numPredict: 'num_predict',
    numGpu: 'num_gpu',
    numGqa: 'num_gqa',
    numBatch: 'num_batch',
    numKeep: 'num_keep',
    numThread: 'num_thread',
    repeatLastN: 'repeat_last_n',
    repeatPenalty: 'repeat_penalty',
    tfsZ: 'tfs_z',
    typicalP: 'typical_p',
    frequencyPenalty: 'frequency_penalty',
    presencePenalty: 'presence_penalty',
    seed: 'seed',
    stop: 'stop',
    useMlock: 'use_mlock',
    useMMap: 'use_mmap',
    f16KV: 'f16_kv',
    logitsAll: 'logits_all',
    vocabOnly: 'vocab_only',
    penalizeNewline: 'penalize_newline',
    ropeFrequencyBase: 'rope_frequency_base',
    ropeFrequencyScale: 'rope_frequency_scale',
    mirostat: 'mirostat',
    mirostatEta: 'mirostat_eta',
    mirostatTau: 'mirostat_tau',
  }

  for (const [camelKey, snakeKey] of Object.entries(mapping)) {
    const key = camelKey as keyof ModelParams
    if (params[key] !== undefined) {
      options[snakeKey] = params[key]
    }
  }

  return options
}

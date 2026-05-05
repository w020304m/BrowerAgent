/**
 * AgentConfig — configuration interface with defaults.
 */

import type { ContextConfig } from './context/types'

export interface AgentConfig {
  // ── LLM settings ──
  /** Max retries for a single LLM call (default 3) */
  maxLlmRetries: number
  /** Base delay for exponential backoff in ms (default 1000) */
  backoffBaseMs: number
  /** Max backoff delay in ms (default 10000) */
  backoffMaxMs: number
  /** Whether to use streaming for LLM calls (default false) */
  useStreaming: boolean

  // ── Error recovery ──
  /** Max consecutive failures of the same tool before asking user (default 2) */
  maxConsecutiveSameToolFail: number
  /** Max total consecutive failures before task_failed (default 3) */
  maxConsecutiveFailures: number

  // ── Execution ──
  /** Default timeout per tool call in ms (default 30000) */
  toolTimeoutMs: number
  /** Whether to auto-get-snapshot on failure before asking user (default true) */
  autoSnapshotOnFailure: boolean

  // ── Context ──
  /** ContextManager configuration overrides */
  contextConfig?: Partial<ContextConfig>
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxLlmRetries: 3,
  backoffBaseMs: 1000,
  backoffMaxMs: 10000,
  useStreaming: false,
  maxConsecutiveSameToolFail: 2,
  maxConsecutiveFailures: 3,
  toolTimeoutMs: 30000,
  autoSnapshotOnFailure: true,
}

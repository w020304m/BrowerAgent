/**
 * ContextManager type definitions.
 */

import type { ToolCall, ToolResult } from '@/types/tool'

/** Configuration for ContextManager behavior */
export interface ContextConfig {
  /** Keep this many recent steps uncompressed (default 3) */
  keepRecentSteps: number
  /** Max tokens for DOM snapshot (default 4000) */
  maxSnapshotTokens: number
  /** Model context window tokens — default 128000, used for budget checking */
  contextWindowTokens: number
  /** Compression trigger: fraction of context window used before compressing (default 0.7 = 70%) */
  compressThreshold: number
}

/** Task definition — the agent's goal and constraints */
export interface TaskDefinition {
  id: string
  goal: string
  constraints: string[]
  createdAt: number
  /** Hard step limit — force task_failed if exceeded (default 50) */
  maxSteps: number
}

/** Record of a single tool call + result within the agent loop */
export interface AgentStep {
  stepNumber: number
  toolCall: {
    id: string
    name: string
    params: Record<string, unknown>
  }
  toolResult: {
    content: string
    isError: boolean
  }
  /** Content from <think/> tags if present */
  thinkingText?: string
  timestamp: number
  durationMs: number
}

/** Default configuration values */
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  keepRecentSteps: 3,
  maxSnapshotTokens: 4000,
  contextWindowTokens: 128_000,
  compressThreshold: 0.7,
}

/** Dynamic threshold calculations based on context window size */
export function getDynamicThresholds(contextWindowTokens: number) {
  return {
    /** Max tokens for step result truncation in formatStepResult (~1.5% of context) */
    formatStepResultLimit: Math.max(500, Math.floor(contextWindowTokens * 0.015)),
    /** Token reserve for large-result tools (~3% of context) */
    largeToolReserve: Math.max(500, Math.floor(contextWindowTokens * 0.03)),
    /** Token reserve for normal tools (~0.8% of context) */
    normalToolReserve: Math.max(200, Math.floor(contextWindowTokens * 0.008)),
    /** Character threshold for LLM summarization of step results (~2% of context as chars) */
    resultSummarizeThreshold: Math.max(1000, Math.floor(contextWindowTokens * 0.02)),
    /** Max chars for formatForLLM truncation (~0.4% of context as chars) */
    formatForLLMLimit: Math.max(200, Math.floor(contextWindowTokens * 0.004)),
    /** Max chars for formatForCompression truncation (~1.2% of context as chars) */
    formatForCompressionLimit: Math.max(500, Math.floor(contextWindowTokens * 0.012)),
  }
}

export const DEFAULT_MAX_STEPS = 50

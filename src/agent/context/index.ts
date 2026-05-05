/**
 * Context management module exports.
 */

export { ContextManager } from './ContextManager'
export { trimSnapshot, estimateTokens, truncateForLLM } from './snapshot-trimmer'
export {
  type ContextConfig,
  type TaskDefinition,
  type AgentStep,
  DEFAULT_CONTEXT_CONFIG,
  DEFAULT_MAX_STEPS,
} from './types'

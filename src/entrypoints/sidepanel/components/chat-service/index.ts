/**
 * Chat service module - All chat-related service functions
 *
 * This module contains all chat service logic split into smaller, maintainable pieces.
 */

// Main hook
export { useChatService } from './use-chat-service'
export type { UseChatServiceResult } from './use-chat-service'

// Agent-related functions
export { compactAgent, isAgentRunning, isContinuationMessage, extractConversationHistory, buildContinuationGoal } from './agent'

// History compression and message building
export { compressHistory, buildMessagesForPipeline } from './history'

// Provider configuration loading
export { getBaseUrl, getApiKey, getHeaders, getSystemPrompt } from './config'

// Database persistence
export { saveMessageToDb, updateChatHistory } from './persistence'

// Normal pipeline execution
export { runNormalPipeline } from './pipeline'
export type { RunNormalPipelineParams } from './pipeline'

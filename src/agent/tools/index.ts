/**
 * Unified exports for the agent tool system.
 */

export { AGENT_TOOLS, AGENT_GROUPS, TOOL_GROUP_MAP } from './schemas'
export { registerPerceptionHandlers } from './perception'
export { registerActionHandlers } from './action'
export { registerNavigationHandlers } from './navigation'
export { registerMemoryHandlers } from './memory'
export { registerReasoningHandlers, setBridgeService as setReasoningBridgeService } from './reasoning'
export { registerSearchHandlers } from './search'

import type { BridgeService } from '../bridge/bridge-service'
import { registerPerceptionHandlers } from './perception'
import { registerActionHandlers } from './action'
import { registerNavigationHandlers } from './navigation'
import { registerMemoryHandlers } from './memory'
import { registerReasoningHandlers, setBridgeService as setReasoningBridgeService } from './reasoning'
import { registerSearchHandlers } from './search'

/** Register all agent tool handlers on the bridge */
export function registerAllAgentTools(bridge: BridgeService): void {
  setReasoningBridgeService(bridge)
  registerPerceptionHandlers(bridge)
  registerActionHandlers(bridge)
  registerNavigationHandlers(bridge)
  registerMemoryHandlers(bridge)
  registerReasoningHandlers(bridge)
  registerSearchHandlers(bridge)
}

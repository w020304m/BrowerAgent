/**
 * MCP settings convenience module.
 * Provides typed access to MCP-related storage keys.
 */

import { localStorageService } from './index'

export const mcpSettings = {
  async isHumanInLoop(): Promise<boolean> {
    return (await localStorageService.get<boolean>('mcpHumanInLoop')) ?? false
  },

  async setHumanInLoop(enabled: boolean): Promise<void> {
    await localStorageService.set('mcpHumanInLoop', enabled)
  },
}

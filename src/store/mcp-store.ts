/**
 * MCP Store.
 * Manages MCP state: pending approvals, action info, and MCP active state.
 * Independent from chat-store to maintain single responsibility.
 */

import { create } from 'zustand'
import type { PendingMcpApproval } from '@/types/chat'
import type { McpActionInfo } from '@/mcp/types'

export interface McpState {
  /** Pending tool approval request */
  pendingApproval: PendingMcpApproval | null
  /** Whether MCP is currently active in this session */
  isMcpActive: boolean
  /** Current MCP action info for UI state */
  actionInfo: McpActionInfo | null

  /** Resolve functions for pending approval Promise */
  _approveResolve: (() => void) | null
  _rejectResolve: ((reason?: string) => void) | null

  // Actions
  setPendingApproval: (approval: PendingMcpApproval | null) => void
  approveTool: () => void
  rejectTool: (reason?: string) => void
  setMcpActive: (active: boolean) => void
  setActionInfo: (info: McpActionInfo | null) => void
  clear: () => void
}

const initialState = {
  pendingApproval: null,
  isMcpActive: false,
  actionInfo: null,
  _approveResolve: null,
  _rejectResolve: null,
}

export const useMcpStore = create<McpState>((set, get) => ({
  ...initialState,

  setPendingApproval: (approval) => set({ pendingApproval: approval }),

  approveTool: () => {
    const { _approveResolve } = get()
    set({
      pendingApproval: null,
      _approveResolve: null,
      _rejectResolve: null,
    })
    _approveResolve?.()
  },

  rejectTool: (reason) => {
    const { _rejectResolve } = get()
    set({
      pendingApproval: null,
      _approveResolve: null,
      _rejectResolve: null,
    })
    _rejectResolve?.(reason)
  },

  setMcpActive: (active) => set({ isMcpActive: active }),

  setActionInfo: (info) => set({ actionInfo: info }),

  clear: () => set(initialState),
}))

/**
 * Wait for user approval of a tool call.
 * Returns true if approved, false if rejected.
 * Sets pendingApproval in the store for UI display.
 */
export function waitForMcpToolApproval(
  approval: PendingMcpApproval
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    useMcpStore.setState({
      pendingApproval: approval,
      _approveResolve: () => resolve(true),
      _rejectResolve: () => resolve(false),
    })
  })
}

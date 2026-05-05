/**
 * Agent task plan types — shared between agent, store, and UI.
 */

/** A single task item in the agent's plan */
export interface PlanItem {
  id: string
  /** Short task title, e.g. "导航到 bilibili.com" */
  title: string
  /** Current status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  /** Optional result when completed/failed */
  result?: string
}

/** The full agent plan state */
export interface AgentPlan {
  items: PlanItem[]
  updatedAt: number
}

/** Count summary for UI */
export interface PlanSummary {
  total: number
  completed: number
  failed: number
  inProgress: number
  pending: number
}

/** Get a summary from a plan */
export function getPlanSummary(plan: AgentPlan | null): PlanSummary {
  if (!plan || plan.items.length === 0) {
    return { total: 0, completed: 0, failed: 0, inProgress: 0, pending: 0 }
  }
  let completed = 0
  let failed = 0
  let inProgress = 0
  let pending = 0
  for (const item of plan.items) {
    switch (item.status) {
      case 'completed': completed++; break
      case 'failed': failed++; break
      case 'in_progress': inProgress++; break
      case 'pending': pending++; break
    }
  }
  return { total: plan.items.length, completed, failed, inProgress, pending }
}

/** Status colors for UI rendering */
export const PLAN_STATUS_CONFIG = {
  pending: { color: 'text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', icon: '○' },
  in_progress: { color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: '⟳' },
  completed: { color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', icon: '✓' },
  failed: { color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', icon: '✗' },
} as const

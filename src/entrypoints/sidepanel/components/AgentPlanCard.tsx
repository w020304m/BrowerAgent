import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat-store'
import { cn } from '@/lib/utils'
import { getPlanSummary, PLAN_STATUS_CONFIG } from '@/types/agent-plan'
import type { PlanItem } from '@/types/agent-plan'

const statusIcon: Record<PlanItem['status'], string> = {
  pending: PLAN_STATUS_CONFIG.pending.icon,
  in_progress: PLAN_STATUS_CONFIG.in_progress.icon,
  completed: PLAN_STATUS_CONFIG.completed.icon,
  failed: PLAN_STATUS_CONFIG.failed.icon,
}

const statusColor: Record<PlanItem['status'], string> = {
  pending: 'text-gray-400',
  in_progress: 'text-blue-500 animate-spin-slow',
  completed: 'text-green-500',
  failed: 'text-red-500',
}

export function AgentPlanCard() {
  const agentPlan = useChatStore(s => s.agentPlan)
  const agentEnabled = useChatStore(s => s.agentEnabled)
  const { t } = useTranslation('sidepanel')
  const [expanded, setExpanded] = useState(true)

  if (!agentPlan || agentPlan.items.length === 0 || !agentEnabled) {
    return null
  }

  const summary = getPlanSummary(agentPlan)
  // Auto-collapse when all tasks are done
  const allDone = summary.completed + summary.failed === summary.total

  return (
    <div className="mx-3 mt-2 border border-purple-200 dark:border-purple-800/40 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          {t('planTitle')}
          <span className="text-purple-500/60 font-normal">
            ({summary.completed}/{summary.total})
          </span>
          {summary.inProgress > 0 && (
            <span className="inline-flex items-center gap-0.5 text-blue-500 font-normal">
              <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
              {summary.inProgress}
            </span>
          )}
        </span>
        <svg
          className={cn('w-3.5 h-3.5 transition-transform', expanded ? 'rotate-180' : '')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Task list — collapsible */}
      {expanded && (
        <div className="px-3 pb-2 space-y-0.5 max-h-40 overflow-y-auto">
          {agentPlan.items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex items-start gap-2 py-0.5 text-xs leading-relaxed',
                item.status === 'completed' && 'line-through opacity-60',
                item.status === 'failed' && 'opacity-70',
              )}
            >
              <span className={cn('flex-shrink-0 mt-0.5 text-[10px]', statusColor[item.status])}>
                {item.status === 'in_progress' ? (
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                ) : statusIcon[item.status]}
              </span>
              <span className="text-gray-700 dark:text-gray-300 break-all">{item.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar */}
      <div className="h-0.5 bg-gray-100 dark:bg-gray-800">
        <div
          className={cn(
            'h-full transition-all duration-300',
            allDone && summary.failed === 0 ? 'bg-green-500' : 'bg-purple-500',
          )}
          style={{ width: `${summary.total > 0 ? (summary.completed / summary.total) * 100 : 0}%` }}
        />
      </div>
    </div>
  )
}

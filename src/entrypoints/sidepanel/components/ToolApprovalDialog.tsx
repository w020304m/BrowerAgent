import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMcpStore } from '@/store/mcp-store'
import { mcpServerRepo } from '@/db/repositories/mcp-server.repository'
import type { McpAvailableTool, McpToolExecutionMode } from '@/mcp/types'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

export function ToolApprovalDialog() {
  const pendingApproval = useMcpStore((s) => s.pendingApproval)
  const approveTool = useMcpStore((s) => s.approveTool)
  const rejectTool = useMcpStore((s) => s.rejectTool)
  const [alwaysAllow, setAlwaysAllow] = useState(false)
  const { t } = useTranslation('mcp')

  const handleApprove = async () => {
    if (alwaysAllow && pendingApproval?.serverId && pendingApproval?.serverName && pendingApproval?.toolName) {
      // Persist "allow" mode for this specific tool
      try {
        const server = await mcpServerRepo.getById(pendingApproval.serverId)
        if (server) {
          const cachedTools = (server as unknown as Record<string, unknown>).cachedTools
          if (Array.isArray(cachedTools)) {
            const updated = (cachedTools as McpAvailableTool[]).map(tool =>
              tool.name === pendingApproval.toolName
                ? { ...tool, executionMode: 'allow' as McpToolExecutionMode }
                : tool
            )
            await mcpServerRepo.updateToolsSync(pendingApproval.serverId, updated)
          }
        }
      } catch {
        // Don't block approval if persistence fails
      }
    }
    setAlwaysAllow(false)
    approveTool()
  }

  const handleReject = () => {
    setAlwaysAllow(false)
    rejectTool('User rejected')
  }

  return (
    <AlertDialog open={!!pendingApproval} onOpenChange={(open) => { if (!open) handleReject() }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('approvalTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('approvalDescription')}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <div className="rounded bg-muted p-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t('toolName')}:
              </span>
              <span className="text-xs font-mono">
                {pendingApproval?.toolName}
              </span>
            </div>
            {pendingApproval?.serverName && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('serverName')}:
                </span>
                <span className="text-xs">
                  {pendingApproval.serverName}
                </span>
              </div>
            )}
          </div>

          <div className="rounded bg-muted p-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('parameters')}:
            </span>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-xs">
              {pendingApproval ? JSON.stringify(pendingApproval.args, null, 2) : ''}
            </pre>
          </div>

          {/* Always allow checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={alwaysAllow}
              onChange={(e) => setAlwaysAllow(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-xs text-muted-foreground">
              {t('alwaysAllow', 'Always allow this tool')}
            </span>
          </label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleReject}>
            {t('reject')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleApprove}>
            {t('approve')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

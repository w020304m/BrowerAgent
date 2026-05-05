import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { mcpServerRepo } from '@/db/repositories/mcp-server.repository'
import { mcpSettings } from '@/storage/mcp-settings'
import { inspectMcpServerTools } from '@/mcp/remote-tools'
import { startMcpOAuthFlow, disconnectMcpOAuth } from '@/mcp/oauth-flow'
import { sendRequest } from '@/ipc/client'
import type { McpServerConfig } from '@/types/tool'
import type { McpAvailableTool, McpToolExecutionMode } from '@/mcp/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

export function McpSection() {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [humanInLoop, setHumanInLoop] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newServerName, setNewServerName] = useState('')
  const [newServerUrl, setNewServerUrl] = useState('')
  const [expandedServer, setExpandedServer] = useState<string | null>(null)
  const [toolsMap, setToolsMap] = useState<Map<string, McpAvailableTool[]>>(new Map())
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation(['settings', 'common'])

  const loadServers = useCallback(async () => {
    const all = await mcpServerRepo.getAll()
    setServers(all)
    setHumanInLoop(await mcpSettings.isHumanInLoop())
  }, [])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  const handleAddServer = async () => {
    if (!newServerName.trim() || !newServerUrl.trim()) return

    const server: McpServerConfig = {
      id: crypto.randomUUID?.() ?? Date.now().toString(),
      name: newServerName.trim(),
      url: newServerUrl.trim(),
      enabled: true,
      transport: 'streamable-http',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await mcpServerRepo.put(server)
    setNewServerName('')
    setNewServerUrl('')
    setShowAddForm(false)
    await loadServers()
  }

  const handleToggleServer = async (id: string, enabled: boolean) => {
    await mcpServerRepo.update(id, { enabled, updatedAt: Date.now() })
    await loadServers()
  }

  const handleDeleteServer = async (id: string) => {
    await mcpServerRepo.delete(id)
    await loadServers()
  }

  const handleInspectTools = async (server: McpServerConfig) => {
    setLoading(server.id)
    setError(null)
    try {
      const result = await inspectMcpServerTools(server as unknown as Parameters<typeof inspectMcpServerTools>[0])
      await mcpServerRepo.updateToolsSync(server.id, result.cachedTools, result.toolsSyncError)
      setToolsMap((prev) => {
        const next = new Map(prev)
        next.set(server.id, result.cachedTools)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(null)
      await loadServers()
    }
  }

  const handleToggleHumanInLoop = async (value: boolean) => {
    await mcpSettings.setHumanInLoop(value)
    setHumanInLoop(value)
  }

  const handleStartOAuth = async (server: McpServerConfig) => {
    setLoading(server.id)
    const result = await sendRequest('mcp_oauth_start', { serverId: server.id })
    if (!result.success && result.error) {
      setError(result.error)
    }
    setLoading(null)
  }

  const handleDisconnectOAuth = async (server: McpServerConfig) => {
    await sendRequest('mcp_oauth_disconnect', { serverId: server.id })
    await loadServers()
  }

  const tools = expandedServer ? toolsMap.get(expandedServer) ?? [] : []

  const handleToggleToolMode = async (serverId: string, toolName: string, newMode: McpToolExecutionMode) => {
    const server = servers.find(s => s.id === serverId)
    if (!server) return
    const cachedTools = (server as unknown as Record<string, unknown>).cachedTools
    if (!Array.isArray(cachedTools)) return
    const updated = (cachedTools as McpAvailableTool[]).map(t =>
      t.name === toolName ? { ...t, executionMode: newMode } : t
    )
    await mcpServerRepo.updateToolsSync(serverId, updated)
    // Update local state
    setToolsMap(prev => {
      const next = new Map(prev)
      next.set(serverId, updated)
      return next
    })
    await loadServers()
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">{t('settings:mcpServers')}</h2>

      {error && (
        <div className="mb-4 rounded bg-destructive/10 p-2 text-xs text-destructive">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            {t('sidepanel:dismiss')}
          </button>
        </div>
      )}

      {/* Human-in-loop toggle */}
      <div className="mb-4 flex items-center gap-2">
        <Switch
          id="human-in-loop"
          checked={humanInLoop}
          onCheckedChange={(v) => handleToggleHumanInLoop(v)}
        />
        <label htmlFor="human-in-loop" className="text-sm text-muted-foreground">
          {t('settings:mcpHumanInLoop')}
        </label>
      </div>

      {/* Server list */}
      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('settings:mcpNoServers')}
        </p>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className="rounded border border-border p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(v) => handleToggleServer(server.id, v)}
                  />
                  <span className="text-sm font-medium">{server.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {server.url}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setExpandedServer(expandedServer === server.id ? null : server.id)
                    }
                  >
                    {t('settings:mcpTools')}
                  </Button>
                  {(server as unknown as Record<string, unknown>).authType === 'oauth' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDisconnectOAuth(server)}
                      className="text-destructive hover:text-destructive"
                    >
                      {t('settings:mcpDisconnect')}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleInspectTools(server)}
                    disabled={loading === server.id}
                  >
                    {loading === server.id ? t('common:loading') : t('settings:mcpInspectTools')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteServer(server.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    {t('common:delete')}
                  </Button>
                </div>
              </div>

              {/* Expanded tools view */}
              {expandedServer === server.id && tools.length > 0 && (
                <div className="mt-2 border-t border-border pt-2">
                  {tools.map((tool) => {
                    const mode: McpToolExecutionMode = tool.executionMode ?? 'human_in_loop'
                    const nextMode: McpToolExecutionMode = mode === 'allow' ? 'human_in_loop' : mode === 'human_in_loop' ? 'disabled' : 'allow'
                    const modeLabel: Record<McpToolExecutionMode, string> = {
                      allow: t('settings:mcpModeAllow', 'Auto-allow'),
                      human_in_loop: t('settings:mcpModeApproval', 'Approval'),
                      disabled: t('settings:mcpModeDisabled', 'Disabled'),
                    }
                    const modeColor: Record<McpToolExecutionMode, string> = {
                      allow: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
                      human_in_loop: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
                      disabled: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
                    }
                    return (
                      <div key={tool.name} className="flex items-center justify-between py-0.5 text-xs">
                        <span className="font-medium">{tool.name}</span>
                        <button
                          onClick={() => handleToggleToolMode(server.id, tool.name, nextMode)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${modeColor[mode]}`}
                          title={t('settings:mcpClickToChange', 'Click to change mode')}
                        >
                          {modeLabel[mode]}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add server */}
      {!showAddForm ? (
        <Button
          variant="outline"
          className="mt-3 border-dashed"
          onClick={() => setShowAddForm(true)}
        >
          {t('settings:mcpAddServer')}
        </Button>
      ) : (
        <div className="mt-3 space-y-2 rounded border border-border p-3">
          <Input
            type="text"
            placeholder={t('settings:mcpServerName')}
            value={newServerName}
            onChange={(e) => setNewServerName(e.target.value)}
          />
          <Input
            type="text"
            placeholder={t('settings:mcpServerUrl')}
            value={newServerUrl}
            onChange={(e) => setNewServerUrl(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddForm(false)
                setNewServerName('')
                setNewServerUrl('')
              }}
            >
              {t('common:cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleAddServer}
              disabled={!newServerName.trim() || !newServerUrl.trim()}
            >
              {t('common:add')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

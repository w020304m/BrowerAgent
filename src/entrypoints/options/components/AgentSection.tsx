/**
 * Agent settings section — three-level tool toggles.
 * Source → Group → Single tool.
 */

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toolSettings } from '@/storage/tool-settings'
import { AGENT_TOOLS, AGENT_GROUPS, TOOL_GROUP_MAP } from '@/agent/tools/schemas'

type SourceSetting = {
  id: string
  enabled: boolean
  disabled?: boolean
  disabledReason?: string
}

type GroupWithTools = {
  groupId: string
  groupLabel: string
  enabled: boolean
  tools: { toolName: string; toolLabel: string; enabled: boolean }[]
}

export function AgentSection() {
  const { t } = useTranslation('settings')
  const [loading, setLoading] = useState(true)
  const [sources, setSources] = useState<SourceSetting[]>([])
  const [groups, setGroups] = useState<GroupWithTools[]>([])

  useEffect(() => {
    const load = async () => {
      const [sourceSettings, groupSettings, toolSettingsMap] = await Promise.all([
        toolSettings.getAllSourceSettings(),
        toolSettings.getAllGroupSettings(),
        toolSettings.getAllToolSettings(),
      ])

      setSources([
        { id: 'mcp', enabled: sourceSettings.mcp ?? true },
        { id: 'builtin', enabled: sourceSettings.builtin ?? true },
      ])

      // Build groups from agent tool schemas
      const groupDefs = AGENT_GROUPS.map((group) => {
        const groupTools = AGENT_TOOLS.filter(
          (tool) => TOOL_GROUP_MAP[tool.name] === group.id
        )
        return {
          groupId: group.id,
          groupLabel: group.label,
          enabled: groupSettings[group.id] ?? true,
          tools: groupTools.map((tool) => ({
            toolName: tool.name,
            toolLabel: tool.name.replace('agent__', ''),
            enabled: toolSettingsMap[tool.name] ?? true,
          })),
        }
      })

      setGroups(groupDefs)
      setLoading(false)
    }
    load()
  }, [])

  const toggleSource = async (sourceId: string, enabled: boolean) => {
    await toolSettings.setSourceEnabled(sourceId, enabled)
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, enabled } : s)))
  }

  const toggleGroup = async (groupId: string, enabled: boolean) => {
    await toolSettings.setGroupEnabled(groupId, enabled)
    setGroups((prev) => prev.map((g) => (g.groupId === groupId ? { ...g, enabled } : g)))
  }

  const toggleTool = async (toolName: string, enabled: boolean) => {
    await toolSettings.setToolEnabled(toolName, enabled)
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        tools: g.tools.map((t) => (t.toolName === toolName ? { ...t, enabled } : t)),
      })),
    )
  }

  const builtinSource = sources.find((s) => s.id === 'builtin')
  const builtinEnabled = builtinSource?.enabled ?? true

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Agent</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure which tool sources and individual tools are available for the agent loop.
        </p>
      </div>

      {/* Source-level toggles */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Tool Sources</h3>
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <Label className="text-sm">
                {source.id === 'mcp' && 'MCP Tools'}
                {source.id === 'builtin' && 'Built-in Tools'}
              </Label>
              {source.disabled ? (
                <span className="text-xs text-muted-foreground" title={source.disabledReason}>
                  <Switch checked={false} disabled />
                </span>
              ) : (
                <Switch
                  checked={source.enabled}
                  onCheckedChange={(checked) => toggleSource(source.id, checked)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Builtin tool groups and individual tools */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Built-in Tool Groups</h3>
        <div className={`space-y-3 ${!builtinEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
          {groups.map((group) => (
            <div key={group.groupId} className="rounded-lg border">
              <div className="flex items-center justify-between px-4 py-3">
                <Label className="text-sm font-medium">{group.groupLabel}</Label>
                <Switch
                  checked={group.enabled}
                  disabled={!builtinEnabled}
                  onCheckedChange={(checked) => toggleGroup(group.groupId, checked)}
                />
              </div>
              <div
                className={`border-t px-4 py-2 space-y-2 ${
                  !group.enabled || !builtinEnabled ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                {group.tools.map((tool) => (
                  <div key={tool.toolName} className="flex items-center justify-between pl-4 py-1">
                    <span className="text-xs font-mono text-muted-foreground">
                      {tool.toolLabel}
                    </span>
                    <Switch
                      checked={tool.enabled}
                      disabled={!group.enabled || !builtinEnabled}
                      onCheckedChange={(checked) => toggleTool(tool.toolName, checked)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'

/**
 * Try to extract a screenshot data URL from a tool result string.
 * Returns the data URL if found, null otherwise.
 */
function extractScreenshot(result: string): string | null {
  if (!result || result.length < 100) return null
  try {
    const parsed = JSON.parse(result)
    if (typeof parsed.screenshot === 'string' && parsed.screenshot.startsWith('data:image/')) {
      return parsed.screenshot
    }
  } catch {
    // Not JSON
  }
  return null
}

/** Map internal tool names to short display names (compact UI) */
const TOOL_SHORT_NAMES: Record<string, string> = {
  agent__page_info: 'page info',
  agent__get_element_by_description: 'find element',
  agent__get_page_screenshot: 'screenshot',
  agent__read_page: 'read page',
  agent__select_element: 'select element',
  agent__click: 'click',
  agent__type: 'type',
  agent__select: 'select',
  agent__scroll: 'scroll',
  agent__drag_and_drop: 'drag',
  agent__wait_for: 'wait',
  agent__navigate: 'navigate',
  agent__navigate_history: 'history',
  agent__open_tab: 'open tab',
  agent__switch_tab: 'switch tab',
  agent__close_tab: 'close tab',
  agent__get_tabs: 'get tabs',
  agent__memory: 'memory',
  agent__scratchpad: 'scratchpad',
  agent__task_complete: 'done',
  agent__task_failed: 'failed',
  agent__ask_user: 'ask user',
  agent__report_progress: 'progress',
  agent__update_plan: 'plan',
  agent__web_search: 'search',
}

function getToolShortName(name: string): string {
  return TOOL_SHORT_NAMES[name] ?? name.replace(/^(agent__|builtin__|mcp__)/, '').replace(/_/g, ' ')
}

/**
 * Check if content is an internal agent signal that shouldn't be shown to users.
 */
function isInternalSignal(content: string): boolean {
  return content.startsWith('__AGENT_SIGNAL__:')
}

/**
 * Clean tool result content for display.
 * Hides internal signal format and extracts the human-readable result.
 */
function cleanResultContent(content: string): string {
  if (!isInternalSignal(content)) return content
  try {
    const jsonStr = content.replace('__AGENT_SIGNAL__:', '')
    const parsed = JSON.parse(jsonStr)
    if (parsed.type === 'task_complete' && parsed.result) {
      return parsed.result
    }
    if (parsed.type === 'task_failed' && parsed.reason) {
      return `Task failed: ${parsed.reason}`
    }
  } catch {
    // Not valid JSON after signal prefix
  }
  return '(completed)'
}

/** Build a compact arg summary string for the header */
function formatArgsSummary(args: Record<string, unknown> | undefined): string {
  if (!args || Object.keys(args).length === 0) return ''
  const entries = Object.entries(args).filter(([, v]) => v != null)
  if (entries.length === 0) return ''

  return entries.map(([k, v]) => {
    if (typeof v === 'string') {
      const short = v.length > 40 ? v.slice(0, 40) + '...' : v
      return `${k}="${short}"`
    }
    if (typeof v === 'object' && v !== null) {
      // For target objects like {agentId: "a0"}, show compactly
      const inner = Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val != null)
        .map(([ik, iv]) => `${ik}:${iv}`)
        .join(',')
      return `${k}={${inner}}`
    }
    return `${k}=${String(v)}`
  }).join(' ')
}

/**
 * Parse selected element result from agent__select_element tool.
 * Returns { agentId, tag, text } or null if not a valid element result.
 */
function parseSelectedElement(result: string | undefined): { agentId: string; tag: string; text?: string } | null {
  if (!result) return null
  try {
    const parsed = JSON.parse(result)
    if (parsed && typeof parsed.agentId === 'string' && typeof parsed.tag === 'string') {
      return {
        agentId: parsed.agentId,
        tag: parsed.tag,
        text: parsed.text,
      }
    }
  } catch {
    // Not valid JSON
  }
  return null
}

interface ToolCallCardProps {
  toolName: string
  serverName?: string
  args?: Record<string, unknown>
  result?: string
  isError?: boolean
  isPending?: boolean
}

export function ToolCallCard({
  toolName,
  serverName,
  args,
  result,
  isError,
  isPending,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation('mcp')

  const shortName = getToolShortName(toolName)
  const argsSummary = formatArgsSummary(args)
  const screenshotUrl = useMemo(() => result ? extractScreenshot(result) : null, [result])
  // Clean internal signal format from result for display
  const displayResult = result ? cleanResultContent(result) : undefined
  // Parse selected element result for special display
  const selectedElement = useMemo(() => toolName === 'agent__select_element' ? parseSelectedElement(displayResult) : null, [toolName, displayResult])

  // Compact mode: most tools show as a single line
  const hasDetails = (args && Object.keys(args).filter(k => args[k] != null).length > 0) || (result && result.length > 0)

  const borderColor = isError
    ? 'border-red-300 dark:border-red-700'
    : isPending
      ? 'border-yellow-300 dark:border-yellow-700'
      : 'border-gray-200 dark:border-gray-700'

  const bgColor = isError
    ? 'bg-red-50/50 dark:bg-red-950/30'
    : isPending
      ? 'bg-yellow-50/50 dark:bg-yellow-950/30'
      : 'bg-gray-50/50 dark:bg-gray-800/50'

  const statusIcon = isError
    ? <span className="text-red-400 text-[10px]">✕</span>
    : isPending
      ? <svg className="w-3 h-3 animate-spin text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
      : <span className="text-green-400 text-[10px]">✓</span>

  return (
    <Collapsible open={expanded} onOpenChange={hasDetails ? setExpanded : undefined} className={`rounded border ${borderColor} ${bgColor} my-0.5 text-xs`}>
      <CollapsibleTrigger className={`flex w-full items-center gap-1.5 px-2 py-1 text-left ${hasDetails ? 'cursor-pointer hover:bg-gray-100/50 dark:hover:bg-gray-700/50' : 'cursor-default'}`}>
        {statusIcon}
        <span className="font-medium text-gray-600 dark:text-gray-400">{shortName}</span>
        {serverName && !toolName.startsWith('agent__') && !toolName.startsWith('builtin__') && (
          <span className="text-muted-foreground">({serverName})</span>
        )}
        {argsSummary && (
          <span className="text-muted-foreground truncate text-[11px]">{argsSummary}</span>
        )}
        {hasDetails && (
          <svg className={`w-2.5 h-2.5 flex-shrink-0 ml-auto text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5l8 7-8 7z" />
          </svg>
        )}
      </CollapsibleTrigger>
      {hasDetails && (
        <CollapsibleContent>
          <div className="border-t border-border/30 px-2 py-1.5 space-y-1">
            {args && Object.keys(args).filter(k => args[k] != null).length > 0 && (
              <div>
                <span className="font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
                  {t('toolCallCard.args', 'Parameters')}
                </span>
                <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-1 text-[11px]">
                  {JSON.stringify(args, null, 2)}
                </pre>
              </div>
            )}

            {screenshotUrl ? (
              <div>
                <span className="font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
                  {t('toolCallCard.result', 'Result')}
                </span>
                <div className="mt-1 rounded overflow-hidden border border-border/50">
                  <img src={screenshotUrl} alt="Screenshot" className="w-full h-auto max-h-80 object-contain bg-gray-100 dark:bg-gray-900" />
                </div>
              </div>
            ) : selectedElement ? (
              <div>
                <span className="font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
                  {t('toolCallCard.result', 'Selected Element')}
                </span>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[11px] font-medium border border-blue-200 dark:border-blue-800">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                    {selectedElement.agentId}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[11px] border border-gray-200 dark:border-gray-700">
                    &lt;{selectedElement.tag}&gt;
                  </span>
                  {selectedElement.text && (
                    <span className="inline-flex items-center max-w-[200px] px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[11px] border border-gray-200 dark:border-gray-700 truncate">
                      "{selectedElement.text}"
                    </span>
                  )}
                </div>
              </div>
            ) : displayResult && displayResult.length > 0 ? (
              <div>
                <span className="font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
                  {t('toolCallCard.result', 'Result')}
                </span>
                <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-1 text-[11px] max-h-60 overflow-y-auto">
                  {displayResult.length > 800 ? displayResult.slice(0, 800) + '\n...(truncated)' : displayResult}
                </pre>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

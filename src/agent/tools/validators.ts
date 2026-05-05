/**
 * Zod runtime validators for all 35 agent tools.
 *
 * These validate the parameters the LLM actually sends back in tool_call.args,
 * catching malformed or missing fields before tool execution.
 * Schemas match the JSON Schema properties in schemas.ts exactly.
 */

import { z } from 'zod'

// ── Shared sub-schemas ──

const TargetSchema = z.object({
  agentId: z.string().optional(),
  selector: z.string().optional(),
}).refine(
  (t) => t.agentId || t.selector,
  'target must include agentId or selector',
)

const OptionalTargetSchema = z.object({
  agentId: z.string().optional(),
  selector: z.string().optional(),
}).optional()

/**
 * Transforms flat agentId/selector into a nested target object.
 * LLMs (especially smaller ones) often produce {"agentId": "a5"} instead of
 * {"target": {"agentId": "a5"}}. This normalizes both formats.
 */
const wrapFlatTarget = z.object({}).passthrough().transform((val) => {
  // LLM sends target as a plain string (e.g. "a0") — normalize to { agentId: "a0" }
  if (typeof val.target === 'string' && val.target.length > 0) {
    const { target, ...rest } = val as Record<string, unknown>
    return { ...rest, target: { agentId: target } }
  }
  if (val.target && typeof val.target === 'object') return val
  if (val.agentId || val.selector) {
    const { agentId, selector, ...rest } = val as Record<string, unknown>
    return { ...rest, target: { ...(agentId ? { agentId } : {}), ...(selector ? { selector } : {}) } }
  }
  return val
})

const TabIdSchema = z.preprocess(
  (val) => (typeof val === 'number' && val > 0) ? val : undefined,
  z.number().int().positive().optional(),
)

// ── Perception (4) ──

const PageInfoParamsSchema = z.discriminatedUnion('info_type', [
  z.object({
    info_type: z.literal('snapshot'),
    tabId: TabIdSchema,
  }),
  z.object({
    info_type: z.literal('elements'),
    tabId: TabIdSchema,
  }),
  z.object({
    info_type: z.literal('scroll'),
    tabId: TabIdSchema,
  }),
  z.object({
    info_type: z.literal('network'),
    urlPattern: z.string().optional(),
    method: z.string().optional(),
    tabId: TabIdSchema,
  }),
])

const GetElementByDescriptionParamsSchema = z.object({
  description: z.string().min(1, 'description is required'),
  tabId: TabIdSchema,
})

const GetPageScreenshotParamsSchema = z.object({
  scope: z.enum(['viewport', 'fullpage']).optional().default('viewport'),
  tabId: TabIdSchema,
})

const ReadPageParamsSchema = z.preprocess(
  (val) => {
    if (val == null || typeof val !== 'object') return val
    const obj = val as Record<string, unknown>
    // Normalize flat agentId/selector into target object
    if (obj.agentId || obj.selector) {
      const { agentId, selector, ...rest } = obj
      return { ...rest, target: { ...(agentId ? { agentId } : {}), ...(selector ? { selector } : {}) } }
    }
    // Normalize string target "a0" into { target: { agentId: "a0" } }
    if (typeof obj.target === 'string' && obj.target.length > 0) {
      const { target, ...rest } = obj
      return { ...rest, target: { agentId: target } }
    }
    return val
  },
  z.object({
    scope: z.enum(['viewport', 'element', 'page']).optional().default('viewport'),
    target: z.object({
      agentId: z.string().optional(),
      selector: z.string().optional(),
    }).optional(),
    maxChars: z.number().int().min(500).max(30000).optional().default(8000),
    tabId: TabIdSchema,
  }).refine(
  (data) => {
    // element mode requires target with agentId or selector
    if (data.scope === 'element') {
      return data.target !== undefined && (data.target.agentId !== undefined || data.target.selector !== undefined)
    }
    return true
  },
  { message: 'element mode requires target (agentId or selector)', path: ['target'] },
))

// ── Action (6) ──

const ClickParamsSchema = wrapFlatTarget.pipe(z.object({
  target: TargetSchema,
  hover: z.boolean().optional().default(false),
  tabId: TabIdSchema,
}))

const TypeParamsSchema = wrapFlatTarget.pipe(z.object({
  target: OptionalTargetSchema,
  text: z.string().optional(),
  clear: z.boolean().optional().default(false),
  pressEnter: z.boolean().optional().default(false),
  keys: z.string().optional(),
  tabId: TabIdSchema,
})).refine(
  (data) => data.text || data.keys,
  { message: 'Either text or keys is required', path: ['text'] },
)

const SelectParamsSchema = wrapFlatTarget.pipe(z.object({
  target: TargetSchema,
  value: z.string().min(1, 'value is required'),
  tabId: TabIdSchema,
}))

const ScrollParamsSchema = z.object({
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  amount: z.number().optional().default(300),
  selector: z.string().optional(),
  toBottom: z.boolean().optional(),
  tabId: TabIdSchema,
})

const DragAndDropParamsSchema = z.object({
  from: TargetSchema,
  to: TargetSchema,
  tabId: TabIdSchema,
})

const WaitForParamsSchema = z.object({
  condition: z.enum(['selector', 'text', 'url', 'navigation', 'networkIdle']),
  value: z.string().optional(),
  timeout: z.number().int().min(100).max(30000).optional().default(5000),
  idleMs: z.number().int().min(500).max(10000).optional().default(2000),
  tabId: TabIdSchema,
}).refine(
  (data) => {
    // navigation and networkIdle don't need value
    if (data.condition === 'navigation' || data.condition === 'networkIdle') return true
    // selector/text/url require value
    return typeof data.value === 'string' && data.value.length > 0
  },
  { message: 'value is required for selector/text/url conditions', path: ['value'] },
)

// ── URL validation ──

/**
 * Validate URL format. Rejects clearly malformed URLs.
 * Does NOT check if the URL actually exists — only validates format.
 */
const UrlSchema = z.string().min(1, 'url is required').refine(
  (url) => {
    // Must start with a known protocol
    if (!/^https?:\/\//i.test(url)) return false
    try {
      const parsed = new URL(url)
      // Must have a hostname with at least one dot (reject "http://foo")
      return parsed.hostname.includes('.')
    } catch {
      return false
    }
  },
  { message: 'Invalid URL format. Must be a full URL like "https://example.com/path"' },
)

// ── Navigation (7) ──

const NavigateParamsSchema = z.object({
  url: UrlSchema,
  tabId: TabIdSchema,
})

const NavigateHistoryParamsSchema = z.object({
  direction: z.enum(['back', 'forward']),
  tabId: TabIdSchema,
})

const OpenTabParamsSchema = z.object({
  url: UrlSchema,
  active: z.boolean().optional().default(true),
})

const SwitchTabParamsSchema = z.object({
  tabId: z.number().int().positive('tabId is required'),
})

const CloseTabParamsSchema = z.object({
  tabId: TabIdSchema,
})

const GetTabsParamsSchema = z.object({
  currentWindow: z.boolean().optional().default(true),
})

// ── Memory (2) ──

const MemoryParamsSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('set'),
    key: z.string().min(1, 'key is required for set'),
    value: z.unknown(),
  }),
  z.object({
    operation: z.literal('get'),
    key: z.string().min(1, 'key is required for get'),
  }),
  z.object({
    operation: z.literal('delete'),
    key: z.string().min(1, 'key is required for delete'),
  }),
  z.object({
    operation: z.literal('list'),
  }),
])

const ScratchpadParamsSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('write'),
    content: z.string().min(1, 'content is required for write'),
  }),
  z.object({
    operation: z.literal('read'),
  }),
  z.object({
    operation: z.literal('clear'),
  }),
])

// ── Reasoning (5) ──

const TaskCompleteParamsSchema = z.object({
  result: z.string().optional(),
})

const TaskFailedParamsSchema = z.object({
  reason: z.string().optional(),
  recoverable: z.boolean().optional().default(false),
})

const AskUserParamsSchema = z.object({
  question: z.string().min(1, 'question is required'),
  options: z.array(z.string()).optional(),
})

const ReportProgressParamsSchema = z.object({
  current: z.number().optional().default(0),
  total: z.number().optional().default(0),
  description: z.string().optional(),
})

const UpdatePlanParamsSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string().min(1, 'id is required'),
      title: z.string().min(1, 'title is required'),
      status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
      result: z.string().optional(),
    }),
  ).min(1, 'tasks must have at least one item'),
})

// ── Search (1) ──

const WebSearchParamsSchema = z.preprocess(
  (val) => {
    if (val == null || typeof val !== 'object') return val
    const obj = val as Record<string, unknown>
    // Small models often send "description" or "q" instead of "query"
    if (!obj.query && (obj.description || obj.q)) {
      return { ...obj, query: String(obj.description ?? obj.q) }
    }
    return val
  },
  z.object({
    query: z.string().min(1, 'query is required'),
    maxResults: z.number().int().min(1).max(20).optional().default(8),
  }),
)

// ── Registry ──

const TOOL_VALIDATORS: Record<string, z.ZodSchema> = {
  // Perception
  agent__page_info: PageInfoParamsSchema,
  agent__get_element_by_description: GetElementByDescriptionParamsSchema,
  agent__get_page_screenshot: GetPageScreenshotParamsSchema,
  agent__read_page: ReadPageParamsSchema,

  // Action
  agent__click: ClickParamsSchema,
  agent__type: TypeParamsSchema,
  agent__select: SelectParamsSchema,
  agent__scroll: ScrollParamsSchema,
  agent__drag_and_drop: DragAndDropParamsSchema,
  agent__wait_for: WaitForParamsSchema,

  // Navigation
  agent__navigate: NavigateParamsSchema,
  agent__navigate_history: NavigateHistoryParamsSchema,
  agent__open_tab: OpenTabParamsSchema,
  agent__switch_tab: SwitchTabParamsSchema,
  agent__close_tab: CloseTabParamsSchema,
  agent__get_tabs: GetTabsParamsSchema,

  // Memory
  agent__memory: MemoryParamsSchema,
  agent__scratchpad: ScratchpadParamsSchema,

  // Reasoning
  agent__task_complete: TaskCompleteParamsSchema,
  agent__task_failed: TaskFailedParamsSchema,
  agent__ask_user: AskUserParamsSchema,
  agent__report_progress: ReportProgressParamsSchema,
  agent__update_plan: UpdatePlanParamsSchema,

  // Search
  agent__web_search: WebSearchParamsSchema,
}

// ── Public API ──

/** Format examples for common tools — included in validation errors to help LLMs self-correct */
const FORMAT_EXAMPLES: Record<string, string> = {
  'agent__click': '{"target": {"agentId": "a0"}}',
  'agent__type': '{"target": {"agentId": "a0"}, "text": "hello"}',
  'agent__navigate': '{"url": "https://example.com"}',
  'agent__select': '{"target": {"agentId": "a0"}, "value": "option1"}',
  'agent__drag_and_drop': '{"from": {"agentId": "a0"}, "to": {"agentId": "a1"}}',
  'agent__scroll': '{"direction": "down", "amount": 300}',
  'agent__page_info': '{"info_type": "snapshot"}',
  'agent__read_page': '{"scope": "viewport"}',
  'agent__get_element_by_description': '{"description": "search input"}',
  'agent__open_tab': '{"url": "https://example.com"}',
  'agent__switch_tab': '{"tabId": 1}',
  'agent__close_tab': '{}',
  'agent__wait_for': '{"condition": "selector", "value": "#result"}',
  'agent__web_search': '{"query": "search terms"}',
  'agent__ask_user': '{"question": "What should I do?"}',
  'agent__update_plan': '{"tasks": [{"id": "1", "title": "Step", "status": "pending"}]}',
  'agent__memory': '{"operation": "set", "key": "mykey", "value": "myvalue"}',
  'agent__scratchpad': '{"operation": "write", "content": "some notes"}',
}

export function validateToolParams(
  toolName: string,
  params: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  const schema = TOOL_VALIDATORS[toolName]
  if (!schema) return { success: true, data: params }

  const result = schema.safeParse(params)
  if (result.success) return { success: true, data: result.data }

  const errors = result.error.issues
    .map((e) => `${(e.path as string[]).join('.')}: ${e.message}`)
    .join('; ')
  const example = FORMAT_EXAMPLES[toolName]
  const hint = example ? ` Example correct format: ${example}` : ''
  return { success: false, error: `Parameter validation failed: ${errors}${hint}` }
}

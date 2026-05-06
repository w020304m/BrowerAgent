/**
 * Agent tool JSON Schemas.
 * Tool names use agent__ prefix.
 * Descriptions kept minimal for small model compatibility.
 *
 * tabId parameter convention:
 *   - All tools accept optional tabId. When omitted, uses active tab.
 *   - The description "Tab ID. Default: active tab." is abbreviated to save tokens.
 */

import type { ToolDefinition } from '@/types/tool'
import type { ToolGroup } from '@/tools/types'

// Shared parameter fragments
const tabIdParam = { type: 'number' as const, description: 'Tab ID. Default: active tab.' }

// ── Perception tools (4) ──

const perceptionTools: ToolDefinition[] = [
  {
    name: 'agent__page_info',
    description: 'Get page information. snapshot: TEXT snapshot with element IDs. elements: list interactive elements. scroll: scroll position. network: network requests.',
    parameters: {
      type: 'object',
      properties: {
        info_type: {
          type: 'string',
          enum: ['snapshot', 'elements', 'scroll', 'network'],
          description: 'Type of page info to retrieve.',
        },
        urlPattern: { type: 'string', description: 'Filter network requests by URL substring (e.g. "api/"). network only.' },
        method: { type: 'string', description: 'Filter network requests: GET, POST, PUT, DELETE. network only.' },
        tabId: tabIdParam,
      },
      required: ['info_type'],
    },
  },
  {
    name: 'agent__get_element_by_description',
    description: 'Find element by text description. Returns agentId for action tools.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Text to match.' },
        tabId: tabIdParam,
      },
      required: ['description'],
    },
  },
  {
    name: 'agent__get_page_screenshot',
    description: 'Capture IMAGE screenshot. scope="viewport" for visible area, "fullpage" for entire page.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['viewport', 'fullpage'],
          description: '"viewport" or "fullpage".',
        },
        tabId: tabIdParam,
      },
    },
  },
  {
    name: 'agent__read_page',
    description: 'Read page text content. Snapshot shows elements; this shows paragraphs/articles. Use scope="element" with agentId to read specific element and reduce context.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['viewport', 'element', 'page'],
          description: 'viewport, element, or page. Default: viewport. Use element to read specific div/section.',
        },
        target: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Element agentId. Required for element scope.' },
            selector: { type: 'string', description: 'CSS selector fallback.' },
          },
          description: 'Target element. Required when scope="element". Use this to avoid reading entire page.',
        },
        maxChars: { type: 'number', description: 'Max chars. Default 8000, range 500-30000. Use 2000-4000 for single element.' },
        tabId: tabIdParam,
      },
    },
  },
]

// ── Action tools (6) ──

const actionTools: ToolDefinition[] = [
  {
    name: 'agent__click',
    description: 'Click or hover over an element. Requires agentId from snapshot. Set hover=true to hover instead of click.',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Element agentId (e.g. "a0").' },
            selector: { type: 'string', description: 'CSS selector fallback.' },
          },
          description: 'Element to click or hover.',
        },
        hover: { type: 'boolean', description: 'Hover instead of click. Triggers hover menus/tooltips. Default: false.' },
        tabId: tabIdParam,
      },
      required: ['target'],
    },
  },
  {
    name: 'agent__type',
    description: 'Type text into input/textarea, or press keyboard keys. Optionally clear first or press Enter after.',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Element agentId.' },
            selector: { type: 'string', description: 'CSS selector fallback.' },
          },
          description: 'Target element. Required when typing text.',
        },
        text: { type: 'string', description: 'Text to type.' },
        clear: { type: 'boolean', description: 'Clear existing text first. Default: false.' },
        pressEnter: { type: 'boolean', description: 'Press Enter after typing. Default: false.' },
        keys: { type: 'string', description: 'Keyboard key to press (e.g. "Enter", "Escape", "Tab"). For pressing keys without typing text.' },
        tabId: tabIdParam,
      },
    },
  },
  {
    name: 'agent__select',
    description: 'Select option in dropdown by value or visible text.',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'object',
          properties: {
            agentId: { type: 'string', description: 'Element agentId.' },
            selector: { type: 'string', description: 'CSS selector fallback.' },
          },
          description: 'Target element.',
        },
        value: { type: 'string', description: 'Option value or visible text.' },
        tabId: tabIdParam,
      },
      required: ['target', 'value'],
    },
  },
  {
    name: 'agent__scroll',
    description: 'Scroll page by direction, to element, or to bottom.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction.' },
        amount: { type: 'number', description: 'Pixels. Default: 300.' },
        selector: { type: 'string', description: 'CSS selector to scroll to.' },
        toBottom: { type: 'boolean', description: 'Scroll to page bottom.' },
        tabId: tabIdParam,
      },
    },
  },
  {
    name: 'agent__drag_and_drop',
    description: 'Drag element and drop onto another.',
    parameters: {
      type: 'object',
      properties: {
        from: {
          type: 'object',
          properties: { agentId: { type: 'string' }, selector: { type: 'string' } },
          description: 'Source element.',
        },
        to: {
          type: 'object',
          properties: { agentId: { type: 'string' }, selector: { type: 'string' } },
          description: 'Target element.',
        },
        tabId: tabIdParam,
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'agent__wait_for',
    description: 'Wait for condition: element appears, text, URL change, page load, or network idle.',
    parameters: {
      type: 'object',
      properties: {
        condition: {
          type: 'string',
          enum: ['selector', 'text', 'url', 'navigation', 'networkIdle'],
          description: 'What to wait for.',
        },
        value: { type: 'string', description: 'Value for condition (selector/text/url).' },
        timeout: { type: 'number', description: 'Max wait ms. Default: 5000.' },
        idleMs: { type: 'number', description: 'For networkIdle: idle period ms. Default: 2000.' },
        tabId: tabIdParam,
      },
      required: ['condition'],
    },
  },
]

// ── Navigation tools (4) ──

const navigationTools: ToolDefinition[] = [
  {
    name: 'agent__navigate',
    description: 'Go to URL in current tab. Waits for page load.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to.' },
        tabId: tabIdParam,
      },
      required: ['url'],
    },
  },
  {
    name: 'agent__navigate_history',
    description: 'Go back or forward in browser history.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['back', 'forward'], description: 'back or forward.' },
        tabId: tabIdParam,
      },
      required: ['direction'],
    },
  },
  {
    name: 'agent__open_tab',
    description: 'Open URL in NEW tab. Keeps current tab. Use navigate for same-tab.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open.' },
        active: { type: 'boolean', description: 'Make tab active. Default: true.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'agent__switch_tab',
    description: 'Switch to tab by ID. Use get_tabs to find IDs.',
    parameters: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID to switch to.' },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'agent__close_tab',
    description: 'Close a tab. Default: active tab.',
    parameters: {
      type: 'object',
      properties: {
        tabId: { type: 'number', description: 'Tab ID. Default: active tab.' },
      },
    },
  },
  {
    name: 'agent__get_tabs',
    description: 'List open tabs with IDs, titles, URLs.',
    parameters: {
      type: 'object',
      properties: {
        currentWindow: { type: 'boolean', description: 'Only current window. Default: true.' },
      },
    },
  },
]

// ── Memory tools (2) ──

const memoryTools: ToolDefinition[] = [
  {
    name: 'agent__memory',
    description: 'Session memory operations. set: store key-value. get: retrieve by key. delete: remove key. list: show all keys.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['set', 'get', 'delete', 'list'],
          description: 'Memory operation.',
        },
        key: { type: 'string', description: 'Memory key. Required for set/get/delete.' },
        value: {
          oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'array' }, { type: 'object' }],
          description: 'Value to store. Required for set.',
        },
      },
      required: ['operation'],
    },
  },
  {
    name: 'agent__scratchpad',
    description: 'Scratchpad operations. write: append text. read: read content. clear: erase all.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['write', 'read', 'clear'],
          description: 'Scratchpad operation.',
        },
        content: { type: 'string', description: 'Text to append. Required for write.' },
      },
      required: ['operation'],
    },
  },
]

// ── Reasoning tools (4) ──

const reasoningTools: ToolDefinition[] = [
  {
    name: 'agent__task_complete',
    description: 'Signal task completion with final answer.',
    parameters: {
      type: 'object',
      properties: {
        result: { type: 'string', description: 'Final answer.' },
      },
    },
  },
  {
    name: 'agent__task_failed',
    description: 'Signal failure. Only when unable to proceed (CAPTCHA, page missing, etc).',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why task cannot complete.' },
        recoverable: { type: 'boolean', description: 'Whether retryable.' },
      },
    },
  },
  {
    name: 'agent__ask_user',
    description: 'Ask user a question. Use when genuinely blocked.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Question to ask.' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Suggested answers.',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'agent__report_progress',
    description: 'Report task progress to UI.',
    parameters: {
      type: 'object',
      properties: {
        current: { type: 'number', description: 'Current step.' },
        total: { type: 'number', description: 'Total steps.' },
        description: { type: 'string', description: 'What is happening.' },
      },
    },
  },
  {
    name: 'agent__update_plan',
    description: 'Plan subtasks for multi-step work. Call first, then update status as you go.',
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Planned tasks with id, title, status.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Task ID (e.g. "1").' },
              title: { type: 'string', description: 'Short title (max 50 chars).' },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed', 'failed'],
                description: 'Task status.',
              },
              result: { type: 'string', description: 'Result or error message.' },
            },
            required: ['id', 'title', 'status'],
          },
        },
      },
      required: ['tasks'],
    },
  },
]

// ── Search tools (1) ──

const searchTools: ToolDefinition[] = [
  {
    name: 'agent__web_search',
    description: 'Search the web. Returns titles, URLs, snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query.' },
        maxResults: { type: 'number', description: 'Max results. Default: 8.' },
      },
      required: ['query'],
    },
  },
]

// ── Aggregated exports ──

export const AGENT_TOOLS: ToolDefinition[] = [
  ...perceptionTools,
  ...actionTools,
  ...navigationTools,
  ...memoryTools,
  ...reasoningTools,
  ...searchTools,
]

export const AGENT_GROUPS: ToolGroup[] = [
  { id: 'agent__perception', label: 'Perception', sourceId: 'builtin' },
  { id: 'agent__action', label: 'Action', sourceId: 'builtin' },
  { id: 'agent__navigation', label: 'Navigation', sourceId: 'builtin' },
  { id: 'agent__memory', label: 'Memory', sourceId: 'builtin' },
  { id: 'agent__reasoning', label: 'Reasoning', sourceId: 'builtin' },
  { id: 'agent__search', label: 'Search', sourceId: 'builtin' },
]

/**
 * Tool name → group mapping for three-level filtering.
 */
export const TOOL_GROUP_MAP: Record<string, string> = {}

// Perception tools → agent__perception
for (const tool of perceptionTools) {
  TOOL_GROUP_MAP[tool.name] = 'agent__perception'
}

// Action tools → agent__action
for (const tool of actionTools) {
  TOOL_GROUP_MAP[tool.name] = 'agent__action'
}

// Navigation tools → agent__navigation
for (const tool of navigationTools) {
  TOOL_GROUP_MAP[tool.name] = 'agent__navigation'
}

// Memory tools → agent__memory
for (const tool of memoryTools) {
  TOOL_GROUP_MAP[tool.name] = 'agent__memory'
}

// Reasoning tools → agent__reasoning
for (const tool of reasoningTools) {
  TOOL_GROUP_MAP[tool.name] = 'agent__reasoning'
}

// Search tools → agent__search
for (const tool of searchTools) {
  TOOL_GROUP_MAP[tool.name] = 'agent__search'
}

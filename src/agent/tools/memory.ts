/**
 * Memory layer: 2 tools for session-based memory and scratchpad.
 * All run in background context using chrome.storage.session.
 */

import type { ToolCall, ToolResult } from '@/types/tool'
import type { BridgeService } from '../bridge/bridge-service'

const MEMORY_KEY = 'agent_memory'
const SCRATCHPAD_KEY = 'agent_scratchpad'

export function registerMemoryHandlers(bridge: BridgeService): void {
  bridge.register('agent__memory', handleMemory)
  bridge.register('agent__scratchpad', handleScratchpad)
}

async function getMemory(): Promise<Record<string, unknown>> {
  const stored = await chrome.storage.session.get(MEMORY_KEY)
  return (stored?.[MEMORY_KEY] as Record<string, unknown>) ?? {}
}

async function setMemory(memory: Record<string, unknown>): Promise<void> {
  await chrome.storage.session.set({ [MEMORY_KEY]: memory })
}

// ── Tool: agent__memory ──

async function handleMemory(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const operation = args.operation as string

  switch (operation) {
    case 'set': {
      const key = args.key as string
      const value = args.value
      if (!key) {
        return { toolCallId: toolCall.id, content: 'Error: key is required', isError: true }
      }
      const memory = await getMemory()
      const MAX_ENTRIES = 200
      if (Object.keys(memory).length >= MAX_ENTRIES && !(key in memory)) {
        return { toolCallId: toolCall.id, content: 'Error: Memory full. Delete unused keys first.', isError: true }
      }
      memory[key] = value
      await setMemory(memory)
      return {
        toolCallId: toolCall.id,
        content: JSON.stringify({ success: true, key }),
        isError: false,
      }
    }

    case 'get': {
      const key = args.key as string
      if (!key) {
        return { toolCallId: toolCall.id, content: 'Error: key is required', isError: true }
      }
      const memory = await getMemory()
      const value = memory[key]
      return {
        toolCallId: toolCall.id,
        content: JSON.stringify({ success: true, key, value: value ?? null }),
        isError: false,
      }
    }

    case 'delete': {
      const key = args.key as string
      if (!key) {
        return { toolCallId: toolCall.id, content: 'Error: key is required', isError: true }
      }
      const memory = await getMemory()
      delete memory[key]
      await setMemory(memory)
      return {
        toolCallId: toolCall.id,
        content: JSON.stringify({ success: true, key }),
        isError: false,
      }
    }

    case 'list': {
      const memory = await getMemory()
      return {
        toolCallId: toolCall.id,
        content: JSON.stringify({ success: true, keys: Object.keys(memory), count: Object.keys(memory).length }),
        isError: false,
      }
    }

    default:
      return {
        toolCallId: toolCall.id,
        content: `Error: unknown memory operation "${operation}". Use set, get, delete, or list.`,
        isError: true,
      }
  }
}

// ── Tool: agent__scratchpad ──

async function getScratchPad(): Promise<string> {
  const stored = await chrome.storage.session.get(SCRATCHPAD_KEY)
  return (stored?.[SCRATCHPAD_KEY] as string) ?? ''
}

async function setScratchPad(content: string): Promise<void> {
  await chrome.storage.session.set({ [SCRATCHPAD_KEY]: content })
}

async function handleScratchpad(toolCall: ToolCall): Promise<ToolResult> {
  const args = toolCall.args ?? {}
  const operation = args.operation as string

  switch (operation) {
    case 'write': {
      const content = args.content as string
      if (!content) {
        return { toolCallId: toolCall.id, content: 'Error: content is required', isError: true }
      }
      const current = await getScratchPad()
      const updated = current ? current + '\n' + content : content
      await setScratchPad(updated)
      return {
        toolCallId: toolCall.id,
        content: JSON.stringify({ success: true, length: updated.length }),
        isError: false,
      }
    }

    case 'read': {
      const content = await getScratchPad()
      return {
        toolCallId: toolCall.id,
        content: JSON.stringify({ success: true, content, length: content.length }),
        isError: false,
      }
    }

    case 'clear': {
      await setScratchPad('')
      return {
        toolCallId: toolCall.id,
        content: JSON.stringify({ success: true }),
        isError: false,
      }
    }

    default:
      return {
        toolCallId: toolCall.id,
        content: `Error: unknown scratchpad operation "${operation}". Use write, read, or clear.`,
        isError: true,
      }
  }
}

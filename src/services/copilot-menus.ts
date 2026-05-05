/**
 * Context menu manager for copilot prompts.
 * Creates and manages chrome.contextMenus entries for built-in and custom copilot prompts.
 */

import { getPromptsEnabledState } from './copilot-service'
import { getCustomPrompts } from './copilot-service'

export const BUILTIN_COPILOT_MENUS = [
  { id: 'summarize-pa', key: 'summary', title: 'Summarize' },
  { id: 'explain-pa', key: 'explain', title: 'Explain' },
  { id: 'rephrase-pa', key: 'rephrase', title: 'Rephrase' },
  { id: 'translate-pg', key: 'translate', title: 'Translate' },
  { id: 'custom-pg', key: 'custom', title: 'Custom' },
] as const

const CUSTOM_MENU_PREFIX = 'custom_copilot_'

export const isCustomCopilotMenuId = (menuId: string): boolean =>
  menuId.startsWith(CUSTOM_MENU_PREFIX)

export const isBuiltinCopilotMenuId = (menuId: string): boolean =>
  BUILTIN_COPILOT_MENUS.some((m) => m.id === menuId)

/** Map a menu item ID to a copilot broadcast type */
export const mapMenuIdToType = (menuId: string): string => {
  const builtin = BUILTIN_COPILOT_MENUS.find((m) => m.id === menuId)
  if (builtin) return builtin.key
  if (menuId.startsWith(CUSTOM_MENU_PREFIX)) return menuId
  return ''
}

export const copilotMenuManager = {
  /** Create built-in copilot context menus based on enabled state */
  async createBuiltinMenus(): Promise<void> {
    const enabledState = await getPromptsEnabledState()

    for (const menu of BUILTIN_COPILOT_MENUS) {
      try {
        await chrome.contextMenus.remove(menu.id)
      } catch {
        // Menu might not exist
      }

      if (enabledState[menu.key]) {
        chrome.contextMenus.create({
          id: menu.id,
          title: menu.title,
          contexts: ['selection'],
        })
      }
    }
  },

  /** Create custom copilot context menus from saved custom prompts */
  async createCustomMenus(): Promise<void> {
    // Remove existing custom menus
    // We need to track IDs; for simplicity, remove all custom_copilot_ prefixed menus
    // chrome.contextMenus doesn't support listing, so we rely on stored state
    // The caller is responsible for tracking and cleaning up

    const customPrompts = await getCustomPrompts()
    const enabledPrompts = customPrompts.filter((p) => p.enabled)

    for (const prompt of enabledPrompts) {
      const menuId = `${CUSTOM_MENU_PREFIX}${prompt.id}`
      try {
        await chrome.contextMenus.remove(menuId)
      } catch {
        // Menu might not exist
      }
      chrome.contextMenus.create({
        id: menuId,
        title: prompt.title,
        contexts: ['selection'],
      })
    }
  },

  /** Remove all copilot menus (built-in + custom) */
  async removeAllMenus(): Promise<void> {
    for (const menu of BUILTIN_COPILOT_MENUS) {
      try {
        await chrome.contextMenus.remove(menu.id)
      } catch {
        // Menu might not exist
      }
    }

    const customPrompts = await getCustomPrompts()
    for (const prompt of customPrompts) {
      try {
        await chrome.contextMenus.remove(`${CUSTOM_MENU_PREFIX}${prompt.id}`)
      } catch {
        // Menu might not exist
      }
    }
  },
}

/**
 * Theme storage — persists the user's theme preference.
 * Uses localStorageService for persistence.
 */

import { localStorageService } from './index'

export type ThemeMode = 'light' | 'dark' | 'system'

const THEME_KEY = 'themeMode'

export const themeStorage = {
  async get(): Promise<ThemeMode> {
    return localStorageService.get<ThemeMode>(THEME_KEY, 'system')
  },

  async set(mode: ThemeMode): Promise<void> {
    await localStorageService.set(THEME_KEY, mode)
  },
}

/**
 * Resolve the effective theme (light or dark) from a ThemeMode.
 * For 'system', checks the OS preference via matchMedia.
 */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply the resolved theme class to the document root.
 */
export function applyThemeClass(resolved: 'light' | 'dark'): void {
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/assets/global.css'
import { signalPanelReady } from '@/ipc/client'
import { resolveTheme, applyThemeClass } from '@/storage/theme-storage'
import App from './App'

// Signal background that the sidepanel is open and ready for broadcasts
signalPanelReady()

// Apply theme synchronously before React renders to prevent FOUC.
// Reads from chrome.storage.local — async, but we apply immediately
// once available and also check localStorage as a synchronous fallback.
;(async () => {
  try {
    const result = await chrome.storage.local.get('themeMode')
    const mode = (result.themeMode as 'light' | 'dark' | 'system') ?? 'system'
    applyThemeClass(resolveTheme(mode))
  } catch {
    // Default to system if storage is unavailable
    applyThemeClass(resolveTheme('system'))
  }
})()

// Synchronous fallback: apply system preference immediately
applyThemeClass(resolveTheme('system'))

const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

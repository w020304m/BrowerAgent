/**
 * YouTube Summarize content script.
 * Injects a "Summarize" button on YouTube watch pages.
 * Uses WXT content script entry format.
 */

import { defineContentScript } from 'wxt/sandbox'
import { sendRequest, sendNotify } from '@/ipc/client'

export default defineContentScript({
  matches: ['*://www.youtube.com/watch*'],
  main() {
    let summarizeEnabled = false
    let buttonInjected = false
    const BUTTON_ID = 'page-assist-summarize-btn'

    async function checkEnabled(): Promise<boolean> {
      try {
        const response = await sendRequest('check_youtube_summarize_enabled')
        return response.enabled
      } catch {
        return false
      }
    }

    function createSummarizeButton(): HTMLElement {
      const button = document.createElement('button')
      button.id = BUTTON_ID
      button.textContent = 'Summarize'
      button.style.cssText = `
        background-color: #4f46e5;
        color: white;
        border: none;
        border-radius: 18px;
        padding: 6px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        margin-left: 8px;
      `
      button.addEventListener('click', () => {
        const videoTitle = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() ?? ''
        const videoUrl = window.location.href
        sendNotify({ type: 'youtube_summarize', videoTitle, videoUrl })
      })
      return button
    }

    function injectButton(): void {
      if (buttonInjected) return
      const container = document.querySelector('#top-level-buttons-computed')
      if (!container) return

      const existing = document.getElementById(BUTTON_ID)
      if (existing) return

      container.appendChild(createSummarizeButton())
      buttonInjected = true
    }

    function removeButton(): void {
      const existing = document.getElementById(BUTTON_ID)
      if (existing) {
        existing.remove()
        buttonInjected = false
      }
    }

    async function init(): Promise<void> {
      summarizeEnabled = await checkEnabled()
      if (summarizeEnabled) {
        injectButton()
      }
    }

    // Listen for setting changes from background
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'youtube_summarize_setting_changed') {
        summarizeEnabled = message.enabled
        if (summarizeEnabled) {
          injectButton()
        } else {
          removeButton()
        }
      }
    })

    // Handle SPA navigation
    const observer = new MutationObserver(() => {
      if (summarizeEnabled && !buttonInjected) {
        injectButton()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    init()
  },
})

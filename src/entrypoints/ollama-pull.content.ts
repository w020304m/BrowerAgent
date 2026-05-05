/**
 * Ollama model pull content script.
 * Injects "Pull" buttons on ollama.com model pages.
 */

import { defineContentScript } from 'wxt/sandbox'
import { sendNotify } from '@/ipc/client'
import { extractModelName, createPullButton } from './shared/ollama-pull-inject'

export default defineContentScript({
  matches: ['*://ollama.com/*'],
  main() {
    function handlePullClick(modelName: string): void {
      sendNotify({ type: 'pull_model', modelName })
    }

    function scanAndInject(): void {
      // Find all code/command blocks that contain ollama run/pull commands
      const codeBlocks = document.querySelectorAll('code, pre, .command')
      for (const block of codeBlocks) {
        const text = block.textContent ?? ''
        const modelName = extractModelName(text)
        if (!modelName) continue

        // Check if already injected
        if (block.parentElement?.querySelector('.page-assist-pull-btn')) continue

        const button = createPullButton(modelName, handlePullClick)
        button.classList.add('page-assist-pull-btn')
        block.parentElement?.appendChild(button)
      }
    }

    // Initial scan
    setTimeout(scanAndInject, 1000)

    // Re-scan on DOM changes
    const observer = new MutationObserver(() => {
      scanAndInject()
    })
    observer.observe(document.body, { childList: true, subtree: true })
  },
})

/**
 * HuggingFace model pull content script.
 * Injects "Pull" buttons on huggingface.co model pages next to ollama run commands.
 */

import { defineContentScript } from 'wxt/sandbox'
import { sendNotify } from '@/ipc/client'
import { extractModelName, createPullButton } from './shared/ollama-pull-inject'

export default defineContentScript({
  matches: ['*://huggingface.co/*'],
  main() {
    function handlePullClick(modelName: string): void {
      sendNotify({ type: 'pull_model', modelName })
    }

    function scanAndInject(): void {
      // Find code blocks with ollama commands on HuggingFace
      const codeBlocks = document.querySelectorAll('code, pre, .command')
      for (const block of codeBlocks) {
        const text = block.textContent ?? ''
        const modelName = extractModelName(text)
        if (!modelName) continue

        if (block.parentElement?.querySelector('.page-assist-pull-btn')) continue

        const button = createPullButton(modelName, handlePullClick)
        button.classList.add('page-assist-pull-btn')
        block.parentElement?.appendChild(button)
      }
    }

    setTimeout(scanAndInject, 1000)

    const observer = new MutationObserver(() => {
      scanAndInject()
    })
    observer.observe(document.body, { childList: true, subtree: true })
  },
})

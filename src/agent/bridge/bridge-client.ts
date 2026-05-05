/**
 * BridgeClient: sidepanel-side typed wrapper for sending tool calls to background.
 */

import type { ToolCall, ToolResult } from '@/types/tool'
import type { AgentToolCallMessage, AgentToolResponse } from './types'

export class BridgeClient {
  private static readonly BRIDGE_TIMEOUT_MS = 30_000

  /** Send tool call to background and await result */
  async executeTool(toolCall: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
    // Check if already aborted before starting
    if (signal?.aborted) {
      return {
        toolCallId: toolCall.id,
        content: 'Tool execution aborted',
        isError: true,
      }
    }

    // Screenshot runs in sidepanel context (captureVisibleTab needs activeTab from user gesture)
    if (toolCall.name === 'agent__get_page_screenshot') {
      return this.executeScreenshot(toolCall, signal)
    }

    const message: AgentToolCallMessage = {
      type: 'agent_tool_call',
      toolCall,
    }

    // Race: sendMessage vs timeout vs abort
    const response = await this.sendMessageWithTimeout(message, signal)

    // Check if aborted during execution
    if (signal?.aborted) {
      return {
        toolCallId: toolCall.id,
        content: 'Tool execution aborted',
        isError: true,
      }
    }

    if (!response || typeof response !== 'object') {
      return {
        toolCallId: toolCall.id,
        content: 'Error: No response from background service worker',
        isError: true,
      }
    }

    const typedResponse = response as AgentToolResponse

    if (!typedResponse.success || !typedResponse.result) {
      return {
        toolCallId: toolCall.id,
        content: typedResponse.error ?? 'Unknown error from background',
        isError: true,
      }
    }

    return typedResponse.result
  }

  /**
   * Send message to background with timeout and abort signal support.
   * Prevents the agent from hanging forever if the background SW is unresponsive.
   */
  private async sendMessageWithTimeout(message: AgentToolCallMessage, signal?: AbortSignal): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Bridge timeout: background did not respond within ${BridgeClient.BRIDGE_TIMEOUT_MS / 1000}s`))
      }, BridgeClient.BRIDGE_TIMEOUT_MS)

      const onAbort = () => {
        clearTimeout(timeoutId)
        reject(new Error('Tool execution aborted'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      chrome.runtime.sendMessage(message)
        .then((response) => {
          clearTimeout(timeoutId)
          signal?.removeEventListener('abort', onAbort)
          resolve(response)
        })
        .catch((err) => {
          clearTimeout(timeoutId)
          signal?.removeEventListener('abort', onAbort)
          reject(err)
        })
    })
  }

  /** Execute screenshot in sidepanel context */
  private async executeScreenshot(toolCall: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
    const args = toolCall.args ?? {}
    const scope = (args.scope as string) === 'fullpage' ? 'fullpage' : 'viewport'

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
      if (!activeTab || !activeTab.windowId || !activeTab.id) {
        return {
          toolCallId: toolCall.id,
          content: JSON.stringify({ error: 'No active tab found' }),
          isError: true,
        }
      }

      if (scope === 'viewport') {
        const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' })
        return {
          toolCallId: toolCall.id,
          content: JSON.stringify({ screenshot: dataUrl, scope: 'viewport' }),
          isError: false,
        }
      }

      // fullpage: get page dimensions, scroll and stitch
      const dimensions = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => ({
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }),
      })

      const dim = dimensions?.[0]?.result as { scrollHeight: number; clientHeight: number; scrollWidth: number; clientWidth: number } | undefined
      if (!dim) {
        return {
          toolCallId: toolCall.id,
          content: JSON.stringify({ error: 'Failed to get page dimensions' }),
          isError: true,
        }
      }

      const viewportH = dim.clientHeight
      const totalH = dim.scrollHeight
      const canvasW = dim.clientWidth

      // If page doesn't actually scroll, just return viewport as fullpage
      if (totalH <= viewportH) {
        const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' })
        return {
          toolCallId: toolCall.id,
          content: JSON.stringify({ screenshot: dataUrl, scope: 'fullpage', slices: 1, note: 'Page fits in one viewport' }),
          isError: false,
        }
      }

      const slices: string[] = []

      // Scroll and capture each viewport-sized slice
      let scrollY = 0
      while (scrollY < totalH) {
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: (y: number) => window.scrollTo(0, y),
          args: [scrollY],
        })
        // Wait for scroll to settle and lazy content to load
        await new Promise((r) => setTimeout(r, 500))

        const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId!, { format: 'png' })
        slices.push(dataUrl)
        scrollY += viewportH
      }

      // Scroll back to top
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => window.scrollTo(0, 0),
      })

      // If only one slice, return directly
      if (slices.length === 1) {
        return {
          toolCallId: toolCall.id,
          content: JSON.stringify({ screenshot: slices[0], scope: 'fullpage', slices: 1 }),
          isError: false,
        }
      }

      // Stitch slices using OffscreenCanvas
      try {
        const stitchResult = await this.stitchScreenshots(slices, canvasW, totalH, viewportH)
        return {
          toolCallId: toolCall.id,
          content: JSON.stringify({ screenshot: stitchResult, scope: 'fullpage', slices: slices.length }),
          isError: false,
        }
      } catch (stitchErr) {
        // Stitching failed — return first slice with diagnostic info
        return {
          toolCallId: toolCall.id,
          content: JSON.stringify({
            screenshot: slices[0],
            scope: 'fullpage',
            slices: slices.length,
            warning: `Stitch failed: ${stitchErr instanceof Error ? stitchErr.message : String(stitchErr)}. Showing first viewport only.`,
          }),
          isError: false,
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      return {
        toolCallId: toolCall.id,
        content: JSON.stringify({
          error: 'Screenshot failed: ' + errMsg,
          hint: 'Please go to chrome://extensions → BrowserAgent → "Site access" → set to "On all sites".',
        }),
        isError: true,
      }
    }
  }

  /** Stitch multiple viewport screenshots into one fullpage image */
  private async stitchScreenshots(
    slices: string[],
    width: number,
    totalHeight: number,
    viewportHeight: number,
  ): Promise<string> {
    // Use OffscreenCanvas if available
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('OffscreenCanvas not available')
    }

    const canvas = new OffscreenCanvas(width, totalHeight)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get 2d context')

    let y = 0
    for (const dataUrl of slices) {
      // Convert data URL to blob, then to ImageBitmap for OffscreenCanvas compatibility
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      const bitmap = await createImageBitmap(blob)
      ctx.drawImage(bitmap, 0, y)
      bitmap.close()
      y += viewportHeight
    }

    const resultBlob = await canvas.convertToBlob({ type: 'image/png' })
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Blob to dataURL failed'))
      reader.readAsDataURL(resultBlob)
    })
  }

  /** Check if bridge is available (background service worker alive) */
  async ping(): Promise<boolean> {
    try {
      await chrome.runtime.sendMessage({ type: 'agent_ping' })
      return true
    } catch {
      return false
    }
  }
}

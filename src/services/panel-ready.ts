/**
 * Panel ready service.
 * Tracks sidepanel readiness via the pgCopilot port connection.
 */

type ReadyCallback = () => void

const pendingCallbacks: ReadyCallback[] = []
let panelReady = false

/**
 * Called by background.ts when a pgCopilot port connects.
 */
export function markPanelReady(): void {
  panelReady = true
  for (const cb of pendingCallbacks) {
    cb()
  }
  pendingCallbacks.length = 0
}

/**
 * Called when the port disconnects.
 */
export function markPanelDisconnected(): void {
  panelReady = false
}

/**
 * Wait for the panel to be ready.
 * Resolves immediately if already ready, otherwise waits for connection.
 */
export function waitForPanelReady(): Promise<void> {
  if (panelReady) return Promise.resolve()
  return new Promise((resolve) => {
    pendingCallbacks.push(resolve)
  })
}

/**
 * Broadcast a message to the sidepanel, waiting for it to be ready first.
 */
export async function broadcastWhenReady(message: unknown): Promise<void> {
  await waitForPanelReady()
  // Broadcast to all extension pages (sidepanel will receive it)
  chrome.runtime.sendMessage(message).catch(() => {
    // Sidepanel may not be listening yet
  })
}

/**
 * Reset state (for testing).
 */
export function resetPanelReady(): void {
  panelReady = false
  pendingCallbacks.length = 0
}

/**
 * Image utility functions for vision support.
 * Handles image conversion, resizing, and media type detection.
 */

/**
 * Convert a File to a base64 data URL.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/**
 * Extract media type from a base64 data URL.
 * e.g. "data:image/png;base64,abc" → "image/png"
 */
export function getImageMediaType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);/)
  return match ? match[1] : 'image/png'
}

/**
 * Resize an image if it exceeds the maximum dimensions.
 * Uses canvas in browser, returns original in non-browser environments.
 */
export async function resizeImageIfNeeded(
  dataUrl: string,
  maxWidth = 1024,
  maxHeight = 1024
): Promise<string> {
  // In non-browser environments, return original
  if (typeof document === 'undefined') return dataUrl

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      if (img.width <= maxWidth && img.height <= maxHeight) {
        resolve(dataUrl)
        return
      }

      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height)
      const newWidth = Math.round(img.width * ratio)
      const newHeight = Math.round(img.height * ratio)

      const canvas = document.createElement('canvas')
      canvas.width = newWidth
      canvas.height = newHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }

      ctx.drawImage(img, 0, 0, newWidth, newHeight)
      resolve(canvas.toDataURL(getImageMediaType(dataUrl)))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

/**
 * Capture a screenshot of a browser tab.
 * Requires browser extension environment.
 */
export async function captureScreenshot(tabId: number): Promise<string> {
  throw new Error(
    `captureScreenshot(${tabId}): requires browser extension environment. ` +
    'Use chrome.tabs.captureVisibleTab or chrome.tabs.sendMessage.'
  )
}

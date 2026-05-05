/**
 * Simple HTML-to-text converter using DOMParser.
 * Available in browser extension context.
 */
export const htmlToText = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const removeSelectors = [
    'script',
    'style',
    'nav',
    'footer',
    'header',
    'noscript',
  ]
  for (const selector of removeSelectors) {
    doc.querySelectorAll(selector).forEach((el) => el.remove())
  }

  const mainContent =
    doc.querySelector('[role="main"]') ??
    doc.querySelector('main') ??
    doc.querySelector('article') ??
    doc.body

  if (!mainContent) return ''

  return (mainContent.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

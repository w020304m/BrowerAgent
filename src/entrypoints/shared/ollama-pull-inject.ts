/**
 * Shared utilities for content scripts that inject "Pull" buttons.
 */

/**
 * Extract a model name from a CLI command string.
 * Handles formats like:
 * - `ollama run llama3`
 * - `ollama run llama3:latest`
 * - `ollama pull mistral`
 * - `ollama run ghcr.io/org/model:tag`
 */
export function extractModelName(cliCommand: string): string | null {
  // Match "ollama run <model>" or "ollama pull <model>"
  const runMatch = cliCommand.match(/ollama\s+(?:run|pull)\s+([^\s\n]+)/i)
  if (runMatch) {
    return runMatch[1]
  }
  return null
}

/**
 * Create a styled pull button element.
 */
export function createPullButton(
  modelName: string,
  onClick: (modelName: string) => void,
): HTMLElement {
  const button = document.createElement('button')
  button.textContent = `Pull ${modelName}`
  button.style.cssText = `
    background-color: #4f46e5;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 13px;
    cursor: pointer;
    margin-left: 8px;
    font-weight: 500;
    transition: background-color 0.2s;
  `
  button.addEventListener('mouseenter', () => {
    button.style.backgroundColor = '#4338ca'
  })
  button.addEventListener('mouseleave', () => {
    button.style.backgroundColor = '#4f46e5'
  })
  button.addEventListener('click', () => onClick(modelName))
  return button
}

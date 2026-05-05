/**
 * Stream cursor for tracking position in a streamed response.
 * Used by UI to know which content has been rendered.
 */

export class StreamCursor {
  private position: number = 0

  /** Get current position */
  get pos(): number {
    return this.position
  }

  /** Advance cursor by delta characters */
  advance(delta: number): void {
    if (delta < 0) {
      throw new Error('Cursor can only advance forward')
    }
    this.position += delta
  }

  /** Reset cursor to beginning */
  reset(): void {
    this.position = 0
  }
}

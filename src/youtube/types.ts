/**
 * YouTube transcript types.
 */

export interface TranscriptSegment {
  text: string
  start: number | null
  end: number | null
  startMs: number | null
  endMs: number | null
}

export interface YouTubePageData {
  clientName?: string
  clientVersion?: string
  transcriptParams?: string
}

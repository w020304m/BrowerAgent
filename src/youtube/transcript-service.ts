/**
 * YouTube transcript service.
 * Pure functions for extracting YouTube video transcripts.
 */

import type { TranscriptSegment, YouTubePageData } from './types'

/**
 * Extract YouTube internal API parameters from page HTML.
 * Finds INNERTUBE_CONTEXT data embedded in the page.
 */
export function extractYouTubeData(html: string): YouTubePageData {
  const result: YouTubePageData = {}

  // Extract client name
  const clientNameMatch = html.match(/"clientName":"([^"]+)"/)
  if (clientNameMatch) {
    result.clientName = clientNameMatch[1]
  }

  // Extract client version
  const clientVersionMatch = html.match(/"clientVersion":"([^"]+)"/)
  if (clientVersionMatch) {
    result.clientVersion = clientVersionMatch[1]
  }

  // Extract transcript params from engagement panels
  const transcriptMatch = html.match(/"transcriptSearchPanelRenderer".*?"params":"([^"]+)"/s)
  if (transcriptMatch) {
    result.transcriptParams = transcriptMatch[1]
  }

  return result
}

/**
 * Fetch transcript from YouTube internal API.
 */
export async function fetchTranscript(
  data: YouTubePageData,
  videoId: string,
): Promise<TranscriptSegment[]> {
  if (!data.transcriptParams) {
    throw new Error('No transcript parameters found in page data')
  }

  const body = {
    context: {
      client: {
        clientName: data.clientName ?? 'WEB',
        clientVersion: data.clientVersion ?? '2.20240101.00.00',
      },
    },
    params: data.transcriptParams,
  }

  const response = await fetch(
    `https://www.youtube.com/youtubei/v1/get_transcript?videoId=${videoId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  if (!response.ok) {
    throw new Error(`YouTube transcript API error: ${response.status}`)
  }

  const responseData = await response.json()
  return parseTranscriptResponse(responseData)
}

/**
 * Parse the YouTube transcript API response into segments.
 * Navigates the nested JSON structure to find cue groups.
 */
export function parseTranscriptResponse(data: unknown): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []

  if (!data || typeof data !== 'object') return segments

  const root = data as Record<string, unknown>

  // Navigate: actions[0].updateEngagementPanelAction.content.transcriptRenderer.body.transcriptBodyRenderer.cueGroups
  const actions = root.actions as Array<Record<string, unknown>> | undefined
  if (!actions?.length) return segments

  const updateAction = actions[0]?.updateEngagementPanelAction as Record<string, unknown> | undefined
  const content = updateAction?.content as Record<string, unknown> | undefined
  const transcriptRenderer = content?.transcriptRenderer as Record<string, unknown> | undefined
  const body = transcriptRenderer?.body as Record<string, unknown> | undefined
  const transcriptBody = body?.transcriptBodyRenderer as Record<string, unknown> | undefined
  const cueGroups = transcriptBody?.cueGroups as Array<Record<string, unknown>> | undefined

  if (!cueGroups) return segments

  for (const group of cueGroups) {
    const cueGroupRenderer = group.transcriptCueGroupRenderer as Record<string, unknown> | undefined
    const cues = (cueGroupRenderer?.cues ??
      group.cues) as Array<Record<string, unknown>> | undefined

    if (!cues) continue

    for (const cue of cues) {
      const cueRenderer = (cue.transcriptCueRenderer ?? cue) as Record<string, unknown>
      const textObj = cueRenderer.cue as Record<string, unknown> | undefined
      const text = textObj?.simpleText as string | undefined ?? ''

      const startOffset = cueRenderer.startOffsetMs as number | undefined ?? null
      const duration = cueRenderer.durationMs as number | undefined ?? null

      segments.push({
        text,
        start: startOffset !== null ? startOffset / 1000 : null,
        end: startOffset !== null && duration !== null ? (startOffset + duration) / 1000 : null,
        startMs: startOffset ?? null,
        endMs: startOffset !== null && duration !== null ? startOffset + duration : null,
      })
    }
  }

  return segments
}

/**
 * Format transcript segments into readable text.
 * [MM:SS] text
 */
export function formatTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map(seg => {
      if (seg.start !== null) {
        return `[${formatTimestamp(seg.start * 1000)}] ${seg.text}`
      }
      return seg.text
    })
    .join('\n')
}

/**
 * Format milliseconds to MM:SS timestamp.
 */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Tab Context Retrieval Step.
 * Fetches the current tab's page content and injects it into the chat context.
 * Only active when context.mode === 'tab'.
 */

import type { ChatContext, IPipelineStep, SourceReference } from '../types'

/** Content extracted from a browser tab */
export interface TabContent {
  title: string
  url: string
  content: string
}

/** Function that retrieves the active tab's content */
export type TabContentProvider = () => Promise<TabContent>

export class TabContextRetrievalStep implements IPipelineStep {
  readonly name = 'TabContextRetrieval'

  constructor(private readonly tabContentProvider: TabContentProvider) {}

  async execute(context: ChatContext): Promise<void> {
    // Only run for tab mode — no-op otherwise
    if (context.mode !== 'tab') {
      return
    }

    const tabContent = await this.tabContentProvider()

    const sources: SourceReference[] = [
      {
        title: tabContent.title,
        url: tabContent.url,
        excerpt: tabContent.content.slice(0, 500),
      },
    ]

    context.retrievedContext = {
      text: tabContent.content,
      sources,
    }
  }
}

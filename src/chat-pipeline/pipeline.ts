/**
 * Chat Pipeline orchestrator.
 * Executes a sequence of pipeline steps, passing context through each.
 */

import type { ChatContext, IPipelineStep, PipelineCallbacks } from './types'

export class ChatPipeline {
  private steps: IPipelineStep[] = []

  constructor(private callbacks?: PipelineCallbacks) {}

  /** Add a step to the pipeline */
  addStep(step: IPipelineStep): this {
    this.steps.push(step)
    return this
  }

  /** Execute all steps in sequence */
  async execute(context: ChatContext): Promise<ChatContext> {
    for (const step of this.steps) {
      if (context.signal?.aborted) {
        throw new DOMException('Pipeline aborted', 'AbortError')
      }

      try {
        await step.execute(context)
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.callbacks?.onError?.(err)
        throw err
      }
    }

    this.callbacks?.onComplete?.(context)
    return context
  }
}

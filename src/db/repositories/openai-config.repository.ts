/**
 * OpenAI config repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { OpenAIModelConfig } from '../types'

export class OpenAIConfigRepository extends BaseRepository<OpenAIModelConfig> {
  protected table = db.openaiConfigs
}

export const openaiConfigRepo = new OpenAIConfigRepository()

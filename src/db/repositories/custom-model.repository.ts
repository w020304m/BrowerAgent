/**
 * Custom model repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { CustomModel } from '../types'

export class CustomModelRepository extends BaseRepository<CustomModel> {
  protected table = db.customModels
}

export const customModelRepo = new CustomModelRepository()

/**
 * Model state repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { ModelState } from '../types'

export class ModelStateRepository extends BaseRepository<ModelState> {
  protected table = db.modelState
}

export const modelStateRepo = new ModelStateRepository()

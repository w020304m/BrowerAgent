/**
 * Vector data repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { VectorData } from '../types'

export class VectorRepository extends BaseRepository<VectorData> {
  protected table = db.vectors
}

export const vectorRepo = new VectorRepository()

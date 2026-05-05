/**
 * Provider state repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { ProviderState } from '../types'

export class ProviderStateRepository extends BaseRepository<ProviderState> {
  protected table = db.providerState
}

export const providerStateRepo = new ProviderStateRepository()

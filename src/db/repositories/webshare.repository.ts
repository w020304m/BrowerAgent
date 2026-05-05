/**
 * Webshare repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { Webshare } from '../types'

export class WebshareRepository extends BaseRepository<Webshare> {
  protected table = db.webshares
}

export const webshareRepo = new WebshareRepository()

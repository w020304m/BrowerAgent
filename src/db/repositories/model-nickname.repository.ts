/**
 * Model nickname repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { ModelNickname } from '../types'

export class ModelNicknameRepository extends BaseRepository<ModelNickname> {
  protected table = db.modelNickname
}

export const modelNicknameRepo = new ModelNicknameRepository()

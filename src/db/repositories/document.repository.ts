/**
 * Document repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { DocumentRow } from '../types'

export class DocumentRepository extends BaseRepository<DocumentRow> {
  protected table = db.documents
}

export const documentRepo = new DocumentRepository()

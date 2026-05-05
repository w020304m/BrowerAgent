/**
 * Project folder repository.
 */

import { db } from '../schema'
import { BaseRepository } from './base.repository'
import type { ProjectFolder } from '../types'

export class ProjectFolderRepository extends BaseRepository<ProjectFolder> {
  protected table = db.projectFolders
}

export const projectFolderRepo = new ProjectFolderRepository()

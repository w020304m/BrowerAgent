/**
 * Import service.
 * Validates, previews, and imports exported data.
 */

import { localStorageService, syncStorageService } from '@/storage/index'
import { chatHistoryRepo } from '@/db/repositories/chat-history.repository'
import { messageRepo } from '@/db/repositories/message.repository'
import { promptRepo } from '@/db/repositories/prompt.repository'
import { knowledgeRepo } from '@/db/repositories/knowledge.repository'
import { documentRepo } from '@/db/repositories/document.repository'
import { vectorRepo } from '@/db/repositories/vector.repository'
import { openaiConfigRepo } from '@/db/repositories/openai-config.repository'
import { customModelRepo } from '@/db/repositories/custom-model.repository'
import { modelNicknameRepo } from '@/db/repositories/model-nickname.repository'
import { modelStateRepo } from '@/db/repositories/model-state.repository'
import { providerStateRepo } from '@/db/repositories/provider-state.repository'
import { memoryRepo } from '@/db/repositories/memory.repository'
import { projectFolderRepo } from '@/db/repositories/project-folder.repository'
import { mcpServerRepo } from '@/db/repositories/mcp-server.repository'
import { sessionFileRepo } from '@/db/repositories/session-file.repository'
import { webshareRepo } from '@/db/repositories/webshare.repository'
import type { ExportData, ExportSection, ImportPreview } from './export-types'
import { CURRENT_EXPORT_VERSION, DB_SECTIONS, ALL_SECTIONS } from './export-types'

type BulkRepo = { bulkAdd: (items: unknown[]) => Promise<void>; clear: () => Promise<void> }
const TABLE_REPOS: Record<string, BulkRepo> = {
  chatHistories: chatHistoryRepo as unknown as BulkRepo,
  messages: messageRepo as unknown as BulkRepo,
  prompts: promptRepo as unknown as BulkRepo,
  knowledge: knowledgeRepo as unknown as BulkRepo,
  documents: documentRepo as unknown as BulkRepo,
  vectors: vectorRepo as unknown as BulkRepo,
  openaiConfigs: openaiConfigRepo as unknown as BulkRepo,
  customModels: customModelRepo as unknown as BulkRepo,
  modelNickname: modelNicknameRepo as unknown as BulkRepo,
  modelState: modelStateRepo as unknown as BulkRepo,
  providerState: providerStateRepo as unknown as BulkRepo,
  memories: memoryRepo as unknown as BulkRepo,
  projectFolders: projectFolderRepo as unknown as BulkRepo,
  mcpServers: mcpServerRepo as unknown as BulkRepo,
  sessionFiles: sessionFileRepo as unknown as BulkRepo,
  webshares: webshareRepo as unknown as BulkRepo,
}

const BATCH_SIZE = 1000

export class ImportService {
  /**
   * Parse a file into an ExportData object.
   */
  async parseFile(file: File): Promise<ExportData> {
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
    const data = JSON.parse(text)
    return data as ExportData
  }

  /**
   * Validate export data structure.
   */
  validate(data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Invalid data: not an object'] }
    }

    const d = data as Record<string, unknown>

    if (typeof d.version !== 'number') {
      errors.push('Missing or invalid version')
    }

    if (typeof d.version === 'number' && d.version > CURRENT_EXPORT_VERSION) {
      errors.push(`Unsupported version: ${d.version}. Maximum supported: ${CURRENT_EXPORT_VERSION}`)
    }

    if (typeof d.exportDate !== 'string') {
      errors.push('Missing or invalid exportDate')
    }

    if (!d.tables || typeof d.tables !== 'object') {
      errors.push('Missing or invalid tables')
    }

    if (!d.sections || !Array.isArray(d.sections)) {
      errors.push('Missing or invalid sections')
    } else {
      for (const section of d.sections as string[]) {
        if (!ALL_SECTIONS.includes(section as ExportSection)) {
          errors.push(`Unknown section: ${section}`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Get a preview of the data to be imported.
   */
  getPreview(data: ExportData): ImportPreview {
    const sections: Partial<Record<ExportSection, number>> = {}

    for (const section of data.sections) {
      if (DB_SECTIONS.includes(section)) {
        const tableData = data.tables[section]
        sections[section] = Array.isArray(tableData) ? tableData.length : 0
      } else if (section === 'storageLocal') {
        sections.storageLocal = data.storage?.local ? Object.keys(data.storage.local).length : 0
      } else if (section === 'storageSync') {
        sections.storageSync = data.storage?.sync ? Object.keys(data.storage.sync).length : 0
      }
    }

    return {
      sections,
      version: data.version,
      exportDate: data.exportDate,
      appVersion: data.appVersion,
    }
  }

  /**
   * Import data into the database and storage.
   * Clears existing data before importing.
   */
  async importData(data: ExportData, sections?: ExportSection[]): Promise<void> {
    const selected = sections ?? data.sections

    // Import DB tables
    const activeDbSections = selected.filter(s => DB_SECTIONS.includes(s))

    for (const section of activeDbSections) {
      const repo = TABLE_REPOS[section]
      if (!repo) continue

      const tableData = data.tables[section]
      if (!Array.isArray(tableData) || tableData.length === 0) continue

      await repo.clear()

      // Import in batches to avoid IDB timeout
      for (let i = 0; i < tableData.length; i += BATCH_SIZE) {
        const batch = tableData.slice(i, i + BATCH_SIZE)
        await repo.bulkAdd(batch)
      }
    }

    // Import storage
    if (selected.includes('storageLocal') && data.storage?.local) {
      await localStorageService.clear()
      await localStorageService.setMultiple(data.storage.local)
    }

    if (selected.includes('storageSync') && data.storage?.sync) {
      await syncStorageService.clear()
      await syncStorageService.setMultiple(data.storage.sync)
    }
  }
}

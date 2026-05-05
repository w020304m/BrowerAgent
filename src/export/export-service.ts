/**
 * Export service.
 * Collects data from all repositories and storage for export.
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
import type { ExportData, ExportSection } from './export-types'
import { CURRENT_EXPORT_VERSION, DB_SECTIONS } from './export-types'

const TABLE_REPOS: Record<string, { getAll: () => Promise<unknown[]> }> = {
  chatHistories: chatHistoryRepo,
  messages: messageRepo,
  prompts: promptRepo,
  knowledge: knowledgeRepo,
  documents: documentRepo,
  vectors: vectorRepo,
  openaiConfigs: openaiConfigRepo,
  customModels: customModelRepo,
  modelNickname: modelNicknameRepo,
  modelState: modelStateRepo,
  providerState: providerStateRepo,
  memories: memoryRepo,
  projectFolders: projectFolderRepo,
  mcpServers: mcpServerRepo,
  sessionFiles: sessionFileRepo,
  webshares: webshareRepo,
}

export class ExportService {
  /**
   * Export data from selected sections.
   * If sections is undefined, export all sections.
   */
  async exportData(sections?: ExportSection[]): Promise<ExportData> {
    const selected = sections ?? ([] as ExportSection[]).concat(
      DB_SECTIONS,
      ['storageLocal', 'storageSync'] as ExportSection[]
    )

    const tables: Record<string, unknown[]> = {}
    const activeDbSections = selected.filter(s => DB_SECTIONS.includes(s))

    // Collect DB data in parallel
    const dbEntries = await Promise.all(
      activeDbSections.map(async (section): Promise<[string, unknown[]]> => {
        const repo = TABLE_REPOS[section]
        if (!repo) return [section, []]
        const data = await repo.getAll()
        return [section, data]
      })
    )
    for (const [section, data] of dbEntries) {
      tables[section] = data
    }

    // Collect storage data
    const storage: ExportData['storage'] = { local: {}, sync: {} }
    if (selected.includes('storageLocal')) {
      storage.local = await localStorageService.getAll()
    }
    if (selected.includes('storageSync')) {
      storage.sync = await syncStorageService.getAll()
    }

    return {
      version: CURRENT_EXPORT_VERSION,
      exportDate: new Date().toISOString(),
      appVersion: '0.1.0',
      tables,
      storage,
      sections: selected,
    }
  }

  /**
   * Export data and trigger file download.
   */
  exportToFile(sections?: ExportSection[]): void {
    this.exportData(sections).then(data => {
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = `page-assist-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()

      URL.revokeObjectURL(url)
    })
  }
}

/**
 * Export/Import type definitions.
 */

export type ExportSection =
  | 'chatHistories'
  | 'messages'
  | 'prompts'
  | 'knowledge'
  | 'documents'
  | 'vectors'
  | 'openaiConfigs'
  | 'customModels'
  | 'modelNickname'
  | 'modelState'
  | 'providerState'
  | 'memories'
  | 'projectFolders'
  | 'mcpServers'
  | 'sessionFiles'
  | 'webshares'
  | 'storageLocal'
  | 'storageSync'

export interface ExportData {
  version: number
  exportDate: string
  appVersion: string
  tables: Record<string, unknown[]>
  storage: {
    local: Record<string, unknown>
    sync: Record<string, unknown>
  }
  sections: ExportSection[]
}

export interface ImportPreview {
  sections: Partial<Record<ExportSection, number>>
  version: number
  exportDate: string
  appVersion: string
}

export const ALL_SECTIONS: ExportSection[] = [
  'chatHistories',
  'messages',
  'prompts',
  'knowledge',
  'documents',
  'vectors',
  'openaiConfigs',
  'customModels',
  'modelNickname',
  'modelState',
  'providerState',
  'memories',
  'projectFolders',
  'mcpServers',
  'sessionFiles',
  'webshares',
  'storageLocal',
  'storageSync',
]

export const DB_SECTIONS: ExportSection[] = [
  'chatHistories',
  'messages',
  'prompts',
  'knowledge',
  'documents',
  'vectors',
  'openaiConfigs',
  'customModels',
  'modelNickname',
  'modelState',
  'providerState',
  'memories',
  'projectFolders',
  'mcpServers',
  'sessionFiles',
  'webshares',
]

export const CURRENT_EXPORT_VERSION = 1

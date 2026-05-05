/**
 * Dexie database schema definition.
 * 17 tables with typed indexes.
 */

import Dexie, { type Table } from 'dexie'
import type {
  HistoryInfo, MessageRow, Prompt, Webshare, SessionFile,
  UserSettings, Knowledge, DocumentRow, VectorData,
  OpenAIModelConfig, CustomModel, ModelNickname, ModelState,
  ProviderState, Memory, ProjectFolder, McpServerConfig
} from './types'

export class PageAssistDB extends Dexie {
  chatHistories!: Table<HistoryInfo>
  messages!: Table<MessageRow>
  prompts!: Table<Prompt>
  webshares!: Table<Webshare>
  sessionFiles!: Table<SessionFile>
  userSettings!: Table<UserSettings>
  knowledge!: Table<Knowledge>
  documents!: Table<DocumentRow>
  vectors!: Table<VectorData>
  openaiConfigs!: Table<OpenAIModelConfig>
  customModels!: Table<CustomModel>
  modelNickname!: Table<ModelNickname>
  modelState!: Table<ModelState>
  providerState!: Table<ProviderState>
  memories!: Table<Memory>
  projectFolders!: Table<ProjectFolder>
  mcpServers!: Table<McpServerConfig>

  constructor() {
    super('PageAssistDatabase')

    this.version(1).stores({
      chatHistories:
        'id, title, is_rag, message_source, is_pinned, createdAt, doc_id, model_id, folder_id',
      messages:
        'id, history_id, name, role, content, createdAt, messageType, modelName, messageKind, toolCallId, toolName, toolServerName',
      prompts:
        'id, title, content, is_system, createdBy, createdAt',
      webshares:
        'id, title, url, api_url, share_id, createdAt',
      sessionFiles:
        'sessionId, retrievalEnabled, createdAt',
      userSettings:
        'id, user_id',
      knowledge:
        'id, db_type, title, status, embedding_model, createdAt',
      documents:
        'id, db_type, title, status, embedding_model, createdAt',
      vectors:
        'id',
      openaiConfigs:
        'id, name, baseUrl, apiKey, createdAt, provider, db_type',
      customModels:
        'id, model_id, name, model_name, provider_id, model_type, db_type',
      modelNickname:
        'id, model_id, model_name',
      modelState:
        'id, model_id, is_enabled',
      providerState:
        'id, provider_id, is_enabled',
      memories:
        'id, content, createdAt, updatedAt',
      projectFolders:
        'id, title, createdAt',
      mcpServers:
        'id, name, url, enabled, transport, updatedAt, createdAt'
    })
  }
}

/** Singleton database instance */
export const db = new PageAssistDB()

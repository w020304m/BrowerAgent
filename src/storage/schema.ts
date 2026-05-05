/**
 * Storage schema: all keys with types and defaults.
 * This is the single source of truth for all storage keys.
 */

export interface StorageKeyDefinition {
  key: string
  area: 'local' | 'sync'
  type: 'string' | 'boolean' | 'number' | 'object'
  defaultValue?: unknown
}

// Helper to define keys with less repetition
function local(key: string, type: StorageKeyDefinition['type'], defaultValue?: unknown): StorageKeyDefinition {
  return { key, area: 'local', type, defaultValue }
}

function sync(key: string, type: StorageKeyDefinition['type'], defaultValue?: unknown): StorageKeyDefinition {
  return { key, area: 'sync', type, defaultValue }
}

export const StorageSchema = {
  // === Ollama ===
  ollamaURL: sync('ollamaURL', 'string', 'http://127.0.0.1:11434'),
  ollamaEnabledStatus: sync('ollamaEnabledStatus', 'boolean', true),
  checkOllamaStatus: sync('checkOllamaStatus', 'boolean', true),
  defaultModel: sync('defaultModel', 'string'),
  selectedModel: sync('selectedModel', 'string'),
  askForModelSelectionEveryTime: sync('askForModelSelectionEveryTime', 'boolean', true),
  customOllamaHeaders: local('customOllamaHeaders', 'object', []),

  // === URL Rewrite ===
  urlRewriteEnabled: local('urlRewriteEnabled', 'boolean', false),
  rewriteUrl: local('rewriteUrl', 'string', 'http://127.0.0.1:11434'),
  autoCORSFix: local('autoCORSFix', 'boolean', true),

  // === Chat Behavior ===
  restoreLastChatModel: sync('restoreLastChatModel', 'boolean', false),
  copilotResumeLastChat: sync('copilotResumeLastChat', 'boolean', false),
  webUIResumeLastChat: sync('webUIResumeLastChat', 'boolean', false),
  sendWhenEnter: sync('sendWhenEnter', 'boolean', true),
  sidebarOpen: local('sidebarOpen', 'string', 'right_clk'),
  openOnIconClick: local('openOnIconClick', 'string', 'webUI'),
  openOnRightClick: local('openOnRightClick', 'string', 'sidePanel'),

  // === System Prompts ===
  systemPromptForNonRag: sync('systemPromptForNonRag', 'string'),
  systemPromptForNonRagOption: sync('systemPromptForNonRagOption', 'string'),
  systemPromptForRag: sync('systemPromptForRag', 'string'),
  questionPromptForRag: sync('questionPromptForRag', 'string'),
  defaultEmbeddingModel: sync('defaultEmbeddingModel', 'string'),
  defaultEmbeddingChunkSize: sync('defaultEmbeddingChunkSize', 'number', 4000),
  defaultEmbeddingChunkOverlap: sync('defaultEmbeddingChunkOverlap', 'number', 200),
  defaultSplittingStrategy: sync('defaultSplittingStrategy', 'string', 'RecursiveCharacterTextSplitter'),
  defaultSplittingSeparator: sync('defaultSplittingSeparator', 'string', '\\n\\n'),

  // === RAG / KB ===
  chatWithWebsiteEmbedding: sync('chatWithWebsiteEmbedding', 'boolean', false),
  maxWebsiteContext: sync('maxWebsiteContext', 'number', 7028),
  totalFilePerKB: local('totalFilePerKB', 'number', 5),
  noOfRetrievedDocs: local('noOfRetrievedDocs', 'number', 4),

  // === Copy / Display ===
  removeReasoningTagFromCopy: local('removeReasoningTagFromCopy', 'boolean', true),

  // === Search ===
  isSimpleInternetSearch: sync('isSimpleInternetSearch', 'boolean', true),
  isVisitSpecificWebsite: sync('isVisitSpecificWebsite', 'boolean', true),
  searchProvider: sync('searchProvider', 'string', 'duckduckgo'),
  totalSearchResults: sync('totalSearchResults', 'number', 2),
  searxngURL: sync('searxngURL', 'string'),
  searxngJSONMode: sync('searxngJSONMode', 'boolean', false),
  defaultInternetSearchOn: sync('defaultInternetSearchOn', 'boolean', false),
  searchGoogleDomain: local('searchGoogleDomain', 'string', 'google.com'),
  domainFilterList: sync('domainFilterList', 'object', '[]'),
  blockedDomainList: sync('blockedDomainList', 'object', '[]'),

  // === Search API Keys ===
  braveApiKey: local('braveApiKey', 'string'),
  ollamaSearchApiKey: local('ollamaSearchApiKey', 'string'),
  kagiApiKey: local('kagiApiKey', 'string'),
  perplexityApiKey: local('perplexityApiKey', 'string'),
  tavilyApiKey: local('tavilyApiKey', 'string'),
  firecrawlAPIKey: local('firecrawlAPIKey', 'string'),
  exaAPIKey: local('exaAPIKey', 'string'),

  // === TTS ===
  ttsProvider: sync('ttsProvider', 'string', 'browser'),
  voice: sync('voice', 'string'),
  isTTSEnabled: sync('isTTSEnabled', 'boolean', true),
  isSSMLEnabled: sync('isSSMLEnabled', 'boolean', false),
  ttsResponseSplitting: sync('ttsResponseSplitting', 'string', 'punctuation'),
  removeReasoningTagTTS: local('removeReasoningTagTTS', 'boolean', true),
  isTTSAutoPlayEnabled: sync('isTTSAutoPlayEnabled', 'boolean', false),
  speechPlaybackSpeed: sync('speechPlaybackSpeed', 'number', 1),

  // === TTS: ElevenLabs ===
  elevenLabsApiKey: sync('elevenLabsApiKey', 'string'),
  elevenLabsVoiceId: sync('elevenLabsVoiceId', 'string'),
  elevenLabsModel: sync('elevenLabsModel', 'string'),

  // === TTS: OpenAI ===
  openAITTSBaseUrl: sync('openAITTSBaseUrl', 'string', 'https://api.openai.com/v1'),
  openAITTSApiKey: sync('openAITTSApiKey', 'string'),
  openAITTSModel: sync('openAITTSModel', 'string', 'tts-1'),
  openAITTSVoice: sync('openAITTSVoice', 'string', 'alloy'),

  // === Chrome AI ===
  chromeAIStatus: sync('chromeAIStatus', 'boolean', false),

  // === Title Generation ===
  titleGenEnabled: sync('titleGenEnabled', 'boolean', false),
  titleGenerationPrompt: sync('titleGenerationPrompt', 'string'),
  titleGenerationModel: sync('titleGenerationModel', 'string'),

  // === Copilot Prompts ===
  copilotSummaryPrompt: sync('copilotSummaryPrompt', 'string'),
  copilotRephrasePrompt: sync('copilotRephrasePrompt', 'string'),
  copilotTranslatePrompt: sync('copilotTranslatePrompt', 'string'),
  copilotExplainPrompt: sync('copilotExplainPrompt', 'string'),
  copilotCustomPrompt: sync('copilotCustomPrompt', 'string', '{text}'),
  copilotPromptsEnabled: sync('copilotPromptsEnabled', 'object'),

  // === Web Search Prompts ===
  webSearchPrompt: sync('webSearchPrompt', 'string'),
  webSearchFollowUpPrompt: sync('webSearchFollowUpPrompt', 'string'),

  // === Page Share ===
  pageShareUrl: sync('pageShareUrl', 'string', 'https://pageassist.xyz'),

  // === OCR ===
  defaultOCRLanguage: sync('defaultOCRLanguage', 'string'),

  // === Advanced Settings ===
  storageSyncEnabled: local('storageSyncEnabled', 'boolean', false),

  // === MCP ===
  mcpHumanInLoop: local('mcpHumanInLoop', 'boolean', false),

  // === Sidepanel / WebUI State ===
  sidepanelTemporaryChat: local('sidepanelTemporaryChat', 'boolean', false),
  webuiTemporaryChat: local('webuiTemporaryChat', 'boolean', false),

  // === Dynamic key patterns ===
  // modelSettings:{model_id} -> ModelSettings (per-model)
  // lastUsedChatModel-{historyId} -> string
  // lastUsedChatSystemPrompt-{historyId} -> { prompt_id?, prompt_content? }
} as const

/** Get all keys grouped by area */
export function getKeysByArea(area: 'local' | 'sync'): string[] {
  return Object.values(StorageSchema)
    .filter(def => def.area === area)
    .map(def => def.key)
}

/** Get all default values as an object */
export function getAllDefaults(): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  for (const def of Object.values(StorageSchema)) {
    if (def.defaultValue !== undefined) {
      defaults[def.key] = def.defaultValue
    }
  }
  return defaults
}

/**
 * ModelSelector - Provider and model selection dropdown
 *
 * Features:
 * - Provider selection (Ollama, OpenAI, Anthropic, Google, OpenRouter, Chrome AI)
 * - Multi-instance support for OpenAI-compatible providers
 * - Base URL configuration
 * - Model list fetching with search
 * - Context window configuration with auto-detection
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useChatStore } from '@/store/chat-store'
import type { ProviderType } from '@/types/provider'
import type { ModelInfo } from '@/types/provider'
import { ollamaSettings } from '@/storage/ollama-settings'
import { openaiConfigRepo } from '@/db/repositories/openai-config.repository'
import { getProviderModels } from '@/providers/provider-registry'
import type { ProviderInstance } from '@/providers/provider-registry'
import { agentSettings } from '@/storage/agent-settings'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { PROVIDERS } from './constants'
import { formatSize, formatContextLength, parseContextLength } from './utils'
import { detectContextLength } from './context-length'

export function ModelSelector() {
  const { t } = useTranslation('sidepanel')
  const [isOpen, setIsOpen] = useState(false)
  const providerType = useChatStore(s => s.providerType)
  const modelId = useChatStore(s => s.modelId)
  const providerConfigId = useChatStore(s => s.providerConfigId)
  const setModel = useChatStore(s => s.setModel)

  // baseUrl state
  const [baseUrl, setBaseUrl] = useState('')
  const [editingBaseUrl, setEditingBaseUrl] = useState(false)
  const [editUrlValue, setEditUrlValue] = useState('')
  const [baseUrlSaved, setBaseUrlSaved] = useState(false)

  // API key state (for non-Ollama providers)
  const [apiKey, setApiKey] = useState<string | undefined>(undefined)

  // Multi-provider instances
  const [providerInstances, setProviderInstances] = useState<{ id: string; name: string }[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(providerConfigId)

  // Model list state
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Context window state
  const [contextWindowTokens, setContextWindowTokens] = useState(0) // user-saved override (>0 = custom)
  const [contextWindowDisplay, setContextWindowDisplay] = useState('')
  const [contextWindowEditing, setContextWindowEditing] = useState(false)
  const [contextWindowAuto, setContextWindowAuto] = useState(0) // auto-detected value
  const [contextWindowDetectedFor, setContextWindowDetectedFor] = useState('') // track which model was detected

  // Load baseUrl and apiKey when provider changes
  const loadProviderConfig = useCallback(async (pt: ProviderType, configId?: string | null) => {
    if (pt === 'ollama') {
      const url = await ollamaSettings.getOllamaURL()
      setBaseUrl(url)
      setEditUrlValue(url)
      setApiKey(undefined)
      setProviderInstances([])
    } else if (pt === 'chrome-ai') {
      setBaseUrl('')
      setEditUrlValue('')
      setApiKey(undefined)
      setProviderInstances([])
    } else {
      const configs = await openaiConfigRepo.getAll()
      const matchingConfigs = configs.filter(c => c.provider === pt)
      setProviderInstances(matchingConfigs.map(c => ({ id: c.id, name: c.name })))

      // If configId provided, find that specific config
      const config = configId
        ? matchingConfigs.find(c => c.id === configId)
        : matchingConfigs[0]

      const url = config?.baseUrl || ''
      setBaseUrl(url)
      setEditUrlValue(url)
      setApiKey(config?.apiKey || undefined)
      setSelectedInstanceId(config?.id ?? null)
    }
    setEditingBaseUrl(false)
    setBaseUrlSaved(false)
  }, [])

  // Load saved context window tokens
  const loadContextWindow = useCallback(async () => {
    const settings = await agentSettings.getSettings()
    const saved = settings.contextWindowTokens
    setContextWindowTokens(saved)
    if (saved > 0) {
      setContextWindowDisplay(formatContextLength(saved))
    } else {
      setContextWindowDisplay('')
    }
  }, [])

  // Fetch models for current provider
  const fetchModels = useCallback(async (pt: ProviderType, url: string, key?: string) => {
    if (pt === 'chrome-ai') {
      setModels([
        { id: 'gemini-nano', name: 'Gemini Nano (Chrome AI)', provider: 'chrome-ai' as ProviderType },
      ])
      return
    }

    if (pt !== 'ollama' && !url && !key) {
      setModels([])
      return
    }

    if (pt !== 'ollama' && !key) {
      setModels([])
      return
    }

    setModelsLoading(true)
    setModelsError(null)

    try {
      const instance: ProviderInstance = {
        providerType: pt,
        baseUrl: url,
        apiKey: key,
        enabled: true,
      }
      const result = await getProviderModels(instance)
      setModels(result)
    } catch {
      setModelsError(t('fetchModelsError'))
      setModels([])
    } finally {
      setModelsLoading(false)
    }
  }, [t])

  // When dropdown opens or provider changes, load config + models
  useEffect(() => {
    if (!isOpen) return

    setModels([])
    setModelsError(null)
    setSearchQuery('')

    let cancelled = false
    const load = async () => {
      await loadProviderConfig(providerType, providerConfigId)
      if (cancelled) return
      let url = ''
      let key: string | undefined
      if (providerType === 'ollama') {
        url = await ollamaSettings.getOllamaURL()
      } else if (providerType !== 'chrome-ai') {
        const configs = await openaiConfigRepo.getAll()
        const config = providerConfigId
          ? configs.find(c => c.id === providerConfigId)
          : configs.find(c => c.provider === providerType)
        url = config?.baseUrl || ''
        key = config?.apiKey || undefined
      }
      if (cancelled) return
      fetchModels(providerType, url, key)
      loadContextWindow()
    }
    load()
    return () => { cancelled = true }
  }, [isOpen, providerType, providerConfigId, loadProviderConfig, fetchModels, loadContextWindow])

  // Auto-detect context length when model changes
  useEffect(() => {
    if (!modelId || !isOpen) return

    // Skip if we already detected for this exact model (avoid re-fetching on re-renders)
    if (contextWindowDetectedFor === `${providerType}:${modelId}`) return

    let cancelled = false
    const detect = async () => {
      const detected = await detectContextLength(providerType, baseUrl, apiKey, modelId)

      if (cancelled) return

      setContextWindowAuto(detected)
      if (contextWindowTokens === 0) {
        setContextWindowDisplay(formatContextLength(detected))
      }
      setContextWindowDetectedFor(`${providerType}:${modelId}`)
    }
    detect()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, providerType, baseUrl, apiKey, isOpen])

  // Handle provider switch
  const handleProviderChange = (pt: ProviderType) => {
    setModel(pt, '', undefined)
    setSearchQuery('')
    setModels([])
    setModelsError(null)
    setSelectedInstanceId(null)
    setContextWindowTokens(0)
    setContextWindowDisplay('')
    setContextWindowAuto(0)
    setContextWindowDetectedFor('')
    setContextWindowEditing(false)
  }

  // Handle instance switch
  const handleInstanceChange = async (instanceId: string) => {
    const configs = await openaiConfigRepo.getAll()
    const config = configs.find(c => c.id === instanceId)
    if (!config) return
    setSelectedInstanceId(instanceId)
    setBaseUrl(config.baseUrl || '')
    setEditUrlValue(config.baseUrl || '')
    setApiKey(config.apiKey || undefined)
    setModel(providerType, modelId, instanceId)
    fetchModels(providerType, config.baseUrl || '', config.apiKey || undefined)
  }

  // Handle base URL save
  const handleSaveBaseUrl = async () => {
    const newUrl = editUrlValue.replace(/\/$/, '')
    if (providerType === 'ollama') {
      await ollamaSettings.setOllamaURL(newUrl)
      setBaseUrl(newUrl)
      setEditUrlValue(newUrl)
    } else {
      const configs = await openaiConfigRepo.getAll()
      // Find config by selected instance or by provider type
      const config = selectedInstanceId
        ? configs.find(c => c.id === selectedInstanceId)
        : configs.find(c => c.provider === providerType)
      if (config) {
        await openaiConfigRepo.update(config.id, { baseUrl: newUrl })
      } else {
        const newConfigId = await openaiConfigRepo.add({
          id: crypto.randomUUID(),
          name: `${PROVIDERS.find(p => p.value === providerType)?.label ?? providerType}`,
          baseUrl: newUrl,
          apiKey: '',
          createdAt: Date.now(),
          provider: providerType,
          db_type: 'openai-config',
        })
        setSelectedInstanceId(newConfigId)
      }
      setBaseUrl(newUrl)
      setEditUrlValue(newUrl)
    }
    setEditingBaseUrl(false)
    setBaseUrlSaved(true)
    fetchModels(providerType, newUrl, apiKey)
    setTimeout(() => setBaseUrlSaved(false), 1500)
  }

  // Handle context window save
  const handleSaveContextWindow = async () => {
    const tokens = parseContextLength(contextWindowDisplay)

    if (tokens > 0) {
      setContextWindowTokens(tokens)
      setContextWindowDisplay(formatContextLength(tokens))
      await agentSettings.setContextWindowTokens(tokens)
    } else {
      // Reset to auto-detected value
      setContextWindowTokens(0)
      const fallback = contextWindowAuto > 0 ? contextWindowAuto : 128000
      setContextWindowDisplay(formatContextLength(fallback))
      await agentSettings.setContextWindowTokens(0)
    }
    setContextWindowEditing(false)
  }

  // Filter models by search query
  const filteredModels = searchQuery
    ? models.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.id.toLowerCase().includes(searchQuery.toLowerCase()))
    : models

  const currentProvider = PROVIDERS.find(p => p.value === providerType)
  const needsApiKey = providerType !== 'ollama' && providerType !== 'chrome-ai'
  const needsBaseUrl = providerType !== 'chrome-ai'

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors truncate max-w-[160px] min-w-0"
          title={`${currentProvider?.label ?? ''} ${modelId}`}
        >
          <span className="truncate">
            {modelId ? modelId : t('selectModel')}
          </span>
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-72 max-h-[28rem] overflow-y-auto p-0 z-30"
      >
        {/* Provider selection */}
        <div className="p-2 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('provider')}</p>
          <div className="flex flex-wrap gap-1">
            {PROVIDERS.map(p => (
              <button
                key={p.value}
                onClick={() => handleProviderChange(p.value)}
                className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                  providerType === p.value
                    ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Instance selector (when configs exist for this provider type) */}
        {providerInstances.length >= 1 && (
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('instance', 'Instance')}</p>
            {providerInstances.length === 1 ? (
              <span className="text-xs text-gray-600 dark:text-gray-300">{providerInstances[0].name}</span>
            ) : (
            <select
              value={selectedInstanceId ?? ''}
              onChange={e => handleInstanceChange(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {providerInstances.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
            )}
          </div>
        )}

        {/* Base URL section (not for chrome-ai) */}
        {needsBaseUrl && (
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('baseUrl')}</p>
            {baseUrl ? (
              <div className="flex items-center gap-1">
                {editingBaseUrl ? (
                  <>
                    <input
                      type="text"
                      value={editUrlValue}
                      onChange={e => setEditUrlValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveBaseUrl()
                        if (e.key === 'Escape') setEditingBaseUrl(false)
                      }}
                      className="flex-1 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveBaseUrl}
                      className="px-1.5 py-0.5 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
                    >
                      {t('saveBaseUrl')}
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className="text-xs text-gray-600 dark:text-gray-300 truncate cursor-pointer hover:text-blue-500"
                      onClick={() => {
                        setEditingBaseUrl(true)
                        setBaseUrlSaved(false)
                      }}
                      title={baseUrl}
                    >
                      {baseUrl}
                    </span>
                    {baseUrlSaved && (
                      <span className="text-xs text-green-500">{t('baseUrlSaved')}</span>
                    )}
                    <svg
                      className="w-3 h-3 text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      onClick={() => {
                        setEditingBaseUrl(true)
                        setBaseUrlSaved(false)
                      }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={() => chrome.runtime.openOptionsPage()}
                className="text-xs text-orange-500 hover:text-orange-600 underline"
              >
                {t('configureInSettings')}
              </button>
            )}
          </div>
        )}

        {/* API Key warning for non-Ollama providers */}
        {needsApiKey && !apiKey && (
          <div className="px-2 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              {t('apiKeyNotSet')} — <button className="underline" onClick={() => chrome.runtime.openOptionsPage()}>{t('configureInSettings')}</button>
            </p>
          </div>
        )}

        {/* Model list */}
        <div className="p-2">
          {/* Search / input */}
          <input
            type="text"
            placeholder={t('modelIdPlaceholder')}
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={searchQuery || modelId}
            onChange={e => {
              setSearchQuery(e.target.value)
              setModel(providerType, e.target.value, selectedInstanceId ?? undefined)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setIsOpen(false)
              }
            }}
          />
        </div>

        {/* Model list from API */}
        {modelsLoading && (
          <div className="px-2 pb-2">
            <p className="text-xs text-gray-400">{t('loadingModels')}</p>
          </div>
        )}

        {modelsError && (
          <div className="px-2 pb-2">
            <p className="text-xs text-red-500">{modelsError}</p>
          </div>
        )}

        {!modelsLoading && !modelsError && filteredModels.length > 0 && (
          <div className="px-1 pb-1 max-h-40 overflow-y-auto">
            {filteredModels.map(m => (
              <button
                key={m.id}
                onClick={() => {
                  setModel(providerType, m.id, selectedInstanceId ?? undefined)
                  setSearchQuery('')
                  setIsOpen(false)
                }}
                className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between gap-1 ${
                  modelId === m.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
                }`}
              >
                <span className="truncate">{m.name}</span>
                {m.size ? <span className="text-gray-400 flex-shrink-0">{formatSize(m.size)}</span> : null}
              </button>
            ))}
          </div>
        )}

        {!modelsLoading && !modelsError && filteredModels.length === 0 && models.length === 0 && searchQuery && (
          <div className="px-2 pb-2">
            <p className="text-xs text-gray-400">{t('orTypeModelName')}</p>
          </div>
        )}

        {/* Context Window section */}
        {modelId && (
          <div className="p-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t('contextWindow')}
            </p>
            <div className="flex items-center gap-1">
              {contextWindowEditing ? (
                <>
                  <input
                    type="text"
                    value={contextWindowDisplay}
                    onChange={e => setContextWindowDisplay(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveContextWindow()
                      if (e.key === 'Escape') setContextWindowEditing(false)
                    }}
                    placeholder="128K"
                    className="flex-1 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveContextWindow}
                    className="px-1.5 py-0.5 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
                  >
                    {t('saveBaseUrl')}
                  </button>
                </>
              ) : (
                <>
                  <span
                    className="text-xs text-gray-600 dark:text-gray-300 cursor-pointer hover:text-blue-500"
                    onClick={() => setContextWindowEditing(true)}
                    title={`${contextWindowTokens > 0 ? contextWindowTokens : contextWindowAuto || 128000} tokens`}
                  >
                    {contextWindowDisplay || '128K'}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    ({contextWindowTokens > 0 ? t('contextWindowCustom') : t('contextWindowAuto')})
                  </span>
                  <svg
                    className="w-3 h-3 text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0 ml-auto"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    onClick={() => setContextWindowEditing(true)}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

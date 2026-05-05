import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { openaiConfigRepo } from '@/db/repositories/openai-config.repository'
import type { OpenAIModelConfig } from '@/db/types'
import type { ProviderType } from '@/types/provider'
import { generateId } from '@/types/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

export function ModelSection() {
  const { t } = useTranslation('settings')
  const [providers, setProviders] = useState<OpenAIModelConfig[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<OpenAIModelConfig | null>(null)

  const load = useCallback(async () => {
    const all = await openaiConfigRepo.getAll()
    setProviders(all)
  }, [])

  useEffect(() => { load() }, [load])

  const handleEdit = (config: OpenAIModelConfig) => {
    setEditingConfig(config)
    setShowForm(true)
  }

  const handleAdd = () => {
    setEditingConfig(null)
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingConfig(null)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('tabModels')}</h2>
        <Button
          onClick={handleAdd}
          size="sm"
        >
          {t('addProvider')}
        </Button>
      </div>

      {showForm && (
        <ProviderForm
          initialData={editingConfig}
          onSave={handleFormClose}
          onCancel={handleFormClose}
        />
      )}

      {providers.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">{t('noProviders')}</p>
      )}

      <div className="space-y-2">
        {providers.map(p => (
          <div key={p.id} className="flex items-center justify-between p-3 rounded border border-border">
            <div className="min-w-0">
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground truncate">{p.baseUrl}</p>
              <p className="text-xs text-muted-foreground">Provider: {p.provider}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              <Badge variant="secondary" className="text-xs">
                {p.provider}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEdit(p)}
                className="text-muted-foreground hover:text-foreground"
                title={t('editProvider')}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => { await openaiConfigRepo.delete(p.id); load() }}
                className="text-destructive hover:text-destructive"
                title={t('deleteProvider')}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProviderForm({
  initialData,
  onSave,
  onCancel,
}: {
  initialData: OpenAIModelConfig | null
  onSave: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation('settings')
  const [name, setName] = useState(initialData?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(initialData?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState(initialData?.apiKey ?? '')
  const [provider, setProvider] = useState<ProviderType>(initialData?.provider ?? 'openai')

  const isEditing = !!initialData

  const handleSave = async () => {
    if (!name || !baseUrl) return

    if (isEditing && initialData) {
      await openaiConfigRepo.update(initialData.id, {
        name,
        baseUrl,
        apiKey,
        provider,
      })
    } else {
      const config: OpenAIModelConfig = {
        id: generateId(),
        name,
        baseUrl,
        apiKey,
        createdAt: Date.now(),
        provider,
        db_type: 'openai_config',
      }
      await openaiConfigRepo.create(config)
    }
    onSave()
  }

  return (
    <div className="p-4 rounded border border-border space-y-3">
      <h3 className="text-sm font-medium">
        {isEditing ? t('editProvider') : t('addProvider')}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="block text-xs text-muted-foreground mb-1">{t('providerName')}</Label>
          <Input
            type="text" value={name} onChange={e => setName(e.target.value)}
          />
        </div>
        <div>
          <Label className="block text-xs text-muted-foreground mb-1">Provider</Label>
          <select
            value={provider} onChange={e => setProvider(e.target.value as ProviderType)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>
      </div>
      <div>
        <Label className="block text-xs text-muted-foreground mb-1">{t('providerBaseUrl')}</Label>
        <Input
          type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </div>
      <div>
        <Label className="block text-xs text-muted-foreground mb-1">{t('providerApiKey')}</Label>
        <Input
          type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="outline" size="sm">
          {t('cancel') ?? 'Cancel'}
        </Button>
        <Button onClick={handleSave} size="sm">
          {t('save') ?? 'Save'}
        </Button>
      </div>
    </div>
  )
}

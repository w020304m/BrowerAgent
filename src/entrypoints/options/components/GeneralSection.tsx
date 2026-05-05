import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ollamaSettings } from '@/storage/ollama-settings'
import { agentSettings } from '@/storage/agent-settings'
import { modelSettingsStorage } from '@/storage/model-settings'
import { syncStorageService } from '@/storage/index'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export function GeneralSection() {
  const { t } = useTranslation('settings')
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434')
  const [sendOnEnter, setSendOnEnter] = useState(true)
  const [restoreLastModel, setRestoreLastModel] = useState(false)
  const [agentContextWindow, setAgentContextWindow] = useState('')

  useEffect(() => {
    ollamaSettings.getOllamaURL().then(setOllamaUrl)
    agentSettings.getContextWindowTokens().then(v => setAgentContextWindow(v > 0 ? String(v) : ''))
    syncStorageService.get<boolean>('sendWhenEnter', true).then(setSendOnEnter)
    modelSettingsStorage.isRestoreLastModelEnabled().then(setRestoreLastModel)
  }, [])

  const handleUrlSave = async () => {
    await ollamaSettings.setOllamaURL(ollamaUrl)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">{t('tabGeneral')}</h2>
      </div>

      {/* Ollama URL */}
      <div>
        <Label className="block mb-1">{t('ollamaUrl')}</Label>
        <div className="flex gap-2">
          <Input
            type="text"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            className="flex-1"
            placeholder="http://127.0.0.1:11434"
          />
          <Button onClick={handleUrlSave} size="sm">
            {t('save') ?? 'Save'}
          </Button>
        </div>
      </div>

      {/* Send on Enter */}
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-medium">{t('sendOnEnter')}</p>
          <p className="text-xs text-muted-foreground">{t('sendOnEnterDesc')}</p>
        </div>
        <Switch checked={sendOnEnter} onCheckedChange={(v) => { setSendOnEnter(v); syncStorageService.set('sendWhenEnter', v) }} />
      </div>

      {/* Restore last model */}
      <div className="flex items-center justify-between py-2">
        <p className="text-sm font-medium">{t('restoreLastModel')}</p>
        <Switch checked={restoreLastModel} onCheckedChange={(v) => { setRestoreLastModel(v); modelSettingsStorage.setRestoreLastModelEnabled(v) }} />
      </div>

      {/* Agent Context Window */}
      <div>
        <Label className="block mb-1">{t('agentContextWindow')}</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            value={agentContextWindow}
            onChange={(e) => setAgentContextWindow(e.target.value)}
            className="flex-1"
            placeholder="128000 (default)"
            min={0}
          />
          <Button
            onClick={async () => {
              const val = parseInt(agentContextWindow, 10)
              await agentSettings.setContextWindowTokens(isNaN(val) ? 0 : val)
            }}
            size="sm"
          >
            {t('save') ?? 'Save'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t('agentContextWindowDesc')}</p>
      </div>
    </div>
  )
}

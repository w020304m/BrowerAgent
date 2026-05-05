import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getCustomPrompts,
  saveCustomPrompt,
  updateCustomPrompt,
  deleteCustomPrompt,
  getPromptsEnabledState,
  togglePromptEnabled,
  type CustomCopilotPrompt,
} from '@/services/copilot-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

const BUILTIN_PROMPTS = [
  { key: 'summary', labelKey: 'summary' },
  { key: 'rephrase', labelKey: 'rephrase' },
  { key: 'translate', labelKey: 'translate' },
  { key: 'explain', labelKey: 'explain' },
  { key: 'custom', labelKey: 'custom' },
]

export function CopilotSection() {
  const { t } = useTranslation('copilot')
  const { t: tc } = useTranslation('common')
  const [customPrompts, setCustomPrompts] = useState<CustomCopilotPrompt[]>([])
  const [enabledState, setEnabledState] = useState<Record<string, boolean>>({})
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    const [prompts, enabled] = await Promise.all([
      getCustomPrompts(),
      getPromptsEnabledState(),
    ])
    setCustomPrompts(prompts)
    setEnabledState(enabled)
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (key: string) => {
    const newVal = !enabledState[key]
    setEnabledState(prev => ({ ...prev, [key]: newVal }))
    await togglePromptEnabled(key, newVal)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('title')}</h2>

      {/* Built-in prompts */}
      <div>
        <h3 className="text-sm font-medium mb-2">Built-in Actions</h3>
        <div className="space-y-1">
          {BUILTIN_PROMPTS.map(p => (
            <div key={p.key} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent">
              <span className="text-sm">{t(p.labelKey)}</span>
              <Switch
                checked={enabledState[p.key] !== false}
                onCheckedChange={() => handleToggle(p.key)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Custom prompts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">{t('customPrompts')}</h3>
          <Button
            onClick={() => setShowForm(true)}
            size="sm"
          >
            {t('addCustomPrompt')}
          </Button>
        </div>

        {showForm && (
          <CustomPromptForm
            onSave={() => { setShowForm(false); load() }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {customPrompts.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">No custom prompts yet.</p>
        )}

        <div className="space-y-1">
          {customPrompts.map(p => (
            <div key={p.id} className="flex items-center justify-between p-2 rounded border border-border">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.title}</p>
                <p className="text-xs text-muted-foreground truncate">{p.prompt}</p>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <Switch
                  checked={p.enabled}
                  onCheckedChange={() => { updateCustomPrompt(p.id, { enabled: !p.enabled }); load() }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { deleteCustomPrompt(p.id); load() }}
                  className="text-destructive hover:text-destructive"
                >
                  {tc('delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CustomPromptForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const { t } = useTranslation('copilot')
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')

  const handleSave = async () => {
    if (!title.trim() || !prompt.trim()) return
    await saveCustomPrompt({ title: title.trim(), prompt: prompt.trim() })
    onSave()
  }

  return (
    <div className="p-3 rounded border border-border space-y-2 mb-2">
      <div>
        <Label className="block text-xs text-muted-foreground mb-1">{t('promptTitle')}</Label>
        <Input
          type="text" value={title} onChange={e => setTitle(e.target.value)}
        />
      </div>
      <div>
        <Label className="block text-xs text-muted-foreground mb-1">{t('promptContent')}</Label>
        <Textarea
          value={prompt} onChange={e => setPrompt(e.target.value)}
          rows={3}
          className="resize-y"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} variant="outline" size="sm">
          Cancel
        </Button>
        <Button onClick={handleSave} size="sm">
          Save
        </Button>
      </div>
    </div>
  )
}

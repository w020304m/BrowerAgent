import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { promptRepo } from '@/db/repositories/prompt.repository'
import type { Prompt } from '@/db/types'
import { generateId } from '@/types/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'

export function PromptSection() {
  const { t } = useTranslation('settings')
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const all = await promptRepo.getAll()
    setPrompts(all.sort((a, b) => b.createdAt - a.createdAt))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('systemPrompts')}</h2>
        <Button
          onClick={() => { setEditingId(null); setShowForm(true) }}
          size="sm"
        >
          {t('addPrompt')}
        </Button>
      </div>

      {showForm && (
        <PromptForm
          existing={editingId ? prompts.find(p => p.id === editingId) : undefined}
          onSave={() => { setShowForm(false); setEditingId(null); load() }}
          onCancel={() => { setShowForm(false); setEditingId(null) }}
        />
      )}

      {prompts.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('noPrompts')}</p>
      )}

      <div className="space-y-2">
        {prompts.map(p => (
          <div key={p.id} className="p-3 rounded border border-border">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">{p.title}</h3>
                {p.is_system && (
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                    System
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditingId(p.id); setShowForm(true) }}
                  className="text-muted-foreground"
                >
                  {t('editPrompt')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => { await promptRepo.delete(p.id); load() }}
                  className="text-destructive hover:text-destructive"
                >
                  {t('delete')}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{p.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function PromptForm({ existing, onSave, onCancel }: {
  existing?: Prompt
  onSave: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation('settings')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [content, setContent] = useState(existing?.content ?? '')
  const [isSystem, setIsSystem] = useState(existing?.is_system ?? false)

  const handleSave = async () => {
    if (!title || !content) return
    if (existing) {
      await promptRepo.update(existing.id, { title, content, is_system: isSystem })
    } else {
      const prompt: Prompt = {
        id: generateId(),
        title,
        content,
        is_system: isSystem,
        createdAt: Date.now(),
      }
      await promptRepo.create(prompt)
    }
    onSave()
  }

  return (
    <div className="p-4 rounded border border-border space-y-3">
      <h3 className="text-sm font-medium">{existing ? t('editPrompt') : t('addPrompt')}</h3>
      <div>
        <Label className="block text-xs text-muted-foreground mb-1">{t('promptTitle')}</Label>
        <Input
          type="text" value={title} onChange={e => setTitle(e.target.value)}
        />
      </div>
      <div>
        <Label className="block text-xs text-muted-foreground mb-1">{t('promptContent')}</Label>
        <Textarea
          value={content} onChange={e => setContent(e.target.value)}
          rows={4}
          className="resize-y"
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={isSystem} onCheckedChange={setIsSystem}
        />
        <Label className="text-xs">{t('promptIsSystem')}</Label>
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

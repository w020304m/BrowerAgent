import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { knowledgeRepo } from '@/db/repositories/knowledge.repository'
import { documentRepo } from '@/db/repositories/document.repository'
import type { Knowledge } from '@/db/types'
import { generateId } from '@/types/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'

export function KnowledgeSection() {
  const { t } = useTranslation('settings')
  const [knowledgeBases, setKnowledgeBases] = useState<Knowledge[]>([])
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    const all = await knowledgeRepo.getAll()
    setKnowledgeBases(all.sort((a, b) => b.createdAt - a.createdAt))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('knowledgeBases')}</h2>
        <Button
          onClick={() => setShowForm(!showForm)}
          size="sm"
        >
          {t('addKnowledge')}
        </Button>
      </div>

      {showForm && (
        <KnowledgeForm onSave={() => { setShowForm(false); load() }} onCancel={() => setShowForm(false)} />
      )}

      {knowledgeBases.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('noKnowledge')}</p>
      )}

      <div className="space-y-2">
        {knowledgeBases.map(kb => (
          <KnowledgeItem key={kb.id} kb={kb} onDelete={() => load()} />
        ))}
      </div>
    </div>
  )
}

function KnowledgeItem({ kb, onDelete }: { kb: Knowledge; onDelete: () => void }) {
  const { t } = useTranslation('settings')
  const [docCount, setDocCount] = useState<number | null>(null)

  useEffect(() => {
    documentRepo.getAll().then(docs => {
      setDocCount(docs.length)
    })
  }, [kb.id])

  const statusLabel = kb.status === 'ready'
    ? t('knowledgeStatusReady')
    : kb.status === 'processing'
      ? t('knowledgeStatusProcessing')
      : t('knowledgeStatusError')

  const statusVariant = kb.status === 'ready'
    ? 'secondary' as const
    : kb.status === 'processing'
      ? 'outline' as const
      : 'destructive' as const

  const handleDelete = async () => {
    await knowledgeRepo.delete(kb.id)
    onDelete()
  }

  return (
    <div className="p-3 rounded border border-border">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{kb.title}</h3>
          <div className="flex items-center gap-3 mt-1">
            <Badge variant={statusVariant} className="text-xs">{statusLabel}</Badge>
            {kb.embedding_model && (
              <span className="text-xs text-muted-foreground">{kb.embedding_model}</span>
            )}
            <span className="text-xs text-muted-foreground">{docCount !== null ? `${docCount} docs` : ''}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
          {t('deleteKnowledge')}
        </Button>
      </div>
    </div>
  )
}

function KnowledgeForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const { t } = useTranslation('settings')
  const [title, setTitle] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [followupPrompt, setFollowupPrompt] = useState('')

  const handleSave = async () => {
    if (!title) return
    const kb: Knowledge = {
      id: generateId(),
      db_type: 'local',
      title,
      status: 'ready',
      systemPrompt: systemPrompt || undefined,
      followupPrompt: followupPrompt || undefined,
      createdAt: Date.now(),
    }
    await knowledgeRepo.create(kb)
    onSave()
  }

  return (
    <div className="p-4 rounded border border-border space-y-3">
      <h3 className="text-sm font-medium">{t('addKnowledge')}</h3>
      <div>
        <Label className="block text-xs text-muted-foreground mb-1">{t('knowledgeTitle')}</Label>
        <Input
          type="text" value={title} onChange={e => setTitle(e.target.value)}
        />
      </div>
      <div>
        <Label className="block text-xs text-muted-foreground mb-1">{t('knowledgeSystemPrompt')}</Label>
        <Textarea
          value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
          rows={2}
          className="resize-y"
        />
      </div>
      <div>
        <Label className="block text-xs text-muted-foreground mb-1">{t('knowledgeFollowupPrompt')}</Label>
        <Textarea
          value={followupPrompt} onChange={e => setFollowupPrompt(e.target.value)}
          rows={2}
          className="resize-y"
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

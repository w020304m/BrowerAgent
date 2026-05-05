import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ImportService } from '@/export/import-service'
import type { ExportData, ImportPreview } from '@/export/export-types'
import { Button } from '@/components/ui/button'

const importService = new ImportService()

type ImportStep = 'select' | 'preview' | 'importing' | 'done' | 'error'

export function ImportSection() {
  const [step, setStep] = useState<ImportStep>('select')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [exportData, setExportData] = useState<ExportData | null>(null)
  const [error, setError] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation(['options', 'common'])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const data = await importService.parseFile(file)
      const validation = importService.validate(data)

      if (!validation.valid) {
        setError(validation.errors.join(', '))
        setStep('error')
        return
      }

      const previewResult = importService.getPreview(data)
      setPreview(previewResult)
      setExportData(data)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('options:importError'))
      setStep('error')
    }
  }

  const handleImport = async () => {
    if (!exportData) return

    setStep('importing')
    try {
      await importService.importData(exportData)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('options:importFailed'))
      setStep('error')
    }
  }

  const handleReset = () => {
    setStep('select')
    setPreview(null)
    setExportData(null)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('options:importData')}</h2>

      {step === 'select' && (
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            {t('options:importDescription')}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
          />
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-3">
          <div className="text-sm space-y-1">
            <p><strong>{t('options:version')}:</strong> {preview.version}</p>
            <p><strong>{t('options:exportDate')}:</strong> {preview.exportDate}</p>
            <p><strong>{t('options:appVersion')}:</strong> {preview.appVersion}</p>
          </div>
          <div className="text-sm">
            <h3 className="font-medium mb-1">{t('options:sectionsToImport')}</h3>
            <ul className="list-disc list-inside space-y-0.5">
              {Object.entries(preview.sections).map(([section, count]) => (
                <li key={section}>{section}: {count} {t('options:items')}</li>
              ))}
            </ul>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleImport}>
              {t('options:import')}
            </Button>
            <Button variant="secondary" onClick={handleReset}>
              {t('common:cancel')}
            </Button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <p className="text-sm text-muted-foreground">{t('options:importingData')}</p>
      )}

      {step === 'done' && (
        <div className="space-y-2">
          <p className="text-sm text-green-600 dark:text-green-400">{t('options:importSuccess')}</p>
          <Button onClick={() => window.location.reload()}>
            {t('options:refreshPage')}
          </Button>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="secondary" onClick={handleReset}>
            {t('options:tryAgain')}
          </Button>
        </div>
      )}
    </div>
  )
}

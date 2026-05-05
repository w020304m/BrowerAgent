import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExportService } from '@/export/export-service'
import { ALL_SECTIONS, type ExportSection } from '@/export/export-types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

const exportService = new ExportService()

export function ExportSection() {
  const [selectedSections, setSelectedSections] = useState<Set<ExportSection>>(
    new Set(ALL_SECTIONS)
  )
  const [exporting, setExporting] = useState(false)
  const { t } = useTranslation('options')

  const toggleSection = (section: ExportSection) => {
    setSelectedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      exportService.exportToFile([...selectedSections])
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('exportData')}</h2>
      <p className="text-sm text-muted-foreground">
        {t('selectSections')}
      </p>
      <div className="space-y-1">
        {ALL_SECTIONS.map(section => (
          <label key={section} className="flex items-center gap-2 text-sm">
            <Switch
              checked={selectedSections.has(section)}
              onCheckedChange={() => toggleSection(section)}
            />
            {section}
          </label>
        ))}
      </div>
      <Button
        onClick={handleExport}
        disabled={selectedSections.size === 0 || exporting}
      >
        {exporting ? t('importing') : t('export')}
      </Button>
    </div>
  )
}

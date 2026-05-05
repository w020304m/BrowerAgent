import React, { useState } from 'react'
import '@/i18n'
import { useTranslation } from 'react-i18next'
import { GeneralSection } from './components/GeneralSection'
import { ModelSection } from './components/ModelSection'
import { PromptSection } from './components/PromptSection'
import { KnowledgeSection } from './components/KnowledgeSection'
import { SearchSection } from './components/SearchSection'
import { TtsSection } from './components/TtsSection'
import { CopilotSection } from './components/CopilotSection'
import { McpSection } from './components/McpSection'
import { AgentSection } from './components/AgentSection'
import { ExportSection } from './components/ExportSection'
import { ImportSection } from './components/ImportSection'
import { LanguageSelector } from './components/LanguageSelector'
import { Separator } from '@/components/ui/separator'

type SettingsPage =
  | null // home
  | 'general' | 'models' | 'knowledge' | 'prompts' | 'search' | 'tts'
  | 'copilot' | 'mcp' | 'agent' | 'data'

interface SettingCardDef {
  id: SettingsPage
  titleKey: string
  descKey: string
  icon: string
}

const CARDS: SettingCardDef[] = [
  { id: 'general', titleKey: 'tabGeneral', descKey: 'cardGeneralDesc', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'models', titleKey: 'tabModels', descKey: 'cardModelsDesc', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { id: 'knowledge', titleKey: 'tabKnowledge', descKey: 'cardKnowledgeDesc', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { id: 'prompts', titleKey: 'tabPrompts', descKey: 'cardPromptsDesc', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { id: 'search', titleKey: 'tabSearch', descKey: 'cardSearchDesc', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
  { id: 'tts', titleKey: 'tabTts', descKey: 'cardTtsDesc', icon: 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z' },
  { id: 'copilot', titleKey: 'tabCopilot', descKey: 'cardCopilotDesc', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { id: 'mcp', titleKey: 'tabMcp', descKey: 'cardMcpDesc', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'agent', titleKey: 'tabAgent', descKey: 'cardAgentDesc', icon: 'M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93V12h3.75a2.5 2.5 0 0 1 2.5 2.5v1.75c1.85.35 3.25 1.98 3.25 3.93a4 4 0 1 1-7.25-2.33V14.5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0-.5.5v3.35A4 4 0 1 1 3 20.18c0-1.95 1.4-3.58 3.25-3.93V14.5A2.5 2.5 0 0 1 8.75 12h3.5V9.93A4.002 4.002 0 0 1 12 2z' },
  { id: 'data', titleKey: 'tabData', descKey: 'cardDataDesc', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
]

export default function OptionApp() {
  const { t } = useTranslation(['options', 'settings'])
  const [page, setPage] = useState<SettingsPage>(null)

  // Sub-page title lookup
  const getPageTitle = (p: SettingsPage): string => {
    const card = CARDS.find(c => c.id === p)
    return card ? t(`settings:${card.titleKey}`) : ''
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6">
          <div className="flex items-center gap-3">
            {page && (
              <button
                onClick={() => setPage(null)}
                className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h1 className="text-xl font-bold">{t('options:settingsTitle')}</h1>
          </div>
          <LanguageSelector />
        </div>
        <Separator />

        {page === null ? (
          /* Home: Card grid */
          <div className="p-8">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {CARDS.map(card => (
                <button
                  key={card.id}
                  onClick={() => setPage(card.id)}
                  className="flex flex-col items-start gap-3 p-5 rounded-xl border border-border hover:shadow-md transition-all text-left group"
                >
                  <div className="p-2 rounded-lg bg-muted group-hover:bg-accent transition-colors">
                    <svg className="w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={card.icon} />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t(`settings:${card.titleKey}`)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t(`options:${card.descKey}` as 'settingsTitle')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Sub-page */
          <div className="p-8">
            <h2 className="text-lg font-semibold mb-6">{getPageTitle(page)}</h2>
            {page === 'general' && <GeneralSection />}
            {page === 'models' && <ModelSection />}
            {page === 'knowledge' && <KnowledgeSection />}
            {page === 'prompts' && <PromptSection />}
            {page === 'search' && <SearchSection />}
            {page === 'tts' && <TtsSection />}
            {page === 'copilot' && <CopilotSection />}
            {page === 'mcp' && <McpSection />}
            {page === 'agent' && <AgentSection />}
            {page === 'data' && <DataManagementSection />}
          </div>
        )}
      </div>
    </div>
  )
}

/** Combined Export + Import sub-section */
function DataManagementSection() {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export')

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-4 border-b border-border">
        <button
          onClick={() => setActiveTab('export')}
          className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'export'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Export
        </button>
        <button
          onClick={() => setActiveTab('import')}
          className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'import'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Import
        </button>
      </div>

      {activeTab === 'export' ? <ExportSection /> : <ImportSection />}
    </div>
  )
}

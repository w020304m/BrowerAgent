import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { searchSettings } from '@/storage/search-settings'
import { searchEngineRegistry } from '@/search'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SearchSection() {
  const { t } = useTranslation('settings')
  const [provider, setProvider] = useState('duckduckgo')
  const [apiKey, setApiKey] = useState('')
  const [searxngUrl, setSearxngUrl] = useState('')
  const [googleDomain, setGoogleDomain] = useState('google.com')
  const [domainFilter, setDomainFilter] = useState('')
  const [blockedDomains, setBlockedDomains] = useState('')
  const [isDefaultOn, setIsDefaultOn] = useState(false)

  // Get all registered engines
  const engines = searchEngineRegistry.getAll()

  useEffect(() => {
    Promise.all([
      searchSettings.getProvider(),
      searchSettings.getSearxngURL(),
      searchSettings.getGoogleDomain(),
      searchSettings.getDomainFilterList(),
      searchSettings.getBlockedDomainList(),
      searchSettings.isDefaultOn(),
    ]).then(([p, surl, gdomain, dfilters, blocked, defOn]) => {
      setProvider(p)
      setSearxngUrl(surl)
      setGoogleDomain(gdomain)
      setDomainFilter(dfilters.join('\n'))
      setBlockedDomains(blocked.join('\n'))
      setIsDefaultOn(defOn)
    })
  }, [])

  // Load API key when provider changes
  useEffect(() => {
    loadApiKey(provider).then(setApiKey)
  }, [provider])

  const selectedEngine = engines.find(e => e.id === provider)

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('searchProvider')}</h2>

      {/* Provider selection */}
      <div>
        <Label className="block text-sm font-medium mb-1">{t('searchProvider')}</Label>
        <select
          value={provider}
          onChange={e => {
            const v = e.target.value
            setProvider(v)
            searchSettings.setProvider(v)
          }}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {engines.map(e => (
            <option key={e.id} value={e.id}>
              {e.label}{e.requiresApiKey ? ' (API Key)' : ''}
            </option>
          ))}
        </select>
        {selectedEngine?.requiresApiKey && (
          <p className="text-xs text-muted-foreground mt-1">Requires API Key</p>
        )}
      </div>

      {/* API Key — only shown for engines that need it */}
      {selectedEngine?.requiresApiKey && (
        <div>
          <Label className="block text-sm font-medium mb-1">{t('searchApiKey')}</Label>
          <Input
            type="password"
            value={apiKey}
            onChange={e => {
              setApiKey(e.target.value)
              saveApiKey(provider, e.target.value)
            }}
            placeholder={`${selectedEngine.label} API Key`}
            className="font-mono"
          />
        </div>
      )}

      {/* SearXNG URL — only shown for SearXNG */}
      {provider === 'searxng' && (
        <div>
          <Label className="block text-sm font-medium mb-1">SearXNG URL</Label>
          <Input
            value={searxngUrl}
            onChange={e => {
              setSearxngUrl(e.target.value)
              searchSettings.setSearxngURL(e.target.value)
            }}
            placeholder="http://localhost:8080"
            className="font-mono"
          />
        </div>
      )}

      {/* Google domain — only shown for Google */}
      {provider === 'google' && (
        <div>
          <Label className="block text-sm font-medium mb-1">Google Domain</Label>
          <Input
            value={googleDomain}
            onChange={e => {
              setGoogleDomain(e.target.value)
              searchSettings.setGoogleDomain(e.target.value)
            }}
            placeholder="google.com"
            className="font-mono"
          />
        </div>
      )}

      {/* Default on */}
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-sm font-medium">Default search on</p>
          <p className="text-xs text-muted-foreground">Enable search in normal chat mode by default</p>
        </div>
        <Switch
          checked={isDefaultOn}
          onCheckedChange={(v) => { setIsDefaultOn(v); searchSettings.setDefaultOn(v) }}
        />
      </div>

      {/* Domain allow filter */}
      <div>
        <Label className="block text-sm font-medium mb-1">{t('searchDomainFilter')}</Label>
        <p className="text-xs text-muted-foreground mb-2">{t('searchDomainFilterDesc')}</p>
        <Textarea
          value={domainFilter}
          onChange={e => {
            const v = e.target.value
            setDomainFilter(v)
            const list = v.split('\n').map(s => s.trim()).filter(Boolean)
            searchSettings.setDomainFilterList(list)
          }}
          rows={3}
          className="font-mono resize-y"
          placeholder="example.com&#10;docs.example.org"
        />
      </div>

      {/* Domain block filter */}
      <div>
        <Label className="block text-sm font-medium mb-1">Blocked Domains</Label>
        <p className="text-xs text-muted-foreground mb-2">Exclude results from these domains (one per line)</p>
        <Textarea
          value={blockedDomains}
          onChange={e => {
            const v = e.target.value
            setBlockedDomains(v)
            const list = v.split('\n').map(s => s.trim()).filter(Boolean)
            searchSettings.setBlockedDomainList(list)
          }}
          rows={3}
          className="font-mono resize-y"
          placeholder="spam-site.com&#10;ads.example.org"
        />
      </div>
    </div>
  )
}

// ── Helpers ──

async function loadApiKey(provider: string): Promise<string> {
  switch (provider) {
    case 'brave-api': return searchSettings.getBraveApiKey()
    case 'tavily': return searchSettings.getTavilyApiKey()
    case 'exa': return searchSettings.getExaAPIKey()
    case 'kagi': return searchSettings.getKagiApiKey()
    case 'perplexity': return searchSettings.getPerplexityApiKey()
    case 'firecrawl': return searchSettings.getFirecrawlAPIKey()
    default: return ''
  }
}

async function saveApiKey(provider: string, key: string): Promise<void> {
  switch (provider) {
    case 'brave-api': return searchSettings.setBraveApiKey(key)
    case 'tavily': return searchSettings.setTavilyApiKey(key)
    case 'exa': return searchSettings.setExaAPIKey(key)
    case 'kagi': return searchSettings.setKagiApiKey(key)
    case 'perplexity': return searchSettings.setPerplexityApiKey(key)
    case 'firecrawl': return searchSettings.setFirecrawlAPIKey(key)
  }
}

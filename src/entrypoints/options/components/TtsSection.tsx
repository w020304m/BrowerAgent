import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ttsSettings } from '@/storage/tts-settings'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export function TtsSection() {
  const { t } = useTranslation('settings')
  const [provider, setProvider] = useState('browser')
  const [autoPlay, setAutoPlay] = useState(false)
  const [elevenLabsKey, setElevenLabsKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('https://api.openai.com/v1')

  useEffect(() => {
    ttsSettings.getProvider().then(setProvider)
    ttsSettings.isAutoPlay().then(setAutoPlay)
    ttsSettings.getElevenLabsApiKey().then(setElevenLabsKey)
    ttsSettings.getOpenAITTSApiKey().then(setOpenaiKey)
    ttsSettings.getOpenAITTSBaseUrl().then(setOpenaiBaseUrl)
  }, [])

  const handleProviderChange = async (v: string) => {
    setProvider(v)
    await ttsSettings.setProvider(v)
  }

  const handleAutoPlay = async (v: boolean) => {
    setAutoPlay(v)
    await ttsSettings.setAutoPlay(v)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('tabTts')}</h2>

      {/* Provider */}
      <div>
        <Label className="block mb-1">{t('ttsProvider')}</Label>
        <select
          value={provider} onChange={e => handleProviderChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="browser">{t('ttsBrowser')}</option>
          <option value="elevenlabs">{t('ttsElevenLabs')}</option>
          <option value="openai">{t('ttsOpenai')}</option>
        </select>
      </div>

      {/* Auto-play */}
      <div className="flex items-center justify-between py-2">
        <p className="text-sm font-medium">{t('ttsAutoPlay')}</p>
        <Switch checked={autoPlay} onCheckedChange={handleAutoPlay} />
      </div>

      {/* ElevenLabs API Key */}
      {provider === 'elevenlabs' && (
        <div>
          <Label className="block mb-1">{t('ttsApiKey')} (ElevenLabs)</Label>
          <Input
            type="password" value={elevenLabsKey}
            onChange={e => { setElevenLabsKey(e.target.value); ttsSettings.setElevenLabsApiKey(e.target.value) }}
          />
        </div>
      )}

      {/* OpenAI TTS settings */}
      {provider === 'openai' && (
        <>
          <div>
            <Label className="block mb-1">Base URL</Label>
            <Input
              type="text" value={openaiBaseUrl}
              onChange={e => { setOpenaiBaseUrl(e.target.value); ttsSettings.setOpenAITTSBaseUrl(e.target.value) }}
            />
          </div>
          <div>
            <Label className="block mb-1">{t('ttsApiKey')} (OpenAI)</Label>
            <Input
              type="password" value={openaiKey}
              onChange={e => { setOpenaiKey(e.target.value); ttsSettings.setOpenAITTSApiKey(e.target.value) }}
            />
          </div>
        </>
      )}
    </div>
  )
}

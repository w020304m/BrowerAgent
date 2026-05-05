/**
 * TTS (Text-to-Speech) settings.
 */

import { syncStorageService, localStorageService } from './index'

export interface TTSSettings {
  provider: string
  voice: string | undefined
  isEnabled: boolean
  isSSMLEnabled: boolean
  responseSplitting: string
  removeReasoningTag: boolean
  isAutoPlay: boolean
  playbackSpeed: number
  elevenLabsApiKey: string
  elevenLabsVoiceId: string
  elevenLabsModel: string
  openAITTSBaseUrl: string
  openAITTSApiKey: string
  openAITTSModel: string
  openAITTSVoice: string
}

export const ttsSettings = {
  async getProvider(): Promise<string> {
    return syncStorageService.get('ttsProvider', 'browser')
  },
  async setProvider(provider: string): Promise<void> {
    await syncStorageService.set('ttsProvider', provider)
  },

  async getVoice(): Promise<string | undefined> {
    return syncStorageService.get('voice')
  },
  async setVoice(voice: string): Promise<void> {
    await syncStorageService.set('voice', voice)
  },

  async isEnabled(): Promise<boolean> {
    return syncStorageService.get('isTTSEnabled', true)
  },
  async setEnabled(enabled: boolean): Promise<void> {
    await syncStorageService.set('isTTSEnabled', enabled)
  },

  async isSSMLEnabled(): Promise<boolean> {
    return syncStorageService.get('isSSMLEnabled', false)
  },
  async setSSMLEnabled(enabled: boolean): Promise<void> {
    await syncStorageService.set('isSSMLEnabled', enabled)
  },

  async getResponseSplitting(): Promise<string> {
    return syncStorageService.get('ttsResponseSplitting', 'punctuation')
  },
  async setResponseSplitting(splitting: string): Promise<void> {
    await syncStorageService.set('ttsResponseSplitting', splitting)
  },

  async isRemoveReasoningTag(): Promise<boolean> {
    return localStorageService.get('removeReasoningTagTTS', true)
  },
  async setRemoveReasoningTag(remove: boolean): Promise<void> {
    await localStorageService.set('removeReasoningTagTTS', remove)
  },

  async isAutoPlay(): Promise<boolean> {
    return syncStorageService.get('isTTSAutoPlayEnabled', false)
  },
  async setAutoPlay(autoPlay: boolean): Promise<void> {
    await syncStorageService.set('isTTSAutoPlayEnabled', autoPlay)
  },

  async getPlaybackSpeed(): Promise<number> {
    return syncStorageService.get('speechPlaybackSpeed', 1)
  },
  async setPlaybackSpeed(speed: number): Promise<void> {
    await syncStorageService.set('speechPlaybackSpeed', speed)
  },

  // ElevenLabs
  async getElevenLabsApiKey(): Promise<string> {
    return syncStorageService.get('elevenLabsApiKey', '')
  },
  async setElevenLabsApiKey(key: string): Promise<void> {
    await syncStorageService.set('elevenLabsApiKey', key)
  },
  async getElevenLabsVoiceId(): Promise<string> {
    return syncStorageService.get('elevenLabsVoiceId', '')
  },
  async setElevenLabsVoiceId(id: string): Promise<void> {
    await syncStorageService.set('elevenLabsVoiceId', id)
  },
  async getElevenLabsModel(): Promise<string> {
    return syncStorageService.get('elevenLabsModel', '')
  },
  async setElevenLabsModel(model: string): Promise<void> {
    await syncStorageService.set('elevenLabsModel', model)
  },

  // OpenAI TTS
  async getOpenAITTSBaseUrl(): Promise<string> {
    return syncStorageService.get('openAITTSBaseUrl', 'https://api.openai.com/v1')
  },
  async setOpenAITTSBaseUrl(url: string): Promise<void> {
    await syncStorageService.set('openAITTSBaseUrl', url)
  },
  async getOpenAITTSApiKey(): Promise<string> {
    return syncStorageService.get('openAITTSApiKey', '')
  },
  async setOpenAITTSApiKey(key: string): Promise<void> {
    await syncStorageService.set('openAITTSApiKey', key)
  },
  async getOpenAITTSModel(): Promise<string> {
    return syncStorageService.get('openAITTSModel', 'tts-1')
  },
  async setOpenAITTSModel(model: string): Promise<void> {
    await syncStorageService.set('openAITTSModel', model)
  },
  async getOpenAITTSVoice(): Promise<string> {
    return syncStorageService.get('openAITTSVoice', 'alloy')
  },
  async setOpenAITTSVoice(voice: string): Promise<void> {
    await syncStorageService.set('openAITTSVoice', voice)
  },

  /**
   * Get all TTS settings at once.
   */
  async getAll(): Promise<TTSSettings> {
    const [
      provider, voice, isEnabled, isSSMLEnabled, responseSplitting,
      removeReasoningTag, isAutoPlay, playbackSpeed,
      elevenLabsApiKey, elevenLabsVoiceId, elevenLabsModel,
      openAITTSBaseUrl, openAITTSApiKey, openAITTSModel, openAITTSVoice
    ] = await Promise.all([
      this.getProvider(), this.getVoice(), this.isEnabled(),
      this.isSSMLEnabled(), this.getResponseSplitting(),
      this.isRemoveReasoningTag(), this.isAutoPlay(), this.getPlaybackSpeed(),
      this.getElevenLabsApiKey(), this.getElevenLabsVoiceId(), this.getElevenLabsModel(),
      this.getOpenAITTSBaseUrl(), this.getOpenAITTSApiKey(),
      this.getOpenAITTSModel(), this.getOpenAITTSVoice()
    ])
    return {
      provider, voice: voice ?? undefined, isEnabled, isSSMLEnabled,
      responseSplitting, removeReasoningTag, isAutoPlay, playbackSpeed,
      elevenLabsApiKey, elevenLabsVoiceId, elevenLabsModel,
      openAITTSBaseUrl, openAITTSApiKey, openAITTSModel, openAITTSVoice
    }
  }
}

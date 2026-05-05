import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
] as const

export function LanguageSelector() {
  const { i18n, t } = useTranslation('common')

  const handleChange = (lng: string) => {
    i18n.changeLanguage(lng)
    localStorage.setItem('i18nextLng', lng)
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="language-select" className="text-sm text-gray-700 dark:text-gray-300">
        {t('language')}:
      </label>
      <select
        id="language-select"
        value={i18n.language}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  )
}

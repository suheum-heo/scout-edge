'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
  normalizeLanguage,
  pluralSuffix,
  translate,
  translateAvailabilityLabel,
  translateFitLabel,
  translatePosition,
  translateVerdictLabel,
  translateValueLabel,
} from '@/lib/i18n'

interface LanguageContextValue {
  language: LanguageCode
  setLanguage: (language: LanguageCode) => void
  t: (key: string, values?: Record<string, string | number>) => string
  translatePosition: (position: string) => string
  translateFitLabel: (label: 'Key Man' | 'Good Fit' | 'Rotation' | 'Poor Fit' | 'Sell Candidate') => string
  translateValueLabel: (label: 'Undervalued' | 'Fair Value' | 'Overpriced') => string
  translateAvailabilityLabel: (label: 'Likely available' | 'Possible' | 'Hard to get') => string
  translateVerdictLabel: (label: 'Do it' | 'Consider it' | 'Risky' | 'Avoid') => string
  pluralSuffix: (count: number) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
      if (saved) setLanguage(normalizeLanguage(saved))
    } catch {
      // Ignore storage failures.
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    } catch {
      // Ignore storage failures.
    }
    document.documentElement.lang = language
  }, [language])

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key, values) => translate(language, key, values),
    translatePosition: (position) => translatePosition(language, position),
    translateFitLabel: (label) => translateFitLabel(language, label),
    translateValueLabel: (label) => translateValueLabel(language, label),
    translateAvailabilityLabel: (label) => translateAvailabilityLabel(language, label),
    translateVerdictLabel: (label) => translateVerdictLabel(language, label),
    pluralSuffix: (count) => pluralSuffix(language, count),
  }), [language])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage()

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span className="hidden sm:inline">{t('nav.language')}</span>
      <div className="flex items-center gap-1">
        {SUPPORTED_LANGUAGES.map((option) => {
          const isActive = language === option.code
          const shortLabel = option.code === 'en' ? 'EN' : option.code === 'ko' ? '한국어' : 'ES'

          return (
            <button
              key={option.code}
              type="button"
              onClick={() => setLanguage(option.code)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
              aria-pressed={isActive}
              aria-label={option.label}
            >
              {shortLabel}
            </button>
          )
        })}
      </div>
    </div>
  )
}

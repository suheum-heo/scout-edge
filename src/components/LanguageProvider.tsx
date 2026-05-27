'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  getEnglishMessages,
  getSeededMessages,
  type MessageCatalog,
  type LanguageCode,
  hasStaticMessages,
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
  const [runtimeCatalog, setRuntimeCatalog] = useState<MessageCatalog | null>(null)

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

  useEffect(() => {
    let cancelled = false

    if (hasStaticMessages(language)) {
      setRuntimeCatalog(null)
      return () => {
        cancelled = true
      }
    }

    setRuntimeCatalog(null)

    void fetch(`/api/i18n?language=${encodeURIComponent(language)}`)
      .then(async (response) => {
        if (!response.ok) return null
        const data = await response.json() as { messages?: MessageCatalog }
        return data.messages || null
      })
      .then((messages) => {
        if (!cancelled) {
          setRuntimeCatalog(messages)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeCatalog(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [language])

  const resolvedCatalog = useMemo(() => {
    const seeded = getSeededMessages(language)
    if (hasStaticMessages(language)) {
      return runtimeCatalog
    }

    if (!runtimeCatalog && Object.keys(seeded).length === 0) {
      return null
    }

    const english = getEnglishMessages()
    const merged = { ...(runtimeCatalog || {}) }

    for (const [key, value] of Object.entries(seeded)) {
      if (!(key in merged) || merged[key] === english[key]) {
        merged[key] = value
      }
    }

    return merged
  }, [language, runtimeCatalog])

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key, values) => translate(language, key, values, resolvedCatalog),
    translatePosition: (position) => translatePosition(language, position),
    translateFitLabel: (label) => translateFitLabel(language, label, resolvedCatalog),
    translateValueLabel: (label) => translateValueLabel(language, label, resolvedCatalog),
    translateAvailabilityLabel: (label) => translateAvailabilityLabel(language, label, resolvedCatalog),
    translateVerdictLabel: (label) => translateVerdictLabel(language, label, resolvedCatalog),
    pluralSuffix: (count) => pluralSuffix(language, count),
  }), [language, resolvedCatalog])

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
    <div className="flex w-full shrink-0 items-center justify-between gap-3 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span className="hidden whitespace-nowrap sm:inline">{t('nav.language')}</span>
      <div className="flex items-center justify-end gap-1 sm:gap-1.5">
        {SUPPORTED_LANGUAGES.map((option) => {
          const isActive = language === option.code
          const shortLabel = option.code === 'ko'
            ? '한국어'
            : option.code === 'ja'
            ? '日本語'
            : option.code.toUpperCase()

          return (
            <button
              key={option.code}
              type="button"
              onClick={() => setLanguage(option.code)}
              className={`rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors sm:px-2 ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
              aria-pressed={isActive}
              aria-label={option.label}
            >
              <span className="whitespace-nowrap">{shortLabel}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

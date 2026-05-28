'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Languages } from 'lucide-react'
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
  const [runtimeCatalogState, setRuntimeCatalogState] = useState<{
    language: LanguageCode
    messages: MessageCatalog | null
  }>({
    language: DEFAULT_LANGUAGE,
    messages: null,
  })

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
      if (!saved) return

      const syncLanguageTimer = window.setTimeout(() => {
        setLanguage(normalizeLanguage(saved))
      }, 0)

      return () => window.clearTimeout(syncLanguageTimer)
    } catch {
      return
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
      return () => {
        cancelled = true
      }
    }

    void fetch(`/api/i18n?language=${encodeURIComponent(language)}`)
      .then(async (response) => {
        if (!response.ok) return null
        const data = await response.json() as { messages?: MessageCatalog }
        return data.messages || null
      })
      .then((messages) => {
        if (!cancelled) {
          setRuntimeCatalogState({ language, messages })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeCatalogState({ language, messages: null })
        }
      })

    return () => {
      cancelled = true
    }
  }, [language])

  const resolvedCatalog = useMemo(() => {
    const runtimeCatalog = runtimeCatalogState.language === language
      ? runtimeCatalogState.messages
      : null
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
  }, [language, runtimeCatalogState])

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
    <label className="relative inline-flex min-w-[140px] shrink-0 items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400">
      <Languages className="h-3.5 w-3.5 shrink-0" />
      <select
        value={language}
        onChange={(event) => setLanguage(normalizeLanguage(event.target.value))}
        aria-label={t('nav.language')}
        className="w-full appearance-none bg-transparent pr-5 text-xs font-medium text-slate-700 outline-none dark:text-slate-200"
      >
        {SUPPORTED_LANGUAGES.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
    </label>
  )
}

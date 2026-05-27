'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { LanguageSelector, useLanguage } from '@/components/LanguageProvider'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage()

  return (
    <>
      <nav className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 min-h-14 py-2 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center">
              <Search className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 dark:text-white tracking-tight">ScoutEdge</span>
            <span className="hidden sm:inline text-slate-400 dark:text-slate-500 text-xs border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded">
              {t('nav.beta')}
            </span>
          </Link>

          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <Link
              href="/"
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-[#EEF2F7] dark:hover:bg-slate-800 transition-colors"
            >
              {t('nav.squadAnalysis')}
            </Link>
            <Link
              href="/player-check"
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-[#EEF2F7] dark:hover:bg-slate-800 transition-colors"
            >
              {t('nav.playerCheck')}
            </Link>
            <Link
              href="/verdict"
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-[#EEF2F7] dark:hover:bg-slate-800 transition-colors"
            >
              {t('nav.verdict')}
            </Link>
            <Link
              href="/build"
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-[#EEF2F7] dark:hover:bg-slate-800 transition-colors"
            >
              {t('nav.buildXi')}
            </Link>
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="border-t border-slate-200 dark:border-slate-800 mt-20 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-slate-400 dark:text-slate-600 text-sm">{t('footer.title')}</p>
          <p className="text-slate-300 dark:text-slate-700 text-xs mt-1">{t('footer.note')}</p>
        </div>
      </footer>
    </>
  )
}

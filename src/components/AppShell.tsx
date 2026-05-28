'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { LanguageSelector, useLanguage } from '@/components/LanguageProvider'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage()
  const navLinkClassName =
    'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-[#EEF2F7] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white md:px-0 md:py-0 md:text-[13px] lg:text-sm'

  return (
    <>
      <nav className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6 md:py-0">
          <div className="flex items-center justify-between gap-4 md:h-[72px]">
            <Link href="/" className="flex shrink-0 items-center gap-2.5 hover:opacity-80 transition-opacity">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
                <Search className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white tracking-tight">ScoutEdge</span>
            </Link>

            <div className="hidden min-w-0 flex-1 items-center justify-end gap-4 md:flex lg:gap-6 xl:gap-8">
              <div className="flex min-w-0 flex-1 items-center justify-end">
                <div className="ml-auto flex min-w-0 items-center gap-4 whitespace-nowrap lg:gap-6 xl:gap-8">
                  <Link href="/" className={navLinkClassName}>
                    {t('nav.squadAnalysis')}
                  </Link>
                  <Link href="/player-check" className={navLinkClassName}>
                    {t('nav.playerCheck')}
                  </Link>
                  <Link href="/verdict" className={navLinkClassName}>
                    {t('nav.verdict')}
                  </Link>
                  <Link href="/build" className={navLinkClassName}>
                    {t('nav.buildXi')}
                  </Link>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 md:gap-2.5">
                <LanguageSelector />
                <ThemeToggle />
              </div>
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <LanguageSelector />
              <ThemeToggle />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 sm:gap-x-6 md:hidden">
            <div className="flex w-full flex-wrap items-center justify-end gap-x-4 gap-y-1 sm:gap-x-6">
                <Link href="/" className={navLinkClassName}>
                  {t('nav.squadAnalysis')}
                </Link>
                <Link href="/player-check" className={navLinkClassName}>
                  {t('nav.playerCheck')}
                </Link>
                <Link href="/verdict" className={navLinkClassName}>
                  {t('nav.verdict')}
                </Link>
                <Link href="/build" className={navLinkClassName}>
                  {t('nav.buildXi')}
                </Link>
              </div>
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

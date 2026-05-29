'use client'

import { useLanguage } from '@/components/LanguageProvider'
import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Sparkles, TriangleAlert } from 'lucide-react'
import { UndervaluedXIResult, UndervaluedPlayer } from '@/lib/claude'
import LoadingSpinner from '@/components/LoadingSpinner'

const BUDGETS = ['< €50M', '€50–100M', '€100–150M', '€150–200M']

const POSITION_ORDER = ['GK', 'RB', 'CB', 'LB', 'WB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'CF', 'ST']

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 65) return 'text-blue-400'
  if (score >= 50) return 'text-slate-600 dark:text-slate-300'
  return 'text-slate-400 dark:text-slate-500'
}

function buildTransfermarktSearchUrl(playerName: string): string {
  return `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(playerName)}`
}

function PlayerCard({ player }: { player: UndervaluedPlayer }) {
  const { t, translateCountryName, localizeText } = useLanguage()
  const href = player.transfermarktUrl
  const fallbackSearchUrl = buildTransfermarktSearchUrl(player.playerName)
  const displayName = player.displayName || player.playerName
  const displayClub = player.displayCurrentClub || player.currentClub
  const cardContent = (
    <>
      {/* Position + archetype */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
          {player.position}
        </span>
        <span className="text-slate-400 dark:text-slate-500 text-[10px] truncate">{player.displayArchetypeLabel || localizeText(player.archetypeLabel)}</span>
      </div>

      {/* Name + score */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1.5 text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-300 transition-colors"
            >
              <span className="font-semibold text-sm leading-tight">{displayName}</span>
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 opacity-50" />
            </a>
          ) : (
            <span className="text-slate-900 dark:text-white font-semibold text-sm leading-tight">{displayName}</span>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-slate-400 dark:text-slate-500 text-[9px] font-medium uppercase tracking-wider">
            {t('common.scoutScore')}
          </div>
          <span className={`text-sm font-bold ${scoreColor(player.scoutScore)}`}>
            {player.scoutScore}
          </span>
        </div>
      </div>

      {/* Age + nationality */}
      <div className="text-slate-400 dark:text-slate-500 text-xs">
        {player.age} · {(player.displayNationality || translateCountryName(player.nationality))}
      </div>
      <div className="flex items-center gap-1">
        {player.tmVerified ? (
          <span className="text-slate-500 dark:text-slate-400 text-xs">{displayClub}</span>
        ) : (
          <a
            href={fallbackSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-amber-500/70 text-[10px] hover:text-amber-400 transition-colors"
          >
            <TriangleAlert className="w-2.5 h-2.5 flex-shrink-0" />
            {t('common.clubUnverifiedCheckTm')}
          </a>
        )}
      </div>

      {/* Value + contract */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-emerald-400 font-semibold">{player.estimatedValue}</span>
        {player.contractUntil && player.contractUntil !== 'Unknown' && (
          <span className="text-slate-400 dark:text-slate-600">{t('common.untilYear', { year: player.contractUntil })}</span>
        )}
      </div>

      {/* Why undervalued */}
      <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed border-t border-slate-200 dark:border-slate-700/50 pt-2 mt-1">
        {localizeText(player.whyUndervalued)}
      </p>
    </>
  )

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 flex flex-col gap-2">
      {cardContent}
    </div>
  )
}

interface Props {
  managerId?: string | null
  managerName?: string
  teamName?: string
  language?: string
}

export default function UndervaluedXI({ managerId, managerName, teamName, language }: Props) {
  const { t } = useLanguage()
  const [budget, setBudget] = useState<string>('')
  const [result, setResult] = useState<UndervaluedXIResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prefetchedResultsRef = useRef(new Map<string, UndervaluedXIResult>())
  const inflightRequestsRef = useRef(new Map<string, Promise<UndervaluedXIResult>>())
  const contextVersionRef = useRef(0)
  const generateRequestSeqRef = useRef(0)

  async function requestUndervaluedXI(targetBudget: string): Promise<UndervaluedXIResult> {
    const cached = prefetchedResultsRef.current.get(targetBudget)
    if (cached) return cached

    const inflight = inflightRequestsRef.current.get(targetBudget)
    if (inflight) return inflight

    const contextVersion = contextVersionRef.current
    const promise = (async () => {
      const res = await fetch('/api/undervalued-xi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget: targetBudget, managerId, managerName, teamName, language }),
      })

      let data: unknown = null
      try {
        data = await res.json()
      } catch {
        data = null
      }

      if (!res.ok) {
        const nextError =
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : t('error.analysisFailed')
        throw new Error(nextError)
      }

      const parsed = data as UndervaluedXIResult
      if (contextVersion === contextVersionRef.current) {
        prefetchedResultsRef.current.set(targetBudget, parsed)
      }
      return parsed
    })()

    inflightRequestsRef.current.set(targetBudget, promise)

    try {
      return await promise
    } finally {
      const current = inflightRequestsRef.current.get(targetBudget)
      if (current === promise) {
        inflightRequestsRef.current.delete(targetBudget)
      }
    }
  }

  useEffect(() => {
    contextVersionRef.current += 1
    prefetchedResultsRef.current.clear()
    inflightRequestsRef.current.clear()
    setResult(null)
    setError(null)
    setLoading(false)
  }, [managerId, managerName, teamName, language])

  useEffect(() => {
    if (!budget || !teamName) return
    if (prefetchedResultsRef.current.has(budget)) return
    if (inflightRequestsRef.current.has(budget)) return

    void requestUndervaluedXI(budget).catch(() => {
      // Silent prewarm: foreground generate still handles user-visible errors.
    })
  }, [budget, managerId, managerName, teamName, language])

  const handleGenerate = async () => {
    if (!budget) return
    const requestSeq = generateRequestSeqRef.current + 1
    generateRequestSeqRef.current = requestSeq
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const nextResult = await requestUndervaluedXI(budget)
      if (generateRequestSeqRef.current !== requestSeq) return
      setResult(nextResult)
    } catch (e) {
      if (generateRequestSeqRef.current !== requestSeq) return
      setError(e instanceof Error ? e.message : t('loading.defaultMessage'))
    } finally {
      if (generateRequestSeqRef.current === requestSeq) {
        setLoading(false)
      }
    }
  }

  const sortedPlayers = result
    ? [...result.players].sort(
        (a, b) => (POSITION_ORDER.indexOf(a.position) ?? 99) - (POSITION_ORDER.indexOf(b.position) ?? 99)
      )
    : []

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-slate-900 dark:text-white font-bold text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          {t('xi.title')}
        </h2>
        <p className="text-slate-500 dark:text-slate-500 text-sm mt-1">
          {t('xi.subtitle', { manager: managerName || t('common.thisSystem') })}
        </p>
      </div>

      {/* Budget selector */}
      <div className="mb-4">
        <p className="text-slate-600 dark:text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">{t('common.totalBudget')}</p>
        <div className="flex flex-wrap gap-2">
          {BUDGETS.map((b) => (
            <button
              key={b}
              onClick={() => setBudget(b)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                budget === b
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={!budget || loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors mb-6"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {t('xi.loadingButton')}
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {result ? t('xi.regenerate') : t('xi.generate')}
          </>
        )}
      </button>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {loading && (
        <LoadingSpinner
          compact
          message={t('xi.loadingTitle')}
          submessage={t('xi.loadingSub')}
          durationHint={t('xi.loadingHint')}
        />
      )}

      {result && (
        <div>
          {/* XI header */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-slate-900 dark:text-white font-bold">{result.formation}</span>
                  <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {result.totalEstimatedCost}
                  </span>
                  {result.budgetStatus === 'over' && result.budgetOverrun && (
                    <span className="bg-red-500/10 border border-red-500/25 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {t('common.overBy', { value: result.budgetOverrun })}
                    </span>
                  )}
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{result.concept}</p>
                {result.budgetStatus === 'over' && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-2">
                    {t('xi.overBudgetHint')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Player grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedPlayers.map((p) => (
              <PlayerCard key={p.playerName} player={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

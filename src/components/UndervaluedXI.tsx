'use client'

import { useState } from 'react'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { UndervaluedXIResult, UndervaluedPlayer } from '@/lib/claude'

const BUDGETS = ['< €50M', '€50–100M', '€100–150M', '€150–200M']

const POSITION_ORDER = ['GK', 'RB', 'CB', 'LB', 'WB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'CF', 'ST']

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 65) return 'text-blue-400'
  if (score >= 50) return 'text-slate-300'
  return 'text-slate-500'
}

function PlayerCard({ player }: { player: UndervaluedPlayer }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-4 flex flex-col gap-2 hover:border-slate-600 transition-colors">
      {/* Position + archetype */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="bg-slate-700 text-slate-300 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
          {player.position}
        </span>
        <span className="text-slate-500 text-[10px] truncate">{player.archetypeLabel}</span>
      </div>

      {/* Name + score */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-white font-semibold text-sm leading-tight">{player.playerName}</span>
        <span className={`text-xs font-bold flex-shrink-0 ${scoreColor(player.scoutScore)}`}>
          SE {player.scoutScore}
        </span>
      </div>

      {/* Age + nationality + club */}
      <div className="text-slate-500 text-xs">
        {player.age} · {player.nationality}
      </div>
      <div className="flex items-center gap-1">
        {player.tmVerified ? (
          <span className="text-slate-400 text-xs">{player.currentClub}</span>
        ) : (
          <a
            href={`https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(player.playerName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-amber-500/70 text-[10px] hover:text-amber-400 transition-colors"
          >
            <TriangleAlert className="w-2.5 h-2.5 flex-shrink-0" />
            Club unverified — check TM
          </a>
        )}
      </div>

      {/* Value + contract */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-emerald-400 font-semibold">{player.estimatedValue}</span>
        {player.contractUntil && player.contractUntil !== 'Unknown' && (
          <span className="text-slate-600">until {player.contractUntil}</span>
        )}
      </div>

      {/* Why undervalued */}
      <p className="text-slate-400 text-xs leading-relaxed border-t border-slate-700/50 pt-2 mt-1">
        {player.whyUndervalued}
      </p>
    </div>
  )
}

interface Props {
  managerId?: string | null
  managerName?: string
  teamName?: string
}

export default function UndervaluedXI({ managerId, managerName, teamName }: Props) {
  const [budget, setBudget] = useState<string>('')
  const [result, setResult] = useState<UndervaluedXIResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!budget) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/undervalued-xi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget, managerId, managerName, teamName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Sort players by formation position order
  const sortedPlayers = result
    ? [...result.players].sort(
        (a, b) => (POSITION_ORDER.indexOf(a.position) ?? 99) - (POSITION_ORDER.indexOf(b.position) ?? 99)
      )
    : []

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-white font-bold text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          Undervalued XI
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          The best tactical XI money {`can't`} buy — hidden gems that fit {managerName || 'this system'} within your budget.
        </p>
      </div>

      {/* Budget selector */}
      <div className="mb-4">
        <p className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">Total Budget</p>
        <div className="flex flex-wrap gap-2">
          {BUDGETS.map((b) => (
            <button
              key={b}
              onClick={() => setBudget(b)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                budget === b
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
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
            Scouting the market…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {result ? 'Regenerate XI' : 'Generate Undervalued XI'}
          </>
        )}
      </button>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div>
          {/* XI header */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 mb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-bold">{result.formation}</span>
                  <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {result.totalEstimatedCost}
                  </span>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">{result.concept}</p>
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

'use client'

import { useState, useEffect, useRef } from 'react'
import { AlertCircle, Wand2, TriangleAlert } from 'lucide-react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { ManagerXIResult, IdealPlayer } from '@/lib/claude'

const BUDGETS = ['€100M', '€200M', '€300M', '€500M', 'Unlimited']

const POSITION_ORDER = ['GK', 'RB', 'CB', 'LB', 'WB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'CF', 'ST']

function fitColor(score: number) {
  if (score >= 90) return 'text-violet-400'
  if (score >= 75) return 'text-blue-400'
  if (score >= 60) return 'text-slate-300'
  return 'text-slate-500'
}

function PlayerCard({ player }: { player: IdealPlayer }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-4 flex flex-col gap-2 hover:border-slate-600 transition-colors">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="bg-violet-500/20 border border-violet-500/30 text-violet-300 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
          {player.position}
        </span>
        <span className="text-slate-500 text-[10px] truncate">{player.archetypeLabel}</span>
      </div>

      <div className="flex items-start justify-between gap-2">
        <span className="text-white font-semibold text-sm leading-tight">{player.playerName}</span>
        <span className={`text-base font-bold flex-shrink-0 ${fitColor(player.systemFitScore)}`}>
          {player.systemFitScore}
        </span>
      </div>

      <div className="text-slate-500 text-xs">{player.age} · {player.nationality}</div>

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

      <div className="text-blue-400 text-xs font-semibold">{player.estimatedFee}</div>

      <p className="text-slate-400 text-xs leading-relaxed border-t border-slate-700/50 pt-2 mt-1">
        {player.whyIdeal}
      </p>
    </div>
  )
}

interface CoachResult {
  id: string
  profileId: string | null
  name: string
  currentClub: string
  hasProfile: boolean
}

export default function BuildPage() {
  const [managerQuery, setManagerQuery] = useState('')
  const [selectedManager, setSelectedManager] = useState<CoachResult | null>(null)
  const [managerSuggestions, setManagerSuggestions] = useState<CoachResult[]>([])
  const [isSearchingManager, setIsSearchingManager] = useState(false)
  const [managerDropdownOpen, setManagerDropdownOpen] = useState(false)
  const managerRef = useRef<HTMLDivElement>(null)
  const managerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [budget, setBudget] = useState('€300M')
  const [result, setResult] = useState<ManagerXIResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (managerRef.current && !managerRef.current.contains(e.target as Node)) setManagerDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleManagerInput = (value: string) => {
    setManagerQuery(value)
    setSelectedManager(null)
    if (managerDebounce.current) clearTimeout(managerDebounce.current)
    if (value.trim().length < 2) { setManagerSuggestions([]); setManagerDropdownOpen(false); return }
    setIsSearchingManager(true)
    setManagerDropdownOpen(true)
    managerDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/managers/search?q=${encodeURIComponent(value.trim())}`)
        const data = await res.json()
        setManagerSuggestions(data.coaches || [])
      } catch { setManagerSuggestions([]) }
      finally { setIsSearchingManager(false) }
    }, 300)
  }

  const handleBuild = async () => {
    if (!managerQuery.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/manager-xi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budget,
          managerId: selectedManager?.profileId || undefined,
          managerName: selectedManager?.profileId ? undefined : managerQuery.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to build')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const sortedPlayers = result
    ? [...result.players].sort(
        (a, b) => (POSITION_ORDER.indexOf(a.position) ?? 99) - (POSITION_ORDER.indexOf(b.position) ?? 99)
      )
    : []

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium px-3 py-1.5 rounded-full mb-4">
          <Wand2 className="w-3 h-3" />
          Manager Identity Mode
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
          Build their dream XI
        </h1>
        <p className="text-slate-400 max-w-xl mx-auto leading-relaxed">
          Pick any manager and a budget. ScoutEdge builds the ideal starting XI for their system — not just good players, but the exact profiles they demand at every position.
        </p>
      </div>

      {/* Form */}
      <div className="max-w-xl mx-auto space-y-4 mb-8">
        {/* Manager search */}
        <div className="relative" ref={managerRef}>
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus-within:border-violet-500/50 transition-colors">
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex-shrink-0" />
            <input
              type="text"
              value={managerQuery}
              onChange={(e) => handleManagerInput(e.target.value)}
              onFocus={() => managerSuggestions.length > 0 && setManagerDropdownOpen(true)}
              onKeyDown={(e) => e.key === 'Enter' && handleBuild()}
              placeholder="Manager name (e.g. Pep Guardiola, Klopp...)"
              className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
            />
            {isSearchingManager && <div className="w-3 h-3 border border-slate-500 border-t-violet-400 rounded-full animate-spin flex-shrink-0" />}
            {selectedManager?.hasProfile && !isSearchingManager && (
              <span className="text-violet-400 text-xs flex-shrink-0">✓ Full profile</span>
            )}
          </div>
          {managerDropdownOpen && (managerSuggestions.length > 0 || isSearchingManager) && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-xl overflow-auto max-h-64 shadow-xl z-20">
              {isSearchingManager && managerSuggestions.length === 0
                ? <div className="px-4 py-3 text-slate-500 text-sm">Searching...</div>
                : managerSuggestions.map((coach) => (
                    <button key={coach.id}
                      onMouseDown={() => { setManagerQuery(coach.name); setSelectedManager(coach); setManagerDropdownOpen(false) }}
                      className="w-full px-4 py-2.5 text-left hover:bg-slate-800 transition-colors text-sm text-white flex items-center justify-between gap-3">
                      <div>
                        <span className="font-medium">{coach.name}</span>
                        <span className="text-slate-500 ml-2 text-xs">{coach.currentClub}</span>
                      </div>
                      {coach.hasProfile && <span className="text-violet-400 text-xs flex-shrink-0">Full profile</span>}
                    </button>
                  ))
              }
            </div>
          )}
        </div>

        {/* Budget */}
        <div>
          <p className="text-slate-400 text-xs font-medium mb-2 uppercase tracking-wider">Budget</p>
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((b) => (
              <button key={b} onClick={() => setBudget(b)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  budget === b
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                }`}>
                {b}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleBuild}
          disabled={!managerQuery.trim() || loading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
        >
          {loading ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Building the XI...</>
          ) : (
            <><Wand2 className="w-4 h-4" />{result ? 'Rebuild XI' : 'Build the XI'}</>
          )}
        </button>
      </div>

      {error && (
        <div className="max-w-xl mx-auto mb-8 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {loading && <LoadingSpinner message="Building the XI..." submessage="Identifying ideal profiles for every position" />}

      {result && !loading && (
        <div className="space-y-5">
          {/* Identity card */}
          <div className="bg-slate-800/60 border border-violet-500/20 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
              <div className="flex items-center gap-3">
                <span className="text-white font-bold text-lg">{result.managerName}</span>
                <span className="text-slate-500 text-sm">{result.formation}</span>
              </div>
              <span className="bg-violet-500/15 border border-violet-500/30 text-violet-400 text-xs font-bold px-2.5 py-1 rounded-full">
                {result.totalEstimatedCost}
              </span>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">{result.identity}</p>
          </div>

          {/* Player grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedPlayers.map((p) => (
              <PlayerCard key={p.playerName} player={p} />
            ))}
          </div>

          {/* System fit legend */}
          <div className="flex items-center gap-4 text-xs text-slate-600 justify-center pt-2">
            <span>System fit score:</span>
            <span className="text-violet-400">90+ Elite</span>
            <span className="text-blue-400">75+ Strong</span>
            <span className="text-slate-400">60+ Good</span>
          </div>
        </div>
      )}

      {/* Examples */}
      {!result && !loading && (
        <div className="max-w-xl mx-auto mt-12">
          <p className="text-slate-600 text-sm text-center mb-4">Try these</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { manager: 'Pep Guardiola',   profileId: 'pep-guardiola',   club: 'Manchester City' },
              { manager: 'Diego Simeone',   profileId: 'diego-simeone',   club: 'Atlético Madrid' },
              { manager: 'Arne Slot',        profileId: 'arne-slot',        club: 'Liverpool' },
              { manager: 'Ruben Amorim',    profileId: 'ruben-amorim',    club: 'Manchester United' },
            ].map(({ manager, profileId, club }) => (
              <button key={manager}
                onClick={() => {
                  setManagerQuery(manager)
                  setSelectedManager({ id: profileId, profileId, name: manager, currentClub: club, hasProfile: true })
                }}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3 text-left transition-colors">
                <p className="text-white text-sm font-medium">{manager}</p>
                <p className="text-slate-500 text-xs">{club}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

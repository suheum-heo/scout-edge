'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, AlertCircle, Zap } from 'lucide-react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { TransferVerdictResult, VerdictLabel } from '@/lib/claude'
import type { TMPlayerData } from '@/lib/transfermarkt'

const VERDICT_CONFIG: Record<VerdictLabel, { bg: string; border: string; text: string; label: string }> = {
  'Do it':       { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', label: 'DO IT' },
  'Consider it': { bg: 'bg-blue-500/15',    border: 'border-blue-500/40',    text: 'text-blue-400',    label: 'CONSIDER IT' },
  'Risky':       { bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   text: 'text-amber-400',   label: 'RISKY' },
  'Avoid':       { bg: 'bg-red-500/15',     border: 'border-red-500/40',     text: 'text-red-400',     label: 'AVOID' },
}

interface Team {
  id: number | string
  name: string
  country: string
  logo: string
  source?: string
  fotmobId?: number
}

interface PlayerResult {
  id: string
  name: string
  position: string
  club: string
}

const EXAMPLES: { player: string; team: Team }[] = [
  { player: 'Victor Osimhen',   team: { id: 61,  fotmobId: 8455, name: 'Chelsea',       country: 'England', logo: 'https://crests.football-data.org/61.png',  source: 'fd' } },
  { player: 'Alexander Isak',   team: { id: 65,  fotmobId: 8456, name: 'Manchester City',country: 'England', logo: 'https://crests.football-data.org/65.png',  source: 'fd' } },
  { player: 'Jamal Musiala',    team: { id: 57,  fotmobId: 9825, name: 'Arsenal',        country: 'England', logo: 'https://crests.football-data.org/57.png',  source: 'fd' } },
  { player: 'Jonathan David',   team: { id: 86,  fotmobId: 8633, name: 'Real Madrid',    country: 'Spain',   logo: 'https://crests.football-data.org/86.png',  source: 'fd' } },
]

export default function VerdictPage() {
  // Player search
  const [playerQuery, setPlayerQuery] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null)
  const [playerSuggestions, setPlayerSuggestions] = useState<PlayerResult[]>([])
  const [isSearchingPlayer, setIsSearchingPlayer] = useState(false)
  const [playerDropdownOpen, setPlayerDropdownOpen] = useState(false)
  const playerRef = useRef<HTMLDivElement>(null)
  const playerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Club search
  const [clubQuery, setClubQuery] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [clubSuggestions, setClubSuggestions] = useState<Team[]>([])
  const [isSearchingClub, setIsSearchingClub] = useState(false)
  const [clubDropdownOpen, setClubDropdownOpen] = useState(false)
  const clubRef = useRef<HTMLDivElement>(null)
  const clubDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isChecking, setIsChecking] = useState(false)
  const [result, setResult] = useState<TransferVerdictResult | null>(null)
  const [tmPlayer, setTmPlayer] = useState<TMPlayerData | null>(null)
  const [detectedManager, setDetectedManager] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/teams?q=united').catch(() => {})
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (playerRef.current && !playerRef.current.contains(e.target as Node)) setPlayerDropdownOpen(false)
      if (clubRef.current && !clubRef.current.contains(e.target as Node)) setClubDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handlePlayerInput = (value: string) => {
    setPlayerQuery(value)
    setSelectedPlayer(null)
    if (playerDebounce.current) clearTimeout(playerDebounce.current)
    if (value.trim().length < 2) { setPlayerSuggestions([]); setPlayerDropdownOpen(false); return }
    setIsSearchingPlayer(true)
    setPlayerDropdownOpen(true)
    playerDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(value.trim())}`)
        const data = await res.json()
        setPlayerSuggestions(data.players || [])
      } catch { setPlayerSuggestions([]) }
      finally { setIsSearchingPlayer(false) }
    }, 300)
  }

  const handleClubInput = (value: string) => {
    setClubQuery(value)
    setSelectedTeam(null)
    if (clubDebounce.current) clearTimeout(clubDebounce.current)
    if (value.trim().length < 2) { setClubSuggestions([]); setClubDropdownOpen(false); return }
    setIsSearchingClub(true)
    setClubDropdownOpen(true)
    clubDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/teams?q=${encodeURIComponent(value.trim())}`)
        const data = await res.json()
        setClubSuggestions((data.teams || []).map((t: { team: Team }) => t.team))
      } catch { setClubSuggestions([]) }
      finally { setIsSearchingClub(false) }
    }, 300)
  }

  const handleCheck = async (overridePlayer?: string, overrideTeam?: Team) => {
    const resolvedPlayerName = overridePlayer ?? (selectedPlayer?.name || playerQuery.trim())
    const resolvedTeam = overrideTeam ?? selectedTeam
    if (!resolvedPlayerName || !resolvedTeam) return
    setIsChecking(true)
    setError(null)
    setResult(null)
    setTmPlayer(null)
    setDetectedManager(null)

    try {
      const res = await fetch('/api/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: resolvedPlayerName,
          tmPlayerId: overridePlayer ? undefined : selectedPlayer?.id,
          teamId: resolvedTeam.id,
          teamName: resolvedTeam.name,
          teamSource: resolvedTeam.source,
          fotmobId: resolvedTeam.fotmobId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      setResult(data.verdict)
      setTmPlayer(data.player || null)
      setDetectedManager(data.detectedManager || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setIsChecking(false)
    }
  }

  const cfg = result ? VERDICT_CONFIG[result.verdictLabel] : null

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium px-3 py-1.5 rounded-full mb-4">
          <Zap className="w-3 h-3" />
          Transfer Verdict
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
          Should they sign him?
        </h1>
        <p className="text-slate-400 max-w-xl mx-auto leading-relaxed">
          Any player, any club — rumour, hypothetical, or wishlist. We detect the manager and give you an instant scout verdict.
        </p>
      </div>

      {/* Form */}
      <div className="max-w-xl mx-auto space-y-3 mb-8">
        {/* Player */}
        <div className="relative" ref={playerRef}>
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus-within:border-amber-500/50 transition-colors">
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex-shrink-0" />
            <input
              type="text"
              value={playerQuery}
              onChange={(e) => handlePlayerInput(e.target.value)}
              onFocus={() => playerSuggestions.length > 0 && setPlayerDropdownOpen(true)}
              onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
              placeholder="Player name (e.g. Victor Osimhen)"
              className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
            />
            {isSearchingPlayer && <div className="w-3 h-3 border border-slate-500 border-t-green-400 rounded-full animate-spin flex-shrink-0" />}
            {selectedPlayer && !isSearchingPlayer && <span className="text-green-400 text-xs flex-shrink-0">&#10003;</span>}
          </div>
          {playerDropdownOpen && (playerSuggestions.length > 0 || isSearchingPlayer) && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-xl overflow-auto max-h-64 shadow-xl z-20">
              {isSearchingPlayer && playerSuggestions.length === 0
                ? <div className="px-4 py-3 text-slate-500 text-sm">Searching...</div>
                : playerSuggestions.map((p) => (
                    <button key={p.id} onMouseDown={() => { setPlayerQuery(p.name); setSelectedPlayer(p); setPlayerDropdownOpen(false) }}
                      className="w-full px-4 py-2.5 text-left hover:bg-slate-800 transition-colors text-sm text-white flex items-center justify-between gap-3">
                      <div><span className="font-medium">{p.name}</span><span className="text-slate-500 ml-2 text-xs">{p.club}</span></div>
                      <span className="text-slate-500 text-xs flex-shrink-0">{p.position}</span>
                    </button>
                  ))
              }
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-slate-600">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs">to</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Club */}
        <div className="relative" ref={clubRef}>
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus-within:border-amber-500/50 transition-colors">
            <Search className="w-4 h-4 text-slate-600 flex-shrink-0" />
            <input
              type="text"
              value={clubQuery}
              onChange={(e) => handleClubInput(e.target.value)}
              onFocus={() => clubSuggestions.length > 0 && setClubDropdownOpen(true)}
              onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
              placeholder="Target club (e.g. Arsenal)"
              className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
            />
            {isSearchingClub && <div className="w-3 h-3 border border-slate-600 border-t-slate-400 rounded-full animate-spin flex-shrink-0" />}
            {selectedTeam && !isSearchingClub && <span className="text-amber-400 text-xs flex-shrink-0">&#10003; {selectedTeam.name}</span>}
          </div>
          {clubDropdownOpen && (clubSuggestions.length > 0 || isSearchingClub) && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-xl overflow-auto max-h-48 shadow-xl z-20">
              {isSearchingClub && clubSuggestions.length === 0
                ? <div className="px-4 py-3 text-slate-500 text-sm">Searching...</div>
                : clubSuggestions.map((club) => (
                    <button key={club.id} onMouseDown={() => { setClubQuery(club.name); setSelectedTeam(club); setClubDropdownOpen(false); setClubSuggestions([]) }}
                      className="w-full px-4 py-2.5 text-left hover:bg-slate-800 transition-colors text-sm text-white flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {club.logo && <img src={club.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />}
                      <span className="font-medium">{club.name}</span>
                      <span className="text-slate-500 text-xs ml-auto">{club.country}</span>
                    </button>
                  ))
              }
            </div>
          )}
        </div>

        <button
          onClick={() => handleCheck()}
          disabled={!playerQuery.trim() || !selectedTeam || isChecking}
          className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm disabled:cursor-not-allowed"
        >
          {isChecking ? 'Running scout analysis...' : 'Get Verdict'}
        </button>
      </div>

      {error && (
        <div className="max-w-xl mx-auto mb-8 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {isChecking && <LoadingSpinner message="Running scout analysis..." submessage="Fetching player data and analysing tactical fit" />}

      {result && cfg && !isChecking && (
        <div className="space-y-4 max-w-2xl mx-auto">
          {/* Player bar */}
          {tmPlayer && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {tmPlayer.imageUrl
                    ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tmPlayer.imageUrl} alt={tmPlayer.name} className="w-12 h-12 rounded-full object-cover bg-slate-700 flex-shrink-0" />
                      )
                    : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{result.playerName.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
                  }
                  <div>
                    <p className="text-white font-semibold">{tmPlayer.name}</p>
                    <p className="text-slate-400 text-sm">{tmPlayer.currentClub}</p>
                    <p className="text-slate-500 text-xs">{tmPlayer.position} · Age {tmPlayer.age} · {tmPlayer.nationality}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-center"><p className="text-white font-bold text-sm">{tmPlayer.goals}</p><p className="text-slate-500 text-xs">Goals</p></div>
                  <div className="text-center"><p className="text-white font-bold text-sm">{tmPlayer.assists}</p><p className="text-slate-500 text-xs">Assists</p></div>
                  <div className="text-center"><p className="text-white font-bold text-sm">{tmPlayer.appearances}</p><p className="text-slate-500 text-xs">Apps</p></div>
                  <div className="text-center"><p className="text-blue-400 font-bold text-sm">{tmPlayer.marketValueFormatted}</p><p className="text-slate-500 text-xs">Value</p></div>
                  <div className="text-center"><p className="text-slate-300 font-bold text-sm">{tmPlayer.contractYear}</p><p className="text-slate-500 text-xs">Contract</p></div>
                </div>
              </div>
            </div>
          )}

          {/* Verdict banner */}
          <div className={`${cfg.bg} border ${cfg.border} rounded-xl p-5`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-3xl font-black tracking-tight ${cfg.text}`}>{cfg.label}</span>
                  <span className="text-slate-400 text-sm font-medium">{result.fitScore}/10 tactical fit</span>
                </div>
                <p className="text-white font-medium leading-snug">{result.headline}</p>
                {detectedManager && (
                  <p className="text-slate-500 text-xs mt-1.5">Manager detected: {detectedManager}</p>
                )}
              </div>
            </div>
          </div>

          {/* Why it works / doesn't */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.whyItWorks.length > 0 && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
                <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">Why it works</p>
                <ul className="space-y-2">
                  {result.whyItWorks.map((w, i) => (
                    <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5 flex-shrink-0">+</span>{w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.whyItDoesnt.length > 0 && (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
                <p className="text-red-400 text-xs font-semibold uppercase tracking-wider mb-3">Concerns</p>
                <ul className="space-y-2">
                  {result.whyItDoesnt.map((w, i) => (
                    <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                      <span className="text-red-400 mt-0.5 flex-shrink-0">&#8722;</span>{w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Role in system</p>
              <p className="text-slate-300 text-sm">{result.roleInSystem}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-700/50">
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Need</p>
                <p className="text-slate-300 text-xs leading-relaxed">{result.needAssessment}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Value</p>
                <p className="text-slate-300 text-xs leading-relaxed">{result.valueAssessment}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-0.5">Timing</p>
                <p className="text-slate-300 text-xs leading-relaxed">{result.timing}</p>
              </div>
            </div>
          </div>

          {/* Scout verdict */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-2">Scout verdict</p>
            <p className="text-slate-300 text-sm leading-relaxed italic">&ldquo;{result.scoutVerdict}&rdquo;</p>
          </div>

          {/* Try another */}
          <div className="pt-2 text-center">
            <button onClick={() => { setResult(null); setTmPlayer(null); setPlayerQuery(''); setSelectedPlayer(null); setClubQuery(''); setSelectedTeam(null) }}
              className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
              Check another &#8594;
            </button>
          </div>
        </div>
      )}

      {/* Examples */}
      {!result && !isChecking && (
        <div className="max-w-xl mx-auto mt-12">
          <p className="text-slate-600 text-sm text-center mb-4">Try these hypotheticals</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXAMPLES.map(({ player, team }) => (
              <button key={player + team.name}
                onClick={() => {
                  setPlayerQuery(player)
                  setSelectedPlayer(null)
                  setClubQuery(team.name)
                  setSelectedTeam(team)
                  handleCheck(player, team)
                }}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3 text-left transition-colors">
                <p className="text-white text-sm font-medium">{player}</p>
                <p className="text-slate-500 text-xs">&#8594; {team.name}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

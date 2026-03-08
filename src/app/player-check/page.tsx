'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, AlertCircle, GitCompare } from 'lucide-react'
import CompatibilityReport from '@/components/CompatibilityReport'
import LoadingSpinner from '@/components/LoadingSpinner'
import { PlayerCompatibilityResult } from '@/lib/claude'
import type { TMPlayerData } from '@/lib/transfermarkt'

interface CoachResult {
  id: string
  profileId: string | null
  name: string
  currentClub: string
  formations: string[]
  hasProfile: boolean
}

interface PlayerResult {
  id: string
  name: string
  position: string
  club: string
  nationality: string
}

export default function PlayerCheckPage() {
  // Target club search
  const [clubQuery, setClubQuery] = useState('')
  const [clubSuggestions, setClubSuggestions] = useState<Array<{ id: number; name: string; country: string; logo: string }>>([])
  const [isSearchingClub, setIsSearchingClub] = useState(false)
  const [clubDropdownOpen, setClubDropdownOpen] = useState(false)
  const clubRef = useRef<HTMLDivElement>(null)
  const clubDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Player search
  const [playerQuery, setPlayerQuery] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null)
  const [playerSuggestions, setPlayerSuggestions] = useState<PlayerResult[]>([])
  const [isSearchingPlayer, setIsSearchingPlayer] = useState(false)
  const [playerDropdownOpen, setPlayerDropdownOpen] = useState(false)
  const playerRef = useRef<HTMLDivElement>(null)
  const playerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Manager search
  const [managerQuery, setManagerQuery] = useState('')
  const [selectedManager, setSelectedManager] = useState<CoachResult | null>(null)
  const [managerSuggestions, setManagerSuggestions] = useState<CoachResult[]>([])
  const [isSearchingManager, setIsSearchingManager] = useState(false)
  const [managerDropdownOpen, setManagerDropdownOpen] = useState(false)
  const managerRef = useRef<HTMLDivElement>(null)
  const managerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isChecking, setIsChecking] = useState(false)
  const [result, setResult] = useState<PlayerCompatibilityResult | null>(null)
  const [tmPlayer, setTmPlayer] = useState<TMPlayerData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (playerRef.current && !playerRef.current.contains(e.target as Node)) setPlayerDropdownOpen(false)
      if (managerRef.current && !managerRef.current.contains(e.target as Node)) setManagerDropdownOpen(false)
      if (clubRef.current && !clubRef.current.contains(e.target as Node)) setClubDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Pre-warm the team cache on page load
  useEffect(() => {
    fetch('/api/teams?q=united').catch(() => {})
  }, [])

  const handleClubInput = (value: string) => {
    setClubQuery(value)
    if (clubDebounceRef.current) clearTimeout(clubDebounceRef.current)
    if (value.trim().length < 2) {
      setClubSuggestions([])
      setClubDropdownOpen(false)
      return
    }
    setIsSearchingClub(true)
    setClubDropdownOpen(true)
    clubDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/teams?q=${encodeURIComponent(value.trim())}`)
        const data = await res.json()
        setClubSuggestions((data.teams || []).map((t: { team: { id: number; name: string; country: string; logo: string } }) => t.team))
      } catch {
        setClubSuggestions([])
      } finally {
        setIsSearchingClub(false)
      }
    }, 300)
  }

  const handlePlayerInput = (value: string) => {
    setPlayerQuery(value)
    setSelectedPlayer(null)

    if (playerDebounceRef.current) clearTimeout(playerDebounceRef.current)

    if (value.trim().length < 2) {
      setPlayerSuggestions([])
      setPlayerDropdownOpen(false)
      return
    }

    setIsSearchingPlayer(true)
    setPlayerDropdownOpen(true)

    playerDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(value.trim())}`)
        const data = await res.json()
        setPlayerSuggestions(data.players || [])
      } catch {
        setPlayerSuggestions([])
      } finally {
        setIsSearchingPlayer(false)
      }
    }, 300)
  }

  const handleSelectPlayer = (player: PlayerResult) => {
    setPlayerQuery(player.name)
    setSelectedPlayer(player)
    setPlayerDropdownOpen(false)
    setPlayerSuggestions([])
  }

  const handleManagerInput = (value: string) => {
    setManagerQuery(value)
    setSelectedManager(null)

    if (managerDebounceRef.current) clearTimeout(managerDebounceRef.current)

    if (value.trim().length < 2) {
      setManagerSuggestions([])
      setManagerDropdownOpen(false)
      return
    }

    setIsSearchingManager(true)
    setManagerDropdownOpen(true)

    managerDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/managers/search?q=${encodeURIComponent(value.trim())}`)
        const data = await res.json()
        setManagerSuggestions(data.coaches || [])
      } catch {
        setManagerSuggestions([])
      } finally {
        setIsSearchingManager(false)
      }
    }, 300)
  }

  const handleSelectManager = (coach: CoachResult) => {
    setManagerQuery(coach.name)
    setSelectedManager(coach)
    setManagerDropdownOpen(false)
    setManagerSuggestions([])
  }

  const handleCheck = async () => {
    if (!playerQuery.trim() || !managerQuery.trim()) return

    setIsChecking(true)
    setError(null)
    setResult(null)
    setTmPlayer(null)

    // Use canonical name from typeahead selection if available, else raw query
    const resolvedPlayerName = selectedPlayer?.name || playerQuery.trim()

    try {
      const res = await fetch('/api/player-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: resolvedPlayerName,
          tmPlayerId: selectedPlayer?.id || undefined,
          managerId: selectedManager?.profileId || undefined,
          managerName: selectedManager?.profileId ? undefined : managerQuery.trim(),
          targetTeam: clubQuery.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Analysis failed')
        return
      }

      setResult(data.compatibility)
      setTmPlayer(data.player || null)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium px-3 py-1.5 rounded-full mb-4">
          <GitCompare className="w-3 h-3" />
          Player Compatibility
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
          Does this player fit?
        </h1>
        <p className="text-slate-400 max-w-xl mx-auto leading-relaxed">
          Enter any player&apos;s name and select a manager to get a detailed tactical compatibility
          report — including role, fit score, strengths, concerns, and scout comparison.
        </p>
      </div>

      {/* Form */}
      <div className="max-w-xl mx-auto space-y-4 mb-8">
        {/* Player live search */}
        <div className="relative" ref={playerRef}>
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus-within:border-purple-500/50 transition-colors">
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex-shrink-0" />
            <input
              type="text"
              value={playerQuery}
              onChange={(e) => handlePlayerInput(e.target.value)}
              onFocus={() => playerSuggestions.length > 0 && setPlayerDropdownOpen(true)}
              onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
              placeholder="Player name (e.g. Micky van de Ven)"
              className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
            />
            {isSearchingPlayer && (
              <div className="w-3 h-3 border border-slate-500 border-t-green-400 rounded-full animate-spin flex-shrink-0" />
            )}
            {selectedPlayer && !isSearchingPlayer && (
              <span className="text-green-400 text-xs flex-shrink-0">✓ Found</span>
            )}
          </div>

          {playerDropdownOpen && (playerSuggestions.length > 0 || isSearchingPlayer) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl overflow-auto max-h-64 shadow-xl z-20">
              {isSearchingPlayer && playerSuggestions.length === 0 ? (
                <div className="px-4 py-3 text-slate-500 text-sm">Searching...</div>
              ) : (
                playerSuggestions.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => handleSelectPlayer(player)}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-800 transition-colors text-sm text-white flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-medium">{player.name}</span>
                      <span className="text-slate-500 ml-2 text-xs">{player.club}</span>
                    </div>
                    <span className="text-slate-500 text-xs flex-shrink-0">{player.position}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Manager live search */}
        <div className="relative" ref={managerRef}>
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus-within:border-purple-500/50 transition-colors">
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex-shrink-0" />
            <input
              type="text"
              value={managerQuery}
              onChange={(e) => handleManagerInput(e.target.value)}
              onFocus={() => managerSuggestions.length > 0 && setManagerDropdownOpen(true)}
              onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
              placeholder="Manager name (e.g. Klopp, Vitor Pereira...)"
              className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
            />
            {isSearchingManager && (
              <div className="w-3 h-3 border border-slate-500 border-t-purple-400 rounded-full animate-spin flex-shrink-0" />
            )}
            {selectedManager?.hasProfile && !isSearchingManager && (
              <span className="text-purple-400 text-xs flex-shrink-0">✓ Full profile</span>
            )}
          </div>

          {managerDropdownOpen && (managerSuggestions.length > 0 || isSearchingManager) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl overflow-auto max-h-64 shadow-xl z-20">
              {isSearchingManager && managerSuggestions.length === 0 ? (
                <div className="px-4 py-3 text-slate-500 text-sm">Searching...</div>
              ) : (
                managerSuggestions.map((coach) => (
                  <button
                    key={coach.id}
                    onClick={() => handleSelectManager(coach)}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-800 transition-colors text-sm text-white flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="font-medium">{coach.name}</span>
                      <span className="text-slate-500 ml-2 text-xs">{coach.currentClub}</span>
                    </div>
                    {coach.hasProfile && (
                      <span className="text-purple-400 text-xs flex-shrink-0">Full profile</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Optional target club with typeahead */}
        <div className="relative" ref={clubRef}>
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus-within:border-slate-600 transition-colors">
            <Search className="w-4 h-4 text-slate-600 flex-shrink-0" />
            <input
              type="text"
              value={clubQuery}
              onChange={(e) => handleClubInput(e.target.value)}
              onFocus={() => clubSuggestions.length > 0 && setClubDropdownOpen(true)}
              onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
              placeholder="Target club (optional — e.g. Arsenal)"
              className="flex-1 bg-transparent text-white placeholder-slate-600 outline-none text-sm"
            />
            {isSearchingClub && (
              <div className="w-3 h-3 border border-slate-600 border-t-slate-400 rounded-full animate-spin flex-shrink-0" />
            )}
          </div>

          {clubDropdownOpen && (clubSuggestions.length > 0 || isSearchingClub) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl overflow-auto max-h-48 shadow-xl z-20">
              {isSearchingClub && clubSuggestions.length === 0 ? (
                <div className="px-4 py-3 text-slate-500 text-sm">Searching...</div>
              ) : (
                clubSuggestions.map((club) => (
                  <button
                    key={club.id}
                    onClick={() => { setClubQuery(club.name); setClubDropdownOpen(false); setClubSuggestions([]) }}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-800 transition-colors text-sm text-white flex items-center gap-3"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {club.logo && <img src={club.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />}
                    <span className="font-medium">{club.name}</span>
                    <span className="text-slate-500 text-xs ml-auto">{club.country}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleCheck}
          disabled={!playerQuery.trim() || !managerQuery.trim() || isChecking}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm disabled:cursor-not-allowed"
        >
          {isChecking ? 'Analyzing compatibility...' : 'Check Compatibility'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-xl mx-auto mb-8 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {isChecking && (
        <LoadingSpinner
          message="Running scout analysis..."
          submessage="Fetching player stats and analyzing tactical compatibility"
        />
      )}

      {/* Results */}
      {result && !isChecking && (
        <div className="space-y-6">
          {/* Player info bar */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                {tmPlayer?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tmPlayer.imageUrl} alt={tmPlayer.name} className="w-12 h-12 rounded-full object-cover bg-slate-700 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {result.playerName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                )}
                <div>
                  <p className="text-white font-semibold">{result.playerName}</p>
                  <p className="text-slate-400 text-sm">{tmPlayer?.currentClub || result.currentClub || '—'}</p>
                  <p className="text-slate-500 text-xs">
                    {tmPlayer?.position || result.position}
                    {(tmPlayer?.age || result.age) ? ` · Age ${tmPlayer?.age || result.age}` : ''}
                    {(tmPlayer?.nationality || result.nationality) ? ` · ${tmPlayer?.nationality || result.nationality}` : ''}
                  </p>
                </div>
              </div>

              {tmPlayer && (
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-center">
                    <p className="text-white font-bold text-sm">{tmPlayer.goals}</p>
                    <p className="text-slate-500 text-xs">Goals</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold text-sm">{tmPlayer.assists}</p>
                    <p className="text-slate-500 text-xs">Assists</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold text-sm">{tmPlayer.appearances}</p>
                    <p className="text-slate-500 text-xs">Apps</p>
                  </div>
                  <div className="text-center">
                    <p className="text-blue-400 font-bold text-sm">{tmPlayer.marketValueFormatted}</p>
                    <p className="text-slate-500 text-xs">Value</p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-300 font-bold text-sm">{tmPlayer.contractYear}</p>
                    <p className="text-slate-500 text-xs">Contract</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <CompatibilityReport result={result} />
        </div>
      )}

      {/* Examples */}
      {!result && !isChecking && (
        <div className="max-w-xl mx-auto mt-12">
          <p className="text-slate-600 text-sm text-center mb-4">Try these examples</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { player: 'Bukayo Saka', manager: 'Mikel Arteta', profileId: 'mikel-arteta' },
              { player: 'Erling Haaland', manager: 'Diego Simeone', profileId: 'diego-simeone' },
              { player: 'Rodri', manager: 'Arne Slot', profileId: 'arne-slot' },
              { player: 'Lamine Yamal', manager: 'Pep Guardiola', profileId: 'pep-guardiola' },
            ].map(({ player, manager, profileId }) => (
              <button
                key={player + manager}
                onClick={() => {
                  setPlayerQuery(player)
                  setSelectedPlayer(null) // no TM id for examples — will search on submit
                  setManagerQuery(manager)
                  setSelectedManager({ id: profileId, profileId, name: manager, currentClub: '', formations: [], hasProfile: true })
                }}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3 text-left transition-colors"
              >
                <p className="text-white text-sm font-medium">{player}</p>
                <p className="text-slate-500 text-xs">→ {manager}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

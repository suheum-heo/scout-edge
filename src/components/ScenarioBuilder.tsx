'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ScenarioOutPlayer, ScenarioInPlayer, TransferTarget } from '@/lib/claude'
import type { SquadPlayer } from '@/lib/role-profiles'
import { Plus, X, Play, Search } from 'lucide-react'

interface PlayerSuggestion {
  id: string
  name: string
  position: string
  club: string
  nationality: string
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

interface Props {
  squad: SquadPlayer[]
  recommendations: TransferTarget[]
  onRun: (out: ScenarioOutPlayer[], inn: ScenarioInPlayer[]) => void
  isLoading: boolean
}

type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT'

function positionGroup(pos: string): PositionGroup {
  const p = pos.toLowerCase()
  if (p.includes('goalkeeper') || p === 'gk') return 'GK'
  if (p.includes('back') || p.includes('defender') || p.includes('cb') || p.includes('lb') || p.includes('rb')) return 'DEF'
  if (p.includes('mid') || p.includes('winger') || p.includes('wing')) return 'MID'
  return 'ATT'
}

const GROUP_ORDER: PositionGroup[] = ['GK', 'DEF', 'MID', 'ATT']
const GROUP_LABELS: Record<PositionGroup, string> = { GK: 'GK', DEF: 'Defenders', MID: 'Midfielders', ATT: 'Attackers' }

const POSITIONS = ['Goalkeeper', 'Right Back', 'Left Back', 'Centre Back', 'Defensive Mid', 'Central Mid', 'Attacking Mid', 'Right Wing', 'Left Wing', 'Striker']

export default function ScenarioBuilder({ squad, recommendations, onRun, isLoading }: Props) {
  const [outIds, setOutIds] = useState<Set<string>>(new Set())
  const [inList, setInList] = useState<ScenarioInPlayer[]>([])
  const [inName, setInName] = useState('')
  const [inPosition, setInPosition] = useState('Striker')
  const [inAge, setInAge] = useState('')
  const [showRecPicker, setShowRecPicker] = useState(false)

  // Player search state
  const [suggestions, setSuggestions] = useState<PlayerSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleNameChange = useCallback((value: string) => {
    const titled = toTitleCase(value)
    setInName(titled)
    setShowDropdown(true)

    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (titled.length < 2) { setSuggestions([]); return }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(titled)}`)
        const data = await res.json()
        setSuggestions(data.players || [])
      } catch {
        setSuggestions([])
      } finally {
        setIsSearching(false)
      }
    }, 300)
  }, [])

  const pickSuggestion = (p: PlayerSuggestion) => {
    setInName(p.name)
    setInPosition(p.position || inPosition)
    setSuggestions([])
    setShowDropdown(false)
  }

  const toggleOut = (p: SquadPlayer) => {
    setOutIds((prev) => {
      const next = new Set(prev)
      next.has(p.playerId) ? next.delete(p.playerId) : next.add(p.playerId)
      return next
    })
  }

  const addInPlayer = () => {
    if (!inName.trim()) return
    setInList((prev) => [...prev, {
      name: toTitleCase(inName.trim()),
      position: inPosition,
      age: parseInt(inAge) || 25,
      fromRecommendations: false,
    }])
    setInName('')
    setInAge('')
    setSuggestions([])
  }

  const addFromRec = (rec: TransferTarget) => {
    setInList((prev) => [...prev, {
      name: rec.playerName,
      position: rec.position,
      age: rec.age,
      fromRecommendations: true,
    }])
    setShowRecPicker(false)
  }

  const removeIn = (i: number) => setInList((prev) => prev.filter((_, idx) => idx !== i))

  const handleRun = () => {
    const playersOut: ScenarioOutPlayer[] = squad
      .filter((p) => outIds.has(p.playerId))
      .map((p) => ({ playerId: p.playerId, name: p.name, position: p.position, age: p.age }))
    onRun(playersOut, inList)
  }

  // Group squad by position
  const grouped = GROUP_ORDER.reduce((acc, g) => {
    acc[g] = squad.filter((p) => positionGroup(p.position) === g)
    return acc
  }, {} as Record<PositionGroup, SquadPlayer[]>)

  const canRun = (outIds.size > 0 || inList.length > 0) && !isLoading

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* OUT — squad selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-300 text-sm font-semibold">Players OUT</span>
            {outIds.size > 0 && (
              <span className="text-red-400 text-xs">{outIds.size} selected</span>
            )}
          </div>
          <div className="border border-slate-700 rounded-lg overflow-hidden">
            {GROUP_ORDER.map((g) => grouped[g].length > 0 && (
              <div key={g}>
                <div className="px-3 py-1 bg-slate-800/80 border-b border-slate-700/50">
                  <span className="text-slate-500 text-[10px] uppercase tracking-widest">{GROUP_LABELS[g]}</span>
                </div>
                {grouped[g].map((p) => {
                  const selected = outIds.has(p.playerId)
                  return (
                    <button
                      key={p.playerId}
                      onClick={() => toggleOut(p)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left border-b border-slate-700/30 last:border-0 transition-colors ${
                        selected
                          ? 'bg-red-500/10 text-red-300'
                          : 'hover:bg-slate-700/30 text-slate-300'
                      }`}
                    >
                      <span className="text-xs">{p.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 text-[10px]">Age {p.age}</span>
                        {selected && <X className="w-3 h-3 text-red-400" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* IN — player form */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-300 text-sm font-semibold">Players IN</span>
            {inList.length > 0 && (
              <span className="text-emerald-400 text-xs">{inList.length} added</span>
            )}
          </div>

          {/* Added players */}
          {inList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {inList.map((p, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                >
                  {p.name}
                  <button onClick={() => removeIn(i)} className="hover:text-white transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add form */}
          <div className="space-y-2 border border-slate-700 rounded-lg p-3">
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={inName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addInPlayer()}
                  onFocus={() => inName.length >= 2 && setShowDropdown(true)}
                  placeholder="Player name"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-8 pr-3 py-2 text-white text-xs placeholder-slate-500 outline-none focus:border-slate-400"
                />
                {isSearching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border border-slate-400/40 border-t-slate-300 rounded-full animate-spin" />
                )}
              </div>

              {/* Suggestions dropdown */}
              {showDropdown && suggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                  {suggestions.map((p) => (
                    <button
                      key={p.id}
                      onMouseDown={(e) => { e.preventDefault(); pickSuggestion(p) }}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700 transition-colors text-left border-b border-slate-700/50 last:border-0"
                    >
                      <div>
                        <span className="text-white text-xs font-medium">{p.name}</span>
                        <span className="text-slate-500 text-[10px] ml-2">{p.club}</span>
                      </div>
                      <span className="text-slate-500 text-[10px] flex-shrink-0">{p.position}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={inPosition}
                onChange={(e) => setInPosition(e.target.value)}
                className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-slate-400"
              >
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
              <input
                type="number"
                value={inAge}
                onChange={(e) => setInAge(e.target.value)}
                placeholder="Age (25)"
                min={16}
                max={45}
                className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs placeholder-slate-500 outline-none focus:border-slate-400"
              />
            </div>
            <button
              onClick={addInPlayer}
              disabled={!inName.trim()}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-600 text-slate-300 text-xs hover:border-slate-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              Add player
            </button>

            {/* Pick from recommendations shortcut */}
            {recommendations.length > 0 && (
              <div className="pt-1 border-t border-slate-700/50">
                <button
                  onClick={() => setShowRecPicker(!showRecPicker)}
                  className="text-blue-400/80 text-[11px] hover:text-blue-300 transition-colors"
                >
                  Pick from recommendations ({recommendations.length})
                </button>
                {showRecPicker && (
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {recommendations.map((rec, i) => (
                      <button
                        key={i}
                        onClick={() => addFromRec(rec)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-700/50 transition-colors text-left"
                      >
                        <span className="text-slate-300 text-xs">{rec.playerName}</span>
                        <span className="text-slate-500 text-[10px]">{rec.position} · Age {rec.age}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={!canRun}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-sm transition-colors disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Analysing scenario…
          </span>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Run Scenario
          </>
        )}
      </button>
    </div>
  )
}

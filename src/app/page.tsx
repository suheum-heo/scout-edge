'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, Zap, AlertCircle, ChevronDown, Settings2 } from 'lucide-react'
import GapCard from '@/components/GapCard'
import TransferTargetCard from '@/components/TransferTargetCard'
import LoadingSpinner from '@/components/LoadingSpinner'
import { SquadAnalysisResult, SquadGap, TransferTarget } from '@/lib/claude'
import { getScoreColor } from '@/lib/utils'

interface Team {
  team: { id: number; name: string; country: string; logo: string; source?: 'af' | 'fotmob'; fotmobId?: number }
  venue: { name: string; city: string }
}

interface Manager {
  id: string
  name: string
  formations: string[]
}

interface ManagerResult {
  id: string | null
  name: string
  currentClub: string
  formations: string[]
  style: Record<string, string> | null
  tacticalSummary: string | null
  keyPrinciples: string[]
}

export default function HomePage() {
  const [teamQuery, setTeamQuery] = useState('')
  const [teamResults, setTeamResults] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Manager override (secondary, collapsed by default)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [managers, setManagers] = useState<Manager[]>([])
  const [selectedManagerId, setSelectedManagerId] = useState<string>('')
  const [managerDropdownOpen, setManagerDropdownOpen] = useState(false)

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<SquadAnalysisResult | null>(null)
  const [managerResult, setManagerResult] = useState<ManagerResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [selectedGap, setSelectedGap] = useState<SquadGap | null>(null)
  const [selectedBudget, setSelectedBudget] = useState<string>('')
  const [recommendations, setRecommendations] = useState<TransferTarget[]>([])
  const [isLoadingRecs, setIsLoadingRecs] = useState(false)
  const [recsError, setRecsError] = useState<string | null>(null)

  const searchTimeout = useRef<NodeJS.Timeout | null>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const recsRef = useRef<HTMLDivElement>(null)

  const loadManagers = useCallback(async () => {
    if (managers.length > 0) return
    try {
      const res = await fetch('/api/managers')
      const data = await res.json()
      setManagers(data.managers || [])
    } catch {
      // silently fail
    }
  }, [managers.length])

  // Pre-warm the team cache on page load so first search is fast
  useEffect(() => {
    fetch('/api/teams?q=united').catch(() => {})
  }, [])

  const handleTeamSearch = useCallback((value: string) => {
    setTeamQuery(value)
    setSelectedTeam(null)

    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (searchAbort.current) searchAbort.current.abort()
    if (value.length < 2) {
      setTeamResults([])
      return
    }

    searchTimeout.current = setTimeout(async () => {
      const controller = new AbortController()
      searchAbort.current = controller
      setIsSearching(true)
      try {
        const res = await fetch(`/api/teams?q=${encodeURIComponent(value)}`, { signal: controller.signal })
        const data = await res.json()
        setTeamResults(data.teams || [])
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setTeamResults([])
      } finally {
        setIsSearching(false)
      }
    }, 150)
  }, [])

  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team)
    setTeamQuery(team.team.name)
    setTeamResults([])
    setAnalysis(null)
    setSelectedGap(null)
    setRecommendations([])
    setError(null)
  }

  const handleAnalyze = async () => {
    if (!selectedTeam) return
    setIsAnalyzing(true)
    setError(null)
    setAnalysis(null)
    setSelectedGap(null)
    setRecommendations([])

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedTeam.team.id,
          teamName: selectedTeam.team.name,
          managerId: selectedManagerId || undefined,
          teamSource: selectedTeam.team.source,
          fotmobId: selectedTeam.team.fotmobId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Analysis failed')
        return
      }

      setAnalysis(data.analysis)
      setManagerResult(data.manager)

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSelectGap = (gap: SquadGap) => {
    setSelectedGap(gap)
    setSelectedBudget('')
    setRecommendations([])
    setRecsError(null)
    setTimeout(() => {
      recsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  const handleSelectBudget = async (budget: string) => {
    if (!selectedGap || !selectedTeam || !managerResult) return
    setSelectedBudget(budget)
    setRecommendations([])
    setRecsError(null)
    setIsLoadingRecs(true)

    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gap: selectedGap,
          managerId: managerResult.id || undefined,
          managerName: managerResult.name,
          teamName: selectedTeam.team.name,
          budget,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setRecsError(data.error || 'Failed to load recommendations')
      } else {
        setRecommendations(data.recommendations || [])
      }
    } catch {
      setRecsError('Failed to load recommendations')
    } finally {
      setIsLoadingRecs(false)
    }
  }

  const selectedManagerOverride = managers.find((m) => m.id === selectedManagerId)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium px-3 py-1.5 rounded-full mb-4">
          <Zap className="w-3 h-3" />
          AI-Powered Tactical Intelligence
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          Find the exact players<br />
          <span className="text-blue-400">your system demands</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
          Search any club — we auto-detect the manager and analyse the squad for transfer window gaps.
        </p>
      </div>

      {/* Search form */}
      <div className="max-w-2xl mx-auto space-y-3 mb-8">
        {/* Team search */}
        <div className="relative">
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3.5 focus-within:border-blue-500/50 transition-colors">
            <Search className="w-5 h-5 text-slate-500 flex-shrink-0" />
            <input
              type="text"
              value={teamQuery}
              onChange={(e) => handleTeamSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && selectedTeam && handleAnalyze()}
              placeholder="Search for a club... (e.g. Tottenham, Bayern München)"
              className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
            />
            {isSearching && (
              <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
            )}
          </div>

          {/* Team results dropdown */}
          {teamResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-xl z-20">
              {teamResults.slice(0, 6).map((team) => (
                <button
                  key={team.team.id}
                  onClick={() => handleSelectTeam(team)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800 transition-colors text-left"
                >
                  {team.team.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={team.team.logo} alt={team.team.name} className="w-6 h-6 object-contain" />
                  )}
                  <div>
                    <p className="text-white text-sm font-medium">{team.team.name}</p>
                    <p className="text-slate-500 text-xs">{team.team.country}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Manager override — collapsed by default */}
        {selectedTeam && (
          <div>
            <button
              onClick={() => {
                setOverrideOpen(!overrideOpen)
                if (!overrideOpen) loadManagers()
              }}
              className="flex items-center gap-1.5 text-slate-600 hover:text-slate-400 text-xs transition-colors"
            >
              <Settings2 className="w-3 h-3" />
              {selectedManagerId
                ? `Manager override: ${selectedManagerOverride?.name}`
                : 'Override manager (optional)'}
              <ChevronDown className={`w-3 h-3 transition-transform ${overrideOpen ? 'rotate-180' : ''}`} />
            </button>

            {overrideOpen && (
              <div className="relative mt-2">
                <button
                  onClick={() => setManagerDropdownOpen(!managerDropdownOpen)}
                  className="w-full flex items-center justify-between gap-3 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 hover:border-slate-600 transition-colors text-left"
                >
                  <span className={`text-sm ${selectedManagerOverride ? 'text-white' : 'text-slate-500'}`}>
                    {selectedManagerOverride
                      ? `${selectedManagerOverride.name} · ${selectedManagerOverride.formations[0]}`
                      : 'Select a manager to override auto-detection'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${managerDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {managerDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-xl overflow-auto max-h-56 shadow-xl z-20">
                    <button
                      onClick={() => {
                        setSelectedManagerId('')
                        setManagerDropdownOpen(false)
                      }}
                      className="w-full px-4 py-2.5 text-left text-slate-500 text-sm hover:bg-slate-800 transition-colors border-b border-slate-800"
                    >
                      Auto-detect from team
                    </button>
                    {managers.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedManagerId(m.id)
                          setManagerDropdownOpen(false)
                        }}
                        className={`w-full px-4 py-2.5 text-left hover:bg-slate-800 transition-colors text-sm ${
                          selectedManagerId === m.id ? 'bg-blue-500/10 text-blue-400' : 'text-white'
                        }`}
                      >
                        <span className="font-medium">{m.name}</span>
                        <span className="text-slate-600 ml-2 text-xs">{m.formations[0]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={!selectedTeam || isAnalyzing}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm disabled:cursor-not-allowed"
        >
          {isAnalyzing ? 'Analysing Squad...' : 'Analyse Squad'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-2xl mx-auto mb-8 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {isAnalyzing && (
        <LoadingSpinner
          message="Analysing squad..."
          submessage="Fetching squad data and running tactical analysis with Claude AI"
        />
      )}

      {/* Results */}
      {analysis && managerResult && !isAnalyzing && (
        <div ref={resultsRef} className="space-y-8">
          {/* Manager + score header */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {managerResult.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <h2 className="text-white font-bold">{managerResult.name}</h2>
                    <p className="text-slate-500 text-xs">{managerResult.currentClub}</p>
                  </div>
                </div>
                {managerResult.formations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 ml-11">
                    {managerResult.formations.map((f) => (
                      <span key={f} className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs px-2 py-0.5 rounded-full">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
                {managerResult.tacticalSummary && (
                  <p className="text-slate-400 text-sm leading-relaxed mt-3 ml-11 line-clamp-2">
                    {managerResult.tacticalSummary}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-3xl font-bold ${getScoreColor(analysis.tacticalFitScore)}`}>
                  {analysis.tacticalFitScore}
                  <span className="text-base text-slate-500">/10</span>
                </div>
                <div className="text-slate-500 text-xs">Tactical Fit</div>
              </div>
            </div>

            <div className="border-t border-slate-700 mt-4 pt-4">
              <p className="text-slate-300 text-sm leading-relaxed mb-4">{analysis.overallAssessment}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-2">Strengths</p>
                  <ul className="space-y-1">
                    {analysis.squadStrengths?.map((s, i) => (
                      <li key={i} className="text-slate-400 text-xs flex items-start gap-1.5">
                        <span className="text-green-400/60 mt-0.5">+</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-red-400 text-xs font-semibold uppercase tracking-wider mb-2">Weaknesses</p>
                  <ul className="space-y-1">
                    {analysis.squadWeaknesses?.map((w, i) => (
                      <li key={i} className="text-slate-400 text-xs flex items-start gap-1.5">
                        <span className="text-red-400/60 mt-0.5">−</span>{w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Gaps + Recommendations */}
          <div>
            <h2 className="text-white font-bold text-lg mb-1">Transfer Window Gaps</h2>
            <p className="text-slate-500 text-sm mb-4">
              Click a gap to get real player recommendations
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Gaps list */}
              <div className="space-y-3">
                {analysis.gaps?.map((gap, i) => (
                  <GapCard
                    key={i}
                    gap={gap}
                    onClick={() => handleSelectGap(gap)}
                    isSelected={selectedGap?.position === gap.position}
                  />
                ))}
              </div>

              {/* Recommendations panel */}
              <div ref={recsRef}>
                {!selectedGap && (
                  <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-8 text-center">
                    <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Search className="w-5 h-5 text-slate-600" />
                    </div>
                    <p className="text-slate-500 text-sm">Select a gap to find transfer targets</p>
                  </div>
                )}

                {/* Budget selector — shown once a gap is selected */}
                {selectedGap && !isLoadingRecs && (
                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-4">
                    <p className="text-white font-semibold text-sm mb-1">
                      {selectedGap.position} — choose your budget
                    </p>
                    <p className="text-slate-500 text-xs mb-3">
                      Claude will find real players that fit within this range
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['Loan', 'Free agent', '< €20M', '€20–50M', '€50–100M', '€100M+'].map((b) => (
                        <button
                          key={b}
                          onClick={() => handleSelectBudget(b)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                            selectedBudget === b
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-slate-900 border-slate-600 text-slate-300 hover:border-blue-500/50 hover:text-white'
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedGap && isLoadingRecs && (
                  <LoadingSpinner
                    message={`Finding ${selectedGap.position} targets...`}
                    submessage="Claude is scanning the transfer market"
                  />
                )}

                {selectedGap && recsError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-red-400 text-sm">{recsError}</p>
                  </div>
                )}

                {selectedGap && !isLoadingRecs && recommendations.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-semibold">{selectedGap.position} Targets</h3>
                      <span className="text-slate-500 text-xs">{selectedBudget} · {recommendations.length} players</span>
                    </div>
                    {recommendations.map((rec, i) => (
                      <TransferTargetCard key={rec.playerName} target={rec} rank={i + 1} />
                    ))}
                  </div>
                )}

                {selectedGap && !isLoadingRecs && selectedBudget && recommendations.length === 0 && !recsError && (
                  <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-6 text-center">
                    <p className="text-slate-400 text-sm font-medium mb-1">No players found in this range</p>
                    <p className="text-slate-600 text-xs">Try a different budget — verified market values may not match the selected tier</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      {!analysis && !isAnalyzing && (
        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-center text-slate-500 text-sm font-medium uppercase tracking-wider mb-8">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: 'Search any club',
                desc: 'We auto-detect the current manager and their tactical system — no setup required.',
              },
              {
                step: '02',
                title: 'AI analyses the squad',
                desc: "Claude identifies which positions are gaps or mismatches for the manager's system.",
              },
              {
                step: '03',
                title: 'Get transfer targets',
                desc: 'Click any gap for real, available players ranked by tactical fit with scout-level reasoning.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="text-blue-500/30 font-bold text-4xl mb-3">{step}</div>
                <h3 className="text-white font-semibold mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

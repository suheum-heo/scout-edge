'use client'

import { useLanguage } from '@/components/LanguageProvider'
import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, Zap, AlertCircle, ChevronDown, Settings2, Sparkles } from 'lucide-react'
import GapCard from '@/components/GapCard'
import TransferTargetCard from '@/components/TransferTargetCard'
import SquadFitMap from '@/components/SquadFitMap'
import AvailabilityEditor from '@/components/AvailabilityEditor'
import ScenarioBuilder from '@/components/ScenarioBuilder'
import ScenarioResultCard from '@/components/ScenarioResultCard'
import ScenarioCompare from '@/components/ScenarioCompare'
import UndervaluedXI from '@/components/UndervaluedXI'
import LoadingSpinner from '@/components/LoadingSpinner'
import ExpandableText from '@/components/ExpandableText'
import type { SquadAnalysisResult, SquadGap, TransferTarget, PlayerSystemFit, ScenarioResult, ScenarioOutPlayer, ScenarioInPlayer } from '@/lib/claude'
import { getSeededMessages } from '@/lib/i18n'
import { searchLocalTeams } from '@/lib/teams-db'
import type { SquadPlayer } from '@/lib/role-profiles'
import { getScoreColor } from '@/lib/utils'

interface Team {
  team: { id: number | string; name: string; displayName?: string; country: string; displayCountry?: string; logo: string; source?: 'af' | 'fotmob' | 'tm'; fotmobId?: number }
  venue: { name: string; city: string }
}

interface Manager {
  id: string
  name: string
  displayName?: string
  currentClub: string
  displayCurrentClub?: string
  formations: string[]
}

interface ManagerResult {
  id: string | null
  name: string | null
  displayName?: string | null
  currentClub: string
  displayCurrentClub?: string
  formations: string[]
  style: Record<string, string> | null
  tacticalSummary: string | null
  keyPrinciples: string[]
  source?: 'override' | 'provider' | 'unverified'
  verified?: boolean
  transfermarktUrl?: string | null
  photoUrl?: string | null
}

function makeAvailabilityKey(ids?: Iterable<string>): string {
  return ids ? [...ids].sort().join('|') : ''
}

function makeTeamKey(team?: Team | null): string {
  return team ? `${team.team.source || 'af'}:${team.team.id}` : ''
}

export default function HomePage() {
  const { language, t, pluralSuffix, translateCountryName, localizeText } = useLanguage()
  const seededSearchPlaceholder = getSeededMessages(language)['home.searchPlaceholder']
  const [teamQuery, setTeamQuery] = useState('')
  const [teamResults, setTeamResults] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [analyzedTeam, setAnalyzedTeam] = useState<Team | null>(null)
  const [highlightedTeamIndex, setHighlightedTeamIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)

  // Manager override (secondary, collapsed by default)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [managers, setManagers] = useState<Manager[]>([])
  const [managersLoadedLanguage, setManagersLoadedLanguage] = useState<string | null>(null)
  const [selectedManagerId, setSelectedManagerId] = useState<string>('')
  const [managerDropdownOpen, setManagerDropdownOpen] = useState(false)

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isLoadingAnalysisDetails, setIsLoadingAnalysisDetails] = useState(false)
  const [analysisDetailsError, setAnalysisDetailsError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<SquadAnalysisResult | null>(null)
  const [managerResult, setManagerResult] = useState<ManagerResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [squad, setSquad] = useState<SquadPlayer[]>([])
  const [nationalTeamCountry, setNationalTeamCountry] = useState<string | null>(null)
  const [selectedGap, setSelectedGap] = useState<SquadGap | null>(null)
  const [selectedBudget, setSelectedBudget] = useState<string>('')
  const [recommendations, setRecommendations] = useState<TransferTarget[]>([])
  const [isLoadingRecs, setIsLoadingRecs] = useState(false)
  const [recsError, setRecsError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'gaps' | 'fit' | 'scenario' | 'xi'>('gaps')
  const [squadFit, setSquadFit] = useState<PlayerSystemFit[]>([])
  const [isLoadingFit, setIsLoadingFit] = useState(false)
  const [fitError, setFitError] = useState<string | null>(null)

  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set())
  const [analyzedUnavailableKey, setAnalyzedUnavailableKey] = useState('')

  const [scenarios, setScenarios] = useState<ScenarioResult[]>([])
  const [isRunningScenario, setIsRunningScenario] = useState(false)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null)

  const searchTimeout = useRef<NodeJS.Timeout | null>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const analysisRequestSeq = useRef(0)
  const resultsRef = useRef<HTMLDivElement>(null)
  const recsRef = useRef<HTMLDivElement>(null)
  const previousLanguageRef = useRef(language)

  const loadManagers = useCallback(async () => {
    if (managers.length > 0 && managersLoadedLanguage === language) return
    try {
      const res = await fetch(`/api/managers?language=${encodeURIComponent(language)}`)
      const data = await res.json()
      setManagers(data.managers || [])
      setManagersLoadedLanguage(language)
    } catch {
      // silently fail
    }
  }, [language, managers.length, managersLoadedLanguage])

  const handleTeamSearch = useCallback((value: string) => {
    setTeamQuery(value)
    setSelectedTeam(null)
    setHighlightedTeamIndex(-1)

    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (searchAbort.current) searchAbort.current.abort()
    setIsSearching(false)

    const trimmedValue = value.trim()
    if (trimmedValue.length < 1) {
      setTeamResults([])
      return
    }

    const localResults = searchLocalTeams(trimmedValue)
    if (localResults.length > 0) {
      setTeamResults(localResults)
      setHighlightedTeamIndex(0)
      return
    }

    if (trimmedValue.length < 2) {
      setTeamResults([])
      return
    }

    searchTimeout.current = setTimeout(async () => {
      const controller = new AbortController()
      searchAbort.current = controller
      setIsSearching(true)
      try {
        const res = await fetch(`/api/teams?q=${encodeURIComponent(trimmedValue)}&language=${encodeURIComponent(language)}`, { signal: controller.signal })
        const data = await res.json()
        const nextTeams = data.teams || []
        setTeamResults(nextTeams)
        setHighlightedTeamIndex(nextTeams.length > 0 ? 0 : -1)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setTeamResults([])
        setHighlightedTeamIndex(-1)
      } finally {
        setIsSearching(false)
      }
    }, 150)
  }, [language])

  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team)
    setTeamQuery(team.team.displayName || localizeText(team.team.name))
    setTeamResults([])
    setHighlightedTeamIndex(-1)
    setError(null)
  }

  const handleTeamInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const navigableTeamResults = teamResults.slice(0, 6)

    if (e.key === 'ArrowDown' && navigableTeamResults.length > 0) {
      e.preventDefault()
      setHighlightedTeamIndex((prev) => (prev < 0 ? 0 : (prev + 1) % navigableTeamResults.length))
      return
    }

    if (e.key === 'ArrowUp' && navigableTeamResults.length > 0) {
      e.preventDefault()
      setHighlightedTeamIndex((prev) => (prev <= 0 ? navigableTeamResults.length - 1 : prev - 1))
      return
    }

    if (e.key === 'Escape' && navigableTeamResults.length > 0) {
      e.preventDefault()
      setTeamResults([])
      setHighlightedTeamIndex(-1)
      return
    }

    if (e.key === 'Enter') {
      if (navigableTeamResults.length > 0) {
        e.preventDefault()
        const highlightedTeam = navigableTeamResults[highlightedTeamIndex >= 0 ? highlightedTeamIndex : 0]
        if (highlightedTeam) {
          handleSelectTeam(highlightedTeam)
        }
        return
      }

      if (selectedTeam) {
        e.preventDefault()
        void handleAnalyze()
      }
    }
  }

  const handleToggleUnavailable = (playerId: string) => {
    setUnavailableIds(prev => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
    setSquadFit([])
    setFitError(null)
    setSelectedGap(null)
    setSelectedBudget('')
    setRecommendations([])
    setRecsError(null)
    setScenarios([])
    setCompareIds(null)
    setScenarioError(null)
    setActiveTab('gaps')
    setAnalysisDetailsError(null)
  }

  const hydrateAnalysisDetails = useCallback(async (
    requestSeq: number,
    team: Team,
    excludeIds?: Set<string>
  ) => {
    setIsLoadingAnalysisDetails(true)
    setAnalysisDetailsError(null)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: team.team.id,
          teamName: team.team.name,
          managerId: selectedManagerId || undefined,
          teamSource: team.team.source,
          fotmobId: team.team.fotmobId,
          excludedPlayerIds: excludeIds ? [...excludeIds] : undefined,
          analysisMode: 'details',
          language,
        }),
      })

      if (!res.ok) {
        setAnalysisDetailsError(t('home.detailsFailedMessage'))
        return
      }
      const data = await res.json()
      if (analysisRequestSeq.current !== requestSeq) return
      if (data.analysis) {
        setAnalysis(data.analysis as SquadAnalysisResult)
        setAnalysisDetailsError(null)
      }
    } catch {
      if (analysisRequestSeq.current === requestSeq) {
        setAnalysisDetailsError(t('home.detailsFailedMessage'))
      }
    } finally {
      if (analysisRequestSeq.current === requestSeq) {
        setIsLoadingAnalysisDetails(false)
      }
    }
  }, [language, selectedManagerId, t])

  const loadSquadFit = useCallback(async (
    requestSeq: number,
    squadInput: SquadPlayer[],
    managerInput: ManagerResult,
    teamName: string,
    options?: { showLoading?: boolean; silent?: boolean }
  ) => {
    if (!squadInput.length) return

    if (options?.showLoading) {
      setIsLoadingFit(true)
    }
    if (!options?.silent) {
      setFitError(null)
    }

    try {
      const res = await fetch('/api/squad-fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          squad: squadInput,
          managerId: managerInput.id || undefined,
          managerName: managerInput.name,
          teamName,
          language,
        }),
      })
      const data = await res.json()
      if (analysisRequestSeq.current !== requestSeq) return
      if (!res.ok) {
        if (!options?.silent) {
          setFitError(data.error || t('home.fitLoadingTitle'))
        }
        return
      }
      setSquadFit(data.fits || [])
    } catch {
      if (analysisRequestSeq.current !== requestSeq) return
      if (!options?.silent) {
        setFitError(t('home.fitLoadingTitle'))
      }
    } finally {
      if (options?.showLoading && analysisRequestSeq.current === requestSeq) {
        setIsLoadingFit(false)
      }
    }
  }, [language, t])

  const handleAnalyze = async (options?: { excludeIds?: Set<string>; team?: Team | null }) => {
    const teamToAnalyze = options?.team ?? selectedTeam
    const excludeIds = options?.excludeIds
    if (!teamToAnalyze) return
    const isReAnalyse = !!excludeIds
    const requestSeq = analysisRequestSeq.current + 1
    analysisRequestSeq.current = requestSeq
    setIsAnalyzing(true)
    setIsLoadingAnalysisDetails(false)
    setAnalysisDetailsError(null)
    setError(null)
    setAnalysis(null)
    setSelectedGap(null)
    setRecommendations([])
    setSquadFit([])
    setScenarios([])
    setActiveTab('gaps')
    setFitError(null)
    // On fresh analyse, reset squad + unavailability; on re-analyse keep them
    if (!isReAnalyse) {
      setSquad([])
      setUnavailableIds(new Set())
      setAnalyzedUnavailableKey('')
    }

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: teamToAnalyze.team.id,
          teamName: teamToAnalyze.team.name,
          managerId: selectedManagerId || undefined,
          teamSource: teamToAnalyze.team.source,
          fotmobId: teamToAnalyze.team.fotmobId,
          excludedPlayerIds: excludeIds ? [...excludeIds] : undefined,
          language,
        }),
      })

      let data: Record<string, unknown>
      try {
        data = await res.json()
      } catch {
        setError(t('home.timeout'))
        return
      }

      if (!res.ok) {
        setError((data.error as string) || t('error.analysisFailed'))
        return
      }

      const nextAnalysis = data.analysis as SquadAnalysisResult
      const nextSquad = (data.squad as SquadPlayer[]) || []
      const nextManager = data.manager as ManagerResult
      setAnalyzedTeam(teamToAnalyze)
      setAnalysis(nextAnalysis)
      setSquad(nextSquad)
      setManagerResult(nextManager)
      setNationalTeamCountry((data.nationalTeamCountry as string) || null)
      setAnalyzedUnavailableKey(makeAvailabilityKey(excludeIds))

      if (nextAnalysis?.detailsStatus === 'partial') {
        void hydrateAnalysisDetails(requestSeq, teamToAnalyze, excludeIds)
      }
      if (nextSquad.length && nextManager?.name) {
        void loadSquadFit(
          requestSeq,
          nextSquad,
          nextManager,
          teamToAnalyze.team.name,
          { silent: true }
        )
      }

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch {
      setError(t('loading.defaultMessage'))
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSelectGap = (gap: SquadGap) => {
    setSelectedGap(gap)
    setSelectedBudget('')
    // Keep previous recommendations visible until user picks a budget for this gap
    setRecsError(null)
    setTimeout(() => {
      recsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  const handleSelectBudget = async (budget: string) => {
    if (!selectedGap || !analyzedTeam || !managerResult) return
    if (availabilityDirty) {
      setRecsError(t('home.reanalyseAvailabilityFirst'))
      setRecommendations([])
      return
    }
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
          teamName: analyzedTeam.team.name,
          budget,
          squad: availableSquad,
          nationalTeamCountry: nationalTeamCountry || undefined,
          language,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setRecsError(data.error || t('home.recsLoadingTitle', { position: selectedGap.displayPosition || localizeText(selectedGap.position) }))
      } else {
        setRecommendations(data.recommendations || [])
      }
    } catch {
      setRecsError(t('home.recsLoadingTitle', { position: selectedGap.displayPosition || localizeText(selectedGap.position) }))
    } finally {
      setIsLoadingRecs(false)
    }
  }

  const handleRunScenario = async (out: ScenarioOutPlayer[], inn: ScenarioInPlayer[]) => {
    if (!availableSquad.length || !managerResult || !analyzedTeam) return
    setIsRunningScenario(true)
    setScenarioError(null)
    try {
      const res = await fetch('/api/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          squad: availableSquad,
          playersOut: out,
          playersIn: inn,
          managerId: managerResult.id || undefined,
          managerName: managerResult.name,
          teamName: analyzedTeam.team.name,
          language,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setScenarioError(data.error || t('scenario.loadingTitle'))
        return
      }
      const letter = String.fromCharCode(65 + scenarios.length) // A, B, C...
      const labeled: ScenarioResult = { ...data.result, label: t('scenario.label', { letter }) }
      setScenarios((prev) => [labeled, ...prev])
    } catch {
      setScenarioError(t('loading.defaultMessage'))
    } finally {
      setIsRunningScenario(false)
    }
  }

  const handleToggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev && prev.includes(id)) {
        return null
      }
      if (!prev) return [id, id] // will be overwritten on second click
      return [prev[0], id]
    })
  }

  const handleSwitchTab = async (tab: 'gaps' | 'fit' | 'scenario' | 'xi') => {
    setActiveTab(tab)
    if (tab === 'scenario') {
      setScenarioError(null)
      return
    }
    if (tab === 'fit' && !squadFit.length && !isLoadingFit && availableSquad.length && managerResult) {
      void loadSquadFit(
        analysisRequestSeq.current,
        availableSquad,
        managerResult,
        analyzedTeam?.team.name || analysis?.teamName || '',
        { showLoading: true }
      )
    }
  }

  const selectedManagerOverride = managers.find((m) => m.id === selectedManagerId)
  const currentAvailabilityKey = makeAvailabilityKey(unavailableIds)
  const analyzedUnavailableIds = analyzedUnavailableKey
    ? new Set(analyzedUnavailableKey.split('|').filter(Boolean))
    : undefined
  const availabilityDirty = currentAvailabilityKey !== analyzedUnavailableKey
  const availableSquad = unavailableIds.size > 0
    ? squad.filter((player) => !unavailableIds.has(player.playerId))
    : squad
  const unavailablePlayers = unavailableIds.size > 0
    ? squad.filter((player) => unavailableIds.has(player.playerId))
    : []
  const unavailableSummary = unavailablePlayers
    .slice(0, 4)
    .map((player) => (player as SquadPlayer & { displayName?: string }).displayName || player.name)
    .join(', ')
  const unavailableOverflow = unavailablePlayers.length > 4
    ? ` ${t('common.moreCount', { count: unavailablePlayers.length - 4 })}`
    : ''
  const analysisDetailsPending = analysis?.detailsStatus === 'partial'
  const hasPendingTeamSelection =
    !!analysis &&
    !!selectedTeam &&
    !!analyzedTeam &&
    makeTeamKey(selectedTeam) !== makeTeamKey(analyzedTeam)
  const analysisDetailsHeadline = analysisDetailsError
    ? t('home.detailsFailedHeadline')
    : isLoadingAnalysisDetails
    ? t('home.detailsLoadingHeadline')
    : t('home.detailsReadyHeadline')
  const analysisDetailsMessage = analysisDetailsError
    ? t('home.detailsFailedMessage')
    : isLoadingAnalysisDetails
    ? t('home.detailsLoadingMessage')
    : t('home.detailsReadyMessage')

  useEffect(() => {
    const previousLanguage = previousLanguageRef.current
    previousLanguageRef.current = language

    if (previousLanguage === language) return
    if (!analysis || !analyzedTeam || isAnalyzing) return

    void handleAnalyze({
      team: analyzedTeam,
      excludeIds: analyzedUnavailableIds,
    })
  }, [analysis, analyzedTeam, analyzedUnavailableIds, isAnalyzing, language])

  const handleRetryAnalysisDetails = () => {
    if (!analyzedTeam || !analysis || isLoadingAnalysisDetails) return
    void hydrateAnalysisDetails(analysisRequestSeq.current, analyzedTeam, analyzedUnavailableIds)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium px-3 py-1.5 rounded-full mb-4">
          <Zap className="w-3 h-3" />
          {t('home.heroBadge')}
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white tracking-tight mb-4">
          {t('home.heroTitleLine1')}<br />
          <span className="text-blue-400">{t('home.heroTitleLine2')}</span>
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-lg max-w-4xl mx-auto leading-relaxed text-pretty">
          {t('home.heroSubtitle')}
        </p>
      </div>

      {/* Search form */}
      <div className="max-w-2xl mx-auto space-y-3 mb-8">
        {/* Team search */}
        <div className="relative">
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 focus-within:border-blue-500/50 transition-colors">
            <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
            <input
              type="text"
              value={teamQuery}
              onChange={(e) => handleTeamSearch(e.target.value)}
              onKeyDown={handleTeamInputKeyDown}
              placeholder={seededSearchPlaceholder || t('home.searchPlaceholder')}
              className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none text-sm"
            />
            {isSearching && (
              <div className="w-4 h-4 border-2 border-slate-300 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
            )}
          </div>

          {/* Team results dropdown */}
          {teamResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-xl z-20">
              {teamResults.slice(0, 6).map((team, index) => (
                <button
                  key={team.team.id}
                  onClick={() => handleSelectTeam(team)}
                  onMouseEnter={() => setHighlightedTeamIndex(index)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                    highlightedTeamIndex === index
                      ? 'bg-[#EEF2F7] dark:bg-slate-800'
                      : 'hover:bg-[#EEF2F7] dark:hover:bg-slate-800'
                  }`}
                >
                  {team.team.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={team.team.logo} alt={team.team.displayName || localizeText(team.team.name)} className="w-6 h-6 object-contain" />
                  )}
                  <div>
                    <p className="text-slate-900 dark:text-white text-sm font-medium">{team.team.displayName || localizeText(team.team.name)}</p>
                    <p className="text-slate-600 text-xs">{(team.team as typeof team.team & { displayCountry?: string }).displayCountry || translateCountryName(team.team.country)}</p>
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
              className="flex items-center gap-1.5 text-slate-600 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-400 text-xs transition-colors"
            >
              <Settings2 className="w-3 h-3" />
              {selectedManagerId
                ? t('home.overrideSelected', { name: selectedManagerOverride?.displayName || selectedManagerOverride?.name || '' })
                : t('home.overrideOptional')}
              <ChevronDown className={`w-3 h-3 transition-transform ${overrideOpen ? 'rotate-180' : ''}`} />
            </button>

            {overrideOpen && (
              <div className="relative mt-2">
                <button
                  onClick={() => setManagerDropdownOpen(!managerDropdownOpen)}
                  className="w-full flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors text-left"
                >
                  <span className={`text-sm ${selectedManagerOverride ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                    {selectedManagerOverride
                      ? `${selectedManagerOverride.displayName || selectedManagerOverride.name} · ${selectedManagerOverride.displayCurrentClub || selectedManagerOverride.currentClub}`
                      : t('home.overrideSelectManager')}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${managerDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {managerDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-auto max-h-56 shadow-xl z-20">
                    <button
                      onClick={() => {
                        setSelectedManagerId('')
                        setManagerDropdownOpen(false)
                      }}
                      className="w-full px-4 py-2.5 text-left text-slate-400 dark:text-slate-500 text-sm hover:bg-[#EEF2F7] dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800"
                    >
                      {t('home.autoDetectFromTeam')}
                    </button>
                    {managers.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedManagerId(m.id)
                          setManagerDropdownOpen(false)
                        }}
                        className={`w-full px-4 py-2.5 text-left hover:bg-[#EEF2F7] dark:hover:bg-slate-800 transition-colors text-sm ${
                          selectedManagerId === m.id ? 'bg-blue-500/10 text-blue-400' : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        <span className="font-medium">{m.displayName || m.name}</span>
                        <span className="text-slate-400 dark:text-slate-600 ml-2 text-xs">{m.displayCurrentClub || m.currentClub}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {hasPendingTeamSelection && selectedTeam && analyzedTeam && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            {t('home.pendingTeamSwitch', { currentTeam: analyzedTeam.team.displayName || localizeText(analyzedTeam.team.name), nextTeam: selectedTeam.team.displayName || localizeText(selectedTeam.team.name) })}
          </div>
        )}

        {/* Analyze button */}
        <button
          onClick={() => void handleAnalyze()}
          disabled={!selectedTeam || isAnalyzing}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm disabled:cursor-not-allowed"
        >
          {isAnalyzing ? t('home.analyzingButton') : t('home.analyseButton')}
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
          message={t('home.analysisLoadingTitle')}
          submessage={t('home.analysisLoadingSub')}
          durationHint={t('home.analysisLoadingHint')}
        />
      )}

      {/* Results */}
      {analysis && managerResult && !isAnalyzing && (
        <div ref={resultsRef} className="space-y-8">
          {/* Manager + score header */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {managerResult.photoUrl ? (
                    <img
                      src={managerResult.photoUrl}
                      alt={managerResult.displayName ?? managerResult.name ?? t('home.managerUnavailable')}
                      className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {(managerResult.displayName ?? managerResult.name ?? '?').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <div>
                    {managerResult.transfermarktUrl ? (
                      <a
                        href={managerResult.transfermarktUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-900 dark:text-white font-bold hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
                      >
                        {managerResult.displayName ?? managerResult.name ?? t('home.managerUnavailable')}
                      </a>
                    ) : (
                      <h2 className="text-slate-900 dark:text-white font-bold">{managerResult.displayName ?? managerResult.name ?? t('home.managerUnavailable')}</h2>
                    )}
                    <p className="text-slate-600 text-xs">{managerResult.displayCurrentClub || managerResult.currentClub}</p>
                  </div>
                </div>
                {managerResult.verified === false && (
                  <p className="text-amber-500 text-xs mt-2 ml-11">
                    {t('home.managerUnverified')}
                  </p>
                )}
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
                  <ExpandableText
                    text={managerResult.tacticalSummary}
                    collapsedLines={2}
                    className="text-slate-400 text-sm leading-relaxed mt-3 ml-11"
                    buttonClassName="ml-11"
                  />
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-3xl font-bold ${getScoreColor(analysis.tacticalFitScore)}`}>
                  {analysis.tacticalFitScore}
                  <span className="text-base text-slate-600">/10</span>
                </div>
                <div className="text-slate-600 text-xs">{t('home.tacticalFit')}</div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 mt-4 pt-4">
              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-4">{analysis.overallAssessment}</p>
              {analysisDetailsPending && (
                <div className={`mb-4 rounded-xl border px-4 py-3 flex items-start gap-3 ${
                  analysisDetailsError
                    ? 'bg-amber-500/10 border-amber-500/20'
                    : 'bg-blue-500/10 border-blue-500/20'
                }`}>
                  <div className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                    analysisDetailsError
                      ? 'bg-amber-400'
                      : isLoadingAnalysisDetails
                      ? 'bg-blue-400 animate-pulse'
                      : 'bg-blue-300'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                      analysisDetailsError ? 'text-amber-300' : 'text-blue-200'
                    }`}>
                      {analysisDetailsHeadline}
                    </p>
                    <p className={`text-xs mt-1 ${
                      analysisDetailsError ? 'text-amber-200/90' : 'text-blue-100/80'
                    }`}>
                      {analysisDetailsMessage}
                    </p>
                  </div>
                  <button
                    onClick={handleRetryAnalysisDetails}
                    disabled={isLoadingAnalysisDetails}
                    className="text-xs px-2.5 py-1 rounded-full border border-blue-500/20 text-blue-300 hover:bg-blue-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoadingAnalysisDetails ? t('home.loadingDetails') : t('home.retryDetails')}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('home.strengths')}</p>
                  <ul className="space-y-1">
                    {analysis.squadStrengths?.length ? analysis.squadStrengths.map((s, i) => (
                      <li key={i} className="text-slate-600 dark:text-slate-400 text-xs flex items-start gap-1.5">
                        <span className="text-green-400/60 mt-0.5">+</span>{s}
                      </li>
                    )) : analysisDetailsPending ? (
                      Array.from({ length: 3 }, (_, index) => (
                        <li key={index} className="text-slate-500 dark:text-slate-500 text-xs flex items-start gap-1.5">
                          <span className="text-green-400/60 mt-0.5">+</span>
                          <span
                            className={`block h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse ${
                              index === 1 ? 'w-4/5' : index === 2 ? 'w-3/4' : 'w-[92%]'
                            }`}
                          />
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-500 dark:text-slate-500 text-xs">
                        {t('home.noStrengths')}
                      </li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-red-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('home.weaknesses')}</p>
                  <ul className="space-y-1">
                    {analysis.squadWeaknesses?.length ? analysis.squadWeaknesses.map((w, i) => (
                      <li key={i} className="text-slate-600 dark:text-slate-400 text-xs flex items-start gap-1.5">
                        <span className="text-red-400/60 mt-0.5">−</span>{w}
                      </li>
                    )) : analysisDetailsPending ? (
                      Array.from({ length: 3 }, (_, index) => (
                        <li key={index} className="text-slate-500 dark:text-slate-500 text-xs flex items-start gap-1.5">
                          <span className="text-red-400/60 mt-0.5">−</span>
                          <span
                            className={`block h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse ${
                              index === 1 ? 'w-[88%]' : index === 2 ? 'w-3/4' : 'w-[94%]'
                            }`}
                          />
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-500 dark:text-slate-500 text-xs">
                        {t('home.noWeaknesses')}
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Availability editor + re-analyse */}
          {squad.length > 0 && (
            <div className="mb-2">
              <AvailabilityEditor
                squad={squad}
                unavailableIds={unavailableIds}
                onToggle={handleToggleUnavailable}
              />
              {unavailablePlayers.length > 0 && (
                <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                  availabilityDirty
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                }`}>
                  {availabilityDirty
                    ? t('availability.changed', { players: `${unavailableSummary}${unavailableOverflow}` })
                    : t('availability.activeMode', { players: `${unavailableSummary}${unavailableOverflow}` })}
                </div>
              )}
              {unavailableIds.size > 0 && (
                <button
                  onClick={() => void handleAnalyze({ excludeIds: unavailableIds, team: analyzedTeam })}
                  disabled={isAnalyzing}
                  className="w-full mb-5 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600/80 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
                >
                  {isAnalyzing
                    ? t('home.analyzingButton')
                    : t('availability.reanalyse', { count: unavailableIds.size, suffix: pluralSuffix(unavailableIds.size) })}
                </button>
              )}
            </div>
          )}

          {/* Tab switcher */}
          <div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-1 w-fit mb-6">
              <button
                onClick={() => handleSwitchTab('gaps')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'gaps'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('home.transferGaps')}
              </button>
              <button
                onClick={() => handleSwitchTab('fit')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'fit'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('home.squadFitMap')}
              </button>
              <button
                onClick={() => handleSwitchTab('scenario')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'scenario'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('home.scenarios')}
                {scenarios.length > 0 && (
                  <span className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {scenarios.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleSwitchTab('xi')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'xi'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {t('home.undervaluedXi')}
              </button>
            </div>

            {/* Transfer Gaps tab */}
            {activeTab === 'gaps' && (
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
                    <div className="bg-[#EEF2F7] dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Search className="w-5 h-5 text-slate-400 dark:text-slate-600" />
                      </div>
                      <p className="text-slate-600 text-sm">{t('home.selectGap')}</p>
                    </div>
                  )}

                  {/* Budget selector */}
                  {selectedGap && !isLoadingRecs && (
                    <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-4">
                      <p className="text-slate-900 dark:text-white font-semibold text-sm mb-1">
                        {t('home.chooseBudgetTitle', { position: selectedGap.displayPosition || localizeText(selectedGap.position) })}
                      </p>
                      <p className="text-slate-600 text-xs mb-3">
                        {t('home.chooseBudgetSubtitle')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {['Loan', 'Free agent', '< €20M', '€20–50M', '€50–100M', '€100M+'].map((b) => (
                          <button
                            key={b}
                            onClick={() => handleSelectBudget(b)}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                              selectedBudget === b
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-white'
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
                      message={t('home.recsLoadingTitle', { position: selectedGap.displayPosition || localizeText(selectedGap.position) })}
                      submessage={t('home.recsLoadingSub')}
                      durationHint={t('home.recsLoadingHint')}
                    />
                  )}

                  {selectedGap && recsError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                      <p className="text-red-400 text-sm">{recsError}</p>
                    </div>
                  )}

                  {!isLoadingRecs && recommendations.length > 0 && (
                    <div className={`space-y-3 transition-opacity ${!selectedBudget ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                      <div className="flex items-center justify-between">
                        <h3 className="text-slate-900 dark:text-white font-semibold">
                          {t('home.targetsTitle', { position: selectedGap?.displayPosition || localizeText(selectedGap?.position || '') })}
                        </h3>
                        <span className="text-slate-600 text-xs">
                          {selectedBudget
                            ? t('home.targetsCount', { budget: selectedBudget, count: recommendations.length })
                            : t('home.selectBudgetAbove')}
                        </span>
                      </div>
                      {recommendations.map((rec, i) => (
                        <TransferTargetCard key={rec.playerName} target={rec} rank={i + 1} />
                      ))}
                    </div>
                  )}

                  {selectedGap && !isLoadingRecs && selectedBudget && recommendations.length === 0 && !recsError && (
                    <div className="bg-[#EEF2F7] dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center">
                      <p className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-1">{t('home.noPlayersFound')}</p>
                      <p className="text-slate-400 dark:text-slate-600 text-xs">{t('home.noPlayersFoundDetail')}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Squad Fit Map tab */}
            {activeTab === 'fit' && (
              <div>
                {isLoadingFit && (
                  <LoadingSpinner
                    message={t('home.fitLoadingTitle')}
                    submessage={t('home.fitLoadingSub')}
                    durationHint={t('home.fitLoadingHint')}
                  />
                )}
                {fitError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-red-400 text-sm">{fitError}</p>
                  </div>
                )}
                {!isLoadingFit && squadFit.length > 0 && (
                  <SquadFitMap fits={squadFit} managerName={managerResult.displayName ?? managerResult.name ?? undefined} />
                )}
              </div>
            )}

            {/* Scenarios tab */}
            {activeTab === 'scenario' && (
              <div className="space-y-6">
                {/* Builder */}
                <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                  <div className="mb-4">
                    <h3 className="text-slate-900 dark:text-white font-semibold text-sm">{t('scenario.buildTitle')}</h3>
                    <p className="text-slate-600 text-xs mt-0.5">
                      {t('scenario.buildSubtitle')}
                    </p>
                  </div>
                  <ScenarioBuilder
                    squad={availableSquad}
                    recommendations={recommendations}
                    onRun={handleRunScenario}
                    isLoading={isRunningScenario}
                  />
                  {isRunningScenario && (
                    <LoadingSpinner
                      compact
                      message={t('scenario.loadingTitle')}
                      submessage={t('scenario.loadingSub')}
                      durationHint={t('scenario.loadingHint')}
                    />
                  )}
                  {scenarioError && (
                    <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-red-400 text-xs">{scenarioError}</p>
                    </div>
                  )}
                </div>

                {/* Compare view */}
                {compareIds && compareIds[0] !== compareIds[1] && (() => {
                  const a = scenarios.find((s) => s.id === compareIds[0])
                  const b = scenarios.find((s) => s.id === compareIds[1])
                  return a && b ? <ScenarioCompare a={a} b={b} /> : null
                })()}

                {/* Results list */}
                {scenarios.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-slate-900 dark:text-white font-semibold text-sm">
                        {t('scenario.count', { count: scenarios.length, suffix: pluralSuffix(scenarios.length) })}
                      </h3>
                      {scenarios.length >= 2 && !compareIds && (
                        <p className="text-slate-600 text-xs">{t('scenario.compareHint')}</p>
                      )}
                    </div>
                    {scenarios.map((s) => {
                      const isSelected = !!compareIds && compareIds.includes(s.id)
                      const twoSelected = !!compareIds && compareIds[0] !== compareIds[1]
                      return (
                        <ScenarioResultCard
                          key={s.id}
                          result={s}
                          compareSelected={isSelected}
                          onToggleCompare={handleToggleCompare}
                          compareDisabled={twoSelected && !isSelected}
                        />
                      )
                    })}
                  </div>
                )}

                {scenarios.length === 0 && !isRunningScenario && (
                  <div className="text-center py-8">
                    <p className="text-slate-600 text-sm">{t('scenario.empty')}</p>
                  </div>
                )}
              </div>
            )}

            {/* Undervalued XI tab */}
            {activeTab === 'xi' && (
              <UndervaluedXI
                managerId={managerResult?.id}
                managerName={(managerResult?.displayName ?? managerResult?.name) ?? undefined}
                teamName={analyzedTeam?.team.name || analysis?.teamName}
                language={language}
              />
            )}
          </div>
        </div>
      )}

      {/* How it works */}
      {!analysis && !isAnalyzing && (
        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-center text-slate-500 dark:text-slate-500 text-sm font-medium uppercase tracking-wider mb-8">
            {t('home.howItWorks')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: t('home.step1Title'),
                desc: t('home.step1Desc'),
              },
              {
                step: '02',
                title: t('home.step2Title'),
                desc: t('home.step2Desc'),
              },
              {
                step: '03',
                title: t('home.step3Title'),
                desc: t('home.step3Desc'),
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="text-blue-500/30 font-bold text-4xl mb-3">{step}</div>
                <h3 className="text-slate-900 dark:text-white font-semibold mb-2">{title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

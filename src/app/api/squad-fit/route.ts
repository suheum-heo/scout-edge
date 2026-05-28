import { NextRequest, NextResponse } from 'next/server'
import { normalizeLanguage, translate } from '@/lib/i18n'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { analyzeSquadSystemFit } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { createServerTiming } from '@/lib/server-timing'
import { localizeSquadFitResults } from '@/lib/entity-localization'
import type { SquadPlayer } from '@/lib/role-profiles'
import type { LanguageCode } from '@/lib/i18n'
import type { PlayerSystemFit, FitLabel } from '@/lib/claude'
import type { ManagerProfile } from '@/lib/managers'

const SQUAD_FIT_TTL_MS = 15 * 60 * 1000
const SQUAD_FIT_GENERATION_LANGUAGE = 'en'
const SQUAD_FIT_ANALYSIS_TIMEOUT_MS = 42_000
const SQUAD_FIT_FAST_FALLBACK_SIZE = 33
const squadFitCache = new Map<string, { data: Awaited<ReturnType<typeof analyzeSquadSystemFit>>; expiresAt: number }>()

function normalizeFitCacheValue(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function getSquadFitCacheKey(
  squad: SquadPlayer[],
  managerId?: string,
  managerName?: string,
  teamName?: string,
  language?: string,
): string {
  const squadKey = squad
    .map((player) => `${player.playerId}:${normalizeFitCacheValue(player.name)}:${normalizeFitCacheValue(player.position)}:${player.age}`)
    .sort()
    .join(',')

  return [
    normalizeFitCacheValue(teamName),
    normalizeFitCacheValue(language),
    managerId || 'no-manager-id',
    normalizeFitCacheValue(managerName),
    squadKey,
  ].join('|')
}

function getCachedSquadFit(cacheKey: string) {
  const entry = squadFitCache.get(cacheKey)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    squadFitCache.delete(cacheKey)
    return null
  }
  return entry.data
}

function setCachedSquadFit(cacheKey: string, data: Awaited<ReturnType<typeof analyzeSquadSystemFit>>) {
  squadFitCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + SQUAD_FIT_TTL_MS,
  })
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: () => T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback()), timeoutMs)
    }),
  ])
}

function normalizeFitLabel(score: number): FitLabel {
  if (score >= 9) return 'Key Man'
  if (score >= 7) return 'Good Fit'
  if (score >= 5) return 'Rotation'
  if (score >= 3) return 'Poor Fit'
  return 'Sell Candidate'
}

function buildHeuristicFallbackFits(
  squad: SquadPlayer[],
  language: LanguageCode,
  manager: ManagerProfile | null
): PlayerSystemFit[] {
  return squad.map((player) => {
    const position = player.position.toLowerCase()
    let fitScore = 6

    if (player.age <= 20) fitScore = 5
    else if (player.age <= 24) fitScore = 6
    else if (player.age <= 29) fitScore = 7
    else if (player.age <= 32) fitScore = 6
    else fitScore = 5

    if ((manager?.style.defensiveLine === 'high' || manager?.style.pressing === 'gegenpressing') && player.age >= 31) {
      fitScore -= 1
    }

    if (position.includes('goalkeeper') && manager?.style.buildUp === 'short_passing') {
      fitScore += 1
    }

    if ((position.includes('wing') || position.includes('attacking')) && manager?.style.width === 'wide') {
      fitScore += 1
    }

    if (position.includes('defensive midfield') && manager?.style.buildUp === 'short_passing') {
      fitScore += 1
    }

    fitScore = Math.max(3, Math.min(8, fitScore))

    return {
      playerName: player.name,
      position: player.position,
      age: player.age,
      fitScore,
      fitLabel: normalizeFitLabel(fitScore),
      reason: translate(language, 'fit.manualReviewReason', { player: player.name }),
      scoutScore: Math.max(38, Math.min(82, fitScore * 10 + (fitScore >= 7 ? 4 : 0))),
      valueLabel: 'Fair Value',
    }
  })
}

export async function POST(request: NextRequest) {
  const timing = createServerTiming()
  const requestStartedAt = timing.start()
  let language = normalizeLanguage(undefined)

  try {
    const body = await request.json()
    const { squad, managerId, managerName, teamName } = body as {
      squad: Array<SquadPlayer & { displayName?: string }>
      managerId?: string
      managerName?: string
      teamName: string
      language?: string
    }

    language = normalizeLanguage(body.language)

    if (!squad?.length || !teamName) {
      const response = NextResponse.json({ error: translate(language, 'error.analysisFailed') }, { status: 400 })
      timing.end('total', requestStartedAt)
      timing.apply(response.headers)
      return response
    }

    const cacheKey = getSquadFitCacheKey(squad, managerId, managerName, teamName, language)
    const cachedFits = getCachedSquadFit(cacheKey)
    if (cachedFits) {
      const response = NextResponse.json({ fits: cachedFits })
      timing.end('cache_hit', requestStartedAt, `players:${cachedFits.length}`)
      timing.apply(response.headers)
      return response
    }

    const manager = managerId ? getManagerById(managerId) : undefined
    const factualManagerName = manager?.name || managerName || null
    const snapshotStartedAt = timing.start()
    const liveManagerSnapshot = factualManagerName
      ? await getLiveManagerSnapshot(factualManagerName, { maxMatches: 20 }).catch(() => null)
      : null
    timing.end('manager_snapshot', snapshotStartedAt, factualManagerName ?? 'none')

    const fitStartedAt = timing.start()
    const liveFormationContext = liveManagerSnapshot
      ? {
          primaryFormation: liveManagerSnapshot.primaryFormation,
          recentFormations: liveManagerSnapshot.recentFormations,
          formationSampleSize: liveManagerSnapshot.sampleSize,
          formationSeason: liveManagerSnapshot.season,
          referenceClub: liveManagerSnapshot.referenceClub,
        }
      : undefined
    const fits = squad.length >= SQUAD_FIT_FAST_FALLBACK_SIZE
      ? (() => {
          console.warn(`[squad-fit] using fast fallback for large squad at ${teamName} (${squad.length} players)`)
          return buildHeuristicFallbackFits(squad, language, manager || null)
        })()
      : await withTimeout(
          analyzeSquadSystemFit(
            squad,
            manager || null,
            teamName,
            managerName,
            liveFormationContext,
            SQUAD_FIT_GENERATION_LANGUAGE
          ),
          SQUAD_FIT_ANALYSIS_TIMEOUT_MS,
          () => {
            console.warn(`[squad-fit] timed out for ${teamName}; returning heuristic fallback fits`)
            return buildHeuristicFallbackFits(squad, language, manager || null)
          }
        )
    const localizedFits = await localizeSquadFitResults(
      fits,
      language,
      squad.map((player) => ({ sourceName: player.name, displayName: player.displayName }))
    )
    timing.end('fit_analysis', fitStartedAt, `players:${localizedFits.length}`)
    setCachedSquadFit(cacheKey, localizedFits)

    const response = NextResponse.json({ fits: localizedFits })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  } catch (error) {
    console.error('Squad fit error:', error)
    const details = getAIErrorDetails(error, translate(language, 'error.analysisFailed'))
    const response = NextResponse.json({ error: details.error }, { status: details.status })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  }
}

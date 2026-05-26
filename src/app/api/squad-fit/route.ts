import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { analyzeSquadSystemFit } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { createServerTiming } from '@/lib/server-timing'
import type { SquadPlayer } from '@/lib/role-profiles'

const SQUAD_FIT_TTL_MS = 15 * 60 * 1000
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
): string {
  const squadKey = squad
    .map((player) => `${player.playerId}:${normalizeFitCacheValue(player.name)}:${normalizeFitCacheValue(player.position)}:${player.age}`)
    .sort()
    .join(',')

  return [
    normalizeFitCacheValue(teamName),
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

export async function POST(request: NextRequest) {
  const timing = createServerTiming()
  const requestStartedAt = timing.start()

  try {
    const body = await request.json()
    const { squad, managerId, managerName, teamName } = body as {
      squad: SquadPlayer[]
      managerId?: string
      managerName?: string
      teamName: string
    }

    if (!squad?.length || !teamName) {
      const response = NextResponse.json({ error: 'squad and teamName are required' }, { status: 400 })
      timing.end('total', requestStartedAt)
      timing.apply(response.headers)
      return response
    }

    const cacheKey = getSquadFitCacheKey(squad, managerId, managerName, teamName)
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
    const fits = await analyzeSquadSystemFit(
      squad,
      manager || null,
      teamName,
      managerName,
      liveManagerSnapshot
        ? {
            primaryFormation: liveManagerSnapshot.primaryFormation,
            recentFormations: liveManagerSnapshot.recentFormations,
            formationSampleSize: liveManagerSnapshot.sampleSize,
            formationSeason: liveManagerSnapshot.season,
            referenceClub: liveManagerSnapshot.referenceClub,
          }
        : undefined
    )
    timing.end('fit_analysis', fitStartedAt, `players:${fits.length}`)
    setCachedSquadFit(cacheKey, fits)

    const response = NextResponse.json({ fits })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  } catch (error) {
    console.error('Squad fit error:', error)
    const details = getAIErrorDetails(error, 'Failed to analyse squad fit')
    const response = NextResponse.json({ error: details.error }, { status: details.status })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  }
}

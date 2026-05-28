import { NextResponse } from 'next/server'
import { getCoachLiveContext, getLiveCoachByName } from '@/lib/api-football'
import { normalizeClubDisplayName } from '@/lib/club-names'
import { localizeManagerSearchResults } from '@/lib/entity-localization'
import { normalizeLanguage } from '@/lib/i18n'
import { getAllManagers, getManagerById } from '@/lib/managers'
import { createServerTiming } from '@/lib/server-timing'
import { searchManager } from '@/lib/transfermarkt'

export const dynamic = 'force-dynamic'

type ManagerSummary = {
  id: string
  name: string
  currentClub: string
  nationality: string
  formations: string[]
}

const managersCache = new Map<string, { data: ManagerSummary[]; expiresAt: number }>()
const MANAGERS_TTL = 15 * 60 * 1000

function parseRequestedIds(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('ids')
  if (!raw) return null

  const ids = Array.from(new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  ))

  return ids.length > 0 ? ids : null
}

function makeCacheKey(ids: string[] | null) {
  if (!ids || ids.length === 0) return 'all'
  return ids.slice().sort().join(',')
}

export async function GET(request: Request) {
  const timing = createServerTiming()
  const requestStartedAt = timing.start()
  const language = normalizeLanguage(new URL(request.url).searchParams.get('language'))
  const requestedIds = parseRequestedIds(request)
  const cacheKey = makeCacheKey(requestedIds)

  const cached = managersCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    const localizedManagers = await localizeManagerSearchResults(cached.data, language)
    const response = NextResponse.json({ managers: localizedManagers })
    timing.end('cache_hit', requestStartedAt, `served ${cached.data.length} managers from process cache`)
    timing.apply(response.headers)
    return response
  }

  const managers = timing.measure('select_scope', () => {
    if (!requestedIds) return getAllManagers()
    return requestedIds
      .map((id) => getManagerById(id))
      .filter((manager): manager is NonNullable<typeof manager> => Boolean(manager))
  }, requestedIds ? `requested:${requestedIds.length}` : 'requested:all')

  const enriched = await timing.measureAsync(
    'enrich_all',
    () => Promise.all(
      managers.map(async (m) => {
        const [coach, tmManager] = await Promise.all([
          getLiveCoachByName(m.name),
          searchManager(m.name).catch(() => null),
        ])
        const liveContext = coach ? getCoachLiveContext(coach) : null
        const currentClub = tmManager
          ? (tmManager.currentClub || 'Free Agent')
          : liveContext?.status === 'free_agent'
          ? 'Free Agent'
          : normalizeClubDisplayName(liveContext?.currentClub || 'Unknown')

        return {
          id: m.id,
          name: m.name,
          currentClub,
          nationality: m.nationality,
          formations: [],
        }
      })
    ),
    `enrich ${managers.length} managers with live club data`
  )

  managersCache.set(cacheKey, { data: enriched, expiresAt: Date.now() + MANAGERS_TTL })
  const localizedManagers = await localizeManagerSearchResults(enriched, language)
  const response = NextResponse.json(
    { managers: localizedManagers },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
  timing.end('total', requestStartedAt)
  timing.apply(response.headers)
  return response
}

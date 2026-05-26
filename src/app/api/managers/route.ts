import { NextResponse } from 'next/server'
import { getCoachLiveContext, getLiveCoachByName } from '@/lib/api-football'
import { normalizeClubDisplayName } from '@/lib/club-names'
import { getAllManagers } from '@/lib/managers'
import { createServerTiming } from '@/lib/server-timing'
import { searchManager } from '@/lib/transfermarkt'

export const dynamic = 'force-dynamic'

let managersCache: { data: object[]; expiresAt: number } | null = null
const MANAGERS_TTL = 15 * 60 * 1000

export async function GET() {
  const timing = createServerTiming()
  const requestStartedAt = timing.start()

  if (managersCache && managersCache.expiresAt > Date.now()) {
    const response = NextResponse.json({ managers: managersCache.data })
    timing.end('cache_hit', requestStartedAt, 'served enriched managers from process cache')
    timing.apply(response.headers)
    return response
  }

  const managers = getAllManagers()

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

  managersCache = { data: enriched, expiresAt: Date.now() + MANAGERS_TTL }
  const response = NextResponse.json(
    { managers: enriched },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
  timing.end('total', requestStartedAt)
  timing.apply(response.headers)
  return response
}

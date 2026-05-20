import { NextResponse } from 'next/server'
import { getAllManagers } from '@/lib/managers'
import { getCoachLiveContext, getLiveCoachByName } from '@/lib/api-football'
import { normalizeClubDisplayName } from '@/lib/club-names'
import { searchManager } from '@/lib/transfermarkt'

export const dynamic = 'force-dynamic'

// Server-side cache for the enriched manager list — refreshed every 15 minutes
let managersCache: { data: object[]; expiresAt: number } | null = null
const MANAGERS_TTL = 15 * 60 * 1000

export async function GET() {
  if (managersCache && managersCache.expiresAt > Date.now()) {
    return NextResponse.json({ managers: managersCache.data })
  }

  const managers = getAllManagers()

  // Fetch live current club for all managers in parallel
  const enriched = await Promise.all(
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
  )

  managersCache = { data: enriched, expiresAt: Date.now() + MANAGERS_TTL }
  return NextResponse.json(
    { managers: enriched },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}

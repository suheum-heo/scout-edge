import { NextResponse } from 'next/server'
import { getAllManagers } from '@/lib/managers'
import { getCoachCurrentTeam } from '@/lib/api-football'

// Server-side cache for the enriched manager list — refreshed once per day
let managersCache: { data: object[]; expiresAt: number } | null = null
const MANAGERS_TTL = 24 * 60 * 60 * 1000

export async function GET() {
  if (managersCache && managersCache.expiresAt > Date.now()) {
    return NextResponse.json({ managers: managersCache.data })
  }

  const managers = getAllManagers()

  // Fetch live current club for all managers in parallel (1 API call each, cached 24hr)
  const enriched = await Promise.all(
    managers.map(async (m) => {
      const liveClub = await getCoachCurrentTeam(m.name)
      return {
        id: m.id,
        name: m.name,
        currentClub: liveClub || m.currentClub, // fall back to hardcoded if API misses
        nationality: m.nationality,
        formations: m.formations,
      }
    })
  )

  managersCache = { data: enriched, expiresAt: Date.now() + MANAGERS_TTL }
  return NextResponse.json({ managers: enriched })
}

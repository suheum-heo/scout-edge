import { NextRequest, NextResponse } from 'next/server'
import { APICoach, getCoachLiveContext, getLiveCoachByName, searchCoachesByName } from '@/lib/api-football'
import { getAllManagers, getManagerByName } from '@/lib/managers'
import { normalizeClubDisplayName } from '@/lib/club-names'
import { buildFullName, namesMatch } from '@/lib/person-names'
import { searchManager, searchManagers, TMManagerSearchResult } from '@/lib/transfermarkt'

export const dynamic = 'force-dynamic'

function formatCoachCurrentClub(
  coach: APICoach | null | undefined,
  tmManager: TMManagerSearchResult | null | undefined
): string {
  if (tmManager) return tmManager.currentClub || 'Free Agent'
  if (!coach) return 'Unknown'

  const liveContext = getCoachLiveContext(coach)
  if (liveContext.status === 'free_agent') return 'Free Agent'
  return normalizeClubDisplayName(liveContext.currentClub || 'Unknown')
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ coaches: [] })
  }

  const lower = q.toLowerCase()

  // 1. Search API Football first so we can use live club data for DB matches too
  const [apiCoaches, tmManagers] = await Promise.all([
    searchCoachesByName(q),
    searchManagers(q).catch(() => []),
  ])

  const findTMManager = (managerName: string): TMManagerSearchResult | null =>
    tmManagers.find((manager) => namesMatch(manager.name, managerName)) || null

  const getLiveClubForManager = (managerName: string): string => {
    const match = apiCoaches.find((coach) =>
      namesMatch(buildFullName(coach.firstname, coach.lastname, coach.name), managerName) ||
      namesMatch(coach.name, managerName)
    )

    return formatCoachCurrentClub(match, findTMManager(managerName))
  }

  const exactClubLookups = new Map<string, Promise<string>>()

  const getExactLiveClubForManager = (managerName: string): Promise<string> => {
    const cached = exactClubLookups.get(managerName)
    if (cached) return cached

    const lookup = (async () => {
      const quickClub = getLiveClubForManager(managerName)
      if (quickClub !== 'Unknown') return quickClub

      const [coach, tmManager] = await Promise.all([
        getLiveCoachByName(managerName),
        searchManager(managerName).catch(() => null),
      ])

      return formatCoachCurrentClub(coach, tmManager)
    })()

    exactClubLookups.set(managerName, lookup)
    return lookup
  }

  // 2. Search our local DB — use live club from API Football when available
  const dbMatches = await Promise.all(
    getAllManagers()
      .filter((m) => m.name.toLowerCase().includes(lower))
      .slice(0, 5)
      .map(async (m) => ({
        id: m.id,
        profileId: m.id,
        name: m.name,
        currentClub: normalizeClubDisplayName(await getExactLiveClubForManager(m.name)),
        formations: [],
        hasProfile: true,
      }))
  )

  // Deduplicate API results by coach id, keeping the most recent team entry
  const seen = new Map<number, typeof apiCoaches[0]>()
  for (const c of apiCoaches) {
    seen.set(c.id, c)
  }

  const apiResults = Array.from(seen.values())
    .map((c) => {
      // Reconstruct full name from firstname+lastname (API sometimes abbreviates: "T. Frank")
      const fullName = buildFullName(c.firstname, c.lastname, c.name)

      const profile = getManagerByName(fullName) || getManagerByName(c.name)

      return {
        id: profile?.id ?? `af-${c.id}`,
        profileId: profile?.id ?? null,
        name: profile?.name ?? fullName,
        currentClub: formatCoachCurrentClub(c, findTMManager(profile?.name ?? fullName)),
        formations: [],
        hasProfile: !!profile,
      }
    })
    // Skip any that are already covered by the DB matches (avoid duplicates)
    .filter((c) => !dbMatches.some((m) => m.name.toLowerCase() === c.name.toLowerCase()))

  const tmOnlyResults = tmManagers
    .map((manager) => {
      const profile = getManagerByName(manager.name)

      return {
        id: profile?.id ?? `tm-${manager.id}`,
        profileId: profile?.id ?? null,
        name: profile?.name ?? manager.name,
        currentClub: manager.currentClub || 'Free Agent',
        formations: [],
        hasProfile: !!profile,
      }
    })
    .filter((manager) => {
      const key = manager.name.toLowerCase()
      return !dbMatches.some((match) => match.name.toLowerCase() === key) &&
        !apiResults.some((match) => match.name.toLowerCase() === key)
    })

  // Merge: DB matches first (more reliable names), then API results
  // Final dedup by name — catches cases where two API IDs resolve to the same person
  const seenNames = new Set<string>()
  const coaches = [...dbMatches, ...apiResults, ...tmOnlyResults]
    .filter((c) => {
      const key = c.name.toLowerCase()
      if (seenNames.has(key)) return false
      seenNames.add(key)
      return true
    })
    .slice(0, 10)

  return NextResponse.json(
    { coaches },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}

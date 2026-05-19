import { NextRequest, NextResponse } from 'next/server'
import { searchCoachesByName } from '@/lib/api-football'
import { getAllManagers, getManagerByName } from '@/lib/managers'
import { normalizeClubDisplayName } from '@/lib/club-names'
import { buildFullName, namesMatch } from '@/lib/person-names'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ coaches: [] })
  }

  const lower = q.toLowerCase()

  // 1. Search API Football first so we can use live club data for DB matches too
  const apiCoaches = await searchCoachesByName(q)

  const getLiveClubForManager = (managerName: string): string | null => {
    const match = apiCoaches.find((coach) =>
      namesMatch(buildFullName(coach.firstname, coach.lastname, coach.name), managerName) ||
      namesMatch(coach.name, managerName)
    )

    return match?.team?.name ? normalizeClubDisplayName(match.team.name) : null
  }

  // 2. Search our local DB — use live club from API Football when available
  const dbMatches = getAllManagers()
    .filter((m) => m.name.toLowerCase().includes(lower))
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      profileId: m.id,
      name: m.name,
      currentClub: normalizeClubDisplayName(getLiveClubForManager(m.name) ?? m.currentClub),
      formations: m.formations,
      hasProfile: true,
    }))

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
        currentClub: normalizeClubDisplayName(c.team?.name ?? 'Unknown'),
        formations: profile?.formations ?? [],
        hasProfile: !!profile,
      }
    })
    // Skip any that are already covered by the DB matches (avoid duplicates)
    .filter((c) => !dbMatches.some((m) => m.name.toLowerCase() === c.name.toLowerCase()))

  // Merge: DB matches first (more reliable names), then API results
  // Final dedup by name — catches cases where two API IDs resolve to the same person
  const seenNames = new Set<string>()
  const coaches = [...dbMatches, ...apiResults]
    .filter((c) => {
      const key = c.name.toLowerCase()
      if (seenNames.has(key)) return false
      seenNames.add(key)
      return true
    })
    .slice(0, 10)

  return NextResponse.json({ coaches })
}

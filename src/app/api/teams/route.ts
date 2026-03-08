import { NextRequest, NextResponse } from 'next/server'
import { searchFDTeams } from '@/lib/football-data'
import { searchLocalTeams } from '@/lib/teams-db'
import { searchTeams as searchAFTeams } from '@/lib/api-football'

function normalizeName(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')

  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
  }

  try {
    // Local DB first — instant, handles partial names and aliases
    const localResults = searchLocalTeams(query)
    if (localResults.length > 0) {
      return NextResponse.json({ teams: localResults })
    }

    // Run FD and AF in parallel — FD for European leagues (correct squad IDs),
    // AF for MLS, Turkish, K League, J1, Belgian and any other league.
    const [fdResults, afResults] = await Promise.all([
      searchFDTeams(query),
      searchAFTeams(query),
    ])

    // Merge: FD results first (preferred — correct squad IDs), then AF results
    // not already covered by FD (deduplicated by normalized name).
    const fdNames = new Set(fdResults.map((t) => normalizeName(t.team.name)))
    const afOnly = afResults.filter((t) => !fdNames.has(normalizeName(t.team.name)))

    const merged = [...fdResults, ...afOnly].slice(0, 8)
    return NextResponse.json({ teams: merged })
  } catch (error) {
    console.error('Team search error:', error)
    return NextResponse.json({ error: 'Failed to search teams' }, { status: 500 })
  }
}

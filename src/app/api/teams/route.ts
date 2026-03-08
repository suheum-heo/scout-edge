import { NextRequest, NextResponse } from 'next/server'
import { searchFDTeams } from '@/lib/football-data'
import { searchLocalTeams } from '@/lib/teams-db'
import { searchTeams as searchAFTeams } from '@/lib/api-football'

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

    // football-data.org — covers most major European leagues + MLS + Brazil
    const fdResults = await searchFDTeams(query)
    if (fdResults.length > 0) {
      return NextResponse.json({ teams: fdResults })
    }

    // API Football fallback — covers MLS, K League, J1, Turkish, Belgian, etc.
    // When analyze is called with an AF team ID, FD returns empty squad,
    // which triggers the existing AF squad fallback automatically.
    const afResults = await searchAFTeams(query)
    return NextResponse.json({ teams: afResults.slice(0, 6) })
  } catch (error) {
    console.error('Team search error:', error)
    return NextResponse.json({ error: 'Failed to search teams' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { searchFDTeams } from '@/lib/football-data'
import { searchLocalTeams } from '@/lib/teams-db'

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

    // Fall back to football-data.org competition teams — guarantees correct IDs
    const fdResults = await searchFDTeams(query)
    return NextResponse.json({ teams: fdResults })
  } catch (error) {
    console.error('Team search error:', error)
    return NextResponse.json({ error: 'Failed to search teams' }, { status: 500 })
  }
}

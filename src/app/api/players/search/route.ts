import { NextRequest, NextResponse } from 'next/server'
import { searchPlayer, searchPlayers } from '@/lib/transfermarkt'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ players: [] })
  }

  let results = await searchPlayers(q)
  if (results.length === 0) {
    const bestMatch = await searchPlayer(q)
    if (bestMatch) {
      results = [bestMatch]
    }
  }

  const players = results.map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    club: p.club?.name ?? 'Unknown',
    nationality: p.nationalities?.[0] ?? '',
    marketValue: p.marketValue,
  }))

  return NextResponse.json({ players })
}

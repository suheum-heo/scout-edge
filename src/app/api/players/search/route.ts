import { NextRequest, NextResponse } from 'next/server'
import { searchPlayers } from '@/lib/transfermarkt'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ players: [] })
  }

  const results = await searchPlayers(q)

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

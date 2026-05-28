import { NextRequest, NextResponse } from 'next/server'
import { createServerTiming } from '@/lib/server-timing'
import { localizePlayerSearchResults } from '@/lib/entity-localization'
import { normalizeLanguage } from '@/lib/i18n'
import { searchPlayer, searchPlayers } from '@/lib/transfermarkt'

export async function GET(request: NextRequest) {
  const timing = createServerTiming()
  const requestStartedAt = timing.start()
  const q = request.nextUrl.searchParams.get('q')?.trim()
  const language = normalizeLanguage(request.nextUrl.searchParams.get('language'))

  if (!q || q.length < 2) {
    const response = NextResponse.json({ players: [] })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  }

  let results = await timing.measureAsync('tm_typeahead', () => searchPlayers(q), 'Transfermarkt player search')
  if (results.length === 0) {
    const bestMatch = await timing.measureAsync('tm_best_match', () => searchPlayer(q), 'Transfermarkt single best match fallback')
    if (bestMatch) {
      results = [bestMatch]
    }
  }

  const players = timing.measure('serialize', () => results.map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    club: p.club?.name ?? 'Unknown',
    age: p.age ?? null,
    nationality: p.nationalities?.[0] ?? '',
    marketValue: p.marketValue,
  })))

  const localizedPlayers = await localizePlayerSearchResults(players, language)
  const response = NextResponse.json({ players: localizedPlayers })
  timing.end('total', requestStartedAt)
  timing.apply(response.headers)
  return response
}

import { NextRequest, NextResponse } from 'next/server'
import { searchFDTeams } from '@/lib/football-data'
import { searchLocalTeams } from '@/lib/teams-db'
import { searchTeams as fotmobSearchTeams } from '@/lib/fotmob'
import { searchClubs as tmSearchClubs } from '@/lib/transfermarkt'

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
      // Enrich 'af' teams with live FotMob data so names/logos are always current.
      // Sponsor names change (e.g. "Daejeon Hana Citizen", "Ulsan HD FC") —
      // FotMob returns the official current name and logo without hardcoding.
      const enriched = await Promise.all(
        localResults.map(async (result) => {
          if (result.team.source !== 'af') return result
          try {
            // Use fotmobSearch if set (shorter query = better FotMob hit rate)
            const searchQuery = result.team.fotmobSearch ?? result.team.name
            const fmTeams = await fotmobSearchTeams(searchQuery)
            const fmTeam = fmTeams[0]
            if (fmTeam) {
              return {
                team: {
                  id: fmTeam.team.id,
                  // Use our DB name — it's the full official name with sponsors
                  // (FotMob search often returns short names like "Ulsan" not "Ulsan HD FC")
                  name: result.team.name,
                  country: result.team.country,
                  logo: fmTeam.team.logo, // FotMob logo is always current
                  source: 'fotmob' as const,
                },
                venue: result.venue,
              }
            }
          } catch (e) {
            console.error('[teams] FotMob enrich failed for', result.team.name, e)
          }
          return result // keep local data with 'af' source as fallback
        })
      )
      return NextResponse.json({ teams: enriched })
    }

    // Run FD and FotMob in parallel.
    // FD: European leagues (has correct squad IDs for analysis).
    // FotMob: everything else — always returns official current names and logos.
    const [fdResults, fmResults] = await Promise.all([
      searchFDTeams(query),
      fotmobSearchTeams(query),
    ])

    // Merge: FD results first (preferred — correct squad IDs for European teams),
    // then FotMob results not already covered by FD (deduplicated by normalized name).
    const fdNames = new Set(fdResults.map((t) => normalizeName(t.team.name)))
    const fmOnly = fmResults
      .filter((t) => !fdNames.has(normalizeName(t.team.name)))
      .map((t) => ({ ...t, team: { ...t.team, source: 'fotmob' as const } }))

    const merged = [...fdResults, ...fmOnly].slice(0, 8)
    if (merged.length > 0) {
      return NextResponse.json({ teams: merged })
    }

    // Nothing from FD or FotMob — use Transfermarkt for global coverage
    const tmResults = await tmSearchClubs(query)
    const tmTeams = tmResults.slice(0, 8).map((c) => ({
      team: {
        id: c.id as unknown as number, // TM ID is a string — cast for type compat
        name: c.name,
        country: c.country,
        logo: c.image ?? '',
        source: 'tm' as const,
      },
      venue: { name: '', city: '' },
    }))
    return NextResponse.json({ teams: tmTeams })
  } catch (error) {
    console.error('Team search error:', error)
    return NextResponse.json({ error: 'Failed to search teams' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { searchFDTeams } from '@/lib/football-data'
import { searchLocalTeams } from '@/lib/teams-db'
import { searchTeams as fotmobSearchTeams } from '@/lib/fotmob'
import { searchClubs as tmSearchClubs } from '@/lib/transfermarkt'

function normalizeName(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

// ISO 3166-1 alpha-2 codes (+ subdivision codes for GB nations) for football nations
const COUNTRY_ISO: Record<string, string> = {
  'afghanistan': 'af', 'albania': 'al', 'algeria': 'dz', 'andorra': 'ad', 'angola': 'ao',
  'argentina': 'ar', 'armenia': 'am', 'australia': 'au', 'austria': 'at', 'azerbaijan': 'az',
  'bahrain': 'bh', 'bangladesh': 'bd', 'belgium': 'be', 'bolivia': 'bo', 'bosnia-herzegovina': 'ba',
  'botswana': 'bw', 'brazil': 'br', 'bulgaria': 'bg', 'burkina faso': 'bf', 'burundi': 'bi',
  'cameroon': 'cm', 'canada': 'ca', 'cape verde': 'cv', 'chile': 'cl', 'china': 'cn',
  'colombia': 'co', 'comoros': 'km', 'congo': 'cg', 'costa rica': 'cr', 'croatia': 'hr',
  'cuba': 'cu', 'czech republic': 'cz', 'czechia': 'cz', 'denmark': 'dk', 'dr congo': 'cd',
  'ecuador': 'ec', 'egypt': 'eg', 'el salvador': 'sv', 'england': 'gb-eng', 'estonia': 'ee',
  'ethiopia': 'et', 'finland': 'fi', 'france': 'fr', 'gabon': 'ga', 'gambia': 'gm',
  'georgia': 'ge', 'germany': 'de', 'ghana': 'gh', 'greece': 'gr', 'guatemala': 'gt',
  'guinea': 'gn', 'guinea-bissau': 'gw', 'haiti': 'ht', 'honduras': 'hn', 'hungary': 'hu',
  'iceland': 'is', 'india': 'in', 'indonesia': 'id', 'iran': 'ir', 'iraq': 'iq',
  'ireland': 'ie', 'israel': 'il', 'italy': 'it', "ivory coast": 'ci', "côte d'ivoire": 'ci',
  'jamaica': 'jm', 'japan': 'jp', 'jordan': 'jo', 'kazakhstan': 'kz', 'kenya': 'ke',
  'kuwait': 'kw', 'latvia': 'lv', 'lebanon': 'lb', 'liberia': 'lr', 'libya': 'ly',
  'liechtenstein': 'li', 'lithuania': 'lt', 'luxembourg': 'lu', 'madagascar': 'mg',
  'malawi': 'mw', 'malaysia': 'my', 'mali': 'ml', 'malta': 'mt', 'mauritania': 'mr',
  'mexico': 'mx', 'moldova': 'md', 'mongolia': 'mn', 'montenegro': 'me', 'morocco': 'ma',
  'mozambique': 'mz', 'namibia': 'na', 'nepal': 'np', 'netherlands': 'nl', 'new zealand': 'nz',
  'nigeria': 'ng', 'north korea': 'kp', 'north macedonia': 'mk', 'northern ireland': 'gb-nir',
  'norway': 'no', 'oman': 'om', 'pakistan': 'pk', 'palestine': 'ps', 'panama': 'pa',
  'paraguay': 'py', 'peru': 'pe', 'philippines': 'ph', 'poland': 'pl', 'portugal': 'pt',
  'qatar': 'qa', 'republic of ireland': 'ie', 'romania': 'ro', 'russia': 'ru', 'rwanda': 'rw',
  'saudi arabia': 'sa', 'scotland': 'gb-sct', 'senegal': 'sn', 'serbia': 'rs',
  'sierra leone': 'sl', 'slovakia': 'sk', 'slovenia': 'si', 'somalia': 'so',
  'south africa': 'za', 'south korea': 'kr', 'korea republic': 'kr', 'spain': 'es',
  'sudan': 'sd', 'sweden': 'se', 'switzerland': 'ch', 'syria': 'sy', 'tajikistan': 'tj',
  'tanzania': 'tz', 'thailand': 'th', 'togo': 'tg', 'trinidad and tobago': 'tt',
  'tunisia': 'tn', 'turkey': 'tr', 'turkmenistan': 'tm', 'uganda': 'ug', 'ukraine': 'ua',
  'united arab emirates': 'ae', 'uae': 'ae', 'united states': 'us', 'usa': 'us',
  'uruguay': 'uy', 'uzbekistan': 'uz', 'venezuela': 've', 'vietnam': 'vn',
  'wales': 'gb-wls', 'yemen': 'ye', 'zambia': 'zm', 'zimbabwe': 'zw',
  'democratic republic of congo': 'cd',
}

/** Returns a flag CDN URL if the club name is (or starts with) a known country — covers U21/U23/etc. */
function nationalTeamFlag(name: string): string | null {
  const n = normalizeName(name)
  // Exact match first (e.g. "England")
  if (COUNTRY_ISO[n]) return `https://flagcdn.com/w80/${COUNTRY_ISO[n]}.png`
  // Prefix match for age-group teams (e.g. "England U21", "South Korea U23")
  for (const [country, iso] of Object.entries(COUNTRY_ISO)) {
    if (n.startsWith(country + ' ')) return `https://flagcdn.com/w80/${iso}.png`
  }
  return null
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')

  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
  }

  try {
    // Local DB first — instant, handles partial names and aliases.
    // Run TM in parallel so national teams can be prepended even when local DB hits.
    const localResults = searchLocalTeams(query)
    if (localResults.length > 0) {
      const [enriched, tmResults] = await Promise.all([
        // Enrich 'af' teams with live FotMob data so names/logos are always current.
        Promise.all(
          localResults.map(async (result) => {
            if (result.team.source !== 'af') return result
            try {
              const searchQuery = result.team.fotmobSearch ?? result.team.name
              const fmTeams = await fotmobSearchTeams(searchQuery)
              const fmTeam = fmTeams[0]
              if (fmTeam) {
                return {
                  team: { id: fmTeam.team.id, name: result.team.name, country: result.team.country, logo: fmTeam.team.logo, source: 'fotmob' as const },
                  venue: result.venue,
                }
              }
            } catch (e) {
              console.error('[teams] FotMob enrich failed for', result.team.name, e)
            }
            return result
          })
        ),
        tmSearchClubs(query),
      ])

      // Prepend any national team from TM that isn't already in the local results
      const localNames = new Set(enriched.map((r) => normalizeName(r.team.name)))
      const nationalTeams = tmResults
        .filter((c) => nationalTeamFlag(c.name) && !localNames.has(normalizeName(c.name)))
        .map((c) => ({
          team: { id: c.id as unknown as number, name: c.name, country: c.country, logo: nationalTeamFlag(c.name)!, source: 'tm' as const },
          venue: { name: '', city: '' },
        }))

      return NextResponse.json({ teams: [...nationalTeams, ...enriched].slice(0, 8) })
    }

    // Run FD, FotMob, and TM in parallel.
    // FD: European leagues (correct squad IDs). FotMob: global clubs + logos.
    // TM: global fallback including national teams — always run so they appear alongside clubs.
    const [fdResults, fmResults, tmResults] = await Promise.all([
      searchFDTeams(query),
      fotmobSearchTeams(query),
      tmSearchClubs(query),
    ])

    // Merge: FD first, then FotMob-only, then TM-only — deduplicated by normalized name.
    const seenNames = new Set<string>()
    const merged: Array<{ team: { id: number | string; name: string; country: string; logo: string; source?: string }; venue: { name: string; city: string } }> = []

    for (const t of fdResults) {
      const key = normalizeName(t.team.name)
      if (!seenNames.has(key)) { seenNames.add(key); merged.push(t) }
    }
    for (const t of fmResults) {
      const key = normalizeName(t.team.name)
      if (!seenNames.has(key)) { seenNames.add(key); merged.push({ ...t, team: { ...t.team, source: 'fotmob' as const } }) }
    }
    for (const c of tmResults) {
      const key = normalizeName(c.name)
      if (!seenNames.has(key)) {
        seenNames.add(key)
        merged.push({
          team: {
            id: c.id as unknown as number,
            name: c.name,
            country: c.country,
            logo: nationalTeamFlag(c.name) ?? `https://tmssl.akamaized.net/images/wappen/head/${c.id}.png`,
            source: 'tm' as const,
          },
          venue: { name: '', city: '' },
        })
      }
    }

    return NextResponse.json({ teams: merged.slice(0, 8) })
  } catch (error) {
    console.error('Team search error:', error)
    return NextResponse.json({ error: 'Failed to search teams' }, { status: 500 })
  }
}

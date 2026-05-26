import { NextRequest, NextResponse } from 'next/server'
import { searchTeams as searchAFTeams, type APITeam } from '@/lib/api-football'
import { getCanonicalClubLogo } from '@/lib/club-crests'
import { normalizeCountryDisplayName } from '@/lib/country-names'
import { searchFDTeams } from '@/lib/football-data'
import { createServerTiming } from '@/lib/server-timing'
import { searchLocalTeams } from '@/lib/teams-db'
import { searchClubs as tmSearchClubs } from '@/lib/transfermarkt'

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeTeamKey(value: string) {
  const normalized = normalizeName(value)
  const stripped = normalized
    .replace(/\b(fc|cf|sc|afc|ac|ud|cd|sd|club|bk|fk|ifk)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

  return stripped || normalized
}

function scoreTeamQuery(name: string, query: string) {
  const normalizedName = normalizeName(name)
  const normalizedQuery = normalizeName(query)
  const strippedName = normalizeTeamKey(name)
  const strippedQuery = normalizeTeamKey(query)

  if (strippedName === strippedQuery) return 100
  if (normalizedName === normalizedQuery) return 95
  if (strippedName.startsWith(strippedQuery) || strippedQuery.startsWith(strippedName)) return 90
  if (normalizedName.startsWith(normalizedQuery)) return 85
  if (normalizedName.split(' ').some((word) => word.startsWith(normalizedQuery))) return 80
  if (normalizedName.includes(normalizedQuery) || strippedName.includes(strippedQuery) || strippedQuery.includes(strippedName)) return 70
  return 0
}

type TeamSearchResult = {
  team: {
    id: number | string
    name: string
    country: string
    logo: string
    source?: 'af' | 'tm' | 'fotmob'
    fotmobId?: number
  }
  venue: { name: string; city: string }
}

type RemoteProvider = 'fd' | 'af' | 'tm'

type ProviderBucket = {
  fd?: TeamSearchResult
  af?: TeamSearchResult
  tm?: TeamSearchResult
  order: number
}

const REMOTE_SEARCH_TTL_MS = 10 * 60 * 1000
const remoteSearchCache = new Map<string, { teams: TeamSearchResult[]; expiresAt: number }>()

function getCachedRemoteSearch(query: string): TeamSearchResult[] | null {
  const cached = remoteSearchCache.get(query)
  if (!cached) return null
  if (Date.now() > cached.expiresAt) {
    remoteSearchCache.delete(query)
    return null
  }
  return cached.teams
}

function setCachedRemoteSearch(query: string, teams: TeamSearchResult[]) {
  remoteSearchCache.set(query, {
    teams,
    expiresAt: Date.now() + REMOTE_SEARCH_TTL_MS,
  })
}

// ISO 3166-1 alpha-2 codes (+ subdivision codes for GB nations) for football nations
const COUNTRY_ISO: Record<string, string> = {
  'afghanistan': 'af', 'albania': 'al', 'algeria': 'dz', 'andorra': 'ad', 'angola': 'ao',
  'argentina': 'ar', 'armenia': 'am', 'australia': 'au', 'austria': 'at', 'azerbaijan': 'az',
  'bahrain': 'bh', 'bangladesh': 'bd', 'belgium': 'be', 'bolivia': 'bo', 'bosnia-herzegovina': 'ba', 'cambodia': 'kh',
  'botswana': 'bw', 'brazil': 'br', 'bulgaria': 'bg', 'burkina faso': 'bf', 'burundi': 'bi',
  'cameroon': 'cm', 'canada': 'ca', 'cape verde': 'cv', 'chile': 'cl', 'china': 'cn',
  'colombia': 'co', 'comoros': 'km', 'congo': 'cg', 'costa rica': 'cr', 'croatia': 'hr',
  'cuba': 'cu', 'czech republic': 'cz', 'czechia': 'cz', 'denmark': 'dk', 'dr congo': 'cd',
  'ecuador': 'ec', 'egypt': 'eg', 'el salvador': 'sv', 'england': 'gb-eng', 'estonia': 'ee',
  'ethiopia': 'et', 'finland': 'fi', 'france': 'fr', 'gabon': 'ga', 'gambia': 'gm',
  'georgia': 'ge', 'germany': 'de', 'ghana': 'gh', 'greece': 'gr', 'guatemala': 'gt',
  'guinea': 'gn', 'guinea-bissau': 'gw', 'haiti': 'ht', 'honduras': 'hn', 'hungary': 'hu',
  'iceland': 'is', 'india': 'in', 'indonesia': 'id', 'iran': 'ir', 'iraq': 'iq',
  'ireland': 'ie', 'israel': 'il', 'italy': 'it', "ivory coast": 'ci', "côte d\'ivoire": 'ci',
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
  const normalized = normalizeName(name)
  if (COUNTRY_ISO[normalized]) return `https://flagcdn.com/w80/${COUNTRY_ISO[normalized]}.png`
  for (const [country, iso] of Object.entries(COUNTRY_ISO)) {
    if (normalized.startsWith(country + ' ')) return `https://flagcdn.com/w80/${iso}.png`
  }
  return null
}

function buildAFTeamResult(team: APITeam): TeamSearchResult {
  return {
    team: {
      id: team.team.id,
      name: team.team.name,
      country: normalizeCountryDisplayName(team.team.country || ''),
      logo: getCanonicalClubLogo(team.team.name, nationalTeamFlag(team.team.name) ?? team.team.logo),
      source: 'af',
    },
    venue: {
      name: team.venue?.name || '',
      city: team.venue?.city || '',
    },
  }
}

function buildTMTeamResult(club: Awaited<ReturnType<typeof tmSearchClubs>>[number]): TeamSearchResult {
  return {
    team: {
      id: club.id as string,
      name: club.name,
      country: normalizeCountryDisplayName(club.country),
      logo: getCanonicalClubLogo(club.name, nationalTeamFlag(club.name) ?? `https://tmssl.akamaized.net/images/wappen/head/${club.id}.png`),
      source: 'tm',
    },
    venue: { name: '', city: '' },
  }
}

function addCandidate(
  buckets: Map<string, ProviderBucket>,
  provider: RemoteProvider,
  result: TeamSearchResult,
  order: number
) {
  const key = normalizeTeamKey(result.team.name)
  const existing = buckets.get(key) ?? { order }
  existing[provider] = result
  existing.order = Math.min(existing.order, order)
  buckets.set(key, existing)
}

function finalizeBucket(bucket: ProviderBucket): TeamSearchResult | null {
  const base = bucket.fd ?? bucket.af ?? bucket.tm
  if (!base) return null

  const preferredName = base.team.name
  const preferredCountry =
    bucket.af?.team.country ||
    bucket.fd?.team.country ||
    bucket.tm?.team.country ||
    base.team.country

  const preferredLogo =
    getCanonicalClubLogo(preferredName, nationalTeamFlag(preferredName) || bucket.af?.team.logo) ||
    bucket.af?.team.logo ||
    bucket.tm?.team.logo ||
    bucket.fd?.team.logo ||
    base.team.logo

  const preferredVenue = {
    name: bucket.fd?.venue.name || bucket.af?.venue.name || base.venue.name || '',
    city: bucket.fd?.venue.city || bucket.af?.venue.city || base.venue.city || '',
  }

  if (bucket.fd) {
    return {
      team: {
        ...bucket.fd.team,
        country: preferredCountry,
        logo: preferredLogo,
      },
      venue: preferredVenue,
    }
  }

  if (bucket.af) {
    return {
      team: {
        ...bucket.af.team,
        country: preferredCountry,
        logo: preferredLogo,
        source: 'af',
      },
      venue: preferredVenue,
    }
  }

  return {
    team: {
      ...base.team,
      country: preferredCountry,
      logo: preferredLogo,
      source: 'tm',
    },
    venue: preferredVenue,
  }
}

function mergeProviderBuckets(
  query: string,
  providers: {
    fdResults?: TeamSearchResult[]
    afResults?: APITeam[]
    tmResults?: Awaited<ReturnType<typeof tmSearchClubs>>
  }
): TeamSearchResult[] {
  const buckets = new Map<string, ProviderBucket>()

  ;(providers.fdResults || []).forEach((result, index) => {
    addCandidate(
      buckets,
      'fd',
      {
        ...result,
        team: {
          ...result.team,
          country: normalizeCountryDisplayName(result.team.country),
          logo: getCanonicalClubLogo(result.team.name, nationalTeamFlag(result.team.name) ?? result.team.logo),
        },
      },
      index,
    )
  })

  ;(providers.afResults || []).forEach((team, index) => {
    addCandidate(buckets, 'af', buildAFTeamResult(team), index)
  })

  ;(providers.tmResults || []).forEach((club, index) => {
    addCandidate(buckets, 'tm', buildTMTeamResult(club), index)
  })

  return Array.from(buckets.values())
    .map((bucket) => finalizeBucket(bucket))
    .filter((team): team is TeamSearchResult => Boolean(team))
    .sort((left, right) => {
      const scoreDiff = scoreTeamQuery(right.team.name, query) - scoreTeamQuery(left.team.name, query)
      if (scoreDiff !== 0) return scoreDiff
      return left.team.name.length - right.team.name.length
    })
    .slice(0, 8)
}

function shouldQueryAPIFootball(query: string, teams: TeamSearchResult[]) {
  if (teams.length === 0) return true

  const topScore = scoreTeamQuery(teams[0].team.name, query)
  if (topScore >= 95) return false

  return teams.length < 4
}

export async function GET(request: NextRequest) {
  const timing = createServerTiming()
  const requestStartedAt = timing.start()
  const query = request.nextUrl.searchParams.get('q')?.trim()

  if (!query || query.length < 2) {
    const response = NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  }

  try {
    const localResults = timing.measure('local_db', () => searchLocalTeams(query), 'local team lookup')
    if (localResults.length > 0) {
      const response = NextResponse.json({ teams: localResults.slice(0, 8) })
      timing.end('total', requestStartedAt)
      timing.apply(response.headers)
      return response
    }

    const cacheKey = timing.measure('cache_key', () => normalizeName(query))
    const cachedResults = timing.measure('cache_lookup', () => getCachedRemoteSearch(cacheKey), 'in-memory remote search cache')
    if (cachedResults) {
      const response = NextResponse.json({ teams: cachedResults })
      timing.end('total', requestStartedAt)
      timing.apply(response.headers)
      return response
    }

    const fdTmStartedAt = timing.start()
    const [fdResults, tmResults] = await Promise.all([
      searchFDTeams(query),
      tmSearchClubs(query),
    ])
    timing.end('stage_fd_tm', fdTmStartedAt, `fd:${fdResults.length},tm:${tmResults.length}`)

    let teams = timing.measure(
      'merge_stage1',
      () => mergeProviderBuckets(query, { fdResults, tmResults }),
      'merge FD and TM'
    )

    if (shouldQueryAPIFootball(query, teams)) {
      const afStartedAt = timing.start()
      const afResults = await searchAFTeams(query)
      timing.end('stage_af', afStartedAt, `af:${afResults.length}`)
      teams = timing.measure(
        'merge_stage2',
        () => mergeProviderBuckets(query, { fdResults, afResults, tmResults }),
        'merge AF fallback'
      )
    }

    timing.measure('cache_store', () => setCachedRemoteSearch(cacheKey, teams), 'store merged remote results')

    const response = NextResponse.json({ teams })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  } catch (error) {
    console.error('Team search error:', error)
    const response = NextResponse.json({ error: 'Failed to search teams' }, { status: 500 })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  }
}

/**
 * Transfermarkt API client — wraps the local proxy at http://localhost:8000
 * Provides live player data: current club, contract expiry, market value, stats
 */

const TM_BASE = process.env.TRANSFERMARKT_API_URL || 'http://localhost:8000'

// Simple in-memory cache (6-hour TTL)
const cache = new Map<string, { data: unknown; expires: number }>()
const TTL = 6 * 60 * 60 * 1000

async function tmFetch<T>(path: string): Promise<T> {
  const cached = cache.get(path)
  if (cached && cached.expires > Date.now()) return cached.data as T

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${TM_BASE}${path}`, { signal: controller.signal })
    if (!res.ok) throw new Error(`TM API ${res.status}: ${path}`)
    const data = await res.json() as T
    cache.set(path, { data, expires: Date.now() + TTL })
    return data
  } finally {
    clearTimeout(timer)
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface TMPlayerSearchResult {
  id: string
  name: string
  position: string
  club: { id: string; name: string }
  age: number | null
  nationalities: string[]
  marketValue: number | null
}

export interface TMPlayerData {
  id: string
  name: string
  fullName: string | null
  imageUrl: string | null
  age: number | null
  nationality: string
  position: string
  currentClub: string
  currentClubId: string | null
  contractExpires: string | null   // ISO date "2027-06-30"
  contractYear: string             // "2027" or "Unknown"
  marketValue: number | null       // in euros
  marketValueFormatted: string     // "€75M", "€7.5M", "€500K"
  // Current-season aggregate stats
  appearances: number
  goals: number
  assists: number
  minutesPlayed: number
  yellowCards: number
}

export interface TMClubPlayer {
  id: string
  name: string
  position: string
  age: number | null
  nationality: string
  contract: string | null          // ISO date
  contractYear: string
  marketValue: number | null
  marketValueFormatted: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function formatMarketValue(value: number | null): string {
  if (!value) return 'Unknown'
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`
  return `€${value}`
}

function contractYear(isoDate: string | null): string {
  if (!isoDate) return 'Unknown'
  return isoDate.slice(0, 4)
}

function aggregateStats(stats: Array<{
  seasonId: string
  appearances?: number | null
  goals?: number | null
  assists?: number | null
  minutesPlayed?: number | null
  yellowCards?: number | null
}>) {
  // Pick the most recent season (first two chars = "25" for 25/26, etc.)
  if (!stats.length) return { appearances: 0, goals: 0, assists: 0, minutesPlayed: 0, yellowCards: 0 }

  // Sort seasons descending, take the latest
  const sorted = [...stats].sort((a, b) => b.seasonId.localeCompare(a.seasonId))
  const latestSeason = sorted[0].seasonId

  const rows = sorted.filter((s) => s.seasonId === latestSeason)
  return rows.reduce(
    (acc, s) => ({
      appearances: acc.appearances + (s.appearances ?? 0),
      goals: acc.goals + (s.goals ?? 0),
      assists: acc.assists + (s.assists ?? 0),
      minutesPlayed: acc.minutesPlayed + (s.minutesPlayed ?? 0),
      yellowCards: acc.yellowCards + (s.yellowCards ?? 0),
    }),
    { appearances: 0, goals: 0, assists: 0, minutesPlayed: 0, yellowCards: 0 }
  )
}

// ── Public API ─────────────────────────────────────────────────────────────

// Strip diacritics: "Rajković" → "Rajkovic", "Müller" → "Muller"
function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Search players by name, return top result.
 * Fallback chain: original name → diacritic-stripped → last name only (≥5 chars).
 * Optional hints (age, club) are used to disambiguate when multiple players share a name.
 */
export async function searchPlayer(
  name: string,
  hints?: { age?: number; club?: string }
): Promise<TMPlayerSearchResult | null> {
  const stripped = stripDiacritics(name)
  const lastName = stripped.split(' ').at(-1) ?? ''

  // Try progressively simpler queries until we get results
  let results = await searchPlayers(name)
  if (!results.length && stripped !== name) results = await searchPlayers(stripped)
  if (!results.length && lastName.length >= 5) results = await searchPlayers(lastName)
  if (!results.length) return null

  const q = name.toLowerCase()
  const qStripped = stripDiacritics(q)

  // Score each result: name match + age proximity + club match
  const scored = results.map((p) => {
    const pLow = p.name.toLowerCase()
    const pStripped = stripDiacritics(pLow)

    let score = 0
    // Name similarity
    if (pLow === q || pStripped === qStripped) score += 10
    else if (pStripped.includes(qStripped) && qStripped.length >= 5) score += 5
    else if (pLow.includes(q) && q.length >= 5) score += 5

    // Age proximity (within 2 years = strong signal, within 5 = weak)
    if (hints?.age && p.age !== null) {
      const diff = Math.abs(p.age - hints.age)
      if (diff <= 2) score += 8
      else if (diff <= 5) score += 3
      else score -= 5  // penalise clearly wrong age (avoids picking retired namesakes)
    }

    // Club name match
    if (hints?.club && p.club?.name) {
      const clubQ = hints.club.toLowerCase()
      const clubP = p.club.name.toLowerCase()
      if (clubP.includes(clubQ.split(' ')[0]) || clubQ.includes(clubP.split(' ')[0])) score += 6
    }

    return { p, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0].p
}

/**
 * Search players by name, return up to 8 results for typeahead suggestions.
 */
export async function searchPlayers(name: string): Promise<TMPlayerSearchResult[]> {
  try {
    const encoded = encodeURIComponent(name)
    const data = await tmFetch<{ results: TMPlayerSearchResult[] }>(`/players/search/${encoded}`)
    return data.results.slice(0, 8)
  } catch {
    return []
  }
}

/**
 * Fetch full player data: profile + aggregated current-season stats.
 */
export async function getPlayerData(tmId: string): Promise<TMPlayerData | null> {
  try {
    const [profile, statsData] = await Promise.all([
      tmFetch<{
        id: string
        name: string
        fullName: string | null
        imageUrl: string | null
        age: number | null
        citizenship: string[]
        position: { main: string | null; other: string[] | null }
        club: { id: string | null; name: string; contractExpires: string | null }
        marketValue: number | null
      }>(`/players/${tmId}/profile`),
      tmFetch<{ stats: Array<{ seasonId: string; appearances?: number | null; goals?: number | null; assists?: number | null; minutesPlayed?: number | null; yellowCards?: number | null }> }>(`/players/${tmId}/stats`),
    ])

    const stats = aggregateStats(statsData.stats)

    return {
      id: profile.id,
      name: profile.name,
      fullName: profile.fullName,
      imageUrl: profile.imageUrl,
      age: profile.age,
      nationality: profile.citizenship[0] || 'Unknown',
      position: profile.position.main || 'Unknown',
      currentClub: profile.club.name,
      currentClubId: profile.club.id,
      contractExpires: profile.club.contractExpires,
      contractYear: contractYear(profile.club.contractExpires),
      marketValue: profile.marketValue,
      marketValueFormatted: formatMarketValue(profile.marketValue),
      ...stats,
    }
  } catch {
    return null
  }
}

/**
 * Get a club's full squad with live contract + market value data.
 */
export async function getClubSquad(tmClubId: string): Promise<TMClubPlayer[]> {
  try {
    const data = await tmFetch<{
      players: Array<{
        id: string
        name: string
        position: string
        age: number | null
        nationality: string[]
        contract: string | null
        marketValue: number | null
      }>
    }>(`/clubs/${tmClubId}/players`)

    return data.players.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      age: p.age,
      nationality: p.nationality[0] || 'Unknown',
      contract: p.contract,
      contractYear: contractYear(p.contract),
      marketValue: p.marketValue,
      marketValueFormatted: formatMarketValue(p.marketValue),
    }))
  } catch {
    return []
  }
}

/**
 * Search a club by name and return its Transfermarkt ID.
 */
export async function searchClub(name: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(name)
    const data = await tmFetch<{ results: Array<{ id: string; name: string; country: string }> }>(`/clubs/search/${encoded}`)
    if (!data.results.length) return null
    const q = name.toLowerCase()
    const exact = data.results.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()))
    return exact?.id || data.results[0].id
  } catch {
    return null
  }
}

export interface TMClubSearchResult {
  id: string
  name: string
  country: string
}

/**
 * Search clubs by name and return full results array (global coverage).
 * TM's search API works better with hyphens than spaces, so we try both.
 */
export async function searchClubs(query: string): Promise<TMClubSearchResult[]> {
  try {
    const encoded = encodeURIComponent(query)
    const data = await tmFetch<{ results: TMClubSearchResult[] }>(`/clubs/search/${encoded}`)
    if (data.results?.length) return data.results

    // TM search doesn't handle spaces in names well — try hyphenated form
    const hyphenated = query.trim().replace(/\s+/g, '-')
    if (hyphenated === query) return []
    const encoded2 = encodeURIComponent(hyphenated)
    const data2 = await tmFetch<{ results: TMClubSearchResult[] }>(`/clubs/search/${encoded2}`)
    return data2.results || []
  } catch {
    return []
  }
}

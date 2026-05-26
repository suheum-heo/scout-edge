import axios from 'axios'
import { normalizeCountryDisplayName } from './country-names'
import { normalizeLiveFormation } from './formations'
import { buildFullName, namesMatch } from './person-names'
import { getClubFinalFormation, getManagerProfileSnapshot, searchClub, searchManager } from './transfermarkt'

const BASE_URL = 'https://v3.football.api-sports.io'

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'x-apisports-key': process.env.API_FOOTBALL_KEY || '',
  },
})

// In-memory cache for server-side requests
const cache = new Map<string, { data: unknown; expiresAt: number }>()

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache(key: string, data: unknown, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

const TTL = {
  TEAMS: 24 * 60 * 60 * 1000,       // 24 hours
  SQUAD: 24 * 60 * 60 * 1000,       // 24 hours
  PLAYERS: 12 * 60 * 60 * 1000,     // 12 hours
  COACHES: 30 * 60 * 1000,          // 30 minutes
  FORMATIONS: 30 * 60 * 1000,       // 30 minutes
  LINEUPS: 30 * 24 * 60 * 60 * 1000, // historical lineups are stable
  MANAGER_SNAPSHOT: 15 * 60 * 1000,
}

const NULL_MANAGER_SNAPSHOT = '__manager_snapshot_null__'

export interface APITeam {
  team: {
    id: number
    name: string
    country: string
    logo: string
  }
  venue: {
    name: string
    city: string
  }
}

export interface APIPlayer {
  player: {
    id: number
    name: string
    firstname: string
    lastname: string
    age: number
    nationality: string
    photo: string
    height: string
    weight: string
  }
  statistics: Array<{
    team: { id: number; name: string; logo: string }
    league: { id: number; name: string; country: string; logo: string }
    games: {
      appearences: number
      lineups: number
      minutes: number
      position: string
      rating: string
    }
    goals: { total: number; assists: number }
    shots: { total: number; on: number }
    passes: { total: number; key: number; accuracy: string }
    tackles: { total: number; interceptions: number }
    duels: { total: number; won: number }
    dribbles: { attempts: number; success: number }
  }>
}

export interface APICoach {
  id: number
  name: string
  firstname: string
  lastname: string
  nationality: string
  photo: string
  team: { id: number; name: string; logo: string }
  career?: Array<{
    team: { id: number; name: string; logo: string }
    start?: string
    end?: string | null
  }>
}

export interface TeamFormationUsage {
  formation: string
  count: number
}

export interface RecentTeamFormations {
  primaryFormation: string | null
  formations: TeamFormationUsage[]
  sampleSize: number
  season: number | null
}

export interface CoachLiveContext {
  status: 'active' | 'free_agent' | 'unknown'
  currentClub: string | null
  currentTeamId: number | null
  currentStart: string | null
  referenceClub: string | null
  referenceTeamId: number | null
  referenceStart: string | null
  referenceEnd: string | null
}

export interface ManagerLiveSnapshot {
  name: string
  status: 'active' | 'free_agent' | 'unknown'
  currentClub: string | null
  teamId: number | null
  referenceClub: string | null
  referenceTeamId: number | null
  tenureStart: string | null
  primaryFormation: string | null
  recentFormations: string[]
  formationCounts: TeamFormationUsage[]
  sampleSize: number
  season: number | null
}

// Top leagues we support
export const SUPPORTED_LEAGUES = [
  { id: 39, name: 'Premier League', country: 'England' },
  { id: 140, name: 'La Liga', country: 'Spain' },
  { id: 135, name: 'Serie A', country: 'Italy' },
  { id: 78, name: 'Bundesliga', country: 'Germany' },
  { id: 61, name: 'Ligue 1', country: 'France' },
  { id: 71, name: 'Brasileirao Serie A', country: 'Brazil' },
  { id: 292, name: 'K League 1', country: 'South Korea' },
  { id: 98, name: 'J1 League', country: 'Japan' },
]

export const CURRENT_SEASON = 2025

// League team lists pre-fetched and cached for local fuzzy search.
// This avoids relying on /teams?search=..., which has become unreliable for many clubs.
const EXTRA_LEAGUES = [
  { id: 39,  season: CURRENT_SEASON }, // Premier League
  { id: 40,  season: CURRENT_SEASON }, // Championship
  { id: 140, season: CURRENT_SEASON }, // La Liga
  { id: 135, season: CURRENT_SEASON }, // Serie A
  { id: 78,  season: CURRENT_SEASON }, // Bundesliga
  { id: 61,  season: CURRENT_SEASON }, // Ligue 1
  { id: 88,  season: CURRENT_SEASON }, // Eredivisie
  { id: 94,  season: CURRENT_SEASON }, // Primeira Liga
  { id: 179, season: CURRENT_SEASON }, // Scottish Premiership
  { id: 307, season: CURRENT_SEASON }, // Saudi Pro League
  { id: 71,  season: CURRENT_SEASON }, // Brasileirao Serie A
  { id: 253, season: 2025 }, // MLS 2025
  { id: 253, season: 2024 }, // MLS 2024 (fallback — 2025 may be incomplete early in season)
  { id: 203, season: CURRENT_SEASON }, // Turkish Süper Lig
  { id: 292, season: 2025 }, // K League 1
  { id: 98,  season: 2025 }, // J1 League
  { id: 144, season: CURRENT_SEASON }, // Belgian Pro League
]

let extraLeagueTeams: APITeam[] | null = null
let extraLeagueTeamsFetchedAt = 0
const EXTRA_TTL = 24 * 60 * 60 * 1000

async function getExtraLeagueTeams(): Promise<APITeam[]> {
  if (extraLeagueTeams && Date.now() - extraLeagueTeamsFetchedAt < EXTRA_TTL) {
    return extraLeagueTeams
  }
  try {
    const results = await Promise.allSettled(
      EXTRA_LEAGUES.map(({ id, season }) =>
        client.get<{ response: APITeam[] }>('/teams', { params: { league: id, season } })
      )
    )
    const seen = new Set<number>()
    const teams: APITeam[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const t of r.value.data?.response || []) {
          if (!seen.has(t.team.id)) { seen.add(t.team.id); teams.push(t) }
        }
      }
    }
    if (teams.length > 0) {
      extraLeagueTeams = teams
      extraLeagueTeamsFetchedAt = Date.now()
    }
    return teams
  } catch {
    return extraLeagueTeams || []
  }
}

function normalizeTeamName(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function stripClubSuffixes(name: string) {
  return name.replace(/\b(fc|cf|sc|afc|ac)\b/g, ' ').trim().replace(/\s+/g, ' ')
}

function hasAuxiliaryTeamMarker(name: string) {
  return /\b(w|women|u\d{2}|ii|b|reserves)\b/.test(name)
}

function scoreSearchResultName(name: string, query: string): number {
  const normalizedName = normalizeTeamName(name)
  const normalizedQuery = normalizeTeamName(query)
  let score = scoreTeamMatch(normalizedName, normalizedQuery)

  const strippedName = stripClubSuffixes(normalizedName)
  const strippedQuery = stripClubSuffixes(normalizedQuery)

  if (strippedName === strippedQuery) {
    score = Math.max(score, 95)
  } else if (strippedName.startsWith(strippedQuery) || strippedQuery.startsWith(strippedName)) {
    score = Math.max(score, 85)
  }

  if (hasAuxiliaryTeamMarker(normalizedName) && !hasAuxiliaryTeamMarker(normalizedQuery)) {
    score -= 40
  }

  return score
}

function rankTeamResults(results: APITeam[], query: string): APITeam[] {
  const primaryResults = results.filter((team) => !hasAuxiliaryTeamMarker(normalizeTeamName(team.team.name)))
  const sortable = primaryResults.length > 0 && !hasAuxiliaryTeamMarker(normalizeTeamName(query))
    ? primaryResults
    : results

  return [...sortable].sort((left, right) => {
    const scoreDiff = scoreSearchResultName(right.team.name, query) - scoreSearchResultName(left.team.name, query)
    if (scoreDiff !== 0) return scoreDiff
    return left.team.name.length - right.team.name.length
  })
}

function buildTeamSearchQueries(query: string): string[] {
  const normalizedSpacing = query.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  const withoutSuffixes = normalizedSpacing.replace(/\b(fc|cf|sc|afc|ac)\b/gi, ' ').replace(/\s+/g, ' ').trim()
  const lastWord = withoutSuffixes.split(' ').filter(Boolean).at(-1) || ''

  return Array.from(new Set([
    query.trim(),
    normalizedSpacing,
    withoutSuffixes,
    lastWord.length >= 5 ? lastWord : '',
  ].filter(Boolean)))
}

function normalizeCountry(s: string) {
  return normalizeCountryDisplayName(s)
}

function normalizeFormation(value?: string | null): string | null {
  return normalizeLiveFormation(value)
}

function clubsLikelyMatch(left?: string | null, right?: string | null) {
  if (!left || !right) return false

  const normalizedLeft = stripClubSuffixes(normalizeTeamName(left))
  const normalizedRight = stripClubSuffixes(normalizeTeamName(right))

  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(normalizedRight)
    || normalizedRight.startsWith(normalizedLeft)
}

function isFinishedFixture(status?: string | null) {
  return ['FT', 'AET', 'PEN', 'AWD', 'WO'].includes((status || '').toUpperCase())
}

function compareIsoDateDesc(left?: string | null, right?: string | null) {
  return String(right || '').localeCompare(String(left || ''))
}

function toIsoDateKey(value?: string | null) {
  return String(value || '').slice(0, 10)
}

function buildFullCoachName(coach: APICoach) {
  return buildFullName(coach.firstname, coach.lastname, coach.name)
}

function resolveCoachSearchMatch(coaches: APICoach[], coachName: string): APICoach | null {
  if (!coaches.length) return null

  const lastName = coachName.trim().split(' ').filter(Boolean).at(-1) || ''
  const fullNameMatch = (coach: APICoach) =>
    namesMatch(buildFullCoachName(coach), coachName) ||
    namesMatch(coach.name, coachName)

  return (
    coaches.find(fullNameMatch) ||
    coaches.find((coach) => lastName && namesMatch(coach.name, lastName)) ||
    coaches[0] ||
    null
  )
}

function mapCoachTenure(entry: { team: { id: number; name: string; logo: string }; start?: string; end?: string | null }) {
  return {
    teamId: entry.team.id,
    teamName: entry.team.name,
    start: entry.start || null,
    end: entry.end || null,
  }
}

export function getCoachLiveContext(coach: APICoach): CoachLiveContext {
  const career = coach.career || []
  const ranked = career
    .filter((entry) => entry.team?.id)
    .sort((left, right) => compareIsoDateDesc(left.start, right.start))

  const active = ranked.find((entry) => !entry.end)
  const latest = ranked[0] ? mapCoachTenure(ranked[0]) : null

  if (active) {
    const current = mapCoachTenure(active)
    return {
      status: 'active',
      currentClub: current.teamName,
      currentTeamId: current.teamId,
      currentStart: current.start,
      referenceClub: current.teamName,
      referenceTeamId: current.teamId,
      referenceStart: current.start,
      referenceEnd: current.end,
    }
  }

  if (latest) {
    return {
      status: 'free_agent',
      currentClub: null,
      currentTeamId: null,
      currentStart: null,
      referenceClub: latest.teamName,
      referenceTeamId: latest.teamId,
      referenceStart: latest.start,
      referenceEnd: latest.end,
    }
  }

  if (coach.team?.id) {
    return {
      status: 'active',
      currentClub: coach.team.name,
      currentTeamId: coach.team.id,
      currentStart: null,
      referenceClub: coach.team.name,
      referenceTeamId: coach.team.id,
      referenceStart: null,
      referenceEnd: null,
    }
  }

  return {
    status: 'unknown',
    currentClub: null,
    currentTeamId: null,
    currentStart: null,
    referenceClub: null,
    referenceTeamId: null,
    referenceStart: null,
    referenceEnd: null,
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const currentIndex = nextIndex
      if (currentIndex >= items.length) return
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

function scoreTeamMatch(name: string, q: string): number {
  if (name === q)              return 100
  if (name.startsWith(q))     return 90

  const nameWords = name.split(' ').filter(Boolean)
  const qWords = q.split(' ').filter(Boolean)

  // Initials match: "lafc" matches "los angeles fc"
  // Short tokens like "fc", "ac" kept whole; longer words → first char only
  const initials = nameWords.map((w) => (w.length <= 2 ? w : w[0])).join('')
  if (initials === q) return 88

  // Single query word that starts a name word
  if (qWords.length === 1 && nameWords.some((w) => w.startsWith(q))) return 80

  // All significant query words (≥3 chars) appear in name words
  const sigQ = qWords.filter((w) => w.length >= 3)
  if (
    sigQ.length > 0 &&
    sigQ.every((qw) => nameWords.some((nw) => nw.startsWith(qw)))
  ) return 75

  if (name.includes(q)) return 70

  return 0
}

// Search for teams by name
export async function searchTeams(query: string): Promise<APITeam[]> {
  const q = normalizeTeamName(query)

  // First try local fuzzy search against pre-fetched extra league teams (MLS, Turkish, K League, J1, Belgian)
  const extraTeams = await getExtraLeagueTeams()
  const localMatches = extraTeams
    .map((t) => {
      const name = normalizeTeamName(t.team.name)
      const score = scoreTeamMatch(name, q)
      return { t, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => ({
      ...x.t,
      team: { ...x.t.team, country: normalizeCountry(x.t.team.country) },
    }))

  if (localMatches.length > 0) return localMatches

  // Fall back to AF live search for any other team worldwide
  const cacheKey = `teams:search:${q}`
  const cached = getCached<APITeam[]>(cacheKey)
  if (cached) return cached

  try {
    const seenTeamIds = new Set<number>()
    const mergedResults: APITeam[] = []

    for (const searchQuery of buildTeamSearchQueries(query)) {
      const res = await client.get('/teams', { params: { search: searchQuery } })
      const batch: APITeam[] = (res.data?.response || [])
        .map((t: APITeam) => ({
          ...t,
          team: { ...t.team, country: normalizeCountry(t.team.country) },
        }))
        .filter((team: APITeam) => {
          if (seenTeamIds.has(team.team.id)) return false
          seenTeamIds.add(team.team.id)
          return true
        })

      mergedResults.push(...batch)

      const rankedSoFar = rankTeamResults(mergedResults, query)
      const bestMatch = rankedSoFar[0]
      const bestScore = bestMatch ? scoreSearchResultName(bestMatch.team.name, query) : -Infinity
      const bestIsAuxiliary = bestMatch ? hasAuxiliaryTeamMarker(normalizeTeamName(bestMatch.team.name)) : false

      if (bestMatch && bestScore >= 90 && !bestIsAuxiliary) {
        break
      }
    }

    const results = rankTeamResults(mergedResults, query)
    setCache(cacheKey, results, TTL.TEAMS)
    return results
  } catch {
    return []
  }
}

// Get team by ID
export async function getTeam(teamId: number): Promise<APITeam | null> {
  const cacheKey = `team:${teamId}`
  const cached = getCached<APITeam>(cacheKey)
  if (cached) return cached

  try {
    const res = await client.get('/teams', { params: { id: teamId } })
    const team = res.data?.response?.[0] || null
    if (!team) return null

    const normalizedTeam: APITeam = {
      ...team,
      team: { ...team.team, country: normalizeCountry(team.team.country) },
    }
    setCache(cacheKey, normalizedTeam, TTL.TEAMS)
    return normalizedTeam
  } catch {
    return null
  }
}

// Get squad roster from /players/squads (no stats, but always current and reliable)
async function getSquadRoster(teamId: number): Promise<APIPlayer[]> {
  const cacheKey = `roster:${teamId}`
  const cached = getCached<APIPlayer[]>(cacheKey)
  if (cached && cached.length > 0) return cached

  try {
    const res = await client.get('/players/squads', {
      params: { team: teamId },
    })
    const response = res.data?.response?.[0]
    if (!response?.players?.length) return []

    // Shape roster players into APIPlayer format with empty statistics
    const players: APIPlayer[] = response.players.map((p: {
      id: number; name: string; age: number; number: number; position: string; photo: string
    }) => ({
      player: {
        id: p.id,
        name: p.name,
        firstname: '',
        lastname: '',
        age: p.age || 0,
        nationality: '',
        photo: p.photo || '',
        height: '',
        weight: '',
      },
      statistics: [{
        team: { id: teamId, name: '', logo: '' },
        league: { id: 0, name: '', country: '', logo: '' },
        games: { appearences: 0, lineups: 0, minutes: 0, position: p.position || '', rating: '0' },
        goals: { total: 0, assists: 0 },
        shots: { total: 0, on: 0 },
        passes: { total: 0, key: 0, accuracy: '0' },
        tackles: { total: 0, interceptions: 0 },
        duels: { total: 0, won: 0 },
        dribbles: { attempts: 0, success: 0 },
      }],
    }))

    setCache(cacheKey, players, TTL.SQUAD)
    return players
  } catch {
    return []
  }
}

// Get squad (players) for a team
// Strategy (API-call efficient for free tier):
//   1. /players/squads  — always works, 1 call, gives roster without stats
//   2. /players?team+season — 1 call, enriches with stats if available
export async function getSquad(teamId: number): Promise<APIPlayer[]> {
  // Step 1: get current roster (always reliable, 1 call)
  const rosterPlayers = await getSquadRoster(teamId)

  // Step 2: try to enrich with stats (1 call per season, stop at first success)
  for (const season of [CURRENT_SEASON, CURRENT_SEASON - 1]) {
    const cacheKey = `squad:${teamId}:${season}`
    const cached = getCached<APIPlayer[]>(cacheKey)
    if (cached && cached.length > 0) return cached

    try {
      const res = await client.get('/players', { params: { team: teamId, season } })
      const players: APIPlayer[] = res.data?.response || []
      if (players.length > 0) {
        setCache(cacheKey, players, TTL.SQUAD)
        return players
      }
    } catch { /* fall through */ }
  }

  // Return roster-only data if stats unavailable — Claude can still analyze
  return rosterPlayers
}

// Get coach for a team
export async function getCoach(teamId: number): Promise<APICoach | null> {
  const cacheKey = `coach:${teamId}`
  const cached = getCached<APICoach>(cacheKey)
  if (cached) return cached

  try {
    const res = await client.get('/coachs', { params: { team: teamId } })
    const coaches: APICoach[] = res.data?.response || []
    if (!coaches.length) return null

    // Pick the coach most recently appointed to this team — response order is unreliable
    let best: APICoach | null = null
    let bestDate = ''
    for (const c of coaches) {
      for (const tenure of (c as unknown as { career?: Array<{ team: { id: number }; start?: string }> }).career || []) {
        if (tenure.team?.id === teamId && (tenure.start || '') > bestDate) {
          bestDate = tenure.start || ''
          best = c
        }
      }
    }
    const result = best || coaches[0]
    if (result) setCache(cacheKey, result, TTL.COACHES)
    return result
  } catch {
    return null
  }
}

// Search players by position across supported leagues (for recommendations)
export async function searchPlayersByPosition(
  position: string, // 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Attacker'
  excludeTeamId?: number,
  leagueId?: number
): Promise<APIPlayer[]> {
  const targetLeague = leagueId || SUPPORTED_LEAGUES[0].id
  const cacheKey = `players:${position}:${targetLeague}:${CURRENT_SEASON}`
  const cached = getCached<APIPlayer[]>(cacheKey)
  if (cached) {
    return excludeTeamId
      ? cached.filter((p) => p.statistics[0]?.team.id !== excludeTeamId)
      : cached
  }

  try {
    const res = await client.get('/players', {
      params: {
        league: targetLeague,
        season: CURRENT_SEASON,
        position,
        page: 1,
      },
    })

    const players: APIPlayer[] = res.data?.response || []
    setCache(cacheKey, players, TTL.PLAYERS)

    return excludeTeamId
      ? players.filter((p) => p.statistics[0]?.team.id !== excludeTeamId)
      : players
  } catch {
    return []
  }
}

// Search a specific player by name
export async function searchPlayerByName(name: string): Promise<APIPlayer | null> {
  const cacheKey = `player:name:${name.toLowerCase()}`
  const cached = getCached<APIPlayer>(cacheKey)
  if (cached) return cached

  for (const league of SUPPORTED_LEAGUES.slice(0, 3)) {
    try {
      const res = await client.get('/players', {
        params: { search: name, league: league.id, season: CURRENT_SEASON },
      })
      const player = res.data?.response?.[0] || null
      if (player) {
        setCache(cacheKey, player, TTL.PLAYERS)
        return player
      }
    } catch {
      // continue
    }
  }

  return null
}

// Get player statistics by ID
export async function getPlayerById(playerId: number): Promise<APIPlayer | null> {
  const cacheKey = `player:id:${playerId}:${CURRENT_SEASON}`
  const cached = getCached<APIPlayer>(cacheKey)
  if (cached) return cached

  for (const league of SUPPORTED_LEAGUES.slice(0, 5)) {
    try {
      const res = await client.get('/players', {
        params: { id: playerId, season: CURRENT_SEASON, league: league.id },
      })
      const player = res.data?.response?.[0] || null
      if (player) {
        setCache(cacheKey, player, TTL.PLAYERS)
        return player
      }
    } catch {
      // continue
    }
  }

  return null
}

// Search coaches by name — returns list with current team (for player-check typeahead)
export async function searchCoachesByName(query: string): Promise<APICoach[]> {
  const cacheKey = `coach:search:list:${query.toLowerCase()}`
  const cached = getCached<APICoach[]>(cacheKey)
  if (cached) return cached

  try {
    const res = await client.get('/coachs', { params: { search: query } })
    const coaches: APICoach[] = res.data?.response || []
    setCache(cacheKey, coaches, 5 * 60 * 1000) // 5-min cache for search results
    return coaches
  } catch {
    return []
  }
}

export async function getLiveCoachByName(coachName: string): Promise<APICoach | null> {
  const cacheKey = `coach:live:${coachName.toLowerCase()}`
  const cached = getCached<APICoach | ''>(cacheKey)
  if (cached !== null) return cached || null

  try {
    const nameParts = coachName.trim().split(' ').filter(Boolean)
    const lastName = nameParts.at(-1) || ''
    const searchQueries = Array.from(new Set([coachName.trim(), lastName].filter(Boolean)))
    const coachGroups = await Promise.all(searchQueries.map((query) => searchCoachesByName(query)))
    const coaches = coachGroups.flat()
    const match = resolveCoachSearchMatch(coaches, coachName)

    setCache(cacheKey, match || '', TTL.COACHES)
    return match
  } catch {
    return null
  }
}

export async function getRecentTeamFormations(
  teamId: number,
  options?: { maxMatches?: number; since?: string | null; until?: string | null }
): Promise<RecentTeamFormations> {
  const maxMatches = Math.max(1, Math.min(options?.maxMatches ?? 10, 20))
  const since = options?.since || null
  const until = options?.until || null
  const cacheKey = `formations:${teamId}:${maxMatches}:${since || 'none'}:${until || 'none'}`
  const cached = getCached<RecentTeamFormations>(cacheKey)
  if (cached) return cached

  const seasonsToTry = [CURRENT_SEASON, CURRENT_SEASON - 1, CURRENT_SEASON - 2, CURRENT_SEASON - 3]

  for (const season of seasonsToTry) {
    try {
      const fixturesRes = await client.get('/fixtures', { params: { team: teamId, season } })
      const fixtureRows = (fixturesRes.data?.response || []) as Array<{
        fixture?: { id?: number; date?: string; status?: { short?: string } }
      }>

      const recentFixtures = fixtureRows
        .filter((row) => row.fixture?.id && isFinishedFixture(row.fixture?.status?.short))
        .filter((row) => !since || toIsoDateKey(row.fixture?.date) >= toIsoDateKey(since))
        .filter((row) => !until || toIsoDateKey(row.fixture?.date) <= toIsoDateKey(until))
        .sort((left, right) => compareIsoDateDesc(left.fixture?.date, right.fixture?.date))
        .slice(0, maxMatches)

      if (!recentFixtures.length) continue

      const lineupResponses = await mapWithConcurrency(
        recentFixtures,
        4,
        async (row) => {
          const fixtureId = row.fixture?.id
          if (!fixtureId) return null

          const lineupCacheKey = `fixture:lineups:${fixtureId}`
          const cachedLineups = getCached<Array<{ team?: { id?: number }; formation?: string }> | null>(lineupCacheKey)
          if (cachedLineups !== null) return cachedLineups

          try {
            const lineupRes = await client.get('/fixtures/lineups', { params: { fixture: fixtureId } })
            const lineups = (lineupRes.data?.response || []) as Array<{ team?: { id?: number }; formation?: string }>
            setCache(lineupCacheKey, lineups, TTL.LINEUPS)
            return lineups
          } catch {
            setCache(lineupCacheKey, null, TTL.LINEUPS)
            return null
          }
        }
      )

      const counts = new Map<string, { count: number; latestDate: string }>()
      for (let index = 0; index < recentFixtures.length; index += 1) {
        const row = recentFixtures[index]
        const fixtureDate = row.fixture?.date || ''
        const lineups = lineupResponses[index] || []
        const teamLineup = lineups.find((lineup) => lineup?.team?.id === teamId)
        const formation = normalizeFormation(teamLineup?.formation)
        if (!formation) continue

        const existing = counts.get(formation)
        if (!existing) {
          counts.set(formation, { count: 1, latestDate: fixtureDate })
          continue
        }

        counts.set(formation, {
          count: existing.count + 1,
          latestDate: existing.latestDate > fixtureDate ? existing.latestDate : fixtureDate,
        })
      }

      const formations = Array.from(counts.entries())
        .map(([formation, meta]) => ({
          formation,
          count: meta.count,
          latestDate: meta.latestDate,
        }))
        .sort((left, right) => {
          if (right.count !== left.count) return right.count - left.count
          return compareIsoDateDesc(left.latestDate, right.latestDate)
        })

      const result: RecentTeamFormations = {
        primaryFormation: formations[0]?.formation || null,
        formations: formations.map(({ formation, count }) => ({ formation, count })),
        sampleSize: formations.reduce((sum, item) => sum + item.count, 0),
        season,
      }

      setCache(cacheKey, result, TTL.FORMATIONS)
      return result
    } catch {
      continue
    }
  }

  const empty: RecentTeamFormations = {
    primaryFormation: null,
    formations: [],
    sampleSize: 0,
    season: null,
  }
  setCache(cacheKey, empty, TTL.FORMATIONS)
  return empty
}

export async function getLiveManagerSnapshot(
  coachName: string,
  options?: { maxMatches?: number }
): Promise<ManagerLiveSnapshot | null> {
  const maxMatches = options?.maxMatches ?? 10
  const cacheKey = `manager:snapshot:${coachName.trim().toLowerCase()}:${maxMatches}`
  const cachedEntry = cache.get(cacheKey)
  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.data === NULL_MANAGER_SNAPSHOT
      ? null
      : cachedEntry.data as ManagerLiveSnapshot
  }

  const cacheSnapshot = (snapshot: ManagerLiveSnapshot | null) => {
    setCache(cacheKey, snapshot ?? NULL_MANAGER_SNAPSHOT, TTL.MANAGER_SNAPSHOT)
  }

  const [coach, tmManager] = await Promise.all([
    getLiveCoachByName(coachName),
    searchManager(coachName).catch(() => null),
  ])
  const tmManagerProfile = tmManager?.id
    ? await getManagerProfileSnapshot(tmManager.id).catch(() => null)
    : null

  const afLiveContext = coach ? getCoachLiveContext(coach) : null
  const tmCurrentClub = tmManager?.currentClub || null
  const afActiveContext = afLiveContext?.status === 'active' ? afLiveContext : null
  const tmMatchesAFActiveClub = Boolean(
    tmCurrentClub &&
    afActiveContext?.currentClub &&
    clubsLikelyMatch(tmCurrentClub, afActiveContext.currentClub)
  )

  const liveContext: CoachLiveContext | null = tmManager
    ? tmCurrentClub
      ? tmMatchesAFActiveClub && afActiveContext
        ? {
            ...afActiveContext,
            currentClub: tmCurrentClub,
            referenceClub: tmCurrentClub,
            referenceStart: afActiveContext.referenceStart || tmManagerProfile?.latestAppointed || null,
          }
        : {
            status: 'active',
            currentClub: tmCurrentClub,
            currentTeamId: null,
            currentStart: tmManagerProfile?.latestAppointed || null,
            referenceClub: tmCurrentClub,
            referenceTeamId: null,
            referenceStart: tmManagerProfile?.latestAppointed || null,
            referenceEnd: null,
          }
      : {
          status: 'free_agent',
          currentClub: null,
          currentTeamId: null,
          currentStart: null,
          referenceClub: afLiveContext?.referenceClub || tmManagerProfile?.latestClub || null,
          referenceTeamId: afLiveContext?.referenceTeamId || null,
          referenceStart: afLiveContext?.referenceStart || tmManagerProfile?.latestAppointed || null,
          referenceEnd: afLiveContext?.referenceEnd || tmManagerProfile?.latestInChargeUntil || null,
        }
    : afLiveContext

  if (!liveContext) {
    cacheSnapshot(null)
    return null
  }

  let referenceTeamId = liveContext.referenceTeamId
  if (!referenceTeamId && liveContext.referenceClub) {
    try {
      const teamMatches = await searchTeams(liveContext.referenceClub)
      referenceTeamId = teamMatches[0]?.team.id || null
    } catch {
      referenceTeamId = null
    }
  }

  let currentTeamId = liveContext.currentTeamId
  if (!currentTeamId && liveContext.currentClub && liveContext.currentClub === liveContext.referenceClub) {
    currentTeamId = referenceTeamId
  }

  const shouldUseTMFinalFormation = liveContext.status === 'active'
  let tmReferenceClubId = shouldUseTMFinalFormation ? tmManager?.currentClubId || null : null
  if (!tmReferenceClubId && shouldUseTMFinalFormation) {
    const tmClubQuery = liveContext.currentClub || liveContext.referenceClub
    if (tmClubQuery) {
      tmReferenceClubId = await searchClub(tmClubQuery).catch(() => null)
    }
  }

  const [formations, rawTMFinalFormation] = await Promise.all([
    referenceTeamId
      ? getRecentTeamFormations(referenceTeamId, {
          maxMatches: options?.maxMatches ?? 10,
          since: liveContext.referenceStart,
          until: liveContext.referenceEnd,
        })
      : Promise.resolve({ primaryFormation: null, formations: [], sampleSize: 0, season: null }),
    tmReferenceClubId ? getClubFinalFormation(tmReferenceClubId).catch(() => null) : Promise.resolve(null),
  ])

  const tmFinalFormation =
    shouldUseTMFinalFormation &&
    rawTMFinalFormation &&
    (
      !rawTMFinalFormation.trainerName ||
      namesMatch(rawTMFinalFormation.trainerName, tmManager?.name || coachName) ||
      namesMatch(rawTMFinalFormation.trainerName, coachName)
    )
      ? rawTMFinalFormation
      : null

  const profilePreferredFormation = tmManagerProfile?.preferredFormation || null
  const recentFormations = [
    ...formations.formations.map((item) => item.formation),
    ...(tmFinalFormation?.formation ? [tmFinalFormation.formation] : []),
    ...(profilePreferredFormation ? [profilePreferredFormation] : []),
  ].filter((formation, index, list) => Boolean(formation) && list.indexOf(formation) === index)

  const formationCounts = formations.formations.length > 0
    ? formations.formations
    : tmFinalFormation?.formation
    ? [{ formation: tmFinalFormation.formation, count: 1 }]
    : []

  const primaryFormation = formations.primaryFormation || tmFinalFormation?.formation || profilePreferredFormation || null
  const sampleSize = formations.sampleSize || (tmFinalFormation?.formation ? 1 : 0)

  const snapshot: ManagerLiveSnapshot = {
    name: tmManager?.name || (coach ? buildFullCoachName(coach) || coach.name : coachName),
    status: liveContext.status,
    currentClub: liveContext.currentClub,
    teamId: currentTeamId || null,
    referenceClub: liveContext.referenceClub,
    referenceTeamId: referenceTeamId || null,
    tenureStart: liveContext.referenceStart,
    primaryFormation,
    recentFormations,
    formationCounts,
    sampleSize,
    season: formations.season,
  }

  cacheSnapshot(snapshot)
  return snapshot
}

// Search for a coach by name, return their current team name (live from API)
export async function getCoachCurrentTeam(coachName: string): Promise<string | null> {
  const cacheKey = `coach:search:${coachName.toLowerCase()}`
  const cached = getCached<string>(cacheKey)
  if (cached !== null) return cached || null // '' means not found, non-empty means club name

  try {
    const match = await getLiveCoachByName(coachName)
    const liveContext = match ? getCoachLiveContext(match) : null
    const teamName = liveContext?.currentClub || ''
    setCache(cacheKey, teamName, TTL.COACHES)
    return teamName || null
  } catch {
    return null
  }
}

export async function resolveCoachByTeamName(teamName: string): Promise<APICoach | null> {
  const seenTeamIds = new Set<number>()
  const mergedResults: APITeam[] = []

  for (const searchQuery of buildTeamSearchQueries(teamName)) {
    try {
      const res = await client.get('/teams', { params: { search: searchQuery } })
      const batch: APITeam[] = (res.data?.response || [])
        .map((t: APITeam) => ({
          ...t,
          team: { ...t.team, country: normalizeCountry(t.team.country) },
        }))
        .filter((team: APITeam) => {
          if (seenTeamIds.has(team.team.id)) return false
          seenTeamIds.add(team.team.id)
          return true
        })

      mergedResults.push(...batch)

      const rankedSoFar = rankTeamResults(mergedResults, teamName)
      if (rankedSoFar[0]) break
    } catch {
      continue
    }
  }

  const bestTeam = rankTeamResults(mergedResults, teamName)[0]
  if (!bestTeam) return null
  return getCoach(bestTeam.team.id)
}

// Format player stats for display
export function formatPlayerStats(player: APIPlayer) {
  const stats = player.statistics[0]
  if (!stats) return null

  return {
    playerId: player.player.id,
    name: player.player.name,
    age: player.player.age,
    nationality: player.player.nationality,
    photo: player.player.photo,
    currentTeam: stats.team.name,
    teamLogo: stats.team.logo,
    league: stats.league.name,
    position: stats.games.position,
    appearances: stats.games.appearences || 0,
    minutes: stats.games.minutes || 0,
    rating: parseFloat(stats.games.rating || '0').toFixed(1),
    goals: stats.goals.total || 0,
    assists: stats.goals.assists || 0,
    shotsOnTarget: stats.shots?.on || 0,
    keyPasses: stats.passes?.key || 0,
    passAccuracy: stats.passes?.accuracy || '0',
    tackles: stats.tackles?.total || 0,
    interceptions: stats.tackles?.interceptions || 0,
    duelWinRate: stats.duels?.total
      ? Math.round(((stats.duels.won || 0) / stats.duels.total) * 100)
      : 0,
    dribbleSuccess: stats.dribbles?.attempts
      ? Math.round(((stats.dribbles.success || 0) / stats.dribbles.attempts) * 100)
      : 0,
  }
}

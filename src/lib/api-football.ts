import axios from 'axios'

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
  COACHES: 24 * 60 * 60 * 1000,     // 24 hours
}

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

// Search for teams by name
export async function searchTeams(query: string): Promise<APITeam[]> {
  const cacheKey = `teams:search:${query.toLowerCase()}`
  const cached = getCached<APITeam[]>(cacheKey)
  if (cached) return cached

  try {
    // Search by name only — no league/season filter, which causes empty results
    const res = await client.get('/teams', {
      params: { name: query },
    })
    const results: APITeam[] = res.data?.response || []
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
    if (team) setCache(cacheKey, team, TTL.TEAMS)
    return team
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
    const coach = res.data?.response?.[0] || null
    if (coach) setCache(cacheKey, coach, TTL.COACHES)
    return coach
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

// Search for a coach by name, return their current team name (live from API)
export async function getCoachCurrentTeam(coachName: string): Promise<string | null> {
  const nameParts = coachName.trim().split(' ')
  const lastName = nameParts[nameParts.length - 1]
  const cacheKey = `coach:search:${coachName.toLowerCase()}`
  const cached = getCached<string>(cacheKey)
  if (cached !== null) return cached || null // '' means not found, non-empty means club name

  try {
    const res = await client.get('/coachs', { params: { search: lastName } })
    const coaches: APICoach[] = res.data?.response || []

    if (!coaches.length) {
      setCache(cacheKey, '', TTL.COACHES)
      return null
    }

    // Prefer exact full-name match, then last-name match, then first result
    const lowerTarget = coachName.toLowerCase()
    const match =
      coaches.find((c) => c.name.toLowerCase() === lowerTarget) ||
      coaches.find((c) => c.name.toLowerCase().includes(lastName.toLowerCase())) ||
      coaches[0]

    const teamName = match?.team?.name || ''
    setCache(cacheKey, teamName, TTL.COACHES)
    return teamName || null
  } catch {
    return null
  }
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

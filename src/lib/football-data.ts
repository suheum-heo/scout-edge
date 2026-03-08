/**
 * football-data.org v4 client
 * Free tier: 10 req/min, no daily cap
 * Covers: PL, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie, Brasileirao, CL, PPL
 * Key advantage: returns CURRENT coach and CURRENT squad in one call per team
 *
 * Add FOOTBALL_DATA_KEY to .env.local
 */

import axios from 'axios'

const BASE_URL = 'https://api.football-data.org/v4'

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Auth-Token': process.env.FOOTBALL_DATA_KEY || '',
  },
  timeout: 15000,
})

// ── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; expiresAt: number }>()

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null }
  return entry.data as T
}

function setCache(key: string, data: unknown, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

const TTL = {
  SQUAD: 6 * 60 * 60 * 1000,    // 6 hours — coaches change rarely, squads less often
  COACH: 6 * 60 * 60 * 1000,
  TEAMS: 24 * 60 * 60 * 1000,   // 24 hours — competition teams rarely change
}

// Competition codes on football-data.org (free tier supports all)
const FD_COMPETITIONS = ['PL', 'ELC', 'PD', 'SA', 'BL1', 'FL1', 'PPL', 'DED']

interface FDTeamSummary {
  id: number
  name: string
  shortName?: string
  tla?: string
  crest?: string
  area?: { name: string }
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/**
 * Fetches all teams across supported competitions and caches for 24h.
 * Guarantees football-data.org IDs — no cross-system mismatch.
 */
async function getAllFDTeams(): Promise<FDTeamSummary[]> {
  const cacheKey = 'fd:all-teams'
  const cached = getCached<FDTeamSummary[]>(cacheKey)
  if (cached) return cached

  const allTeams: FDTeamSummary[] = []
  const seen = new Set<number>()

  for (const code of FD_COMPETITIONS) {
    try {
      const res = await client.get<{ teams: FDTeamSummary[] }>(`/competitions/${code}/teams`)
      for (const t of res.data.teams || []) {
        if (!seen.has(t.id)) { seen.add(t.id); allTeams.push(t) }
      }
    } catch { /* skip unsupported competition */ }
  }

  if (allTeams.length > 0) setCache(cacheKey, allTeams, TTL.TEAMS)
  return allTeams
}

/**
 * Search teams by name using football-data.org data (correct IDs guaranteed).
 * Returns same shape as searchLocalTeams so teams/route.ts needs no changes.
 */
export async function searchFDTeams(query: string): Promise<Array<{
  team: { id: number; name: string; country: string; logo: string }
  venue: { name: string; city: string }
}>> {
  const q = normalize(query)
  if (q.length < 2) return []

  const teams = await getAllFDTeams()

  return teams
    .map((t) => {
      const normName = normalize(t.name)
      const normShort = normalize(t.shortName || '')
      const normTla = normalize(t.tla || '')
      let score = 0
      if (normName === q || normShort === q || normTla === q)             score = 100
      else if (normName.startsWith(q) || normShort.startsWith(q))        score = 90
      else if (normName.includes(q) || normShort.includes(q))            score = 70
      return { team: t, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ team: t }) => ({
      team: {
        id: t.id,
        name: t.name,
        country: t.area?.name || '',
        logo: t.crest || `https://crests.football-data.org/${t.id}.png`,
      },
      venue: { name: '', city: '' },
    }))
}

// ── Same output types as api-football.ts so nothing else changes ─────────────

export interface APICoach {
  id: number
  name: string
  firstname: string
  lastname: string
  nationality: string
  photo: string
  team: { id: number; name: string; logo: string }
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcAge(dateOfBirth: string): number {
  if (!dateOfBirth) return 0
  const dob = new Date(dateOfBirth)
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

/** Map football-data.org position strings to our 4-category codes */
function mapPosition(pos: string | undefined): string {
  if (!pos) return 'Midfielder'
  const p = pos.toLowerCase()
  if (p.includes('goalkeeper') || p === 'gk') return 'Goalkeeper'
  if (
    p.includes('back') ||
    p.includes('defence') ||
    p.includes('center-back') ||
    p.includes('centre-back') ||
    p === 'defender'
  ) return 'Defender'
  if (
    p.includes('forward') ||
    p.includes('winger') ||
    p.includes('striker') ||
    p === 'offence' ||
    p === 'attack'
  ) return 'Attacker'
  return 'Midfielder'
}

function teamLogoUrl(id: number): string {
  return `https://crests.football-data.org/${id}.png`
}

// ── API Functions ─────────────────────────────────────────────────────────────

interface FDTeam {
  id: number
  name: string
  shortName?: string
  crest?: string
  venue?: string
  coach?: {
    id: number
    name: string
    firstName?: string
    lastName?: string
    nationality?: string
    dateOfBirth?: string
  }
  squad?: Array<{
    id: number
    name: string
    position?: string
    dateOfBirth?: string
    nationality?: string
  }>
  runningCompetitions?: Array<{ id: number; name: string; code: string }>
}

/**
 * Fetch current squad + coach for a team in one call.
 * Returns { players: APIPlayer[], coach: APICoach | null }
 */
export async function getTeamData(
  teamId: number
): Promise<{ players: APIPlayer[]; coach: APICoach | null }> {
  const cacheKey = `fd:team:${teamId}`
  const cached = getCached<{ players: APIPlayer[]; coach: APICoach | null }>(cacheKey)
  if (cached) return cached

  try {
    const res = await client.get<FDTeam>(`/teams/${teamId}`)
    const data = res.data

    const teamName = data.shortName || data.name || ''
    const competition = data.runningCompetitions?.[0]
    const leagueId = competition?.id || 0
    const leagueName = competition?.name || ''

    // Map squad members → APIPlayer (no stats — football-data.org free doesn't include them)
    const players: APIPlayer[] = (data.squad || []).map((p) => ({
      player: {
        id: p.id,
        name: p.name,
        firstname: p.name.split(' ').slice(0, -1).join(' '),
        lastname: p.name.split(' ').pop() || '',
        age: calcAge(p.dateOfBirth || ''),
        nationality: p.nationality || '',
        photo: '',
        height: '',
        weight: '',
      },
      statistics: [
        {
          team: { id: teamId, name: teamName, logo: teamLogoUrl(teamId) },
          league: { id: leagueId, name: leagueName, country: '', logo: '' },
          games: {
            appearences: 0,
            lineups: 0,
            minutes: 0,
            position: mapPosition(p.position),
            rating: '0',
          },
          goals: { total: 0, assists: 0 },
          shots: { total: 0, on: 0 },
          passes: { total: 0, key: 0, accuracy: '0' },
          tackles: { total: 0, interceptions: 0 },
          duels: { total: 0, won: 0 },
          dribbles: { attempts: 0, success: 0 },
        },
      ],
    }))

    // Map coach — prefer firstName+lastName to avoid abbreviated "S. Parker" style names
    let coach: APICoach | null = null
    if (data.coach?.name) {
      const firstName = data.coach.firstName || ''
      const lastName = data.coach.lastName || ''
      const fullName =
        firstName && lastName
          ? `${firstName} ${lastName}`
          : data.coach.name
      coach = {
        id: data.coach.id || 0,
        name: fullName,
        firstname: firstName || data.coach.name.split(' ').slice(0, -1).join(' '),
        lastname: lastName || data.coach.name.split(' ').pop() || '',
        nationality: data.coach.nationality || '',
        photo: '',
        team: { id: teamId, name: teamName, logo: teamLogoUrl(teamId) },
      }
    }

    const result = { players, coach }
    setCache(cacheKey, result, TTL.SQUAD)
    return result
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(`[FD] getTeamData(${teamId}) failed:`, err.response?.status, err.response?.data)
    } else {
      console.error(`[FD] getTeamData(${teamId}) error:`, err)
    }
    return { players: [], coach: null }
  }
}

/** formatPlayerStats — same output shape as api-football.ts */
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
    appearances: 0,
    minutes: 0,
    rating: '0.0',
    goals: 0,
    assists: 0,
    shotsOnTarget: 0,
    keyPasses: 0,
    passAccuracy: '0',
    tackles: 0,
    interceptions: 0,
    duelWinRate: 0,
    dribbleSuccess: 0,
  }
}

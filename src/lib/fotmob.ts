/**
 * FotMob unofficial API client
 * Endpoints are reverse-engineered from the FotMob web app.
 * No API key required. All calls are made server-side (no CORS issue).
 *
 * If FotMob changes their API structure, check console.error logs to see
 * the raw response and update the parsing helpers below.
 */

import axios from 'axios'

const BASE_URL = 'https://www.fotmob.com/api'

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.fotmob.com/',
    Origin: 'https://www.fotmob.com',
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
  TEAMS: 24 * 60 * 60 * 1000,
  SQUAD: 6 * 60 * 60 * 1000,
  PLAYERS: 6 * 60 * 60 * 1000,
  COACHES: 6 * 60 * 60 * 1000,
}

// ── Shared interfaces (same shape as api-football.ts so nothing else changes) ─

export interface APITeam {
  team: { id: number; name: string; country: string; logo: string }
  venue: { name: string; city: string }
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

// ── Supported leagues (FotMob IDs) ───────────────────────────────────────────

export const SUPPORTED_LEAGUES = [
  { id: 47,  name: 'Premier League',   country: 'England' },
  { id: 87,  name: 'La Liga',          country: 'Spain' },
  { id: 55,  name: 'Serie A',          country: 'Italy' },
  { id: 54,  name: 'Bundesliga',       country: 'Germany' },
  { id: 53,  name: 'Ligue 1',          country: 'France' },
  { id: 268, name: 'Brasileirao',      country: 'Brazil' },
  { id: 366, name: 'K League 1',       country: 'South Korea' },
  { id: 271, name: 'J1 League',        country: 'Japan' },
]

export const CURRENT_SEASON = 2025

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Pull a numeric stat from FotMob's various stat array shapes */
function extractStat(
  stats: Array<{ key?: string; title?: string; value?: unknown; stat?: { value?: unknown } }> | undefined,
  ...keys: string[]
): number {
  if (!stats?.length) return 0
  const keySet = new Set(keys.map((k) => k.toLowerCase()))
  for (const s of stats) {
    const k = (s.key || s.title || '').toLowerCase()
    if (keySet.has(k)) {
      const raw = s.stat?.value ?? s.value
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '0'))
      return isNaN(n) ? 0 : Math.round(n)
    }
  }
  return 0
}

/** Convert FotMob role string to our position code */
function toPositionCode(role: string | undefined): string {
  if (!role) return 'Midfielder'
  const r = role.toUpperCase()
  if (r.startsWith('G')) return 'Goalkeeper'
  if (r.startsWith('D') || r === 'CB' || r === 'LB' || r === 'RB') return 'Defender'
  if (r.startsWith('F') || r === 'ST' || r === 'LW' || r === 'RW' || r === 'ATT' || r === 'FWD') return 'Attacker'
  return 'Midfielder'
}

/** Build a FotMob player photo URL */
function playerPhoto(id: number): string {
  return `https://images.fotmob.com/image_resources/playerimages/${id}.png`
}

/** Build a FotMob team logo URL */
function teamLogo(id: number | string): string {
  return `https://images.fotmob.com/image_resources/logo/teamlogo/${id}_small.png`
}

/** Map a FotMob squad member into our APIPlayer shape */
function memberToAPIPlayer(
  member: Record<string, unknown>,
  teamId: number,
  teamName: string,
  leagueId: number,
  leagueName: string,
  leagueCountry: string
): APIPlayer | null {
  const id = member.id as number
  const roleKey = (member.role as { key?: string } | undefined)?.key || ''
  if (!id || (member.isCoach as boolean) || roleKey === 'coach') return null
  // Players with no shirt number are loaned out — exclude them from squad analysis
  if (member.shirtNumber == null) return null

  const stats =
    (member.stats as Array<{ key?: string; title?: string; value?: unknown; stat?: { value?: unknown } }>) ||
    (member.stat as Array<{ key?: string; title?: string; value?: unknown; stat?: { value?: unknown } }>) ||
    []

  const roleObj = member.role as { fallback?: string; key?: string; id?: number } | undefined
  // positionIdsDesc gives specific multi-position string e.g. "LB,LM,LWB" — prefer over broad role fallback
  const positionIdsDesc = member.positionIdsDesc as string | undefined
  const roleStr = positionIdsDesc || roleObj?.fallback || (member.positionId as string) || ''

  // In current FotMob API (2025+) stats are direct fields on the member, not in stats array
  const goalsRaw = member.goals as number | null | undefined
  const assistsRaw = member.assists as number | null | undefined
  const ratingDirect = member.rating as number | null | undefined

  const goals = goalsRaw != null ? goalsRaw : extractStat(stats, 'goals', 'goal')
  const assists = assistsRaw != null ? assistsRaw : extractStat(stats, 'assists', 'assist')
  const appearances = extractStat(stats, 'matches played', 'appearances', 'games', 'matches')
  const minutes = extractStat(stats, 'minutes played', 'minutes')
  const tackles = extractStat(stats, 'tackles', 'tackle')
  const interceptions = extractStat(stats, 'interceptions', 'interception')
  const keyPasses = extractStat(stats, 'key passes', 'chances created', 'key pass')
  const duelTotal = extractStat(stats, 'duels', 'total duels')
  const duelWon = extractStat(stats, 'duels won')

  // Rating: prefer direct field, fall back to stats array
  const ratingRaw = (() => {
    if (ratingDirect != null && ratingDirect > 0) return ratingDirect.toFixed(2)
    for (const s of stats) {
      const k = (s.key || s.title || '').toLowerCase()
      if (k.includes('rating') || k === 'fotmob rating') {
        const v = s.stat?.value ?? s.value
        const n = parseFloat(String(v ?? '0'))
        if (!isNaN(n) && n > 0) return n.toFixed(1)
      }
    }
    return '0.0'
  })()

  return {
    player: {
      id,
      name: (member.name as string) || '',
      firstname: '',
      lastname: '',
      age: (member.age as number) || 0,
      nationality: (member.cname as string) || '',
      photo: playerPhoto(id),
      height: '',
      weight: '',
    },
    statistics: [
      {
        team: { id: teamId, name: teamName, logo: teamLogo(teamId) },
        league: { id: leagueId, name: leagueName, country: leagueCountry, logo: '' },
        games: {
          appearences: appearances,
          lineups: appearances,
          minutes,
          // Use FotMob's specific position string (e.g. "Center-back", "Left back") so
          // Claude can distinguish between CBs and full-backs rather than seeing "Defender" for all.
          // toPositionCode() is kept for SquadGap.positionCode (broad UI category).
          position: roleStr || toPositionCode(roleStr),
          rating: ratingRaw,
        },
        goals: { total: goals, assists },
        shots: { total: 0, on: 0 },
        passes: { total: 0, key: keyPasses, accuracy: '0' },
        tackles: { total: tackles, interceptions },
        duels: { total: duelTotal, won: duelWon },
        dribbles: { attempts: 0, success: 0 },
      },
    ],
  }
}

// ── API Functions ─────────────────────────────────────────────────────────────

/** Search teams by name — FotMob handles partial matches and nicknames natively */
export async function searchTeams(query: string): Promise<APITeam[]> {
  const cacheKey = `fm:teams:search:${query.toLowerCase()}`
  const cached = getCached<APITeam[]>(cacheKey)
  if (cached) return cached

  try {
    const res = await client.get('/searchpage', { params: { term: query } })
    const data = res.data

    // FotMob returns { squad:[], team:[], player:[], manager:[], league:[] }
    const teams: Array<Record<string, unknown>> = data?.team || data?.data?.team?.hits || []

    const results: APITeam[] = teams
      .filter((t) => t.type !== 'national') // skip national teams
      .map((t) => {
        const id = Number(t.id)
        return {
          team: {
            id,
            name: (t.name as string) || (t.shortName as string) || '',
            country: (t.country as string) || '',
            logo: teamLogo(id),
          },
          venue: { name: '', city: '' },
        }
      })
      .filter((t) => t.team.id && t.team.name)

    setCache(cacheKey, results, TTL.TEAMS)
    return results
  } catch (err) {
    // /searchpage returns 404 — FotMob removed this endpoint. Log only non-404 errors.
    const status = (err as { status?: number; response?: { status?: number } })?.response?.status
    if (status !== 404) console.error('[FotMob] searchTeams error:', err)
    return []
  }
}

/** Fetch squad for a team with per-player season stats */
export async function getSquad(teamId: number): Promise<APIPlayer[]> {
  const cacheKey = `fm:squad:${teamId}`
  const cached = getCached<APIPlayer[]>(cacheKey)
  if (cached && cached.length > 0) return cached

  try {
    const res = await client.get('/teams', {
      params: { id: teamId, tab: 'squad', type: 'players', timeZone: 'UTC' },
    })
    const data = res.data

    // Try to identify the league from team details
    const leagueData = data?.details?.selectedSeason || data?.overview?.leagueData
    const leagueId: number = leagueData?.id || 0
    const leagueName: string = leagueData?.name || leagueData?.ccode || ''
    const leagueCountry: string = data?.details?.country || ''
    const teamName: string = data?.details?.name || data?.details?.shortName || ''

    // Squad members may be in various shapes depending on FotMob API version:
    //   1. data.squad.squad — array of position groups [{title, members:[...]}, ...]  (current)
    //   2. data.squad.members — flat array
    //   3. data.members — flat array
    //   4. data.squad — array of position groups [{title, members:[...]}, ...]
    //   5. data.squad — flat array of players
    let rawMembers: Array<Record<string, unknown>> = []

    const squadInner = data?.squad?.squad  // current structure: doubly nested
    if (Array.isArray(squadInner)) {
      const groups = squadInner as Array<Record<string, unknown>>
      if (groups.length > 0 && Array.isArray(groups[0]?.members)) {
        rawMembers = groups.flatMap((g) => (g.members as Array<Record<string, unknown>>) || [])
      } else {
        rawMembers = groups
      }
    } else if (Array.isArray(data?.squad?.members)) {
      rawMembers = data.squad.members
    } else if (Array.isArray(data?.members)) {
      rawMembers = data.members
    } else if (Array.isArray(data?.squad)) {
      const groups = data.squad as Array<Record<string, unknown>>
      if (groups.length > 0 && Array.isArray(groups[0]?.members)) {
        rawMembers = groups.flatMap((g) => (g.members as Array<Record<string, unknown>>) || [])
      } else {
        rawMembers = groups
      }
    }

    if (!rawMembers.length) {
      const squadObj = data?.squad
      console.error(
        '[FotMob] getSquad: no members found. Raw keys:', Object.keys(data || {}),
        'squad type:', typeof squadObj,
        'squad keys:', squadObj && typeof squadObj === 'object' ? Object.keys(squadObj) : 'n/a',
      )
      return []
    }

    let players = rawMembers
      .map((m) => memberToAPIPlayer(m, teamId, teamName, leagueId, leagueName, leagueCountry))
      .filter((p): p is APIPlayer => p !== null)

    // Enrich with minutes/appearances from league stats endpoint
    // data.stats contains primaryLeagueId and primarySeasonId from the same response
    const statsBlock = data?.stats as Record<string, unknown> | undefined
    const primaryLeagueId: number = Number(statsBlock?.primaryLeagueId || 0)
    const primarySeasonId: string = String(statsBlock?.primarySeasonId || '')
    if (primaryLeagueId && primarySeasonId) {
      try {
        const minsUrl = `https://data.fotmob.com/stats/${primaryLeagueId}/season/${primarySeasonId}/mins_played.json`
        const minsRes = await client.get(minsUrl, { baseURL: '' })
        const topLists = minsRes.data?.TopLists as Array<{ StatList?: Array<Record<string, unknown>> }> | undefined
        const statList = topLists?.[0]?.StatList || []
        const minsMap = new Map<number, { minutes: number; appearances: number }>()
        for (const entry of statList) {
          const pid = Number(entry.ParticiantId || 0)
          if (pid) {
            minsMap.set(pid, {
              minutes: Number(entry.MinutesPlayed || 0),
              appearances: Number(entry.MatchesPlayed || 0),
            })
          }
        }
        // Patch each player's statistics with actual minutes/appearances
        players = players.map((p) => {
          const m = minsMap.get(p.player.id)
          if (!m) return p
          const stat = p.statistics[0]
          return {
            ...p,
            statistics: [{ ...stat, games: { ...stat.games, minutes: m.minutes, appearences: m.appearances, lineups: m.appearances } }],
          }
        })
        console.log(`[FotMob] Enriched ${players.filter(p => (p.statistics[0]?.games.minutes ?? 0) > 0).length}/${players.length} players with minutes from league stats`)
      } catch (e) {
        console.warn('[FotMob] minutes enrichment failed (non-critical):', (e as Error).message)
      }
    }

    setCache(cacheKey, players, TTL.SQUAD)
    return players
  } catch (err) {
    console.error('[FotMob] getSquad error:', err)
    return []
  }
}

/** Get the current head coach for a team */
export async function getCoach(teamId: number): Promise<APICoach | null> {
  const cacheKey = `fm:coach:${teamId}`
  const cached = getCached<APICoach>(cacheKey)
  if (cached) return cached

  try {
    const res = await client.get('/teams', {
      params: { id: teamId, tab: 'squad', type: 'players', timeZone: 'UTC' },
    })
    const data = res.data

    // Coach might be in squad.members with isCoach=true, or in a separate field
    let rawMembers: Array<Record<string, unknown>> = []
    const squadInnerC = data?.squad?.squad
    if (Array.isArray(squadInnerC)) {
      const groups = squadInnerC as Array<Record<string, unknown>>
      if (groups.length > 0 && Array.isArray(groups[0]?.members)) {
        rawMembers = groups.flatMap((g) => (g.members as Array<Record<string, unknown>>) || [])
      } else {
        rawMembers = groups
      }
    } else if (Array.isArray(data?.squad?.members)) {
      rawMembers = data.squad.members
    } else if (Array.isArray(data?.members)) {
      rawMembers = data.members
    } else if (Array.isArray(data?.squad)) {
      const groups = data.squad as Array<Record<string, unknown>>
      if (groups.length > 0 && Array.isArray(groups[0]?.members)) {
        rawMembers = groups.flatMap((g) => (g.members as Array<Record<string, unknown>>) || [])
      } else {
        rawMembers = groups
      }
    }

    const coachMember = rawMembers.find(
      (m) => m.isCoach === true || (m.role as { key?: string } | undefined)?.key === 'coach'
    )
    const coachFromDetails = data?.details?.coachName || data?.details?.coach?.name

    const coachName =
      (coachMember?.name as string) || (coachFromDetails as string) || null

    if (!coachName) return null

    const coachId = coachMember?.id as number || 0
    const coach: APICoach = {
      id: coachId,
      name: coachName,
      firstname: '',
      lastname: coachName.split(' ').pop() || '',
      nationality: (coachMember?.cname as string) || '',
      photo: coachId ? playerPhoto(coachId) : '',
      team: {
        id: teamId,
        name: data?.details?.name || '',
        logo: teamLogo(teamId),
      },
    }

    setCache(cacheKey, coach, TTL.COACHES)
    return coach
  } catch (err) {
    console.error('[FotMob] getCoach error:', err)
    return null
  }
}

/** Get players in a league filtered by position (for recommendations) */
export async function searchPlayersByPosition(
  position: string,
  excludeTeamId?: number,
  leagueId?: number
): Promise<APIPlayer[]> {
  const targetLeague = SUPPORTED_LEAGUES.find((l) => l.id === leagueId) || SUPPORTED_LEAGUES[0]
  const cacheKey = `fm:players:${position}:${targetLeague.id}`
  const cached = getCached<APIPlayer[]>(cacheKey)
  if (cached) {
    return excludeTeamId
      ? cached.filter((p) => p.statistics[0]?.team.id !== excludeTeamId)
      : cached
  }

  // Map our position codes to FotMob stat filter
  const fotmobPos: Record<string, string> = {
    Goalkeeper: 'goalkeeper',
    Defender: 'defender',
    Midfielder: 'midfielder',
    Attacker: 'forward',
  }
  const posFilter = fotmobPos[position] || position.toLowerCase()

  try {
    const res = await client.get('/leagues', {
      params: {
        id: targetLeague.id,
        tab: 'stats',
        type: 'players',
        stat: 'rating_weighted',
        positionId: posFilter,
      },
    })
    const data = res.data

    // FotMob league stats response: { stats: { players: [...] } } or similar
    const rawPlayers: Array<Record<string, unknown>> =
      data?.stats?.players ||
      data?.data?.players ||
      data?.players ||
      []

    if (!rawPlayers.length) {
      console.error('[FotMob] searchPlayersByPosition: no players. Keys:', Object.keys(data || {}))
      return []
    }

    const players = rawPlayers.map((p): APIPlayer => {
      const id = Number(p.id || p.playerId)
      const teamId = Number((p.teamId as number) || 0)
      const stats = (p.stats as Array<{ key?: string; title?: string; value?: unknown; stat?: { value?: unknown } }>) || []
      return {
        player: {
          id,
          name: (p.name as string) || (p.playerName as string) || '',
          firstname: '',
          lastname: '',
          age: Number(p.age || 0),
          nationality: (p.cname as string) || (p.nationality as string) || '',
          photo: playerPhoto(id),
          height: '',
          weight: '',
        },
        statistics: [
          {
            team: { id: teamId, name: (p.teamName as string) || '', logo: teamLogo(teamId) },
            league: { id: targetLeague.id, name: targetLeague.name, country: targetLeague.country, logo: '' },
            games: {
              appearences: extractStat(stats, 'matches played', 'appearances'),
              lineups: 0,
              minutes: extractStat(stats, 'minutes played'),
              position: toPositionCode((p.positionId as string) || posFilter),
              rating: (() => {
                const r = extractStat(stats, 'fotmob rating', 'rating')
                return r > 0 ? (r / 10).toFixed(1) : '0.0' // FotMob rating might be 0-100
              })(),
            },
            goals: {
              total: extractStat(stats, 'goals', 'goal'),
              assists: extractStat(stats, 'assists'),
            },
            shots: { total: 0, on: 0 },
            passes: {
              total: 0,
              key: extractStat(stats, 'key passes', 'chances created'),
              accuracy: String(extractStat(stats, 'pass accuracy', 'accurate passes') || 0),
            },
            tackles: {
              total: extractStat(stats, 'tackles', 'tackle won'),
              interceptions: extractStat(stats, 'interceptions'),
            },
            duels: {
              total: extractStat(stats, 'duels', 'total duels'),
              won: extractStat(stats, 'duels won'),
            },
            dribbles: { attempts: 0, success: 0 },
          },
        ],
      }
    })

    setCache(cacheKey, players, TTL.PLAYERS)
    return excludeTeamId
      ? players.filter((p) => p.statistics[0]?.team.id !== excludeTeamId)
      : players
  } catch (err) {
    console.error('[FotMob] searchPlayersByPosition error:', err)
    return []
  }
}

/** Search for a specific player by name (for player-check page) */
export async function searchPlayerByName(name: string): Promise<APIPlayer | null> {
  const cacheKey = `fm:player:name:${name.toLowerCase()}`
  const cached = getCached<APIPlayer>(cacheKey)
  if (cached) return cached

  try {
    const res = await client.get('/searchpage', { params: { term: name } })
    const data = res.data

    const players: Array<Record<string, unknown>> =
      data?.player || data?.data?.player?.hits || []

    if (!players.length) return null

    // Pick the first match — FotMob orders by relevance
    const hit = players[0]
    const playerId = Number(hit.id)

    // Fetch full player data
    return await getPlayerById(playerId)
  } catch (err) {
    console.error('[FotMob] searchPlayerByName error:', err)
    return null
  }
}

/** Get a player's full stats by FotMob player ID */
export async function getPlayerById(playerId: number): Promise<APIPlayer | null> {
  const cacheKey = `fm:player:id:${playerId}`
  const cached = getCached<APIPlayer>(cacheKey)
  if (cached) return cached

  try {
    const res = await client.get('/playerData', { params: { id: playerId } })
    const data = res.data

    if (!data) return null

    // Player info
    const info = data.playerInformation || data.information || {}
    const name: string = data.name || data.playerName || info.name?.value || ''
    const age: number = Number(info.age?.value || info.age || data.age || 0)
    const nationality: string =
      info.country?.shortName || info.country?.value || info.nationality || ''

    const primaryTeam = info.primaryTeam || data.primaryTeam || {}
    const teamId: number = Number(primaryTeam.teamId || primaryTeam.id || 0)
    const teamName: string = primaryTeam.teamName || primaryTeam.name || ''

    // Main league stats
    const leagueStats = data.mainLeague?.stats?.items || data.stats?.items || []
    const leagueId: number = Number(data.mainLeague?.leagueId || 0)
    const leagueName: string = data.mainLeague?.leagueName || ''

    const posRaw: string = info.primaryPosition?.value || info.position || data.position || ''

    const player: APIPlayer = {
      player: {
        id: playerId,
        name,
        firstname: '',
        lastname: name.split(' ').pop() || '',
        age,
        nationality,
        photo: playerPhoto(playerId),
        height: String(info.height?.value || ''),
        weight: String(info.weight?.value || ''),
      },
      statistics: [
        {
          team: { id: teamId, name: teamName, logo: teamLogo(teamId) },
          league: { id: leagueId, name: leagueName, country: '', logo: '' },
          games: {
            appearences: extractStat(leagueStats, 'matches played', 'appearances', 'games'),
            lineups: 0,
            minutes: extractStat(leagueStats, 'minutes played', 'minutes'),
            position: toPositionCode(posRaw),
            rating: (() => {
              for (const s of leagueStats) {
                const k = (s.key || s.title || s.name || '').toLowerCase()
                if (k.includes('rating')) {
                  const v = s.stat?.value ?? s.value
                  const n = parseFloat(String(v ?? '0'))
                  if (!isNaN(n) && n > 0) return n.toFixed(1)
                }
              }
              return '0.0'
            })(),
          },
          goals: {
            total: extractStat(leagueStats, 'goals', 'goal'),
            assists: extractStat(leagueStats, 'assists', 'assist'),
          },
          shots: {
            total: extractStat(leagueStats, 'shots', 'total shots'),
            on: extractStat(leagueStats, 'shots on target'),
          },
          passes: {
            total: extractStat(leagueStats, 'passes', 'total passes'),
            key: extractStat(leagueStats, 'key passes', 'chances created', 'big chances created'),
            accuracy: String(extractStat(leagueStats, 'pass accuracy', 'accurate passes %') || 0),
          },
          tackles: {
            total: extractStat(leagueStats, 'tackles', 'tackle won', 'tackles won'),
            interceptions: extractStat(leagueStats, 'interceptions', 'interception'),
          },
          duels: {
            total: extractStat(leagueStats, 'duels', 'ground duels', 'aerial duels') * 2 || 0,
            won: extractStat(leagueStats, 'duels won', 'ground duels won', 'aerial duels won'),
          },
          dribbles: {
            attempts: extractStat(leagueStats, 'dribble attempts', 'dribbles attempted'),
            success: extractStat(leagueStats, 'dribbles', 'successful dribbles', 'dribble success'),
          },
        },
      ],
    }

    setCache(cacheKey, player, TTL.PLAYERS)
    return player
  } catch (err) {
    console.error('[FotMob] getPlayerById error:', err)
    return null
  }
}

// ── formatPlayerStats (same output shape as before) ──────────────────────────

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

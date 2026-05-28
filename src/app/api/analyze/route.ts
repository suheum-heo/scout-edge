import { NextRequest, NextResponse } from 'next/server'
import { normalizeLanguage } from '@/lib/i18n'

export const maxDuration = 60

// Minimal FIFA nation set for national team detection
const FIFA_NATIONS = new Set([
  'afghanistan','albania','algeria','andorra','angola','argentina','armenia','australia','austria','azerbaijan',
  'bahrain','bangladesh','belgium','bolivia','bosnia-herzegovina','botswana','brazil','bulgaria','burkina faso','burundi','cambodia',
  'cameroon','canada','cape verde','chile','china','colombia','comoros','congo','costa rica','croatia','cuba',
  'czech republic','czechia','denmark','dr congo','ecuador','egypt','el salvador','england','estonia','ethiopia',
  'finland','france','gabon','gambia','georgia','germany','ghana','greece','guatemala','guinea','guinea-bissau',
  'haiti','honduras','hungary','iceland','india','indonesia','iran','iraq','ireland','israel','italy','ivory coast',
  'jamaica','japan','jordan','kazakhstan','kenya','kuwait','latvia','lebanon','liberia','libya','liechtenstein',
  'lithuania','luxembourg','madagascar','malawi','malaysia','mali','malta','mauritania','mexico','moldova',
  'mongolia','montenegro','morocco','mozambique','namibia','nepal','netherlands','new zealand','nigeria',
  'north korea','north macedonia','northern ireland','norway','oman','pakistan','palestine','panama','paraguay',
  'peru','philippines','poland','portugal','qatar','republic of ireland','romania','russia','rwanda',
  'saudi arabia','scotland','senegal','serbia','sierra leone','slovakia','slovenia','somalia','south africa',
  'south korea','spain','sudan','sweden','switzerland','syria','tajikistan','tanzania','thailand','togo',
  'trinidad and tobago','tunisia','turkey','turkmenistan','uganda','ukraine','united arab emirates','united states',
  'uruguay','uzbekistan','venezuela','vietnam','wales','yemen','zambia','zimbabwe',
  'côte d\'ivoire','korea republic','uae','usa','democratic republic of congo',
])

function isNationalTeam(name: string): boolean {
  return FIFA_NATIONS.has(name.toLowerCase().trim())
}

const TM_TO_AF_TEAM_ID_OVERRIDES: Record<string, number> = {
  'al nassr': 2939,
  'al nassr fc': 2939,
}
import { getTeamData, formatPlayerStats, APIPlayer, APICoach, isLikelyYouthOnlySquad } from '@/lib/football-data'
import {
  getSquad,
  getCoach,
  getLiveManagerSnapshot,
  type ManagerLiveSnapshot,
  searchTeams as afSearchTeams,
  formatPlayerStats as afFormatPlayerStats,
} from '@/lib/api-football'
import {
  searchTeams as fotmobSearchTeams,
  getSquadAndCoach as fotmobGetSquadAndCoach,
  formatPlayerStats as fotmobFormatPlayerStats,
  APIPlayer as FotmobAPIPlayer,
} from '@/lib/fotmob'
import { getClubManager, getClubSquad, searchClub, searchManager, searchManagerByClub } from '@/lib/transfermarkt'
import { getManagerById, getManagerByName } from '@/lib/managers'
import { getCachedSquadAnalysisCore, getCachedSquadAnalysisDetails } from '@/lib/analyze-cache'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { localizeSquadAnalysisResult, resolveLocalizedEntityMap } from '@/lib/entity-localization'
import { translateCountryDisplayName } from '@/lib/country-names'
import { localizeManagerProfile } from '@/lib/runtime-localization'
import { createServerTiming } from '@/lib/server-timing'
import type { SquadPlayer } from '@/lib/role-profiles'
import { buildFullName, personNameTokens } from '@/lib/person-names'

type AFSearchTeamResult = Awaited<ReturnType<typeof afSearchTeams>>[number]

function normalizeTeamLookupName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/Ø/g, 'O')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function stripClubSuffixes(value: string): string {
  return normalizeTeamLookupName(value).replace(/\b(fc|cf|sc|afc|ac)\b/g, ' ').trim().replace(/\s+/g, ' ')
}

function getAFOverrideTeamId(teamName: string): number | null {
  const normalizedName = normalizeTeamLookupName(teamName)
  return TM_TO_AF_TEAM_ID_OVERRIDES[normalizedName] ?? TM_TO_AF_TEAM_ID_OVERRIDES[stripClubSuffixes(normalizedName)] ?? null
}

function hasSecondaryTeamMarker(value: string): boolean {
  return /\b(w|women|u\d{2}|ii|b|reserves)\b/.test(value)
}

function buildAFSearchVariants(teamName: string): string[] {
  const spacedName = teamName.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  const strippedName = spacedName.replace(/\b(fc|cf|sc|afc|ac)\b/gi, ' ').replace(/\s+/g, ' ').trim()
  const lastWord = strippedName.split(' ').filter(Boolean).at(-1) || ''

  return Array.from(new Set([
    teamName.trim(),
    spacedName,
    strippedName,
    lastWord.length >= 5 ? lastWord : '',
  ].filter(Boolean)))
}

function scoreAFTeamResult(team: AFSearchTeamResult, query: string): number {
  const normalizedName = normalizeTeamLookupName(team.team.name)
  const normalizedQuery = normalizeTeamLookupName(query)
  const strippedName = stripClubSuffixes(normalizedName)
  const strippedQuery = stripClubSuffixes(normalizedQuery)

  let score = 0
  if (strippedName === strippedQuery) score = 100
  else if (normalizedName === normalizedQuery) score = 95
  else if (strippedName.startsWith(strippedQuery) || strippedQuery.startsWith(strippedName)) score = 85
  else if (normalizedName.includes(strippedQuery) || strippedQuery.includes(normalizedName)) score = 70

  if (hasSecondaryTeamMarker(normalizedName) && !hasSecondaryTeamMarker(normalizedQuery)) {
    score -= 40
  }

  return score
}

function selectBestAFTeam(matches: AFSearchTeamResult[][], query: string): AFSearchTeamResult | null {
  const byId = new Map<number, AFSearchTeamResult>()

  for (const group of matches) {
    for (const team of group) {
      if (!byId.has(team.team.id)) {
        byId.set(team.team.id, team)
      }
    }
  }

  const allMatches = Array.from(byId.values())
  const primaryMatches = allMatches.filter((team) => !hasSecondaryTeamMarker(normalizeTeamLookupName(team.team.name)))
  const sortable = primaryMatches.length > 0 && !hasSecondaryTeamMarker(normalizeTeamLookupName(query))
    ? primaryMatches
    : allMatches

  return sortable.sort((left, right) => {
    const scoreDiff = scoreAFTeamResult(right, query) - scoreAFTeamResult(left, query)
    if (scoreDiff !== 0) return scoreDiff
    return left.team.name.length - right.team.name.length
  })[0] ?? null
}

function getVerifiedAFTeam(teamName: string, bestAfTeam: AFSearchTeamResult | null): AFSearchTeamResult | null {
  if (!bestAfTeam) return null
  return scoreAFTeamResult(bestAfTeam, teamName) >= 95 ? bestAfTeam : null
}

function getCoachDisplayName(coach: APICoach | null): string | null {
  if (!coach) return null

  const fullName = buildFullName(coach.firstname, coach.lastname, coach.name)
  const displayName = fullName || coach.name?.trim() || ''

  return displayName || null
}

function clubsLikelyMatchForManagerName(left?: string | null, right?: string | null): boolean {
  const normalizedLeft = stripClubSuffixes(left || '')
  const normalizedRight = stripClubSuffixes(right || '')

  if (!normalizedLeft || !normalizedRight) return false

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  )
}

function preferRicherManagerName(current?: string | null, candidate?: string | null): string | null {
  const base = current?.trim() || ''
  const next = candidate?.trim() || ''

  if (!next) return base || null
  if (!base) return next

  const baseTokens = personNameTokens(base)
  const nextTokens = personNameTokens(next)
  const sharesLastName =
    baseTokens.length > 0 &&
    nextTokens.length > 0 &&
    baseTokens.at(-1) === nextTokens.at(-1)

  if (sharesLastName && nextTokens.length > baseTokens.length) {
    return next
  }

  if (baseTokens.join(' ') === nextTokens.join(' ') && next.length > base.length) {
    return next
  }

  return base
}

function managerNamesLikelyMatch(left?: string | null, right?: string | null): boolean {
  const leftTokens = personNameTokens(left || '')
  const rightTokens = personNameTokens(right || '')

  if (!leftTokens.length || !rightTokens.length) return false
  if (leftTokens.join(' ') === rightTokens.join(' ')) return true

  const leftLast = leftTokens.at(-1)
  const rightLast = rightTokens.at(-1)
  const leftFirst = leftTokens[0]
  const rightFirst = rightTokens[0]

  return leftLast === rightLast && leftFirst?.[0] === rightFirst?.[0]
}

function getTrustedSnapshotManagerName(snapshot: ManagerLiveSnapshot | null, teamName: string): string | null {
  if (!snapshot?.name) return null

  if (
    clubsLikelyMatchForManagerName(snapshot.currentClub, teamName) ||
    clubsLikelyMatchForManagerName(snapshot.referenceClub, teamName)
  ) {
    return snapshot.name
  }

  return null
}

function tmManagerToCoach(manager: Awaited<ReturnType<typeof getClubManager>>, teamId: number | string, teamName: string): APICoach | null {
  if (!manager) return null

  const numericTeamId = typeof teamId === 'number' ? teamId : Number(teamId) || 0
  const numericManagerId = Number(manager.id) || 0

  return {
    id: numericManagerId,
    name: manager.name,
    firstname: '',
    lastname: '',
    nationality: '',
    photo: manager.profileImage ?? '',
    team: {
      id: numericTeamId,
      name: teamName,
      logo: '',
    },
  }
}

async function resolveTMManagerCoach(
  teamId: number | string,
  teamName: string,
  tmClubId?: string | null
): Promise<APICoach | null> {
  try {
    const resolvedTmClubId = tmClubId ?? await searchClub(teamName)
    if (!resolvedTmClubId) return null

    const tmManager = await getClubManager(String(resolvedTmClubId))
    return tmManagerToCoach(tmManager, teamId, teamName)
  } catch {
    return null
  }
}

async function resolveLiveManagerCoach(
  teamId: number | string,
  teamName: string,
  tmClubId?: string | null
): Promise<APICoach | null> {
  const tmCoach = await resolveTMManagerCoach(teamId, teamName, tmClubId)
  if (tmCoach) return tmCoach

  try {
    const tmManager = await searchManagerByClub(teamName)
    return tmManagerToCoach(
      tmManager
        ? {
            id: tmManager.id,
            name: tmManager.name,
            position: tmManager.functionTitle || 'Manager',
            age: tmManager.age,
            appointed: null,
            contractUntil: tmManager.contractUntil,
            countryIcon: null,
            profileImage: null,
            profileUrl: null,
          }
        : null,
      teamId,
      teamName
    )
  } catch {
    return null
  }
}

function formatTMFallbackSquad(
  teamName: string,
  tmPlayers: Awaited<ReturnType<typeof getClubSquad>>
) {
  if (!tmPlayers.length) return null

  return tmPlayers.map((p) => ({
    playerId: p.id,
    name: p.name,
    position: p.position,
    age: p.age ?? 0,
    nationality: p.nationality,
    appearances: 0,
    minutes: 0,
    rating: '0',
    goals: 0,
    assists: 0,
    currentTeam: teamName,
  }))
}

type AnalyzeSquadRow = {
  playerId?: number | string
  name: string
  position: string
  age: number
  nationality: string
  appearances: number
  minutes: number
  rating: string
  goals: number
  assists: number
  currentTeam?: string
}

interface CachedAnalyzeProviderContext {
  squad: AnalyzeSquadRow[]
  squadPlayers: SquadPlayer[]
  providerManagerName: string | null
  providerManagerPhoto: string | null
}

const ANALYZE_PROVIDER_TTL_MS = 10 * 60 * 1000
const analyzeProviderCache = new Map<string, { data: CachedAnalyzeProviderContext; expiresAt: number }>()

function getAnalyzeProviderCacheKey(teamId: number | string, teamName: string, teamSource?: string, fotmobId?: number | null) {
  return [
    'analyze-provider',
    String(teamSource ?? 'fd'),
    String(teamId),
    String(fotmobId ?? 'none'),
    normalizeTeamLookupName(teamName),
  ].join(':')
}

function getCachedAnalyzeProviderContext(cacheKey: string): CachedAnalyzeProviderContext | null {
  const entry = analyzeProviderCache.get(cacheKey)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    analyzeProviderCache.delete(cacheKey)
    return null
  }
  return entry.data
}

function setCachedAnalyzeProviderContext(cacheKey: string, data: CachedAnalyzeProviderContext) {
  analyzeProviderCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ANALYZE_PROVIDER_TTL_MS,
  })
}

function isAnalyzeSquadRow(value: AnalyzeSquadRow | null | undefined): value is AnalyzeSquadRow {
  return Boolean(value && value.name)
}

export async function POST(request: NextRequest) {
  const timing = createServerTiming()
  const requestStartedAt = timing.start()

  try {
    const body = await request.json()
    const { teamId, teamName, managerId, teamSource, fotmobId, excludedPlayerIds, analysisMode } = body
    const language = normalizeLanguage(typeof body.language === 'string' ? body.language : null)
    const excludedSet = new Set<string>(excludedPlayerIds ?? [])

    if (teamId == null || !teamName) {
      const response = NextResponse.json({ error: 'teamId and teamName are required' }, { status: 400 })
      timing.end('total', requestStartedAt)
      timing.apply(response.headers)
      return response
    }

    const providerFetchStartedAt = timing.start()
    const formatSquadStartedAt = timing.start()
    const providerCacheKey = getAnalyzeProviderCacheKey(teamId, teamName, teamSource, typeof fotmobId === 'number' ? fotmobId : null)
    const cachedProviderContext = getCachedAnalyzeProviderContext(providerCacheKey)

    let squad: AnalyzeSquadRow[] = cachedProviderContext?.squad ?? []
    let squadPlayers: SquadPlayer[] = cachedProviderContext?.squadPlayers ?? []
    let providerManagerName: string | null = cachedProviderContext?.providerManagerName ?? null
    let providerManagerPhoto: string | null = cachedProviderContext?.providerManagerPhoto ?? null

    if (cachedProviderContext) {
      const cachedHasStats = squad.some((p) => (p.appearances ?? 0) > 0 || parseFloat(p.rating || '0') > 0)
      timing.end('provider_fetch', providerFetchStartedAt, `source:${teamSource ?? 'fd'},cache:hit,squad:${squad.length},coach:${providerManagerName ? 'yes' : 'no'}`)
      timing.end('format_squad', formatSquadStartedAt, `cache:hit,players:${squadPlayers.length},stats:${cachedHasStats ? 'yes' : 'no'}`)
    } else {
      let squadRaw: APIPlayer[] = []
      let fotmobSquad: FotmobAPIPlayer[] = []
      let tmFormattedSquad: Array<{
        playerId: string; name: string; position: string; age: number; nationality: string;
        appearances: number; minutes: number; rating: string; goals: number; assists: number; currentTeam: string;
      }> | null = null
      let coach: APICoach | null = null
      let usedFotmob = false

      if (teamSource === 'tm') {
        console.log(`[analyze] TM team ${teamName} (${teamId}), fetching squad + coach`)
        const afSearchVariants = buildAFSearchVariants(teamName)
        const preferredFmId = typeof fotmobId === 'number' ? fotmobId : null
        const [tmPlayers, tmManager, afTeamMatches] = await Promise.all([
          getClubSquad(String(teamId)).catch(() => []),
          getClubManager(String(teamId)).catch(() => null),
          Promise.all(afSearchVariants.map((variant) => afSearchTeams(variant).catch(() => []))),
        ])
        const bestAfTeam = selectBestAFTeam(afTeamMatches, teamName)
        const verifiedAfTeam = getVerifiedAFTeam(teamName, bestAfTeam)
        tmFormattedSquad = formatTMFallbackSquad(teamName, tmPlayers)
        coach = tmManagerToCoach(tmManager, teamId, teamName)

        const preferredAfTeamId = getAFOverrideTeamId(teamName) ?? verifiedAfTeam?.team.id ?? null
        if (preferredAfTeamId && !coach) {
          try {
            coach = await getCoach(preferredAfTeamId)
          } catch {}
        }
        if (!preferredAfTeamId && bestAfTeam) {
          console.log(`[analyze] Rejecting fuzzy API Football team match for ${teamName}: ${bestAfTeam.team.name}`)
        }

        if (!coach) {
          const tryFotmobTeam = async (fmTeamId: number) => {
            try {
              const fmResult = await fotmobGetSquadAndCoach(fmTeamId)
              if (fmResult.coach) coach = fmResult.coach as unknown as APICoach
              if (!tmFormattedSquad && fmResult.squad.length) {
                fotmobSquad = fmResult.squad
                usedFotmob = true
              }
            } catch (e) {
              console.error('[analyze] TM-path FotMob fallback failed:', e)
            }
          }
          if (preferredFmId) await tryFotmobTeam(preferredFmId)
        }

        if (!coach) {
          coach = await resolveLiveManagerCoach(teamId, teamName, String(teamId))
        }

        if (!tmFormattedSquad && preferredAfTeamId) {
          try {
            squadRaw = await getSquad(preferredAfTeamId)
          } catch {}
        }
      } else if (teamSource === 'fotmob') {
        console.log(`[analyze] FotMob team ${teamName} (${teamId}), fetching squad directly`)
        try {
          const result = await fotmobGetSquadAndCoach(teamId)
          if (result.squad.length) {
            fotmobSquad = result.squad
            usedFotmob = true
            if (result.coach) coach = result.coach as unknown as APICoach
          }
        } catch (e) {
          console.error('[analyze] FotMob direct fetch failed:', e)
        }

        if (!coach) {
          coach = await resolveLiveManagerCoach(teamId, teamName)
        }

        if (!fotmobSquad.length) {
          try {
            const tmId = await searchClub(teamName)
            if (tmId) {
              const tmPlayers = await getClubSquad(tmId)
              tmFormattedSquad = formatTMFallbackSquad(teamName, tmPlayers)
            }
          } catch {}
        }
      } else if (teamSource === 'af') {
        const fmId: number | null = fotmobId ?? null
        console.log(`[analyze] AF team ${teamName}, parallel fetch (fotmobId=${fmId ?? 'none'})`)

        const [afCoach, fmResult, tmId] = await Promise.all([
          getCoach(teamId).catch(() => null),
          fmId ? fotmobGetSquadAndCoach(fmId).catch(() => null) : Promise.resolve(null),
          searchClub(teamName).catch(() => null),
        ])

        coach = (fmResult?.coach as unknown as APICoach | null) ?? afCoach

        if (!coach) {
          coach = await resolveLiveManagerCoach(teamId, teamName, tmId)
        }

        if (fmResult?.squad.length) {
          fotmobSquad = fmResult.squad
          usedFotmob = true
        } else if (tmId) {
          const tmPlayers = await getClubSquad(tmId).catch(() => [])
          tmFormattedSquad = formatTMFallbackSquad(teamName, tmPlayers)
        }

        if (!tmFormattedSquad && !usedFotmob) {
          try { squadRaw = await getSquad(teamId) } catch {}
        }
      } else {
        const fmId: number | null = fotmobId ?? null
        console.log(`[analyze] FD team ${teamName}, fetching FD+FotMob in parallel (fotmobId=${fmId ?? 'none'})`)

        const [fdData, fotmobResult, tmId] = await Promise.all([
          getTeamData(teamId),
          fmId ? fotmobGetSquadAndCoach(fmId).catch(() => null) : Promise.resolve(null),
          searchClub(teamName).catch(() => null),
        ])

        const fdSquadLooksYouth = isLikelyYouthOnlySquad(fdData.players)
        let tmPlayers: Awaited<ReturnType<typeof getClubSquad>> = []
        let tmCoach: APICoach | null = null

        if (tmId && (fdSquadLooksYouth || !fdData.coach)) {
          ;[tmPlayers, tmCoach] = await Promise.all([
            getClubSquad(tmId).catch(() => []),
            resolveLiveManagerCoach(teamId, teamName, tmId),
          ])
        }

        coach = (fotmobResult?.coach as unknown as APICoach | null) ?? fdData.coach ?? tmCoach

        if (fdSquadLooksYouth) {
          console.warn(`[analyze] Ignoring suspicious FD first-team payload for ${teamName}; attempting live fallback sources`)
          if (tmCoach) coach = tmCoach
        }

        if (fotmobResult?.squad.length) {
          fotmobSquad = fotmobResult.squad
          usedFotmob = true
        }

        if (!coach) {
          coach = tmCoach ?? await resolveLiveManagerCoach(teamId, teamName, tmId)
        }

        if (!usedFotmob) {
          try {
            const fmTeams = await fotmobSearchTeams(teamName)
            const resolvedFmId = fmTeams[0]?.team.id ?? null
            if (resolvedFmId) {
              const result = await fotmobGetSquadAndCoach(resolvedFmId)
              if (result.squad.length) {
                fotmobSquad = result.squad
                usedFotmob = true
                if (result.coach) coach = result.coach as unknown as APICoach
              }
            }
          } catch (e) {
            console.error('[analyze] FotMob search enrichment failed:', e)
          }
        }

        if (!usedFotmob) {
          if (fdSquadLooksYouth) {
            if (tmPlayers.length) {
              tmFormattedSquad = formatTMFallbackSquad(teamName, tmPlayers)
            } else {
              squadRaw = fdData.players
            }
          } else {
            squadRaw = fdData.players
          }

          if (!squadRaw.length && !tmFormattedSquad?.length && tmId) {
            try {
              const tmFallbackPlayers = tmPlayers.length ? tmPlayers : await getClubSquad(tmId).catch(() => [])
              tmFormattedSquad = formatTMFallbackSquad(teamName, tmFallbackPlayers)
            } catch {}
          }

          if (!squadRaw.length && !tmFormattedSquad?.length) {
            console.log(`[analyze] FD squad empty for ${teamName}, FD/FotMob/TM fallback all missed`)
          }
        }
      }

      const hasSquadData = !!(tmFormattedSquad?.length || fotmobSquad.length || squadRaw.length)
      if (!hasSquadData && teamSource !== 'tm') {
        const response = NextResponse.json(
          { error: `Could not fetch live squad data for ${teamName} right now. Our squad providers all missed on this request.` },
          { status: 404 }
        )
        timing.end('total', requestStartedAt)
        timing.apply(response.headers)
        return response
      }

      providerManagerName = getCoachDisplayName(coach)
      providerManagerPhoto = coach?.photo?.trim() || null
      let resolvedSquad: AnalyzeSquadRow[] = []
      if (tmFormattedSquad) {
        resolvedSquad = tmFormattedSquad
      } else if (usedFotmob) {
        resolvedSquad = fotmobSquad.reduce<AnalyzeSquadRow[]>((acc, player) => {
          const formatted = fotmobFormatPlayerStats(player)
          if (isAnalyzeSquadRow(formatted)) acc.push(formatted)
          return acc
        }, [])
      } else {
        resolvedSquad = squadRaw.reduce<AnalyzeSquadRow[]>((acc, player) => {
          const formatted = formatPlayerStats(player) ?? afFormatPlayerStats(player)
          if (isAnalyzeSquadRow(formatted)) acc.push(formatted)
          return acc
        }, [])
      }
      squad = resolvedSquad

      const hasStats = squad.some((p) => p && ((p.appearances ?? 0) > 0 || parseFloat(p.rating || '0') > 0))
      console.log(`[analyze] source=fotmob:${usedFotmob} squadSize=${squad.length} hasStats=${hasStats}`)
      if (usedFotmob && squad.length) {
        const defenders = squad.filter((p) => p && p.position?.match(/CB|LB|RB|LWB|RWB|Defender/))
        console.log('[analyze] Defenders:', defenders.map((p) => `${p.name}(pos:${p.position},rtg:${p.rating ?? '0'})`).join(', '))
      }

      squadPlayers = squad
        .filter(Boolean)
        .map((p) => ({
          playerId: String(p.playerId ?? ''),
          name: p.name,
          position: p.position ?? '',
          age: p.age ?? 0,
          nationality: p.nationality ?? '',
        }))
        .filter((p) => p.playerId && p.name)

      setCachedAnalyzeProviderContext(providerCacheKey, {
        squad,
        squadPlayers,
        providerManagerName,
        providerManagerPhoto,
      })

      timing.end(
        'provider_fetch',
        providerFetchStartedAt,
        `source:${teamSource ?? 'fd'},cache:miss,squad:${squad.length},coach:${providerManagerName ? 'yes' : 'no'}`
      )
      timing.end('format_squad', formatSquadStartedAt, `players:${squadPlayers.length},stats:${hasStats ? 'yes' : 'no'}`)
    }

    const hasSquadData = squad.length > 0
    if (!hasSquadData && teamSource !== 'tm') {
      const response = NextResponse.json(
        { error: `Could not fetch live squad data for ${teamName} right now. Our squad providers all missed on this request.` },
        { status: 404 }
      )
      timing.end('total', requestStartedAt)
      timing.apply(response.headers)
      return response
    }

    let manager = managerId ? getManagerById(managerId) : undefined
    const providerManagerProfile = providerManagerName ? getManagerByName(providerManagerName) : undefined

    if (!manager && providerManagerProfile) {
      manager = providerManagerProfile
    }

    // Filter excluded players (injured/suspended) before passing to Claude
    const availableSquad = excludedSet.size > 0
      ? squad.filter((p) => p && !excludedSet.has(String((p as { playerId?: number }).playerId ?? '')))
      : squad

    // Build unavailable player list for explicit prompt context
    const unavailablePlayers = excludedSet.size > 0
      ? squad
          .filter((p) => p && excludedSet.has(String((p as { playerId?: number }).playerId ?? '')))
          .map((p) => ({
            name: (p as { name: string }).name,
            position: (p as { position?: string }).position ?? '',
          }))
      : undefined

    // Detect national teams so recommendations can filter by nationality
    const nationalTeamCountry = isNationalTeam(teamName) ? teamName : null
    const initialManagerName = manager?.name ?? providerManagerName ?? null
    const managerSnapshotStartedAt = timing.start()
    const liveManagerSnapshot = initialManagerName
      ? await getLiveManagerSnapshot(initialManagerName, { maxMatches: 20 }).catch(() => null)
      : null
    timing.end('manager_snapshot', managerSnapshotStartedAt, initialManagerName ?? 'none')

    const snapshotManagerName = getTrustedSnapshotManagerName(liveManagerSnapshot, teamName)
    const snapshotManagerProfile = !manager && snapshotManagerName ? getManagerByName(snapshotManagerName) : undefined
    const resolvedManager = manager ?? snapshotManagerProfile ?? providerManagerProfile
    const factualManagerName = preferRicherManagerName(
      resolvedManager?.name ?? providerManagerName,
      snapshotManagerName
    )
    const managerNameHint = factualManagerName ?? undefined

    const allowManagerInference = Boolean(resolvedManager || factualManagerName)
    const analysisInput = {
      manager: resolvedManager || null,
      squadPlayers: availableSquad,
      teamName,
      managerName: managerNameHint,
      unavailablePlayers,
      allowManagerInference,
      language,
      liveFormationContext: liveManagerSnapshot
        ? {
            primaryFormation: liveManagerSnapshot.primaryFormation,
            recentFormations: liveManagerSnapshot.recentFormations,
            formationSampleSize: liveManagerSnapshot.sampleSize,
            formationSeason: liveManagerSnapshot.season,
            referenceClub: liveManagerSnapshot.referenceClub,
          }
        : undefined,
    }

    const requestedAnalysisMode = analysisMode === 'details' ? 'details' : 'core'
    const claudeStartedAt = timing.start()
    const coreAnalysis = await getCachedSquadAnalysisCore(analysisInput)
    let analysis
    if (requestedAnalysisMode === 'details') {
      const detailsAnalysis = await getCachedSquadAnalysisDetails(analysisInput, coreAnalysis)
      analysis = {
        ...coreAnalysis,
        ...detailsAnalysis,
        detailsStatus: 'complete' as const,
      }
    } else {
      analysis = {
        ...coreAnalysis,
        squadStrengths: [],
        squadWeaknesses: [],
        detailsStatus: 'partial' as const,
      }
    }
    if (factualManagerName) {
      analysis = {
        ...analysis,
        managerName: factualManagerName,
      }
    }
    const localizedAnalysis = await localizeSquadAnalysisResult(
      analysis,
      language,
      squadPlayers.map((player) => ({ name: player.name, entityType: 'player' as const }))
    )
    const squadNameMap = await resolveLocalizedEntityMap(
      squadPlayers.map((player) => ({ name: player.name, entityType: 'player' as const })),
      language,
      {
        displayPolicy:
          language === 'ko' || language === 'ja'
            ? 'bulk_display_cjk'
            : 'latin_safe_display',
      }
    )
    const localizedSquadPlayers = squadPlayers.map((player) => ({
      ...player,
      displayName: squadNameMap[player.name] || player.name,
      displayNationality: translateCountryDisplayName(player.nationality, language),
    }))
    timing.end(
      requestedAnalysisMode === 'details' ? 'claude_analysis_details' : 'claude_analysis_core',
      claudeStartedAt,
      requestedAnalysisMode
    )

    const inferredManagerName = analysis.managerName?.trim() || null
    const factualManagerVerified = Boolean(factualManagerName)
    const managerSource = managerId
      ? 'override'
      : factualManagerName
      ? 'provider'
      : 'unverified'

    const [tmManagerByClub, tmManagerByName, localizedManager] = await Promise.all([
      !managerId ? searchManagerByClub(teamName).catch(() => null) : Promise.resolve(null),
      factualManagerName ? searchManager(factualManagerName).catch(() => null) : Promise.resolve(null),
      resolvedManager ? localizeManagerProfile(resolvedManager, language).catch(() => resolvedManager) : Promise.resolve(null),
    ])
    const managerTransfermarktUrl =
      (tmManagerByClub && managerNamesLikelyMatch(tmManagerByClub.name, factualManagerName)
        ? tmManagerByClub.profileUrl
        : null) ||
      (tmManagerByName && managerNamesLikelyMatch(tmManagerByName.name, factualManagerName)
        ? tmManagerByName.profileUrl
        : null) ||
      tmManagerByClub?.profileUrl ||
      tmManagerByName?.profileUrl ||
      null
    const managerPhotoUrl = providerManagerPhoto || null

    console.log(
      `[analyze] managerResolution team=${teamName} source=${teamSource ?? 'fd'} provider=${providerManagerName ?? 'none'} inferred=${inferredManagerName ?? 'none'} factual=${factualManagerName ?? 'none'} managerSource=${managerSource}`
    )

    const response = NextResponse.json({
      analysis: localizedAnalysis,
      squad: localizedSquadPlayers,
      nationalTeamCountry,
      manager: resolvedManager
        ? {
            id: localizedManager?.id ?? resolvedManager.id,
            name: localizedManager?.name ?? resolvedManager.name,
            displayName: localizedAnalysis.displayManagerName ?? localizedManager?.name ?? resolvedManager.name,
            currentClub: teamName,
            displayCurrentClub: localizedAnalysis.displayTeamName ?? teamName,
            formations: liveManagerSnapshot?.recentFormations || [],
            style: resolvedManager.style,
            tacticalSummary: localizedManager?.tacticalSummary ?? resolvedManager.tacticalSummary,
            keyPrinciples: localizedManager?.keyPrinciples ?? resolvedManager.keyPrinciples,
            source: managerSource,
            verified: factualManagerVerified,
            transfermarktUrl: managerTransfermarktUrl,
            photoUrl: managerPhotoUrl,
          }
        : {
            id: null,
            name: factualManagerName,
            displayName: localizedAnalysis.displayManagerName ?? factualManagerName,
            currentClub: teamName,
            displayCurrentClub: localizedAnalysis.displayTeamName ?? teamName,
            formations: liveManagerSnapshot?.recentFormations || [],
            style: null,
            tacticalSummary: null,
            keyPrinciples: [],
            source: managerSource,
            verified: factualManagerVerified,
            transfermarktUrl: managerTransfermarktUrl,
            photoUrl: managerPhotoUrl,
          },
      squadSize: squad.length,
      managerFromDB: !!resolvedManager,
    })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  } catch (error) {
    console.error('Analysis error:', error)
    const details = getAIErrorDetails(error, 'Analysis failed. Please try again.')
    const response = NextResponse.json({ error: details.error }, { status: details.status })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  }
}

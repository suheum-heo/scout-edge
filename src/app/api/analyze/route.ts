import { NextRequest, NextResponse } from 'next/server'

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
import { getTeamData, formatPlayerStats, APIPlayer, APICoach } from '@/lib/football-data'
import { getSquad, getCoach, searchTeams as afSearchTeams, formatPlayerStats as afFormatPlayerStats } from '@/lib/api-football'
import {
  searchTeams as fotmobSearchTeams,
  getSquadAndCoach as fotmobGetSquadAndCoach,
  formatPlayerStats as fotmobFormatPlayerStats,
  APIPlayer as FotmobAPIPlayer,
} from '@/lib/fotmob'
import { getClubManager, getClubSquad, searchClub } from '@/lib/transfermarkt'
import { getManagerById, getManagerByName } from '@/lib/managers'
import { analyzeSquadGaps } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import type { SquadPlayer } from '@/lib/role-profiles'
import { buildFullName } from '@/lib/person-names'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { teamId, teamName, managerId, teamSource, fotmobId, excludedPlayerIds } = body
    const excludedSet = new Set<string>(excludedPlayerIds ?? [])

    if (teamId == null || !teamName) {
      return NextResponse.json({ error: 'teamId and teamName are required' }, { status: 400 })
    }

    let squadRaw: APIPlayer[] = []
    let fotmobSquad: FotmobAPIPlayer[] = []
    let tmFormattedSquad: Array<{
      playerId: string; name: string; position: string; age: number; nationality: string;
      appearances: number; minutes: number; rating: string; goals: number; assists: number; currentTeam: string;
    }> | null = null
    let coach: APICoach | null = null
    let usedFotmob = false

    if (teamSource === 'tm') {
      // Squad + manager from TM first, then exact verified IDs only.
      // Do not fall back to fuzzy provider name-matching here — that's how clubs get crossed.
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
      if (tmPlayers.length) {
        tmFormattedSquad = tmPlayers.map((p) => ({
          playerId: p.id, name: p.name, position: p.position, age: p.age ?? 0,
          nationality: p.nationality, appearances: 0, minutes: 0, rating: '0',
          goals: 0, assists: 0, currentTeam: teamName,
        }))
      }
      coach = tmManagerToCoach(tmManager, teamId, teamName)

      const preferredAfTeamId = getAFOverrideTeamId(teamName) ?? verifiedAfTeam?.team.id ?? null
      if (preferredAfTeamId && !coach) {
        try {
          coach = await getCoach(preferredAfTeamId)
        } catch { /* coach stays null */ }
      }
      if (!preferredAfTeamId && bestAfTeam) {
        console.log(
          `[analyze] Rejecting fuzzy API Football team match for ${teamName}: ${bestAfTeam.team.name}`
        )
      }

      if (!coach) {
        const tryFotmobTeam = async (fmTeamId: number) => {
          try {
            const fmResult = await fotmobGetSquadAndCoach(fmTeamId)
            if (fmResult.coach) {
              coach = fmResult.coach as unknown as APICoach
            }
            if (!tmFormattedSquad && fmResult.squad.length) {
              fotmobSquad = fmResult.squad
              usedFotmob = true
            }
          } catch (e) {
            console.error('[analyze] TM-path FotMob fallback failed:', e)
          }
        }

        if (preferredFmId) {
          await tryFotmobTeam(preferredFmId)
        }
      }

    } else if (teamSource === 'fotmob') {
      // FotMob ID — direct squad fetch, no re-search needed
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
    } else if (teamSource === 'af') {
      // Run AF coach + FotMob (if we have its ID) + TM club search in parallel
      const fmId: number | null = fotmobId ?? null
      console.log(`[analyze] AF team ${teamName}, parallel fetch (fotmobId=${fmId ?? 'none'})`)

      const [afCoach, fmResult, tmId] = await Promise.all([
        getCoach(teamId).catch(() => null),
        fmId ? fotmobGetSquadAndCoach(fmId).catch(() => null) : Promise.resolve(null),
        searchClub(teamName).catch(() => null),
      ])

      // FotMob coach is live — prefer it over potentially stale AF data
      coach = (fmResult?.coach as unknown as APICoach | null) ?? afCoach

      // Squad: FotMob (has stats) > TM > AF
      if (fmResult?.squad.length) {
        fotmobSquad = fmResult.squad
        usedFotmob = true
      } else if (tmId) {
        const tmPlayers = await getClubSquad(tmId).catch(() => [])
        if (tmPlayers.length) {
          tmFormattedSquad = tmPlayers.map((p) => ({
            playerId: p.id, name: p.name, position: p.position, age: p.age ?? 0,
            nationality: p.nationality, appearances: 0, minutes: 0, rating: '0',
            goals: 0, assists: 0, currentTeam: teamName,
          }))
        }
      }

      // Last resort: API Football squad (stale but better than nothing)
      if (!tmFormattedSquad && !usedFotmob) {
        try { squadRaw = await getSquad(teamId) } catch { /* stay empty */ }
      }
    } else {
      // Get FD data + FotMob stats in parallel when fotmobId is already known
      const fmId: number | null = fotmobId ?? null
      console.log(`[analyze] FD team ${teamName}, fetching FD+FotMob in parallel (fotmobId=${fmId ?? 'none'})`)

      const [fdData, fotmobResult] = await Promise.all([
        getTeamData(teamId),
        fmId ? fotmobGetSquadAndCoach(fmId).catch(() => null) : Promise.resolve(null),
      ])

      coach = fdData.coach

      if (fotmobResult?.squad.length) {
        fotmobSquad = fotmobResult.squad
        usedFotmob = true
        if (!coach && fotmobResult.coach) {
          coach = fotmobResult.coach as unknown as APICoach
        }
      }

      // fotmobId wasn't in local DB — try FotMob search by name
      if (!usedFotmob) {
        try {
          const fmTeams = await fotmobSearchTeams(teamName)
          const resolvedFmId = fmTeams[0]?.team.id ?? null
          if (resolvedFmId) {
            const result = await fotmobGetSquadAndCoach(resolvedFmId)
            if (result.squad.length) {
              fotmobSquad = result.squad
              usedFotmob = true
              if (!coach && result.coach) coach = result.coach as unknown as APICoach
            }
          }
        } catch (e) {
          console.error('[analyze] FotMob search enrichment failed:', e)
        }
      }

      // Fall back to FD squad (no stats) if FotMob enrichment failed
      if (!usedFotmob) {
        squadRaw = fdData.players
        if (!squadRaw.length) {
          console.log(`[analyze] FD squad empty for ${teamName}, no fallback available`)
        }
      }
    }

    const hasSquadData = !!(tmFormattedSquad?.length || fotmobSquad.length || squadRaw.length)
    // National teams (source=tm) may have empty TM squad data — let Claude use own knowledge.
    // All other sources 404 when empty since we expect real data from FD/FotMob/AF/TM.
    if (!hasSquadData && teamSource !== 'tm') {
      return NextResponse.json(
        { error: `Could not fetch squad data for ${teamName}. The club may not be covered by our data providers yet.` },
        { status: 404 }
      )
    }

    // Resolve manager: manual override > live provider coach data.
    // Claude may still infer a manager name for tactical reasoning, but that must never be
    // promoted into the factual manager card shown to the user.
    let manager = managerId ? getManagerById(managerId) : undefined
    const providerManagerName = getCoachDisplayName(coach)
    const providerManagerProfile = providerManagerName ? getManagerByName(providerManagerName) : undefined

    if (!manager && providerManagerProfile) {
      manager = providerManagerProfile
    }

    const managerNameHint = providerManagerName ?? manager?.name ?? undefined

    // Format player stats — use the formatter matching the data source
    const squad = tmFormattedSquad
      ? tmFormattedSquad
      : usedFotmob
      ? fotmobSquad.map(fotmobFormatPlayerStats).filter(Boolean)
      : squadRaw.map((p) => formatPlayerStats(p) ?? afFormatPlayerStats(p)).filter(Boolean)

    const hasStats = squad.some((p) => p && ((p as { appearances?: number }).appearances! > 0 || parseFloat((p as { rating?: string }).rating || '0') > 0))
    console.log(`[analyze] source=fotmob:${usedFotmob} squadSize=${squad.length} hasStats=${hasStats}`)
    if (usedFotmob && squad.length) {
      const defenders = squad.filter((p) => p && (p as { position?: string }).position?.match(/CB|LB|RB|LWB|RWB|Defender/))
      console.log('[analyze] Defenders:', defenders.map((p) => `${(p as { name: string }).name}(pos:${(p as { position?: string }).position},rtg:${(p as { rating?: string }).rating ?? '0'})`).join(', '))
    }

    // Build the full squad shape first (needed for both analysis and response)
    const squadPlayers: SquadPlayer[] = squad
      .filter(Boolean)
      .map((p) => ({
        playerId: String((p as { playerId?: number }).playerId ?? ''),
        name: (p as { name: string }).name,
        position: (p as { position?: string }).position ?? '',
        age: (p as { age?: number }).age ?? 0,
        nationality: (p as { nationality?: string }).nationality ?? '',
      }))
      .filter((p) => p.playerId && p.name)

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

    // Analyze with Claude — null manager triggers Claude's own tactical knowledge
    const allowManagerInference = Boolean(manager || providerManagerName)
    const analysis = await analyzeSquadGaps(
      manager || null,
      availableSquad,
      teamName,
      managerNameHint,
      unavailablePlayers,
      allowManagerInference,
    )
    const inferredManagerName = analysis.managerName?.trim() || null
    const resolvedManager = manager ?? providerManagerProfile
    const factualManagerName = resolvedManager?.name ?? providerManagerName ?? null
    const factualManagerVerified = Boolean(factualManagerName)
    const managerSource = managerId
      ? 'override'
      : factualManagerName
      ? 'provider'
      : 'unverified'

    console.log(
      `[analyze] managerResolution team=${teamName} source=${teamSource ?? 'fd'} provider=${providerManagerName ?? 'none'} inferred=${inferredManagerName ?? 'none'} factual=${factualManagerName ?? 'none'} managerSource=${managerSource}`
    )

    return NextResponse.json({
      analysis,
      squad: squadPlayers,
      nationalTeamCountry,
      manager: resolvedManager
        ? {
            id: resolvedManager.id,
            name: resolvedManager.name,
            currentClub: teamName,
            formations: resolvedManager.formations,
            style: resolvedManager.style,
            tacticalSummary: resolvedManager.tacticalSummary,
            keyPrinciples: resolvedManager.keyPrinciples,
            source: managerSource,
            verified: factualManagerVerified,
          }
        : {
            id: null,
            name: factualManagerName,
            currentClub: teamName,
            formations: [],
            style: null,
            tacticalSummary: null,
            keyPrinciples: [],
            source: managerSource,
            verified: factualManagerVerified,
          },
      squadSize: squad.length,
      managerFromDB: !!resolvedManager,
    })
  } catch (error) {
    console.error('Analysis error:', error)
    const details = getAIErrorDetails(error, 'Analysis failed. Please try again.')
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

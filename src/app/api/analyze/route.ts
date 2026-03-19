import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// Minimal FIFA nation set for national team detection
const FIFA_NATIONS = new Set([
  'afghanistan','albania','algeria','andorra','angola','argentina','armenia','australia','austria','azerbaijan',
  'bahrain','bangladesh','belgium','bolivia','bosnia-herzegovina','botswana','brazil','bulgaria','burkina faso','burundi',
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
import { getTeamData, formatPlayerStats, APIPlayer, APICoach } from '@/lib/football-data'
import { getSquad, getCoach, searchTeams as afSearchTeams, formatPlayerStats as afFormatPlayerStats } from '@/lib/api-football'
import {
  searchTeams as fotmobSearchTeams,
  getSquadAndCoach as fotmobGetSquadAndCoach,
  formatPlayerStats as fotmobFormatPlayerStats,
  APIPlayer as FotmobAPIPlayer,
} from '@/lib/fotmob'
import { getClubSquad, searchClub } from '@/lib/transfermarkt'
import { getManagerById, getManagerByName } from '@/lib/managers'
import { analyzeSquadGaps } from '@/lib/claude'
import type { SquadPlayer } from '@/lib/role-profiles'

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
      // Transfermarkt club — squad from TM, coach from API Football (search by name)
      console.log(`[analyze] TM team ${teamName} (${teamId}), fetching squad + coach`)
      const [tmPlayers, afTeams] = await Promise.all([
        getClubSquad(String(teamId)).catch(() => []),
        isNationalTeam(teamName) ? Promise.resolve([]) : afSearchTeams(teamName).catch(() => []),
      ])
      if (tmPlayers.length) {
        tmFormattedSquad = tmPlayers.map((p) => ({
          playerId: p.id, name: p.name, position: p.position, age: p.age ?? 0,
          nationality: p.nationality, appearances: 0, minutes: 0, rating: '0',
          goals: 0, assists: 0, currentTeam: teamName,
        }))
      }
      if (afTeams.length && !coach) {
        try {
          coach = await getCoach(afTeams[0].team.id)
        } catch { /* coach stays null */ }
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
      // Always get coach from AF first — we have the AF team ID, it covers all leagues
      try { coach = await getCoach(teamId) } catch { /* coach stays null */ }

      // FotMob search is broken; try TM for accurate current squad
      console.log(`[analyze] AF team ${teamName}, fetching squad via TM then AF`)
      try {
        const tmId = await searchClub(teamName)
        if (tmId) {
          const tmPlayers = await getClubSquad(tmId)
          if (tmPlayers.length) {
            tmFormattedSquad = tmPlayers.map((p) => ({
              playerId: p.id, name: p.name, position: p.position, age: p.age ?? 0,
              nationality: p.nationality, appearances: 0, minutes: 0, rating: '0',
              goals: 0, assists: 0, currentTeam: teamName,
            }))
          }
        }
      } catch (e) {
        console.error('[analyze] TM squad failed:', e)
      }

      // Last resort: API Football squad (stale but better than nothing)
      if (!tmFormattedSquad) {
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

    // Resolve manager: manual override > auto-detect from live coach data > Claude fallback
    let manager = managerId ? getManagerById(managerId) : undefined
    const coachName = coach?.name

    if (!manager && coachName) {
      manager = getManagerByName(coachName)
    }

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
    const analysis = await analyzeSquadGaps(manager || null, availableSquad, teamName, coachName, unavailablePlayers)

    return NextResponse.json({
      analysis,
      squad: squadPlayers,
      nationalTeamCountry,
      manager: manager
        ? {
            id: manager.id,
            name: manager.name,
            currentClub: teamName,
            formations: manager.formations,
            style: manager.style,
            tacticalSummary: manager.tacticalSummary,
            keyPrinciples: manager.keyPrinciples,
          }
        : {
            id: null,
            name: coachName || teamName,
            currentClub: teamName,
            formations: [],
            style: null,
            tacticalSummary: null,
            keyPrinciples: [],
          },
      squadSize: squad.length,
      managerFromDB: !!manager,
    })
  } catch (error) {
    console.error('Analysis error:', error)
    return NextResponse.json({ error: 'Analysis failed. Please try again.' }, { status: 500 })
  }
}

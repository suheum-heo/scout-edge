import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60
import { getTeamData, formatPlayerStats, APIPlayer, APICoach } from '@/lib/football-data'
import { getSquad, getCoach, formatPlayerStats as afFormatPlayerStats } from '@/lib/api-football'
import {
  searchTeams as fotmobSearchTeams,
  getSquadAndCoach as fotmobGetSquadAndCoach,
  formatPlayerStats as fotmobFormatPlayerStats,
  APIPlayer as FotmobAPIPlayer,
} from '@/lib/fotmob'
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
    let coach: APICoach | null = null
    let usedFotmob = false

    if (teamSource === 'fotmob') {
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
      // 'af' fallback: FotMob search by name (team enrichment failed earlier), then AF
      console.log(`[analyze] AF team ${teamName}, trying FotMob by name`)
      try {
        const fmTeams = await fotmobSearchTeams(teamName)
        const fmTeam = fmTeams[0]
        if (fmTeam) {
          const result = await fotmobGetSquadAndCoach(fmTeam.team.id)
          if (result.squad.length) {
            fotmobSquad = result.squad
            usedFotmob = true
            if (result.coach) coach = result.coach as unknown as APICoach
          }
        }
      } catch (e) {
        console.error('[analyze] FotMob fetch failed:', e)
      }

      if (!usedFotmob) {
        console.log(`[analyze] FotMob empty for ${teamName}, falling back to API Football`)
        try {
          squadRaw = await getSquad(teamId)
          coach = await getCoach(teamId)
        } catch (e) {
          console.error('[analyze] API Football fetch failed:', e)
        }
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

    if (!fotmobSquad.length && !squadRaw.length) {
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
    const squad = usedFotmob
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

    // Analyze with Claude — null manager triggers Claude's own tactical knowledge
    const analysis = await analyzeSquadGaps(manager || null, availableSquad, teamName, coachName)

    return NextResponse.json({
      analysis,
      squad: squadPlayers,
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
            name: coachName || 'Unknown Manager',
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

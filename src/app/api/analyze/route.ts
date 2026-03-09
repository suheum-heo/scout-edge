import { NextRequest, NextResponse } from 'next/server'
import { getTeamData, formatPlayerStats, APIPlayer, APICoach } from '@/lib/football-data'
import { searchTeams, getSquad, getCoach, formatPlayerStats as afFormatPlayerStats } from '@/lib/api-football'
import {
  searchTeams as fotmobSearchTeams,
  getSquad as fotmobGetSquad,
  getCoach as fotmobGetCoach,
  formatPlayerStats as fotmobFormatPlayerStats,
  APIPlayer as FotmobAPIPlayer,
} from '@/lib/fotmob'
import { getManagerById, getManagerByName } from '@/lib/managers'
import { analyzeSquadGaps } from '@/lib/claude'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { teamId, teamName, managerId, teamSource } = body

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
        fotmobSquad = await fotmobGetSquad(teamId)
        if (fotmobSquad.length) {
          usedFotmob = true
          const fmCoach = await fotmobGetCoach(teamId)
          if (fmCoach) coach = fmCoach as unknown as APICoach
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
          fotmobSquad = await fotmobGetSquad(fmTeam.team.id)
          if (fotmobSquad.length) {
            usedFotmob = true
            const fmCoach = await fotmobGetCoach(fmTeam.team.id)
            if (fmCoach) coach = fmCoach as unknown as APICoach
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
      // Get current squad + coach from football-data.org (live, no daily limit)
      const fdData = await getTeamData(teamId)
      coach = fdData.coach

      // FD free tier returns no per-player stats — always try FotMob for the same team
      // so Claude gets real 2025-26 appearances, positions, and ratings instead of
      // relying on its training knowledge (which may be outdated for player roles).
      console.log(`[analyze] FD team ${teamName}, enriching with FotMob stats`)
      try {
        const fmTeams = await fotmobSearchTeams(teamName)
        const fmTeam = fmTeams[0]
        if (fmTeam) {
          const fmSquad = await fotmobGetSquad(fmTeam.team.id)
          if (fmSquad.length) {
            fotmobSquad = fmSquad
            usedFotmob = true
            if (!coach) {
              const fmCoach = await fotmobGetCoach(fmTeam.team.id)
              if (fmCoach) coach = fmCoach as unknown as APICoach
            }
          }
        }
      } catch (e) {
        console.error('[analyze] FotMob stats enrichment failed:', e)
      }

      // Fall back to FD squad (no stats) if FotMob enrichment failed
      if (!usedFotmob) {
        squadRaw = fdData.players
        // If FD also has no squad (newly promoted etc.), give up gracefully
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

    console.log(`[analyze] source=fotmob:${usedFotmob} squadSize=${squad.length} hasStats=${squad.some((p) => p && (p as { appearances?: number }).appearances! > 0)}`)
    if (usedFotmob && squad.length) {
      const defenders = squad.filter((p) => p && (p as { position?: string }).position === 'Defender')
      console.log('[analyze] Defenders:', defenders.map((p) => `${(p as { name: string }).name}(apps:${(p as { appearances?: number }).appearances ?? 0})`).join(', '))
    }

    // Analyze with Claude — null manager triggers Claude's own tactical knowledge
    const analysis = await analyzeSquadGaps(manager || null, squad, teamName, coachName)

    return NextResponse.json({
      analysis,
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

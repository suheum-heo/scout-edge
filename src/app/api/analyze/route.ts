import { NextRequest, NextResponse } from 'next/server'
import { getTeamData, formatPlayerStats } from '@/lib/football-data'
import { searchTeams, getSquad, getCoach, formatPlayerStats as afFormatPlayerStats } from '@/lib/api-football'
import { getManagerById, getManagerByName } from '@/lib/managers'
import { analyzeSquadGaps } from '@/lib/claude'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { teamId, teamName, managerId } = body

    if (!teamId || !teamName) {
      return NextResponse.json({ error: 'teamId and teamName are required' }, { status: 400 })
    }

    // Get current squad + coach from football-data.org (live, no daily limit)
    let { players: squadRaw, coach } = await getTeamData(teamId)

    // Fallback: if football-data.org has no squad data (e.g. newly promoted clubs),
    // try API Football by searching the team name
    if (!squadRaw.length) {
      console.log(`[analyze] FD squad empty for ${teamName}, trying API Football fallback`)
      try {
        const afTeams = await searchTeams(teamName)
        const afTeam = afTeams[0]
        if (afTeam) {
          const afSquad = await getSquad(afTeam.team.id)
          if (afSquad.length) {
            squadRaw = afSquad
            // If FD had no coach either, try API Football for coach
            if (!coach) {
              const afCoach = await getCoach(afTeam.team.id)
              if (afCoach) coach = afCoach
            }
          }
        }
      } catch (e) {
        console.error('[analyze] API Football fallback failed:', e)
      }
    }

    if (!squadRaw.length) {
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
    const squad = squadRaw.map(
      (p) => formatPlayerStats(p) ?? afFormatPlayerStats(p)
    ).filter(Boolean)

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

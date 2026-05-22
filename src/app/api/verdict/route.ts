import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerByName } from '@/lib/managers'
import { analyzeTransferVerdict } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { searchPlayer, getPlayerData } from '@/lib/transfermarkt'
import { getTeamData, APICoach } from '@/lib/football-data'
import { getSquadAndCoach as fotmobGetSquadAndCoach } from '@/lib/fotmob'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playerName, tmPlayerId, playerAge, teamId, teamName, teamSource, fotmobId } = body as {
      playerName: string
      tmPlayerId?: string
      playerAge?: number
      teamId: number | string
      teamName: string
      teamSource?: string
      fotmobId?: number
    }

    if (!playerName || !teamName) {
      return NextResponse.json({ error: 'playerName and teamName are required' }, { status: 400 })
    }

    // Fetch club's current coach (parallel with TM player lookup)
    let coachName: string | undefined
    const fetchCoach = async () => {
      try {
        if (teamSource === 'tm') {
          // TM clubs — no FotMob/FD ID available; Claude will infer coach from team name
        } else if (teamSource === 'fotmob' || fotmobId) {
          const fmId = teamSource === 'fotmob' ? (teamId as number) : fotmobId!
          const result = await fotmobGetSquadAndCoach(fmId)
          if (result.coach) coachName = (result.coach as { name: string }).name
        } else if (typeof teamId === 'number') {
          const fdData = await getTeamData(teamId)
          coachName = (fdData.coach as APICoach | null)?.name
        }
      } catch {
        // Coach detection failed — will fall back to Claude's knowledge
      }
    }

    const fetchPlayer = async () => {
      try {
        if (tmPlayerId) return await getPlayerData(tmPlayerId, { fallbackAge: playerAge })
        const searchResult = await searchPlayer(playerName)
        if (searchResult) return await getPlayerData(searchResult.id, { fallbackAge: searchResult.age ?? playerAge })
      } catch {
        return null
      }
      return null
    }

    const [, tmPlayer] = await Promise.all([fetchCoach(), fetchPlayer()])

    // Resolve manager from coach name
    const manager = coachName ? getManagerByName(coachName) : undefined
    const factualManagerName = manager?.name || coachName || null
    const liveManagerSnapshot = factualManagerName
      ? await getLiveManagerSnapshot(factualManagerName, { maxMatches: 20 }).catch(() => null)
      : null

    const verdict = await analyzeTransferVerdict(
      playerName,
      teamName,
      tmPlayer ?? null,
      manager || null,
      coachName,
      liveManagerSnapshot
        ? {
            primaryFormation: liveManagerSnapshot.primaryFormation,
            recentFormations: liveManagerSnapshot.recentFormations,
            formationSampleSize: liveManagerSnapshot.sampleSize,
            formationSeason: liveManagerSnapshot.season,
            referenceClub: liveManagerSnapshot.referenceClub,
          }
        : undefined
    )

    return NextResponse.json({
      verdict,
      player: tmPlayer,
      playerVerified: Boolean(tmPlayer),
      detectedManager: coachName || null,
    })
  } catch (error) {
    console.error('Verdict error:', error)
    const details = getAIErrorDetails(error, 'Analysis failed. Please try again.')
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

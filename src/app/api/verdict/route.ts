import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerByName } from '@/lib/managers'
import { analyzeTransferVerdict } from '@/lib/claude'
import { searchPlayer, getPlayerData } from '@/lib/transfermarkt'
import { getTeamData, APICoach } from '@/lib/football-data'
import { getSquadAndCoach as fotmobGetSquadAndCoach } from '@/lib/fotmob'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playerName, tmPlayerId, teamId, teamName, teamSource, fotmobId } = body as {
      playerName: string
      tmPlayerId?: string
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
        if (tmPlayerId) return await getPlayerData(tmPlayerId)
        const searchResult = await searchPlayer(playerName)
        if (searchResult) return await getPlayerData(searchResult.id)
      } catch {
        return null
      }
      return null
    }

    const [, tmPlayer] = await Promise.all([fetchCoach(), fetchPlayer()])

    // Resolve manager from coach name
    const manager = coachName ? getManagerByName(coachName) : undefined

    const verdict = await analyzeTransferVerdict(
      playerName,
      teamName,
      tmPlayer ?? null,
      manager || null,
      coachName
    )

    return NextResponse.json({
      verdict,
      player: tmPlayer,
      detectedManager: coachName || null,
    })
  } catch (error) {
    console.error('Verdict error:', error)
    return NextResponse.json({ error: 'Analysis failed. Please try again.' }, { status: 500 })
  }
}

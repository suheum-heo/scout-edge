import { NextRequest, NextResponse } from 'next/server'
import { normalizeLanguage } from '@/lib/i18n'

export const maxDuration = 60

import { getManagerByName } from '@/lib/managers'
import { analyzeTransferVerdict } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { localizeTMPlayerData, localizeTransferVerdictResult } from '@/lib/entity-localization'
import { searchPlayer, getPlayerData, getClubManager, searchClub, searchManagerByClub } from '@/lib/transfermarkt'
import { getTeamData, APICoach, isLikelyYouthOnlySquad } from '@/lib/football-data'
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
      language?: string
    }

    if (!playerName || !teamName) {
      return NextResponse.json({ error: 'playerName and teamName are required' }, { status: 400 })
    }
    const language = normalizeLanguage(body.language)

    // Fetch club's current coach (parallel with TM player lookup)
    let coachName: string | undefined
    const fetchCoach = async () => {
      try {
        const fmPromise = teamSource === 'fotmob' || fotmobId
          ? (async () => {
              const fmId = teamSource === 'fotmob' ? (teamId as number) : fotmobId!
              return await fotmobGetSquadAndCoach(fmId)
            })().catch(() => null)
          : Promise.resolve(null)

        const fdPromise = typeof teamId === 'number'
          ? getTeamData(teamId).catch(() => ({ players: [], coach: null }))
          : Promise.resolve(null)

        const tmClubIdPromise = teamSource === 'tm'
          ? Promise.resolve(String(teamId))
          : searchClub(teamName).catch(() => null)

        const [fotmobResult, fdData, tmClubId] = await Promise.all([
          fmPromise,
          fdPromise,
          tmClubIdPromise,
        ])

        const fdCoachName = (fdData?.coach as APICoach | null)?.name
        const fdSquadLooksYouth = fdData ? isLikelyYouthOnlySquad(fdData.players) : false
        const fotmobCoachName = (fotmobResult?.coach as { name?: string } | null)?.name || undefined

        let tmCoachName: string | undefined
        if (tmClubId) {
          const tmManager = await getClubManager(tmClubId).catch(() => null)
          tmCoachName = tmManager?.name || undefined
        }
        if (!tmCoachName) {
          const tmManagerByClub = await searchManagerByClub(teamName).catch(() => null)
          tmCoachName = tmManagerByClub?.name || undefined
        }

        coachName = fotmobCoachName || (fdSquadLooksYouth ? tmCoachName || fdCoachName : fdCoachName || tmCoachName)
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
        : undefined,
      language
    )
    const [localizedVerdict, localizedPlayer] = await Promise.all([
      localizeTransferVerdictResult(verdict, language),
      localizeTMPlayerData(tmPlayer ?? null, language),
    ])

    return NextResponse.json({
      verdict: localizedVerdict,
      player: localizedPlayer,
      playerVerified: Boolean(tmPlayer),
      detectedManager: coachName || null,
    })
  } catch (error) {
    console.error('Verdict error:', error)
    const details = getAIErrorDetails(error, 'Analysis failed. Please try again.')
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

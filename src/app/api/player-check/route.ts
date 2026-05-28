import { NextRequest, NextResponse } from 'next/server'
import { normalizeLanguage } from '@/lib/i18n'
import { getManagerById } from '@/lib/managers'
import { analyzePlayerCompatibility } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { localizePlayerCompatibilityResult, localizeTMPlayerData } from '@/lib/entity-localization'
import { searchPlayer, getPlayerData } from '@/lib/transfermarkt'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playerName, tmPlayerId, playerAge, managerId, managerName, targetTeam } = body as {
      playerName: string
      tmPlayerId?: string
      playerAge?: number
      managerId?: string
      managerName?: string
      targetTeam?: string
      language?: string
    }

    if (!playerName || (!managerId && !managerName)) {
      return NextResponse.json(
        { error: 'playerName and either managerId or managerName are required' },
        { status: 400 }
      )
    }
    const language = normalizeLanguage(body.language)

    const manager = managerId ? (getManagerById(managerId) ?? null) : null
    const factualManagerName = manager?.name || managerName || null
    const liveManagerSnapshot = factualManagerName
      ? await getLiveManagerSnapshot(factualManagerName, { maxMatches: 20 }).catch(() => null)
      : null

    // Fetch live player data from Transfermarkt
    // If tmPlayerId is provided (player selected from typeahead), skip search
    let tmPlayer = null
    try {
      if (tmPlayerId) {
        tmPlayer = await getPlayerData(tmPlayerId, { fallbackAge: playerAge })
      } else {
        const searchResult = await searchPlayer(playerName)
        if (searchResult) {
          tmPlayer = await getPlayerData(searchResult.id, { fallbackAge: searchResult.age ?? playerAge })
        }
      }
    } catch {
      // Fall back to Claude-only if TM is unavailable
    }

    const compatibility = await analyzePlayerCompatibility(
      playerName,
      tmPlayer,
      manager,
      targetTeam,
      managerName,
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
    const [localizedCompatibility, localizedPlayer] = await Promise.all([
      localizePlayerCompatibilityResult(compatibility, language),
      localizeTMPlayerData(tmPlayer, language),
    ])

    return NextResponse.json({
      compatibility: localizedCompatibility,
      player: localizedPlayer,
      manager: manager
        ? { id: manager.id, name: manager.name, formations: liveManagerSnapshot?.recentFormations || [], style: manager.style, tacticalSummary: manager.tacticalSummary }
        : { id: null, name: managerName || 'Unknown', formations: [], style: null, tacticalSummary: null },
    })
  } catch (error) {
    console.error('Player check error:', error)
    const details = getAIErrorDetails(error, 'Analysis failed. Please try again.')
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

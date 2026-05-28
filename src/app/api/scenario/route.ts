import { NextRequest, NextResponse } from 'next/server'
import { normalizeLanguage, translate } from '@/lib/i18n'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { analyzeScenario, ScenarioResult, ScenarioOutPlayer, ScenarioInPlayer } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { localizeScenarioResult } from '@/lib/entity-localization'
import type { SquadPlayer } from '@/lib/role-profiles'

export async function POST(request: NextRequest) {
  let language = normalizeLanguage(undefined)
  try {
    const body = await request.json() as {
      squad: SquadPlayer[]
      playersOut: ScenarioOutPlayer[]
      playersIn: ScenarioInPlayer[]
      managerId?: string
      managerName?: string
      teamName: string
      language?: string
    }

    const { squad, playersOut, playersIn, managerId, managerName, teamName } = body
    language = normalizeLanguage(body.language)

    if (!squad?.length || !teamName) {
      return NextResponse.json({ error: translate(language, 'error.analysisFailed') }, { status: 400 })
    }
    if (!playersOut?.length && !playersIn?.length) {
      return NextResponse.json({ error: translate(language, 'error.analysisFailed') }, { status: 400 })
    }

    const manager = managerId ? getManagerById(managerId) : undefined
    const factualManagerName = manager?.name || managerName || null
    const liveManagerSnapshot = factualManagerName
      ? await getLiveManagerSnapshot(factualManagerName, { maxMatches: 20 }).catch(() => null)
      : null
    const partial = await analyzeScenario(
      squad,
      playersOut,
      playersIn,
      manager || null,
      teamName,
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

    const result: ScenarioResult = {
      id: crypto.randomUUID(),
      label: '',        // assigned by client (Scenario A / B / C)
      createdAt: Date.now(),
      playersOut,
      playersIn,
      ...partial,
    }

    const localizedResult = await localizeScenarioResult(result, language)

    return NextResponse.json({ result: localizedResult })
  } catch (error) {
    console.error('Scenario error:', error)
    const details = getAIErrorDetails(error, translate(language, 'error.analysisFailed'))
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

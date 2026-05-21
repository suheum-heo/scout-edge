import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { analyzeSquadSystemFit } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import type { SquadPlayer } from '@/lib/role-profiles'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { squad, managerId, managerName, teamName } = body as {
      squad: SquadPlayer[]
      managerId?: string
      managerName?: string
      teamName: string
    }

    if (!squad?.length || !teamName) {
      return NextResponse.json({ error: 'squad and teamName are required' }, { status: 400 })
    }

    const manager = managerId ? getManagerById(managerId) : undefined
    const factualManagerName = manager?.name || managerName || null
    const liveManagerSnapshot = factualManagerName
      ? await getLiveManagerSnapshot(factualManagerName, { maxMatches: 20 }).catch(() => null)
      : null
    const fits = await analyzeSquadSystemFit(
      squad,
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
        : undefined
    )

    return NextResponse.json({ fits })
  } catch (error) {
    console.error('Squad fit error:', error)
    const details = getAIErrorDetails(error, 'Failed to analyse squad fit')
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

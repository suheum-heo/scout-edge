import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { analyzeScenario, ScenarioResult, ScenarioOutPlayer, ScenarioInPlayer } from '@/lib/claude'
import type { SquadPlayer } from '@/lib/role-profiles'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      squad: SquadPlayer[]
      playersOut: ScenarioOutPlayer[]
      playersIn: ScenarioInPlayer[]
      managerId?: string
      managerName?: string
      teamName: string
    }

    const { squad, playersOut, playersIn, managerId, managerName, teamName } = body

    if (!squad?.length || !teamName) {
      return NextResponse.json({ error: 'squad and teamName are required' }, { status: 400 })
    }
    if (!playersOut?.length && !playersIn?.length) {
      return NextResponse.json({ error: 'Add at least one player in or out' }, { status: 400 })
    }

    const manager = managerId ? getManagerById(managerId) : undefined
    const partial = await analyzeScenario(squad, playersOut, playersIn, manager || null, teamName, managerName)

    const result: ScenarioResult = {
      id: crypto.randomUUID(),
      label: '',        // assigned by client (Scenario A / B / C)
      createdAt: Date.now(),
      playersOut,
      playersIn,
      ...partial,
    }

    return NextResponse.json({ result })
  } catch (error) {
    console.error('Scenario error:', error)
    return NextResponse.json({ error: 'Scenario analysis failed. Please try again.' }, { status: 500 })
  }
}

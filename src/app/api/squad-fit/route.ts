import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { analyzeSquadSystemFit } from '@/lib/claude'
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
    const fits = await analyzeSquadSystemFit(squad, manager || null, teamName, managerName)

    return NextResponse.json({ fits })
  } catch (error) {
    console.error('Squad fit error:', error)
    return NextResponse.json({ error: 'Failed to analyse squad fit' }, { status: 500 })
  }
}

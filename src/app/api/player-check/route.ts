import { NextRequest, NextResponse } from 'next/server'
import { getManagerById } from '@/lib/managers'
import { analyzePlayerCompatibility } from '@/lib/claude'
import { searchPlayer, getPlayerData } from '@/lib/transfermarkt'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { playerName, tmPlayerId, managerId, managerName, targetTeam } = body as {
      playerName: string
      tmPlayerId?: string
      managerId?: string
      managerName?: string
      targetTeam?: string
    }

    if (!playerName || (!managerId && !managerName)) {
      return NextResponse.json(
        { error: 'playerName and either managerId or managerName are required' },
        { status: 400 }
      )
    }

    const manager = managerId ? (getManagerById(managerId) ?? null) : null

    // Fetch live player data from Transfermarkt
    // If tmPlayerId is provided (player selected from typeahead), skip search
    let tmPlayer = null
    try {
      if (tmPlayerId) {
        tmPlayer = await getPlayerData(tmPlayerId)
      } else {
        const searchResult = await searchPlayer(playerName)
        if (searchResult) {
          tmPlayer = await getPlayerData(searchResult.id)
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
      managerName
    )

    return NextResponse.json({
      compatibility,
      player: tmPlayer,
      manager: manager
        ? { id: manager.id, name: manager.name, formations: manager.formations, style: manager.style, tacticalSummary: manager.tacticalSummary }
        : { id: null, name: managerName || 'Unknown', formations: [], style: null, tacticalSummary: null },
    })
  } catch (error) {
    console.error('Player check error:', error)
    return NextResponse.json({ error: 'Analysis failed. Please try again.' }, { status: 500 })
  }
}

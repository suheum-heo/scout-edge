import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { buildManagerXI, IdealPlayer } from '@/lib/claude'
import { searchPlayer, getPlayerData, formatMarketValue } from '@/lib/transfermarkt'

const TM_TIMEOUT_MS = 12000

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])
}

async function enrichPlayer(player: IdealPlayer): Promise<IdealPlayer> {
  return withTimeout(
    (async () => {
      const searchResult = await searchPlayer(player.playerName, {
        age: player.age,
        club: player.currentClub,
      })
      if (!searchResult) return player

      const searchClub = searchResult.club?.name
      const searchClubLow = searchClub?.toLowerCase() ?? ''
      const searchClubValid = !!searchClub &&
        !searchClubLow.includes('retired') &&
        !searchClubLow.includes('without club') &&
        searchClubLow !== '-'

      const tmData = await getPlayerData(searchResult.id)
      if (!tmData) {
        return searchClubValid ? { ...player, currentClub: searchClub!, tmVerified: true } : player
      }

      const clubLow = tmData.currentClub?.toLowerCase() ?? ''
      const isRetiredOrUnknown = !tmData.currentClub ||
        clubLow.includes('retired') || clubLow.includes('without club') || clubLow === '-'

      return {
        ...player,
        currentClub: isRetiredOrUnknown ? player.currentClub : tmData.currentClub,
        age: tmData.age ?? player.age,
        nationality: tmData.nationality || player.nationality,
        contractUntil: tmData.contractYear || player.contractUntil,
        estimatedFee: tmData.marketValue ? formatMarketValue(tmData.marketValue) : player.estimatedFee,
        tmVerified: !isRetiredOrUnknown,
      }
    })(),
    TM_TIMEOUT_MS,
    player
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { budget, managerId, managerName } = body as {
      budget: string
      managerId?: string
      managerName?: string
    }

    if (!budget || (!managerId && !managerName)) {
      return NextResponse.json({ error: 'budget and manager are required' }, { status: 400 })
    }

    const manager = managerId ? getManagerById(managerId) : undefined
    const result = await buildManagerXI(manager || null, budget, managerName)

    const enriched = await Promise.all(result.players.map(enrichPlayer))

    return NextResponse.json({ ...result, players: enriched })
  } catch (error) {
    console.error('Manager XI error:', error)
    return NextResponse.json({ error: 'Failed to build XI. Please try again.' }, { status: 500 })
  }
}

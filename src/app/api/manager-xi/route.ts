import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { buildManagerXI, IdealPlayer } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { searchPlayer, getPlayerData, formatMarketValue, TMPlayerSearchResult } from '@/lib/transfermarkt'

const TM_SEARCH_TIMEOUT_MS = 10000
const TM_PROFILE_TIMEOUT_MS = 10000

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])
}

function isUsableTMClubName(clubName?: string | null): clubName is string {
  if (!clubName) return false
  const clubLow = clubName.toLowerCase()
  return !clubLow.includes('retired') &&
    !clubLow.includes('without club') &&
    clubLow !== '-'
}

async function findSearchResult(player: IdealPlayer): Promise<TMPlayerSearchResult | null> {
  const attempts = [
    { age: player.age, club: player.currentClub },
    { age: player.age },
    undefined,
  ] as const

  for (const hints of attempts) {
    const result = await withTimeout(searchPlayer(player.playerName, hints), TM_SEARCH_TIMEOUT_MS, null)
    if (result) return result
  }

  return null
}

function mergeSearchResult(player: IdealPlayer, searchResult: TMPlayerSearchResult): IdealPlayer {
  const searchClub = searchResult.club?.name
  return {
    ...player,
    playerName: searchResult.name || player.playerName,
    currentClub: isUsableTMClubName(searchClub) ? searchClub : player.currentClub,
    age: searchResult.age ?? player.age,
    nationality: searchResult.nationalities?.[0] || player.nationality,
    estimatedFee: searchResult.marketValue ? formatMarketValue(searchResult.marketValue) : player.estimatedFee,
    tmVerified: isUsableTMClubName(searchClub),
  }
}

async function enrichPlayer(player: IdealPlayer): Promise<IdealPlayer> {
  const searchResult = await findSearchResult(player)
  if (!searchResult) return player

  const verifiedFromSearch = mergeSearchResult(player, searchResult)

  const tmData = await withTimeout(getPlayerData(searchResult.id), TM_PROFILE_TIMEOUT_MS, null)
  if (!tmData) {
    return verifiedFromSearch
  }

  return {
    ...verifiedFromSearch,
    playerName: tmData.name || verifiedFromSearch.playerName,
    currentClub: isUsableTMClubName(tmData.currentClub) ? tmData.currentClub : verifiedFromSearch.currentClub,
    age: tmData.age ?? verifiedFromSearch.age,
    nationality: tmData.nationality || verifiedFromSearch.nationality,
    contractUntil: tmData.contractYear || verifiedFromSearch.contractUntil,
    estimatedFee: tmData.marketValue ? formatMarketValue(tmData.marketValue) : verifiedFromSearch.estimatedFee,
    tmVerified: isUsableTMClubName(tmData.currentClub) || verifiedFromSearch.tmVerified === true,
  }
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
    const details = getAIErrorDetails(error, 'Failed to build XI. Please try again.')
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { generateUndervaluedXI, UndervaluedPlayer } from '@/lib/claude'
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

async function findSearchResult(player: UndervaluedPlayer): Promise<TMPlayerSearchResult | null> {
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

function mergeSearchResult(player: UndervaluedPlayer, searchResult: TMPlayerSearchResult): UndervaluedPlayer {
  const searchClub = searchResult.club?.name
  return {
    ...player,
    playerName: searchResult.name || player.playerName,
    currentClub: isUsableTMClubName(searchClub) ? searchClub : player.currentClub,
    age: searchResult.age ?? player.age,
    nationality: searchResult.nationalities?.[0] || player.nationality,
    estimatedValue: searchResult.marketValue ? formatMarketValue(searchResult.marketValue) : player.estimatedValue,
    tmVerified: isUsableTMClubName(searchClub),
  }
}

async function enrichPlayer(player: UndervaluedPlayer): Promise<UndervaluedPlayer> {
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
    estimatedValue: tmData.marketValue ? formatMarketValue(tmData.marketValue) : verifiedFromSearch.estimatedValue,
    tmVerified: isUsableTMClubName(tmData.currentClub) || verifiedFromSearch.tmVerified === true,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { budget, managerId, managerName, teamName } = body as {
      budget: string
      managerId?: string
      managerName?: string
      teamName?: string
    }

    if (!budget) {
      return NextResponse.json({ error: 'budget is required' }, { status: 400 })
    }

    const manager = managerId ? getManagerById(managerId) : undefined
    const result = await generateUndervaluedXI(budget, manager || null, managerName, teamName)

    // TM enrich all 11 players in parallel
    const enriched = await Promise.all(result.players.map(enrichPlayer))

    return NextResponse.json({ ...result, players: enriched })
  } catch (error) {
    console.error('Undervalued XI error:', error)
    const details = getAIErrorDetails(error, 'Failed to generate Undervalued XI')
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

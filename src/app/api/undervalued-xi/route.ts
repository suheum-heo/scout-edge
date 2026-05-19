import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { generateUndervaluedXI, UndervaluedPlayer, UndervaluedXIResult } from '@/lib/claude'
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

function getBudgetCap(budget: string): number | null {
  if (budget === '< €50M') return 50_000_000
  if (budget === '€50–100M') return 100_000_000
  if (budget === '€100–150M') return 150_000_000
  if (budget === '€150–200M') return 200_000_000
  return null
}

function parseEstimatedValue(value?: string | null): number | null {
  if (!value) return null

  const normalized = value
    .replace(/[–—]/g, '-')
    .replace(/≈|~/g, '')
    .trim()
    .toLowerCase()

  if (!normalized || normalized.includes('free agent') || normalized === 'loan') return 0

  const matches = Array.from(normalized.matchAll(/(\d+(?:\.\d+)?)\s*([mbk]?)/g))
  if (!matches.length) return null

  const toEuros = (amount: number, unit: string) => {
    if (unit === 'b') return amount * 1_000_000_000
    if (unit === 'm') return amount * 1_000_000
    if (unit === 'k') return amount * 1_000
    return amount
  }

  const values = matches
    .map((match) => {
      const amount = Number.parseFloat(match[1] || '')
      if (!Number.isFinite(amount)) return null
      return toEuros(amount, match[2] || '')
    })
    .filter((amount): amount is number => amount !== null)

  if (!values.length) return null
  return Math.max(...values)
}

function formatCompactEuros(value: number): string {
  if (value >= 1_000_000_000) return `€${(value / 1_000_000_000).toFixed(value % 1_000_000_000 === 0 ? 0 : 1)}B`
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  if (value >= 1_000) return `€${Math.round(value / 1_000)}K`
  return `€${Math.round(value)}`
}

function calculateTotalEstimatedCost(players: UndervaluedPlayer[]): number {
  return players.reduce((sum, player) => sum + (parseEstimatedValue(player.estimatedValue) ?? 0), 0)
}

function buildBudgetInstructions(budget: string, cap: number, previousPlayers?: UndervaluedPlayer[]): string {
  const averagePerStarter = Math.floor(cap / 11)
  const bracketRules =
    budget === '< €50M'
      ? [
          'No single player can be above €10M, and most of the XI should be well below that.',
          'At least 6 starters should be €5M or less.',
          'Include at least 2 free-agent, loan, or expiring-contract style bargains.',
          'Avoid established stars from elite Champions League clubs unless they are genuine cut-price edge cases.',
        ]
      : budget === '€50–100M'
      ? [
          'No single player can be above €15M.',
          'At least 4 starters should be €8M or less.',
          'Include at least 1 free-agent, loan, or expiring-contract style bargain.',
          'This bracket should still lean heavily toward hidden-gem profiles rather than famous names.',
        ]
      : budget === '€100–150M'
      ? [
          'No single player can be above €22M.',
          'At least 3 starters should be €10M or less.',
          'Do not fill the XI with players who would each cost €15M+.',
        ]
      : budget === '€150–200M'
      ? [
          'No single player can be above €30M.',
          'At least 2 starters should be €10M or less.',
          'Spend heavily only on the true cornerstones and keep the rest of the XI value-driven.',
        ]
      : []

  const base = [
    `Treat ${budget} as a hard ceiling, not a vibe.`,
    `Your XI must come in at or below ${formatCompactEuros(cap)} in total estimated cost.`,
    `That means the average starter can only cost about ${formatCompactEuros(averagePerStarter)}.`,
    'Use a realistic mix of cheaper breakout players, smaller-league value picks, expiring deals, and free agents.',
    'Do not stack the XI with multiple €20M+ or €30M+ names unless the rest of the side is almost entirely bargain-bin.',
    'Be conservative with your fee estimates when you are near the ceiling.',
    'Before you answer, do the arithmetic and sanity-check that the XI genuinely fits the bracket.',
    ...bracketRules,
  ]

  if (!previousPlayers?.length) return base.join(' ')

  const currentTotal = calculateTotalEstimatedCost(previousPlayers)
  const overBy = Math.max(0, currentTotal - cap)
  const expensivePlayers = [...previousPlayers]
    .map((player) => ({ player, value: parseEstimatedValue(player.estimatedValue) ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map(({ player }) => `${player.playerName} (${player.position}, ${player.estimatedValue})`)
    .join('; ')

  return [
    ...base,
    `Your previous XI came out to about ${formatCompactEuros(currentTotal)}, which is ${formatCompactEuros(overBy)} over budget.`,
    `The most expensive picks were: ${expensivePlayers}.`,
    'Replace enough of those expensive slots with clearly cheaper but still tactically coherent alternatives.',
  ].join(' ')
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

function withComputedBudget(result: UndervaluedXIResult, players: UndervaluedPlayer[], budget: string): UndervaluedXIResult {
  const cap = getBudgetCap(budget)
  const total = calculateTotalEstimatedCost(players)
  const overrun = cap !== null ? Math.max(0, total - cap) : 0

  return {
    ...result,
    players,
    totalEstimatedCost: `≈${formatCompactEuros(total)}`,
    budgetStatus: cap === null || overrun <= 0 ? 'within' : 'over',
    budgetOverrun: overrun > 0 ? formatCompactEuros(overrun) : undefined,
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
    const cap = getBudgetCap(budget)
    const budgetInstructions = cap !== null
      ? buildBudgetInstructions(budget, cap)
      : undefined

    const result = await generateUndervaluedXI(
      budget,
      manager || null,
      managerName,
      teamName,
      budgetInstructions
    )

    // Fast TM enrich using search-only data so the route stays responsive.
    const enriched = await Promise.all(result.players.map(enrichPlayer))
    const finalResult = withComputedBudget(result, enriched, budget)

    return NextResponse.json(finalResult)
  } catch (error) {
    console.error('Undervalued XI error:', error)
    const details = getAIErrorDetails(error, 'Failed to generate Undervalued XI')
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

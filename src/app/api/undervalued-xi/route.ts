import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import {
  generateUndervaluedXICandidatePool,
  UndervaluedPlayer,
  UndervaluedXIResult,
  UndervaluedXISlot,
} from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { searchPlayer, formatMarketValue, TMPlayerSearchResult } from '@/lib/transfermarkt'

const TM_SEARCH_TIMEOUT_MS = 7000

interface CandidateEvaluation {
  player: UndervaluedPlayer
}

interface EnrichedSlot {
  slotId: string
  position: string
  archetypeLabel: string
  candidates: CandidateEvaluation[]
}

interface SelectionSummary {
  chosen: CandidateEvaluation[]
  total: number
  score: number
  withinBudget: boolean
}

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
  return players.reduce((sum, player) => sum + candidateCost({ player }), 0)
}

function buildBudgetInstructions(budget: string, cap: number): string {
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

  return [
    `Treat ${budget} as a hard ceiling, not a vibe.`,
    `Your XI must come in at or below ${formatCompactEuros(cap)} in total estimated cost.`,
    `The average starter can only cost about ${formatCompactEuros(averagePerStarter)}.`,
    'For every slot, provide one best-fit option, one balanced option, and one cheaper safety option.',
    'The pool must be diverse enough that a code-based selector can build a full XI under budget.',
    'Keep estimated values conservative and realistic for a real transfer discussion.',
    'Before you answer, do the arithmetic and sanity-check that the pool genuinely contains a legal under-budget XI.',
    ...bracketRules,
  ].join(' ')
}

function materializeCandidates(slot: UndervaluedXISlot): UndervaluedPlayer[] {
  return slot.candidates.map((candidate) => ({
    ...candidate,
    position: slot.position,
    archetypeLabel: slot.archetypeLabel,
    nationality: 'Unknown',
    contractUntil: 'Unknown',
    whyUndervalued: '',
  }))
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function playerKey(player: UndervaluedPlayer): string {
  return `${normalizeKey(player.playerName)}|${normalizeKey(player.currentClub)}`
}

function candidateCost(candidate: CandidateEvaluation): number {
  return parseEstimatedValue(candidate.player.estimatedValue) ?? 999_000_000
}

function dedupeCandidates(candidates: CandidateEvaluation[]): CandidateEvaluation[] {
  const bestByKey = new Map<string, CandidateEvaluation>()

  for (const candidate of candidates) {
    const key = playerKey(candidate.player)
    const existing = bestByKey.get(key)
    if (!existing) {
      bestByKey.set(key, candidate)
      continue
    }

    const currentCost = candidateCost(candidate)
    const existingCost = candidateCost(existing)

    if (
      candidate.player.scoutScore > existing.player.scoutScore ||
      (candidate.player.scoutScore === existing.player.scoutScore && currentCost < existingCost)
    ) {
      bestByKey.set(key, candidate)
    }
  }

  return Array.from(bestByKey.values()).sort((a, b) => {
    if (b.player.scoutScore !== a.player.scoutScore) return b.player.scoutScore - a.player.scoutScore
    return candidateCost(a) - candidateCost(b)
  })
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

async function enrichSelectedPlayer(player: UndervaluedPlayer): Promise<UndervaluedPlayer> {
  const searchResult = await findSearchResult(player)
  if (!searchResult) {
    return {
      ...player,
      tmVerified: false,
    }
  }

  return {
    ...mergeSearchResult(player, searchResult),
    contractUntil: 'Unknown',
  }
}

function buildWhyUndervaluedSummary(player: UndervaluedPlayer): string {
  const valueContext = player.estimatedValue && player.estimatedValue !== 'Unknown'
    ? `at ${player.estimatedValue}`
    : 'at a manageable market cost'

  return `${player.archetypeLabel} profile ${valueContext} for a ${player.age}-year-old. Built as a value-first fit for this system rather than a prestige signing.`
}

async function enrichSlot(slot: UndervaluedXISlot): Promise<EnrichedSlot> {
  const materialized = materializeCandidates(slot).map((player) => ({ player }))
  const deduped = dedupeCandidates(materialized)

  return {
    slotId: slot.slotId,
    position: slot.position,
    archetypeLabel: slot.archetypeLabel,
    candidates: deduped.length > 0 ? deduped : materialized,
  }
}

function selectPlayersForSlots(slots: EnrichedSlot[], cap: number | null): SelectionSummary {
  let bestWithin: SelectionSummary | null = null
  let bestOver: SelectionSummary | null = null

  function recordSelection(chosen: CandidateEvaluation[], total: number, score: number) {
    if (cap === null || total <= cap) {
      if (
        !bestWithin ||
        score > bestWithin.score ||
        (score === bestWithin.score && total < bestWithin.total)
      ) {
        bestWithin = { chosen: [...chosen], total, score, withinBudget: true }
      }
      return
    }

    const overrun = total - cap
    const currentBestOverrun = bestOver ? bestOver.total - cap : Infinity
    if (
      !bestOver ||
      overrun < currentBestOverrun ||
      (overrun === currentBestOverrun && score > bestOver.score)
    ) {
      bestOver = { chosen: [...chosen], total, score, withinBudget: false }
    }
  }

  function dfs(index: number, chosen: CandidateEvaluation[], used: Set<string>, total: number, score: number) {
    if (index === slots.length) {
      recordSelection(chosen, total, score)
      return
    }

    const slot = slots[index]
    const candidates = slot.candidates

    for (const candidate of candidates) {
      const key = playerKey(candidate.player)
      if (used.has(key)) continue

      const nextTotal = total + candidateCost(candidate)
      if (cap !== null && bestWithin && nextTotal > cap) continue

      used.add(key)
      chosen.push(candidate)
      dfs(index + 1, chosen, used, nextTotal, score + candidate.player.scoutScore)
      chosen.pop()
      used.delete(key)
    }
  }

  dfs(0, [], new Set<string>(), 0, 0)

  return bestWithin ?? bestOver ?? { chosen: [], total: 0, score: 0, withinBudget: false }
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

    const pool = await generateUndervaluedXICandidatePool(
      budget,
      manager || null,
      managerName,
      teamName,
      budgetInstructions
    )

    const enrichedSlots = await Promise.all(pool.slots.map(enrichSlot))
    const selection = selectPlayersForSlots(enrichedSlots, cap)

    if (selection.chosen.length !== enrichedSlots.length) {
      return NextResponse.json({ error: 'Failed to build a complete XI from the candidate pool' }, { status: 500 })
    }

    const selectedPlayers = await Promise.all(
      selection.chosen.map(async (candidate) => {
        const enriched = await enrichSelectedPlayer(candidate.player)
        return {
          ...enriched,
          whyUndervalued: buildWhyUndervaluedSummary(enriched),
        }
      })
    )
    const result = withComputedBudget(
      {
        formation: pool.formation,
        concept: pool.concept,
        players: selectedPlayers,
        totalEstimatedCost: `≈${formatCompactEuros(selection.total)}`,
      },
      selectedPlayers,
      budget
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Undervalued XI error:', error)
    const details = getAIErrorDetails(error, 'Failed to generate Undervalued XI')
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

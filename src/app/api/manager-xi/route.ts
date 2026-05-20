import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import {
  generateManagerXICandidatePool,
  IdealPlayer,
  ManagerXICandidatePool,
  ManagerXIResult,
  ManagerXISlot,
} from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { searchPlayer, formatMarketValue, TMPlayerSearchResult } from '@/lib/transfermarkt'

const TM_SEARCH_TIMEOUT_MS = 7000
const TM_ENRICHMENT_CONCURRENCY = 4

interface CandidateEvaluation {
  player: IdealPlayer
  searchResult: TMPlayerSearchResult | null
  selectionCost: number
}

interface EnrichedSlot {
  slotId: string
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
  if (budget.toLowerCase() === 'unlimited') return null

  const match = budget.match(/(\d+(?:\.\d+)?)\s*([mbk])/i)
  if (!match) return null

  const amount = Number.parseFloat(match[1] || '')
  if (!Number.isFinite(amount)) return null

  const unit = (match[2] || 'm').toLowerCase()
  if (unit === 'b') return amount * 1_000_000_000
  if (unit === 'k') return amount * 1_000
  return amount * 1_000_000
}

function parseEstimatedFee(value?: string | null): number | null {
  if (!value) return null

  const normalized = value
    .replace(/[–—]/g, '-')
    .replace(/≈|~/g, '')
    .trim()
    .toLowerCase()

  if (!normalized || normalized.includes('free agent') || normalized === 'loan') return 0

  const matches = Array.from(normalized.matchAll(/(\d+(?:\.\d+)?)\s*([mbk]?)/g))
  if (!matches.length) return null

  const values = matches
    .map((match) => {
      const amount = Number.parseFloat(match[1] || '')
      if (!Number.isFinite(amount)) return null

      const unit = (match[2] || '').toLowerCase()
      if (unit === 'b') return amount * 1_000_000_000
      if (unit === 'm') return amount * 1_000_000
      if (unit === 'k') return amount * 1_000
      return amount
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

function buildBudgetInstructions(budget: string, cap: number): string {
  const averagePerStarter = Math.floor(cap / 11)

  const bracketRules =
    budget === '€100M'
      ? [
          'No single player can be above €18M.',
          'At least 5 starters should be €10M or less.',
          'Avoid obvious superstar names entirely in this bracket.',
        ]
      : budget === '€200M'
      ? [
          'No single player can be above €35M.',
          'At least 4 starters should be €15M or less.',
          'Limit the XI to one major premium signing at most.',
        ]
      : budget === '€300M'
      ? [
          'No single player can be above €55M.',
          'At least 3 starters should be €20M or less.',
          'Do not include generational superstars whose fee alone would consume most of the budget.',
        ]
      : budget === '€500M'
      ? [
          'No single player can be above €100M unless the rest of the pool clearly stays affordable.',
          'At least 2 starters should be €20M or less.',
          'Even in this bracket, the combined XI must still fit under the cap once prices are added up.',
        ]
      : []

  return [
    `Treat ${budget} as a hard ceiling, not a rough vibe.`,
    `Your pool must allow a full XI at or below ${formatCompactEuros(cap)} total.`,
    `The average starter can only cost about ${formatCompactEuros(averagePerStarter)}.`,
    'If one player would consume more than roughly a fifth of the budget, exclude them unless the rest of the pool is clearly cheap enough to compensate.',
    'Provide materially cheaper fallback options in multiple slots, not just one or two.',
    'Before answering, sanity-check the arithmetic so a code-based selector can assemble a legal XI from your pool.',
    ...bracketRules,
  ].join(' ')
}

function normalizeKey(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function playerKey(player: IdealPlayer): string {
  return `${normalizeKey(player.playerName)}|${normalizeKey(player.currentClub)}`
}

function searchCacheKey(player: IdealPlayer): string {
  return `${normalizeKey(player.playerName)}|${player.age ?? 'na'}|${normalizeKey(player.currentClub)}`
}

function playerCost(player: IdealPlayer): number {
  return parseEstimatedFee(player.estimatedFee) ?? 999_000_000
}

function candidateCost(candidate: CandidateEvaluation): number {
  return candidate.selectionCost
}

function materializeCandidates(slot: ManagerXISlot): IdealPlayer[] {
  return slot.candidates
    .filter((candidate) => Boolean(candidate.playerName?.trim()))
    .map((candidate) => ({
      playerName: candidate.playerName.trim(),
      position: slot.position,
      archetypeLabel: slot.archetypeLabel,
      age: candidate.age,
      nationality: 'Unknown',
      currentClub: candidate.currentClub || '',
      estimatedFee: candidate.estimatedFee || 'Unknown',
      contractUntil: 'Unknown',
      whyIdeal: `Selected as the ${slot.archetypeLabel.toLowerCase()} fit for this ${slot.position} role in the manager's system.`,
      systemFitScore: candidate.systemFitScore,
      tmVerified: false,
    }))
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const currentIndex = nextIndex
      if (currentIndex >= items.length) return
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

async function findSearchResult(
  player: IdealPlayer,
  searchCache: Map<string, Promise<TMPlayerSearchResult | null>>
): Promise<TMPlayerSearchResult | null> {
  const cacheKey = searchCacheKey(player)
  const cached = searchCache.get(cacheKey)
  if (cached) return cached

  const lookup = (async () => {
    const attempts = [
      { age: player.age, club: player.currentClub },
      { age: player.age },
      undefined,
    ] as const

    for (const hints of attempts) {
      try {
        const result = await withTimeout(searchPlayer(player.playerName, hints), TM_SEARCH_TIMEOUT_MS, null)
        if (result) return result
      } catch {
        continue
      }
    }

    return null
  })()

  searchCache.set(cacheKey, lookup)
  return lookup
}

async function warmTransfermarktSearch(
  slots: ManagerXISlot[],
  searchCache: Map<string, Promise<TMPlayerSearchResult | null>>
): Promise<void> {
  for (const slot of slots) {
    const firstCandidate = materializeCandidates(slot)[0]
    if (!firstCandidate) continue

    try {
      await findSearchResult(firstCandidate, searchCache)
    } catch {
      // If the warmup miss fails, we still continue into the normal search path.
    }
    return
  }
}

function buildCandidateEvaluation(player: IdealPlayer, searchResult: TMPlayerSearchResult | null): CandidateEvaluation {
  const enrichedPlayer = searchResult
    ? mergeSearchResult(player, searchResult)
    : {
        ...player,
        tmVerified: false,
      }

  return {
    player: enrichedPlayer,
    searchResult,
    selectionCost: playerCost(enrichedPlayer),
  }
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
      candidate.player.systemFitScore > existing.player.systemFitScore ||
      (candidate.player.systemFitScore === existing.player.systemFitScore && currentCost < existingCost)
    ) {
      bestByKey.set(key, candidate)
    }
  }

  return Array.from(bestByKey.values()).sort((a, b) => {
    if (b.player.systemFitScore !== a.player.systemFitScore) {
      return b.player.systemFitScore - a.player.systemFitScore
    }
    return candidateCost(a) - candidateCost(b)
  })
}

function buildLocalSlots(slots: ManagerXISlot[]): EnrichedSlot[] {
  return slots.map((slot) => ({
    slotId: slot.slotId,
    candidates: dedupeCandidates(
      materializeCandidates(slot).map((player) => buildCandidateEvaluation(player, null))
    ),
  }))
}

async function enrichSlots(slots: ManagerXISlot[]): Promise<EnrichedSlot[]> {
  const searchCache = new Map<string, Promise<TMPlayerSearchResult | null>>()
  await warmTransfermarktSearch(slots, searchCache)
  const evaluatedSlots = await mapWithConcurrency(
    slots,
    TM_ENRICHMENT_CONCURRENCY,
    async (slot) => {
      const candidates = await mapWithConcurrency(
        materializeCandidates(slot),
        TM_ENRICHMENT_CONCURRENCY,
        async (player) => buildCandidateEvaluation(player, await findSearchResult(player, searchCache))
      )

      return {
        slotId: slot.slotId,
        candidates: dedupeCandidates(candidates),
      }
    }
  )

  return evaluatedSlots
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
    for (const candidate of slot.candidates) {
      const key = playerKey(candidate.player)
      if (used.has(key)) continue

      const nextTotal = total + candidateCost(candidate)
      if (cap !== null && bestWithin && nextTotal > cap) continue

      used.add(key)
      chosen.push(candidate)
      dfs(index + 1, chosen, used, nextTotal, score + candidate.player.systemFitScore)
      chosen.pop()
      used.delete(key)
    }
  }

  dfs(0, [], new Set<string>(), 0, 0)
  return bestWithin ?? bestOver ?? { chosen: [], total: 0, score: 0, withinBudget: false }
}

async function enrichPlayer(
  player: IdealPlayer,
  searchResult: TMPlayerSearchResult | null
): Promise<IdealPlayer> {
  return searchResult ? mergeSearchResult(player, searchResult) : player
}

async function enrichSelectedPlayers(players: IdealPlayer[]): Promise<IdealPlayer[]> {
  const searchCache = new Map<string, Promise<TMPlayerSearchResult | null>>()

  const firstPlayer = players[0]
  if (firstPlayer) {
    try {
      await findSearchResult(firstPlayer, searchCache)
    } catch {
      // Keep going — warmup is a best-effort latency improvement only.
    }
  }

  return mapWithConcurrency(
    players,
    TM_ENRICHMENT_CONCURRENCY,
    async (player) => enrichPlayer(player, await findSearchResult(player, searchCache))
  )
}

function calculateTotalEstimatedCost(players: IdealPlayer[]): number {
  return players.reduce((sum, player) => sum + playerCost(player), 0)
}

function withComputedBudget(
  base: Omit<ManagerXIResult, 'players' | 'totalEstimatedCost'>,
  players: IdealPlayer[],
  budget: string
): ManagerXIResult {
  const cap = getBudgetCap(budget)
  const total = calculateTotalEstimatedCost(players)
  const overrun = cap !== null ? Math.max(0, total - cap) : 0

  return {
    ...base,
    players,
    totalEstimatedCost: `≈${formatCompactEuros(total)}`,
    budgetStatus: cap === null || overrun <= 0 ? 'within' : 'over',
    budgetOverrun: overrun > 0 ? formatCompactEuros(overrun) : undefined,
  }
}

async function resolveCandidatePool(pool: ManagerXICandidatePool, budget: string): Promise<ManagerXIResult | null> {
  const cap = getBudgetCap(budget)
  const candidateSlots = cap === null ? buildLocalSlots(pool.slots) : await enrichSlots(pool.slots)
  const selection = selectPlayersForSlots(candidateSlots, cap)

  if (selection.chosen.length !== pool.slots.length) {
    return null
  }

  const enrichedPlayers = cap === null
    ? await enrichSelectedPlayers(selection.chosen.map((candidate) => candidate.player))
    : await mapWithConcurrency(
        selection.chosen,
        TM_ENRICHMENT_CONCURRENCY,
        async (candidate) => enrichPlayer(candidate.player, candidate.searchResult)
      )

  return withComputedBudget(
    {
      formation: pool.formation,
      managerName: pool.managerName,
      identity: pool.identity,
    },
    enrichedPlayers,
    budget
  )
}

async function buildBudgetAwareManagerXI(
  budget: string,
  managerName?: string,
  managerId?: string
): Promise<ManagerXIResult> {
  const manager = managerId ? (getManagerById(managerId) || null) : null
  const cap = getBudgetCap(budget)
  const baseInstructions = cap !== null ? buildBudgetInstructions(budget, cap) : undefined
  const retryInstructions = cap !== null
    ? `${baseInstructions} Previous attempt was still too expensive once priced against live Transfermarkt values. Return materially cheaper alternatives across multiple slots and avoid any player likely to cost above ${formatCompactEuros(Math.floor(cap * 0.18))}.`
    : undefined

  const instructionPasses = [baseInstructions, retryInstructions].filter((value): value is string => Boolean(value))

  if (instructionPasses.length === 0) {
    const pool = await generateManagerXICandidatePool(budget, manager, managerName)
    const resolved = await resolveCandidatePool(pool, budget)
    if (!resolved) throw new Error('Failed to build a valid XI from the candidate pool.')
    return resolved
  }

  let lastResolved: ManagerXIResult | null = null

  for (const instructions of instructionPasses) {
    const pool = await generateManagerXICandidatePool(budget, manager, managerName, instructions)
    const resolved = await resolveCandidatePool(pool, budget)
    if (!resolved) continue
    lastResolved = resolved
    if (resolved.budgetStatus !== 'over') return resolved
  }

  if (lastResolved) return lastResolved
  throw new Error('Failed to build a valid XI from the candidate pool.')
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

    const result = await buildBudgetAwareManagerXI(budget, managerName, managerId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Manager XI error:', error)
    const details = getAIErrorDetails(error, 'Failed to build XI. Please try again.')
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

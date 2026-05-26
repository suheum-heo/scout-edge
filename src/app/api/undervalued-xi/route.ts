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
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { getSharedCacheEntry, setSharedCacheEntry } from '@/lib/shared-cache'
import { createServerTiming } from '@/lib/server-timing'
import { buildTMPlayerProfileUrl, searchPlayer, formatMarketValue, TMPlayerSearchResult } from '@/lib/transfermarkt'

const TM_SEARCH_TIMEOUT_MS = 5000
const TM_ENRICHMENT_CONCURRENCY = 8
const UNDERVALUED_XI_TTL_MS = 30 * 60 * 1000
const UNDERVALUED_XI_CACHE_SCOPE = 'undervalued-xi-v3'
const undervaluedXICache = new Map<string, { data: UndervaluedXIResult; expiresAt: number }>()
const TM_SEARCH_TIMED_OUT = Symbol('tm-search-timed-out')

interface CandidateEvaluation {
  player: UndervaluedPlayer
  selectionCost: number
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

interface MaterializedSlotCandidate {
  slotId: string
  position: string
  archetypeLabel: string
  player: UndervaluedPlayer
}

function normalizeCacheValue(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function getUndervaluedXICacheKey(
  budget: string,
  managerId?: string,
  managerName?: string,
  teamName?: string
): string {
  return [
    budget,
    managerId || 'no-manager-id',
    normalizeCacheValue(managerName),
    normalizeCacheValue(teamName),
  ].join('|')
}

function getCachedUndervaluedXI(cacheKey: string): UndervaluedXIResult | null {
  const entry = undervaluedXICache.get(cacheKey)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    undervaluedXICache.delete(cacheKey)
    return null
  }
  return entry.data
}

function setCachedUndervaluedXI(cacheKey: string, data: UndervaluedXIResult) {
  undervaluedXICache.set(cacheKey, {
    data,
    expiresAt: Date.now() + UNDERVALUED_XI_TTL_MS,
  })
}

async function persistUndervaluedXIResult(
  cacheKey: string,
  result: UndervaluedXIResult,
  metadata?: Record<string, unknown>
) {
  setCachedUndervaluedXI(cacheKey, result)
  await setSharedCacheEntry(
    UNDERVALUED_XI_CACHE_SCOPE,
    cacheKey,
    result,
    UNDERVALUED_XI_TTL_MS,
    metadata
  )
}

function withTimeout<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return Promise.race([promise, new Promise<T | F>((resolve) => setTimeout(() => resolve(fallback), ms))])
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
  return players.reduce((sum, player) => sum + playerCost(player), 0)
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
    'For every slot, provide one best-fit option and one cheaper safety option.',
    'The pool must be diverse enough that a code-based selector can build a full XI under budget.',
    'Keep estimated values conservative and realistic for a real transfer discussion.',
    'Before you answer, do the arithmetic and sanity-check that the pool genuinely contains a legal under-budget XI.',
    ...bracketRules,
  ].join(' ')
}

function buildVerificationInstructions(): string {
  return [
    'Every candidate must be easily verifiable on current Transfermarkt player search with the exact spelling you provide.',
    'Avoid speculative youth names, uncertain transliterations, obscure loan statuses, and anyone whose current club you are not completely certain about.',
    'Prefer a slightly more established active first-team player over a clever obscure option if verification is at all doubtful.',
    'The final XI must be fully club-verifiable by Transfermarkt, not just tactically plausible.',
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

function searchCacheKey(player: UndervaluedPlayer): string {
  return `${normalizeKey(player.playerName)}|${player.age ?? 'na'}|${normalizeKey(player.currentClub)}`
}

function playerCost(player: UndervaluedPlayer): number {
  return parseEstimatedValue(player.estimatedValue) ?? 999_000_000
}

function candidateCost(candidate: CandidateEvaluation): number {
  return candidate.selectionCost
}

function buildCandidateEvaluationFromPlayer(player: UndervaluedPlayer): CandidateEvaluation {
  return {
    player,
    selectionCost: playerCost(player),
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
    transfermarktUrl: searchResult.profileUrl || buildTMPlayerProfileUrl(searchResult.id, searchResult.name),
  }
}

function hasDuplicateUndervaluedPlayers(players: UndervaluedPlayer[]): boolean {
  const seen = new Set<string>()

  for (const player of players) {
    const key = playerKey(player)
    if (seen.has(key)) return true
    seen.add(key)
  }

  return false
}

function hasUnverifiedPlayers(players: UndervaluedPlayer[]): boolean {
  return players.some((player) => player.tmVerified !== true)
}

function preferVerifiedCandidates(candidates: CandidateEvaluation[]): CandidateEvaluation[] {
  const verified = candidates.filter((candidate) => candidate.player.tmVerified === true)
  return verified.length > 0 ? verified : candidates
}

async function enrichDirectPlayers(
  players: UndervaluedPlayer[],
  searchCache = new Map<string, Promise<TMPlayerSearchResult | null>>()
): Promise<UndervaluedPlayer[]> {
  return mapWithConcurrency(
    players,
    TM_ENRICHMENT_CONCURRENCY,
    async (player) => {
      const searchResult = await findSearchResult(player, searchCache)
      const enriched = searchResult
        ? mergeSearchResult(player, searchResult)
        : {
            ...player,
            tmVerified: false,
          }

      return {
        ...enriched,
        contractUntil: player.contractUntil || 'Unknown',
        whyUndervalued: player.whyUndervalued || buildWhyUndervaluedSummary(enriched),
      }
    }
  )
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
  player: UndervaluedPlayer,
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
        const result = await withTimeout(
          searchPlayer(player.playerName, hints),
          TM_SEARCH_TIMEOUT_MS,
          TM_SEARCH_TIMED_OUT
        )
        if (result === TM_SEARCH_TIMED_OUT) return null
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

function buildCandidateEvaluation(
  player: UndervaluedPlayer,
  searchResult: TMPlayerSearchResult | null
): CandidateEvaluation {
  const enrichedPlayer = searchResult
    ? mergeSearchResult(player, searchResult)
    : {
        ...player,
        tmVerified: false,
      }

  return buildCandidateEvaluationFromPlayer(enrichedPlayer)
}

function buildEstimatedSlots(slots: UndervaluedXISlot[]): EnrichedSlot[] {
  return slots.map((slot) => ({
    slotId: slot.slotId,
    position: slot.position,
    archetypeLabel: slot.archetypeLabel,
    candidates: dedupeCandidates(materializeCandidates(slot).map((player) => buildCandidateEvaluationFromPlayer(player))),
  }))
}

function buildWhyUndervaluedSummary(player: UndervaluedPlayer): string {
  const valueContext = player.estimatedValue && player.estimatedValue !== 'Unknown'
    ? `at ${player.estimatedValue}`
    : 'at a manageable market cost'

  return `${player.archetypeLabel} profile ${valueContext} for a ${player.age}-year-old. Built as a value-first fit for this system rather than a prestige signing.`
}

function getAlternativeEntriesForSelection(
  slots: UndervaluedXISlot[],
  selection: SelectionSummary,
  starters: UndervaluedPlayer[],
  starterResult: UndervaluedXIResult
): MaterializedSlotCandidate[] {
  const needsFullReserveScan =
    starterResult.budgetStatus === 'over' ||
    hasDuplicateUndervaluedPlayers(starters)
  const targetSlotIndexes = needsFullReserveScan
    ? new Set(slots.map((_, index) => index))
    : new Set(
        starters.flatMap((player, index) => (
          player.tmVerified === false ? [index] : []
        ))
      )

  return slots.flatMap((slot, slotIndex) => {
    if (!targetSlotIndexes.has(slotIndex)) return []

    const selectedCandidate = selection.chosen[slotIndex]
    const selectedKey = selectedCandidate ? playerKey(selectedCandidate.player) : null

    return materializeCandidates(slot)
      .filter((player) => !selectedKey || playerKey(player) !== selectedKey)
      .map((player) => ({
        slotId: slot.slotId,
        position: slot.position,
        archetypeLabel: slot.archetypeLabel,
        player,
      }))
  })
}

function buildSelectedPlayers(chosen: CandidateEvaluation[]): UndervaluedPlayer[] {
  return chosen.map((candidate) => {
    const finalizedPlayer = {
      ...candidate.player,
      contractUntil: candidate.player.contractUntil || 'Unknown',
    }

    return {
      ...finalizedPlayer,
      whyUndervalued: candidate.player.whyUndervalued || buildWhyUndervaluedSummary(finalizedPlayer),
    }
  })
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
  const timing = createServerTiming()
  const requestStartedAt = timing.start()

  try {
    const body = await request.json()
    const { budget, managerId, managerName, teamName } = body as {
      budget: string
      managerId?: string
      managerName?: string
      teamName?: string
    }

    if (!budget) {
      const response = NextResponse.json({ error: 'budget is required' }, { status: 400 })
      timing.end('total', requestStartedAt)
      timing.apply(response.headers)
      return response
    }

    const manager = managerId ? getManagerById(managerId) : undefined
    const factualManagerName = manager?.name || managerName || null
    const cacheKey = getUndervaluedXICacheKey(
      budget,
      managerId,
      factualManagerName ?? undefined,
      teamName
    )
    const cachedResult = getCachedUndervaluedXI(cacheKey)
    if (cachedResult) {
      const response = NextResponse.json(cachedResult)
      timing.end('cache_hit', requestStartedAt, `source:memory,players:${cachedResult.players.length}`)
      timing.apply(response.headers)
      return response
    }

    const sharedCachedResult = await getSharedCacheEntry<UndervaluedXIResult>(
      UNDERVALUED_XI_CACHE_SCOPE,
      cacheKey
    )
    if (sharedCachedResult) {
      setCachedUndervaluedXI(cacheKey, sharedCachedResult)
      const response = NextResponse.json(sharedCachedResult)
      timing.end('cache_hit', requestStartedAt, `source:shared,players:${sharedCachedResult.players.length}`)
      timing.apply(response.headers)
      return response
    }

    const snapshotStartedAt = timing.start()
    const liveManagerSnapshot = factualManagerName
      ? await getLiveManagerSnapshot(factualManagerName, { maxMatches: 20 }).catch(() => null)
      : null
    timing.end('manager_snapshot', snapshotStartedAt, factualManagerName ?? 'none')
    const cap = getBudgetCap(budget)
    const verificationInstructions = buildVerificationInstructions()
    const baseInstructions = cap !== null
      ? `${buildBudgetInstructions(budget, cap)} ${verificationInstructions}`
      : verificationInstructions
    const retryInstructions = cap !== null
      ? `${baseInstructions} Previous attempt included at least one name that could not be verified on Transfermarkt or drifted over budget once live values were applied. Return materially safer exact spellings, more obvious current clubs, and slightly more mainstream first-team options across multiple slots.`
      : `${baseInstructions} Previous attempt included at least one name that could not be verified on Transfermarkt. Return more mainstream active first-team players with exact current clubs and spellings that are easy to verify.`
    const instructionPasses = [baseInstructions, retryInstructions]

    const liveFormationContext = liveManagerSnapshot
      ? {
          primaryFormation: liveManagerSnapshot.primaryFormation,
          recentFormations: liveManagerSnapshot.recentFormations,
          formationSampleSize: liveManagerSnapshot.sampleSize,
          formationSeason: liveManagerSnapshot.season,
          referenceClub: liveManagerSnapshot.referenceClub,
        }
      : undefined

    let resolvedResult: UndervaluedXIResult | null = null
    let resolvedFormation: string | null = null
    let resolvedSource: 'starter-path' | 'reserve-path' | null = null
    let attemptsUsed = 0

    for (const [attemptIndex, instructions] of instructionPasses.entries()) {
      attemptsUsed = attemptIndex + 1
      const attemptSuffix = attemptIndex === 0 ? '' : `_${attemptIndex + 1}`

      const candidatePoolStartedAt = timing.start()
      const pool = await generateUndervaluedXICandidatePool(
        budget,
        manager || null,
        managerName,
        teamName,
        instructions,
        liveFormationContext
      )
      timing.end(`candidate_pool${attemptSuffix}`, candidatePoolStartedAt, `formation:${pool.formation},slots:${pool.slots.length}`)

      const initialSelectionStartedAt = timing.start()
      const estimatedSlots = buildEstimatedSlots(pool.slots)
      const initialSelection = selectPlayersForSlots(estimatedSlots, cap)
      timing.end(
        `initial_selection${attemptSuffix}`,
        initialSelectionStartedAt,
        `chosen:${initialSelection.chosen.length},within:${initialSelection.withinBudget ? 'yes' : 'no'}`
      )

      if (initialSelection.chosen.length !== estimatedSlots.length) {
        continue
      }

      const searchCache = new Map<string, Promise<TMPlayerSearchResult | null>>()

      const starterEnrichmentStartedAt = timing.start()
      const enrichedStarters = await enrichDirectPlayers(
        initialSelection.chosen.map((candidate) => candidate.player),
        searchCache
      )
      timing.end(`starter_tm_enrichment${attemptSuffix}`, starterEnrichmentStartedAt, `players:${enrichedStarters.length}`)

      const starterResult = withComputedBudget(
        {
          formation: pool.formation,
          concept: pool.concept,
          players: enrichedStarters,
          totalEstimatedCost: `≈${formatCompactEuros(initialSelection.total)}`,
        },
        enrichedStarters,
        budget
      )

      const starterPathUsable =
        enrichedStarters.length === estimatedSlots.length &&
        !hasDuplicateUndervaluedPlayers(enrichedStarters) &&
        starterResult.budgetStatus === 'within' &&
        !hasUnverifiedPlayers(enrichedStarters)

      if (starterPathUsable) {
        resolvedResult = starterResult
        resolvedFormation = pool.formation
        resolvedSource = 'starter-path'
        break
      }

      const reserveEntries = getAlternativeEntriesForSelection(
        pool.slots,
        initialSelection,
        enrichedStarters,
        starterResult
      )
      const reserveEnrichmentStartedAt = timing.start()
      const reserveEvaluations = await mapWithConcurrency(
        reserveEntries,
        TM_ENRICHMENT_CONCURRENCY,
        async (entry) => ({
          slotId: entry.slotId,
          candidate: buildCandidateEvaluation(entry.player, await findSearchResult(entry.player, searchCache)),
        })
      )
      timing.end(`reserve_tm_enrichment${attemptSuffix}`, reserveEnrichmentStartedAt, `players:${reserveEvaluations.length}`)

      const reserveCandidatesBySlot = new Map<string, CandidateEvaluation[]>()
      for (const entry of reserveEvaluations) {
        const existing = reserveCandidatesBySlot.get(entry.slotId)
        if (existing) {
          existing.push(entry.candidate)
        } else {
          reserveCandidatesBySlot.set(entry.slotId, [entry.candidate])
        }
      }

      const finalSlots = pool.slots.map((slot, slotIndex) => ({
        slotId: slot.slotId,
        position: slot.position,
        archetypeLabel: slot.archetypeLabel,
        candidates: preferVerifiedCandidates(dedupeCandidates([
          buildCandidateEvaluationFromPlayer(enrichedStarters[slotIndex]),
          ...(reserveCandidatesBySlot.get(slot.slotId) ?? []),
        ])),
      }))

      const selectionStartedAt = timing.start()
      const selection = selectPlayersForSlots(finalSlots, cap)
      timing.end(`selection${attemptSuffix}`, selectionStartedAt, `chosen:${selection.chosen.length},within:${selection.withinBudget ? 'yes' : 'no'}`)

      if (selection.chosen.length !== finalSlots.length) {
        continue
      }

      const selectedPlayers = buildSelectedPlayers(selection.chosen)
      if (hasUnverifiedPlayers(selectedPlayers)) {
        continue
      }

      resolvedResult = withComputedBudget(
        {
          formation: pool.formation,
          concept: pool.concept,
          players: selectedPlayers,
          totalEstimatedCost: `≈${formatCompactEuros(selection.total)}`,
        },
        selectedPlayers,
        budget
      )
      resolvedFormation = pool.formation
      resolvedSource = 'reserve-path'
      break
    }

    if (!resolvedResult || !resolvedFormation || !resolvedSource) {
      const response = NextResponse.json(
        { error: 'Failed to build a fully verified Undervalued XI. Please try regenerate.' },
        { status: 500 }
      )
      timing.end('total', requestStartedAt)
      timing.apply(response.headers)
      return response
    }

    await persistUndervaluedXIResult(cacheKey, resolvedResult, {
      source: resolvedSource,
      formation: resolvedFormation,
      budget,
      managerName: factualManagerName,
      teamName,
      attemptsUsed,
    })

    const response = NextResponse.json(resolvedResult)
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  } catch (error) {
    console.error('Undervalued XI error:', error)
    const details = getAIErrorDetails(error, 'Failed to generate Undervalued XI')
    const response = NextResponse.json({ error: details.error }, { status: details.status })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  }
}

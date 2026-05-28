import { NextRequest, NextResponse } from 'next/server'
import { type LanguageCode, normalizeLanguage, translate } from '@/lib/i18n'

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
import { localizeUndervaluedXIResult } from '@/lib/entity-localization'
import { getSharedCacheEntry, setSharedCacheEntry } from '@/lib/shared-cache'
import { createServerTiming } from '@/lib/server-timing'
import { buildTMPlayerProfileUrl, searchPlayer, formatMarketValue, TMPlayerSearchResult, isReliableTMClubMatch } from '@/lib/transfermarkt'

const TM_SEARCH_TIMEOUT_MS = 5000
const TM_ENRICHMENT_CONCURRENCY = 8
const UNDERVALUED_XI_TTL_MS = 30 * 60 * 1000
const UNDERVALUED_XI_CACHE_SCOPE = 'undervalued-xi-v10'
const undervaluedXICache = new Map<string, { data: UndervaluedXIResult; expiresAt: number }>()
const TM_SEARCH_TIMED_OUT = Symbol('tm-search-timed-out')

interface CandidateEvaluation {
  player: UndervaluedPlayer
  selectionCost: number
  selectionScore: number
  positionCompatibilityScore: number
  positionCompatible: boolean
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

type UndervaluedXIErrorCode = 'no_valid_budget_xi' | 'provider_error'

interface MaterializedSlotCandidate {
  slotId: string
  position: string
  archetypeLabel: string
  player: UndervaluedPlayer
}

type SlotFamily =
  | 'goalkeeper'
  | 'center-back'
  | 'fullback'
  | 'wing-back'
  | 'holding-midfielder'
  | 'central-midfielder'
  | 'attacking-midfielder'
  | 'winger'
  | 'striker'

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
  teamName?: string,
  language?: string
): string {
  return [
    budget,
    normalizeCacheValue(language),
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

async function normalizeLocalizedUndervaluedXIResult(
  result: UndervaluedXIResult,
  language: LanguageCode,
  budget: string,
  options?: {
    managerName?: string
    teamName?: string
  }
): Promise<UndervaluedXIResult> {
  const normalizedPlayers = result.players.map((player) => ({
    ...player,
    whyUndervalued: resolveWhyUndervaluedText(player, language),
  }))
  const normalizedResult = withComputedBudget(
    {
      ...result,
      concept: buildLocalizedUndervaluedConcept(
        result.formation,
        options?.managerName || 'this system',
        budget,
        language,
        result.concept
      ),
    },
    normalizedPlayers,
    budget
  )

  return localizeUndervaluedXIResult(normalizedResult, language, options)
}

async function safeNormalizeLocalizedUndervaluedXIResult(
  result: UndervaluedXIResult,
  language: LanguageCode,
  budget: string,
  options?: {
    managerName?: string
    teamName?: string
  }
): Promise<UndervaluedXIResult> {
  try {
    return await normalizeLocalizedUndervaluedXIResult(result, language, budget, options)
  } catch (error) {
    console.warn('[undervalued-xi] localization failed, falling back to canonical result:', error)
    return withComputedBudget(
      {
        ...result,
        concept: buildLocalizedUndervaluedConcept(
          result.formation,
          options?.managerName || 'this system',
          budget,
          language,
          result.concept
        ),
      },
      result.players.map((player) => ({
        ...player,
        whyUndervalued: resolveWhyUndervaluedText(player, language),
      })),
      budget
    )
  }
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

function getBudgetOverrunAllowance(budget: string): number | null {
  if (budget === '< €50M') return 5_000_000
  if (budget === '€50–100M') return 10_000_000
  if (budget === '€100–150M') return 15_000_000
  if (budget === '€150–200M') return 20_000_000
  return null
}

function getBudgetSelectionCap(budget: string): number | null {
  const cap = getBudgetCap(budget)
  if (cap === null) return null
  return cap + (getBudgetOverrunAllowance(budget) ?? 0)
}

function getBudgetOverrun(total: number, budget: string): number {
  const cap = getBudgetCap(budget)
  if (cap === null) return 0
  return Math.max(0, total - cap)
}

function isBudgetTotalAcceptable(total: number, budget: string): boolean {
  const overrun = getBudgetOverrun(total, budget)
  if (overrun <= 0) return true

  const allowance = getBudgetOverrunAllowance(budget)
  if (allowance === null) return false
  return overrun <= allowance
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
    'A player must naturally fit the slot with their live Transfermarkt position data.',
    'Do not use centre-backs as left-backs or right-backs unless Transfermarkt clearly lists them as a full-back or wing-back option.',
    'Do not use defensive midfielders as centre-backs unless Transfermarkt clearly lists them as centre-backs.',
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

function normalizeText(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

function getSlotFamily(slot: Pick<EnrichedSlot, 'position' | 'archetypeLabel'>): SlotFamily {
  switch (slot.position) {
    case 'GK':
      return 'goalkeeper'
    case 'CB':
      return 'center-back'
    case 'LB':
    case 'RB':
      return 'fullback'
    case 'WB':
      return 'wing-back'
    case 'CDM':
      return 'holding-midfielder'
    case 'CAM':
      return 'attacking-midfielder'
    case 'LW':
    case 'RW':
      return 'winger'
    case 'ST':
    case 'CF':
      return 'striker'
    case 'CM':
    default:
      return 'central-midfielder'
  }
}

function scorePositionCompatibility(
  slot: Pick<EnrichedSlot, 'position' | 'archetypeLabel'>,
  tmPosition?: string | null
): number {
  const family = getSlotFamily(slot)
  const positionText = normalizeText(tmPosition)

  if (!positionText) return 0

  switch (family) {
    case 'goalkeeper':
      return includesAny(positionText, ['goalkeeper', 'keeper']) ? 18 : 0
    case 'center-back':
      if (includesAny(positionText, ['centre back', 'center back', 'central defender'])) return 18
      if (positionText.includes('defender')) return 10
      if (includesAny(positionText, ['left back', 'right back', 'wing back'])) return 6
      return 0
    case 'fullback':
      if (slot.position === 'LB' && includesAny(positionText, ['left back', 'left wing back'])) return 18
      if (slot.position === 'RB' && includesAny(positionText, ['right back', 'right wing back'])) return 18
      if (includesAny(positionText, ['full back', 'wing back', 'left back', 'right back'])) return 12
      if (positionText.includes('defender')) return 6
      return 0
    case 'wing-back':
      if (includesAny(positionText, ['wing back', 'left wing back', 'right wing back'])) return 18
      if (includesAny(positionText, ['left back', 'right back', 'full back'])) return 10
      if (positionText.includes('winger')) return 4
      return 0
    case 'holding-midfielder':
      if (includesAny(positionText, ['defensive midfield', 'defensive midfielder'])) return 18
      if (includesAny(positionText, ['central midfield', 'central midfielder'])) return 14
      if (positionText.includes('midfield')) return 10
      return 0
    case 'central-midfielder':
      if (includesAny(positionText, ['central midfield', 'central midfielder'])) return 18
      if (includesAny(positionText, ['defensive midfield', 'attacking midfield'])) return 12
      if (positionText.includes('midfield')) return 9
      return 0
    case 'attacking-midfielder':
      if (includesAny(positionText, ['attacking midfield', 'attacking midfielder'])) return 18
      if (includesAny(positionText, ['central midfield', 'central midfielder'])) return 12
      if (includesAny(positionText, ['winger', 'forward', 'second striker'])) return 8
      return 0
    case 'winger':
      if (slot.position === 'LW' && includesAny(positionText, ['left wing', 'left winger'])) return 18
      if (slot.position === 'RW' && includesAny(positionText, ['right wing', 'right winger'])) return 18
      if (includesAny(positionText, ['winger', 'wing', 'wide forward'])) return 14
      if (includesAny(positionText, ['forward', 'attacking midfield'])) return 8
      return 0
    case 'striker':
      if (includesAny(positionText, ['striker', 'centre forward', 'center forward', 'second striker'])) return 18
      if (positionText.includes('forward')) return 12
      if (positionText.includes('winger')) return 4
      return 0
  }
}

function minimumCompatiblePositionScore(slot: Pick<EnrichedSlot, 'position' | 'archetypeLabel'>): number {
  switch (getSlotFamily(slot)) {
    case 'goalkeeper':
      return 18
    case 'center-back':
      return 10
    case 'fullback':
      return 12
    case 'wing-back':
      return 10
    case 'holding-midfielder':
      return 10
    case 'central-midfielder':
      return 9
    case 'attacking-midfielder':
      return 8
    case 'winger':
      return 8
    case 'striker':
      return 12
  }
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

function candidateRank(candidate: CandidateEvaluation): number {
  return candidate.selectionScore
}

function buildCandidateEvaluationFromPlayer(player: UndervaluedPlayer): CandidateEvaluation {
  return {
    player,
    selectionCost: playerCost(player),
    selectionScore: Math.max(0, Math.min(100, player.scoutScore)),
    positionCompatibilityScore: 0,
    positionCompatible: true,
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
      candidateRank(candidate) > candidateRank(existing) ||
      (candidateRank(candidate) === candidateRank(existing) && currentCost < existingCost)
    ) {
      bestByKey.set(key, candidate)
    }
  }

  return Array.from(bestByKey.values()).sort((a, b) => {
    if (candidateRank(b) !== candidateRank(a)) return candidateRank(b) - candidateRank(a)
    return candidateCost(a) - candidateCost(b)
  })
}

function mergeSearchResult(player: UndervaluedPlayer, searchResult: TMPlayerSearchResult): UndervaluedPlayer {
  const searchClub = searchResult.club?.name
  const reliableClubMatch = !player.currentClub || !searchClub || isReliableTMClubMatch(player.currentClub, searchClub)
  return {
    ...player,
    playerName: searchResult.name || player.playerName,
    currentClub: isUsableTMClubName(searchClub) && reliableClubMatch ? searchClub : player.currentClub,
    age: searchResult.age ?? player.age,
    nationality: searchResult.nationalities?.[0] || player.nationality,
    estimatedValue: searchResult.marketValue ? formatMarketValue(searchResult.marketValue) : player.estimatedValue,
    tmVerified: isUsableTMClubName(searchClub) && reliableClubMatch,
    transfermarktUrl: isUsableTMClubName(searchClub) && reliableClubMatch
      ? (searchResult.profileUrl || buildTMPlayerProfileUrl(searchResult.id, searchResult.name))
      : player.transfermarktUrl,
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

function preferCompatibleCandidates(candidates: CandidateEvaluation[]): CandidateEvaluation[] {
  const compatible = candidates.filter((candidate) => candidate.positionCompatible)
  return compatible.length > 0 ? compatible : []
}

function rankSelectionCandidates(candidates: CandidateEvaluation[]): CandidateEvaluation[] {
  return [...candidates].sort((left, right) => {
    const verificationDiff = Number(right.player.tmVerified === true) - Number(left.player.tmVerified === true)
    if (verificationDiff !== 0) return verificationDiff
    if (candidateRank(right) !== candidateRank(left)) return candidateRank(right) - candidateRank(left)
    return candidateCost(left) - candidateCost(right)
  })
}

async function enrichDirectPlayers(
  players: UndervaluedPlayer[],
  language: LanguageCode,
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
        whyUndervalued: resolveWhyUndervaluedText(enriched, language),
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
  slot: Pick<EnrichedSlot, 'position' | 'archetypeLabel'>,
  player: UndervaluedPlayer,
  searchResult: TMPlayerSearchResult | null
): CandidateEvaluation {
  const enrichedPlayer = searchResult
    ? mergeSearchResult(player, searchResult)
    : {
        ...player,
        tmVerified: false,
      }
  const positionCompatibilityScore = scorePositionCompatibility(slot, searchResult?.position)
  const positionCompatible = positionCompatibilityScore >= minimumCompatiblePositionScore(slot)

  return {
    player: enrichedPlayer,
    selectionCost: playerCost(enrichedPlayer),
    selectionScore: Math.max(
      1,
      Math.min(99, Math.round(enrichedPlayer.scoutScore + positionCompatibilityScore - (positionCompatible ? 0 : 35)))
    ),
    positionCompatibilityScore,
    positionCompatible,
  }
}

function buildEstimatedSlots(slots: UndervaluedXISlot[]): EnrichedSlot[] {
  return slots.map((slot) => ({
    slotId: slot.slotId,
    position: slot.position,
    archetypeLabel: slot.archetypeLabel,
    candidates: dedupeCandidates(materializeCandidates(slot).map((player) => buildCandidateEvaluationFromPlayer(player))),
  }))
}

function buildWhyUndervaluedSummary(player: UndervaluedPlayer, language: LanguageCode): string {
  return player.estimatedValue && player.estimatedValue !== 'Unknown'
    ? translate(language, 'xi.fallbackWhyUndervaluedWithValue', {
        archetype: player.archetypeLabel,
        value: player.estimatedValue,
        age: player.age,
      })
    : translate(language, 'xi.fallbackWhyUndervaluedNoValue', {
        archetype: player.archetypeLabel,
        age: player.age,
      })
}

function resolveWhyUndervaluedText(player: UndervaluedPlayer, language: LanguageCode): string {
  if (language === 'en' && player.whyUndervalued?.trim()) {
    return player.whyUndervalued
  }
  return buildWhyUndervaluedSummary(player, language)
}

function buildLocalizedUndervaluedConcept(
  formation: string,
  managerName: string,
  budget: string,
  language: LanguageCode,
  fallback: string
): string {
  if (language === 'en') return fallback
  return translate(language, 'xi.generatedConcept', {
    formation,
    manager: managerName,
    budget,
  })
}

function getAlternativeEntriesForSelection(
  slots: UndervaluedXISlot[],
  selection: SelectionSummary,
  starterEvaluations: CandidateEvaluation[],
  starterResult: UndervaluedXIResult
): MaterializedSlotCandidate[] {
  const needsFullReserveScan =
    starterResult.budgetStatus === 'over' ||
    hasDuplicateUndervaluedPlayers(starterEvaluations.map((evaluation) => evaluation.player))
  const targetSlotIndexes = needsFullReserveScan
    ? new Set(slots.map((_, index) => index))
    : new Set(
        starterEvaluations.flatMap((evaluation, index) => (
          evaluation.player.tmVerified === false || !evaluation.positionCompatible ? [index] : []
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

function buildSelectedPlayers(chosen: CandidateEvaluation[], language: LanguageCode): UndervaluedPlayer[] {
  return chosen.map((candidate) => {
    const finalizedPlayer = {
      ...candidate.player,
      contractUntil: candidate.player.contractUntil || 'Unknown',
    }

    return {
      ...finalizedPlayer,
      whyUndervalued: resolveWhyUndervaluedText(finalizedPlayer, language),
    }
  })
}

function hasInvalidSelection(
  players: UndervaluedPlayer[],
  chosen: CandidateEvaluation[],
  budget: string,
  options?: {
    requireVerified?: boolean
  }
): boolean {
  if (!players.length) return true
  if (hasDuplicateUndervaluedPlayers(players)) return true
  if (!isBudgetTotalAcceptable(calculateTotalEstimatedCost(players), budget)) return true
  if (chosen.some((candidate) => !candidate.positionCompatible)) return true
  if (options?.requireVerified && hasUnverifiedPlayers(players)) return true
  return false
}

function buildUndervaluedXIErrorPayload(language: LanguageCode, errorCode: UndervaluedXIErrorCode) {
  return {
    errorCode,
    status: errorCode,
    error:
      errorCode === 'no_valid_budget_xi'
        ? translate(language, 'xi.noValidBudgetXi')
        : translate(language, 'xi.providerError'),
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
      dfs(index + 1, chosen, used, nextTotal, score + candidateRank(candidate))
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
  let language = normalizeLanguage(undefined)

  try {
    const body = await request.json()
    const { budget, managerId, managerName, teamName } = body as {
      budget: string
      managerId?: string
      managerName?: string
      teamName?: string
      language?: string
    }
    language = normalizeLanguage(body.language)

    if (!budget) {
      const response = NextResponse.json({ error: translate(language, 'error.analysisFailed') }, { status: 400 })
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
      teamName,
      language
    )
    const cachedResult = getCachedUndervaluedXI(cacheKey)
    if (cachedResult) {
      const normalizedCachedResult = await safeNormalizeLocalizedUndervaluedXIResult(cachedResult, language, budget, {
        managerName: factualManagerName ?? managerName ?? undefined,
        teamName,
      })
      setCachedUndervaluedXI(cacheKey, normalizedCachedResult)
      const response = NextResponse.json(normalizedCachedResult)
      timing.end('cache_hit', requestStartedAt, `source:memory,players:${normalizedCachedResult.players.length}`)
      timing.apply(response.headers)
      return response
    }

    const sharedCachedResult = await getSharedCacheEntry<UndervaluedXIResult>(
      UNDERVALUED_XI_CACHE_SCOPE,
      cacheKey
    )
    if (sharedCachedResult) {
      const normalizedSharedResult = await safeNormalizeLocalizedUndervaluedXIResult(sharedCachedResult, language, budget, {
        managerName: factualManagerName ?? managerName ?? undefined,
        teamName,
      })
      setCachedUndervaluedXI(cacheKey, normalizedSharedResult)
      const response = NextResponse.json(normalizedSharedResult)
      timing.end('cache_hit', requestStartedAt, `source:shared,players:${normalizedSharedResult.players.length}`)
      timing.apply(response.headers)
      return response
    }

    const snapshotStartedAt = timing.start()
    const liveManagerSnapshot = factualManagerName
      ? await getLiveManagerSnapshot(factualManagerName, { maxMatches: 20 }).catch(() => null)
      : null
    timing.end('manager_snapshot', snapshotStartedAt, factualManagerName ?? 'none')
    const cap = getBudgetCap(budget)
    const selectionCap = getBudgetSelectionCap(budget)
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
    let resolvedSource: 'starter-path' | 'reserve-path' | 'safe-fallback-path' | null = null
    let attemptsUsed = 0
    let hadCandidatePoolSuccess = false
    let lastAttemptError: unknown = null

    for (const [attemptIndex, instructions] of instructionPasses.entries()) {
      attemptsUsed = attemptIndex + 1
      const attemptSuffix = attemptIndex === 0 ? '' : `_${attemptIndex + 1}`

      try {
        const candidatePoolStartedAt = timing.start()
        const pool = await generateUndervaluedXICandidatePool(
          budget,
          manager || null,
          managerName,
          teamName,
          instructions,
          liveFormationContext,
          'en'
        )
        hadCandidatePoolSuccess = true
        timing.end(`candidate_pool${attemptSuffix}`, candidatePoolStartedAt, `formation:${pool.formation},slots:${pool.slots.length}`)

        const initialSelectionStartedAt = timing.start()
        const estimatedSlots = buildEstimatedSlots(pool.slots)
        const initialSelection = selectPlayersForSlots(estimatedSlots, selectionCap)
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
        const starterEvaluations = await mapWithConcurrency(
          initialSelection.chosen,
          TM_ENRICHMENT_CONCURRENCY,
          async (candidate, slotIndex) => buildCandidateEvaluation(
            pool.slots[slotIndex],
            candidate.player,
            await findSearchResult(candidate.player, searchCache)
          )
        )
        const enrichedStarters = starterEvaluations.map((evaluation) => ({
          ...evaluation.player,
          contractUntil: evaluation.player.contractUntil || 'Unknown',
          whyUndervalued: resolveWhyUndervaluedText(evaluation.player, language),
        }))
        timing.end(`starter_tm_enrichment${attemptSuffix}`, starterEnrichmentStartedAt, `players:${enrichedStarters.length}`)

        const starterResult = withComputedBudget(
          {
            formation: pool.formation,
            concept: buildLocalizedUndervaluedConcept(
              pool.formation,
              factualManagerName || managerName || 'this system',
              budget,
              language,
              pool.concept
            ),
            players: enrichedStarters,
            totalEstimatedCost: `≈${formatCompactEuros(initialSelection.total)}`,
          },
          enrichedStarters,
          budget
        )

        if (!hasInvalidSelection(enrichedStarters, starterEvaluations, budget, { requireVerified: true })) {
          resolvedResult = starterResult
          resolvedFormation = pool.formation
          resolvedSource = 'starter-path'
          break
        }

        const reserveEntries = getAlternativeEntriesForSelection(
          pool.slots,
          initialSelection,
          starterEvaluations,
          starterResult
        )
        const reserveEnrichmentStartedAt = timing.start()
        const reserveEvaluations = await mapWithConcurrency(
          reserveEntries,
          TM_ENRICHMENT_CONCURRENCY,
          async (entry) => ({
            slotId: entry.slotId,
            candidate: buildCandidateEvaluation(entry, entry.player, await findSearchResult(entry.player, searchCache)),
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

        const strictSlots = pool.slots.map((slot, slotIndex) => ({
          slotId: slot.slotId,
          position: slot.position,
          archetypeLabel: slot.archetypeLabel,
          candidates: preferVerifiedCandidates(
            rankSelectionCandidates(
              preferCompatibleCandidates(
                dedupeCandidates([
                  starterEvaluations[slotIndex],
                  ...(reserveCandidatesBySlot.get(slot.slotId) ?? []),
                ])
              )
            )
          ),
        }))

        const strictSelectionStartedAt = timing.start()
        const strictSelection = selectPlayersForSlots(strictSlots, selectionCap)
        timing.end(
          `strict_selection${attemptSuffix}`,
          strictSelectionStartedAt,
          `chosen:${strictSelection.chosen.length},within:${strictSelection.withinBudget ? 'yes' : 'no'}`
        )

        if (strictSelection.chosen.length === strictSlots.length) {
          const strictPlayers = buildSelectedPlayers(strictSelection.chosen, language)
          if (!hasInvalidSelection(strictPlayers, strictSelection.chosen, budget, { requireVerified: true })) {
            resolvedResult = withComputedBudget(
              {
                formation: pool.formation,
                concept: buildLocalizedUndervaluedConcept(
                  pool.formation,
                  factualManagerName || managerName || 'this system',
                  budget,
                  language,
                  pool.concept
                ),
                players: strictPlayers,
                totalEstimatedCost: `≈${formatCompactEuros(strictSelection.total)}`,
              },
              strictPlayers,
              budget
            )
            resolvedFormation = pool.formation
            resolvedSource = 'reserve-path'
            break
          }
        }

        const safeSlots = pool.slots.map((slot, slotIndex) => ({
          slotId: slot.slotId,
          position: slot.position,
          archetypeLabel: slot.archetypeLabel,
          candidates: rankSelectionCandidates(
            preferCompatibleCandidates(
              dedupeCandidates([
                starterEvaluations[slotIndex],
                ...(reserveCandidatesBySlot.get(slot.slotId) ?? []),
              ])
            )
          ),
        }))

        const safeSelectionStartedAt = timing.start()
        const safeSelection = selectPlayersForSlots(safeSlots, selectionCap)
        timing.end(
          `safe_selection${attemptSuffix}`,
          safeSelectionStartedAt,
          `chosen:${safeSelection.chosen.length},within:${safeSelection.withinBudget ? 'yes' : 'no'}`
        )

        if (safeSelection.chosen.length !== safeSlots.length) {
          continue
        }

        const safePlayers = buildSelectedPlayers(safeSelection.chosen, language)
        if (hasInvalidSelection(safePlayers, safeSelection.chosen, budget)) {
          continue
        }

        resolvedResult = withComputedBudget(
          {
            formation: pool.formation,
            concept: buildLocalizedUndervaluedConcept(
              pool.formation,
              factualManagerName || managerName || 'this system',
              budget,
              language,
              pool.concept
            ),
            players: safePlayers,
            totalEstimatedCost: `≈${formatCompactEuros(safeSelection.total)}`,
          },
          safePlayers,
          budget
        )
        resolvedFormation = pool.formation
        resolvedSource = 'safe-fallback-path'
        break
      } catch (error) {
        lastAttemptError = error
        console.warn(`[undervalued-xi] attempt ${attemptIndex + 1} failed:`, error)
        continue
      }
    }

    if (!resolvedResult || !resolvedFormation || !resolvedSource) {
      const errorCode: UndervaluedXIErrorCode = hadCandidatePoolSuccess ? 'no_valid_budget_xi' : 'provider_error'
      if (lastAttemptError) {
        console.warn(`[undervalued-xi] final failure mode=${errorCode}:`, lastAttemptError)
      }
      const response = NextResponse.json(
        buildUndervaluedXIErrorPayload(language, errorCode),
        { status: errorCode === 'provider_error' ? 503 : 422 }
      )
      timing.end('total', requestStartedAt)
      timing.apply(response.headers)
      return response
    }

    const localizedResult = await safeNormalizeLocalizedUndervaluedXIResult(resolvedResult, language, budget, {
      managerName: factualManagerName || managerName || undefined,
      teamName,
    })

    try {
      await persistUndervaluedXIResult(cacheKey, localizedResult, {
        source: resolvedSource,
        formation: resolvedFormation,
        budget,
        managerName: factualManagerName,
        teamName,
        attemptsUsed,
      })
    } catch (error) {
      console.warn('[undervalued-xi] cache persistence failed:', error)
    }

    const response = NextResponse.json({ ...localizedResult, status: 'ok' as const })
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  } catch (error) {
    console.error('Undervalued XI error:', error)
    const details = getAIErrorDetails(error, translate(language, 'xi.providerError'))
    const response = NextResponse.json(
      {
        ...buildUndervaluedXIErrorPayload(language, 'provider_error'),
        error: details.error,
      },
      { status: details.status }
    )
    timing.end('total', requestStartedAt)
    timing.apply(response.headers)
    return response
  }
}

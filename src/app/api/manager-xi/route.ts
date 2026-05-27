import { NextRequest, NextResponse } from 'next/server'
import { type LanguageCode, normalizeLanguage, translate } from '@/lib/i18n'

export const maxDuration = 60

import {
  getManagerById,
  type ManagerProfile,
  type PositionalRequirement,
} from '@/lib/managers'
import {
  generateManagerXICandidatePool,
  IdealPlayer,
  ManagerXICandidatePool,
  ManagerXIResult,
  ManagerXISlot,
} from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { localizeManagerProfile } from '@/lib/runtime-localization'
import { buildTMPlayerProfileUrl, searchPlayer, formatMarketValue, TMPlayerSearchResult } from '@/lib/transfermarkt'

const TM_SEARCH_TIMEOUT_MS = 4500
const TM_ENRICHMENT_CONCURRENCY = 6
const LIVE_FORMATION_ERROR_PREFIX = 'LIVE_FORMATION_UNAVAILABLE::'

interface CandidateEvaluation {
  player: IdealPlayer
  searchResult: TMPlayerSearchResult | null
  selectionCost: number
  selectionScore: number
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

function getBudgetSpendFloor(budget: string, cap: number | null): number | null {
  if (cap === null) return null

  switch (budget) {
    case '€300M':
      return 200_000_000
    case '€500M':
      return 325_000_000
    default:
      return null
  }
}

function normalizeText(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim()
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase))
}

function buildBudgetInstructions(budget: string, cap: number): string {
  const averagePerStarter = Math.floor(cap / 11)
  const spendFloor = getBudgetSpendFloor(budget, cap)

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
    ...(spendFloor ? [`In this bracket, do not lowball the overall build: the final XI should usually land at or above ${formatCompactEuros(spendFloor)} unless no verified alternatives exist.`] : []),
    'If one player would consume more than roughly a fifth of the budget, exclude them unless the rest of the pool is clearly cheap enough to compensate.',
    'Provide materially cheaper fallback options in multiple slots, not just one or two.',
    'Before answering, sanity-check the arithmetic so a code-based selector can assemble a legal XI from your pool.',
    ...bracketRules,
  ].join(' ')
}

function buildVerificationInstructions(): string {
  return [
    'Every candidate must be easily verifiable on current Transfermarkt player search with the exact spelling you provide.',
    'Avoid speculative youth names, uncertain transliterations, reserve-team players, and anyone whose current club you are not completely certain about.',
    'If a role is tricky, prefer a slightly more established active first-team player over a clever obscure option.',
    'The final XI should be capable of being fully club-verified by Transfermarkt, not just tactically plausible.',
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

function getSlotFamily(slot: Pick<ManagerXISlot, 'position' | 'archetypeLabel'>): SlotFamily {
  switch (slot.position) {
    case 'GK':
      return 'goalkeeper'
    case 'LCB':
    case 'RCB':
    case 'CB':
      return 'center-back'
    case 'LB':
    case 'RB':
      return 'fullback'
    case 'LWB':
    case 'RWB':
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

function scoreRequirementForSlot(
  slot: Pick<ManagerXISlot, 'position' | 'archetypeLabel'>,
  requirement: PositionalRequirement
): number {
  const family = getSlotFamily(slot)
  const requirementText = normalizeText(`${requirement.position} ${requirement.profileLabel}`)
  const archetypeTokens = normalizeText(slot.archetypeLabel)
    .split(' ')
    .filter((token) => token.length > 3)
  const requirementTokens = requirementText.split(' ')

  let score = 0

  switch (family) {
    case 'goalkeeper':
      if (includesAny(requirementText, ['goalkeeper', 'keeper'])) score += 20
      break
    case 'center-back':
      if (includesAny(requirementText, ['center back', 'centre back', 'ball playing cb', 'central defender'])) score += 20
      else if (includesAny(requirementText, ['fullback', 'wing back'])) score += 4
      break
    case 'fullback':
      if (includesAny(requirementText, ['fullback', 'left back', 'right back'])) score += 20
      else if (includesAny(requirementText, ['wing back'])) score += 14
      break
    case 'wing-back':
      if (includesAny(requirementText, ['wing back', 'fullback', 'full back'])) score += 20
      break
    case 'holding-midfielder':
      if (includesAny(requirementText, ['defensive midfielder', 'pivot', '#6', 'holding midfielder'])) score += 20
      else if (includesAny(requirementText, ['central midfielder'])) score += 10
      break
    case 'central-midfielder':
      if (includesAny(requirementText, ['central midfielder', 'box to box', '#8', 'controller'])) score += 20
      else if (includesAny(requirementText, ['attacking midfielder', 'defensive midfielder'])) score += 10
      break
    case 'attacking-midfielder':
      if (includesAny(requirementText, ['attacking midfielder', '#10', 'playmaker', 'creator'])) score += 20
      else if (includesAny(requirementText, ['central midfielder', 'winger'])) score += 9
      break
    case 'winger':
      if (includesAny(requirementText, ['winger', 'wide forward', 'inverted winger'])) score += 20
      else if (includesAny(requirementText, ['striker', 'attacking midfielder'])) score += 8
      break
    case 'striker':
      if (includesAny(requirementText, ['striker', 'forward', 'centre forward', 'center forward', 'false 9'])) score += 20
      else if (includesAny(requirementText, ['winger', 'attacking midfielder'])) score += 7
      break
  }

  score += archetypeTokens.filter((token) => requirementTokens.includes(token)).length * 2
  return score
}

function findBestRequirement(
  manager: ManagerProfile | null,
  slot: Pick<ManagerXISlot, 'position' | 'archetypeLabel'>
): PositionalRequirement | null {
  if (!manager?.positionalRequirements?.length) return null

  const ranked = manager.positionalRequirements
    .map((requirement) => ({
      requirement,
      score: scoreRequirementForSlot(slot, requirement),
    }))
    .sort((left, right) => right.score - left.score)

  return ranked[0] && ranked[0].score > 0 ? ranked[0].requirement : null
}

function scorePositionCompatibility(
  slot: Pick<ManagerXISlot, 'position' | 'archetypeLabel'>,
  tmPosition?: string | null
): number {
  const family = getSlotFamily(slot)
  const positionText = normalizeText(tmPosition)

  if (!positionText) return 0

  switch (family) {
    case 'goalkeeper':
      return includesAny(positionText, ['goalkeeper', 'keeper']) ? 18 : 0
    case 'center-back':
      if (slot.position === 'LCB' && includesAny(positionText, ['left centre back', 'left center back'])) return 20
      if (slot.position === 'RCB' && includesAny(positionText, ['right centre back', 'right center back'])) return 20
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
      if (slot.position === 'LWB' && includesAny(positionText, ['left wing back', 'left back'])) return 18
      if (slot.position === 'RWB' && includesAny(positionText, ['right wing back', 'right back'])) return 18
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

function scoreArchetypeAlignment(
  slot: Pick<ManagerXISlot, 'position' | 'archetypeLabel'>,
  tmPosition?: string | null
): number {
  const archetype = normalizeText(slot.archetypeLabel)
  const positionText = normalizeText(tmPosition)

  if (!archetype || !positionText) return 0

  let score = 0

  if (includesAny(archetype, ['keeper']) && includesAny(positionText, ['goalkeeper', 'keeper'])) score += 6
  if (includesAny(archetype, ['wing back']) && includesAny(positionText, ['wing back'])) score += 8
  if (includesAny(archetype, ['fullback', 'full back']) && includesAny(positionText, ['left back', 'right back', 'full back', 'wing back'])) score += 6
  if (includesAny(archetype, ['center back', 'centre back', 'cb']) && includesAny(positionText, ['centre back', 'center back'])) score += 6
  if (includesAny(archetype, ['pivot', '#6', 'holding']) && includesAny(positionText, ['defensive midfield', 'defensive midfielder'])) score += 6
  if (includesAny(archetype, ['#8', 'engine', 'controller']) && includesAny(positionText, ['central midfield', 'central midfielder'])) score += 5
  if (includesAny(archetype, ['#10', 'creator', 'playmaker']) && includesAny(positionText, ['attacking midfield', 'attacking midfielder'])) score += 6
  if (includesAny(archetype, ['winger', 'wide forward']) && includesAny(positionText, ['winger', 'wing', 'forward'])) score += 6
  if (includesAny(archetype, ['striker', 'forward', 'false 9']) && includesAny(positionText, ['striker', 'forward'])) score += 6

  return Math.min(score, 10)
}

function scoreAgeFit(
  slot: Pick<ManagerXISlot, 'position' | 'archetypeLabel'>,
  age: number | null | undefined,
  manager: ManagerProfile | null
): number {
  if (!age || !Number.isFinite(age)) return 4

  const family = getSlotFamily(slot)
  let score = 0

  switch (family) {
    case 'goalkeeper':
      score = age >= 24 && age <= 31 ? 10 : age >= 21 && age <= 34 ? 6 : 2
      break
    case 'center-back':
      score = age >= 22 && age <= 29 ? 10 : age >= 30 && age <= 32 ? 6 : age >= 20 && age <= 33 ? 4 : 2
      break
    case 'fullback':
    case 'wing-back':
    case 'winger':
      score = age >= 21 && age <= 27 ? 10 : age >= 28 && age <= 30 ? 6 : age >= 19 && age <= 31 ? 3 : 0
      break
    case 'holding-midfielder':
    case 'central-midfielder':
    case 'attacking-midfielder':
      score = age >= 22 && age <= 28 ? 10 : age >= 29 && age <= 31 ? 6 : age >= 20 && age <= 32 ? 4 : 1
      break
    case 'striker':
      score = age >= 22 && age <= 29 ? 10 : age >= 30 && age <= 32 ? 6 : age >= 20 && age <= 33 ? 4 : 1
      break
  }

  if (manager?.style.pressing === 'gegenpressing' || manager?.style.pressing === 'high') {
    if (age >= 30 && includesAny(family, ['fullback', 'wing-back', 'winger', 'holding-midfielder', 'central-midfielder', 'striker'])) {
      score -= 2
    }
  }

  if (manager?.style.defensiveLine === 'high' || manager?.style.defensiveLine === 'very_high') {
    if (family === 'center-back' && age >= 30) score -= 2
  }

  return score
}

function slotBudgetMultiplier(position: string): number {
  switch (position) {
    case 'GK':
      return 0.75
    case 'LB':
    case 'RB':
      return 0.85
    case 'LCB':
    case 'RCB':
    case 'LWB':
    case 'RWB':
    case 'WB':
      return 0.9
    case 'CB':
      return 1
    case 'CDM':
      return 1.05
    case 'CAM':
      return 1.1
    case 'LW':
    case 'RW':
      return 1.15
    case 'ST':
    case 'CF':
      return 1.2
    case 'CM':
    default:
      return 1
  }
}

function scoreBudgetFit(
  slot: Pick<ManagerXISlot, 'position' | 'archetypeLabel'>,
  cost: number,
  cap: number | null
): number {
  if (cap === null || !Number.isFinite(cost)) return 0
  if (cost <= 0) return cap >= 300_000_000 ? 4 : 10

  const target = Math.max(1, (cap / 11) * slotBudgetMultiplier(slot.position))
  const ratio = cost / target

  if (cap >= 300_000_000) {
    if (ratio < 0.45) return -4
    if (ratio < 0.65) return 1
    if (ratio <= 0.95) return 8
    if (ratio <= 1.15) return 10
    if (ratio <= 1.4) return 5
    if (ratio <= 1.7) return 0
    return -6
  }

  if (ratio <= 0.75) return 12
  if (ratio <= 1) return 9
  if (ratio <= 1.2) return 6
  if (ratio <= 1.5) return 2
  if (ratio <= 1.8) return -2
  return -8
}

function getBudgetUsageBonus(total: number, cap: number | null, budget: string): number {
  if (cap === null || cap <= 0) return 0

  const ratio = total / cap

  switch (budget) {
    case '€300M':
    case '€500M':
      if (ratio >= 0.85 && ratio <= 1) return 18
      if (ratio >= 0.72) return 10
      if (ratio >= 0.6) return 2
      return -12
    case '€200M':
      if (ratio >= 0.7 && ratio <= 1) return 5
      if (ratio >= 0.55) return 2
      return 0
    default:
      return 0
  }
}

function selectionRankScore(total: number, score: number, cap: number | null, budget: string): number {
  return score + getBudgetUsageBonus(total, cap, budget)
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)))
}

function lowercaseFirst(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value
}

function joinWithAnd(parts: string[], language: LanguageCode): string {
  if (parts.length <= 1) return parts[0] || ''
  if (language === 'ko') return `${parts[0]} 및 ${parts[1]}`
  if (language === 'es') return `${parts[0]} y ${parts[1]}`
  return `${parts[0]} and ${parts[1]}`
}

function toProsePositionCode(position: string): string {
  switch (position) {
    case 'CDM':
      return 'DM'
    case 'CAM':
      return 'AM'
    default:
      return position.toUpperCase()
  }
}

function toTMPositionCode(position?: string | null): string | null {
  const normalized = normalizeText(position)
  if (!normalized) return null

  if (includesAny(normalized, ['goalkeeper', 'keeper'])) return 'GK'
  if (includesAny(normalized, ['left centre back', 'left center back'])) return 'LCB'
  if (includesAny(normalized, ['right centre back', 'right center back'])) return 'RCB'
  if (includesAny(normalized, ['left wing back'])) return 'LWB'
  if (includesAny(normalized, ['right wing back'])) return 'RWB'
  if (includesAny(normalized, ['wing back'])) return 'WB'
  if (includesAny(normalized, ['left back'])) return 'LB'
  if (includesAny(normalized, ['right back'])) return 'RB'
  if (includesAny(normalized, ['centre back', 'center back', 'central defender'])) return 'CB'
  if (includesAny(normalized, ['defensive midfield', 'defensive midfielder'])) return 'DM'
  if (includesAny(normalized, ['central midfield', 'central midfielder'])) return 'CM'
  if (includesAny(normalized, ['attacking midfield', 'attacking midfielder'])) return 'AM'
  if (includesAny(normalized, ['left wing', 'left winger'])) return 'LW'
  if (includesAny(normalized, ['right wing', 'right winger'])) return 'RW'
  if (includesAny(normalized, ['second striker', 'false 9', 'centre forward', 'center forward'])) return 'CF'
  if (includesAny(normalized, ['striker'])) return 'ST'
  if (normalized.includes('forward')) return 'FW'

  return null
}

function buildWhyIdeal(
  player: IdealPlayer,
  slot: Pick<ManagerXISlot, 'position' | 'archetypeLabel'>,
  managerName: string,
  requirement: PositionalRequirement | null,
  searchResult: TMPlayerSearchResult | null,
  cap: number | null,
  language: LanguageCode
): string {
  const slotLabel = toProsePositionCode(slot.position)
  const tmRoleLabel = toTMPositionCode(searchResult?.position)
  const intro = player.tmVerified
    ? translate(language, 'build.whyIdealVerifiedIntro', { player: player.playerName, slot: slotLabel, archetype: slot.archetypeLabel })
    : translate(language, 'build.whyIdealProjectedIntro', { player: player.playerName, slot: slotLabel, archetype: slot.archetypeLabel })

  const mustHaves = requirement?.mustHave
    .slice(0, 2)
    .map((trait) => lowercaseFirst(trait))
    .filter(Boolean) || []

  const roleContext = tmRoleLabel && tmRoleLabel !== slotLabel
    ? translate(language, 'build.whyIdealRoleContext', { role: tmRoleLabel })
    : ''

  const budgetLine = cap !== null && player.estimatedFee && player.estimatedFee !== 'Unknown'
    ? translate(language, 'build.whyIdealBudgetLine', { fee: player.estimatedFee, budget: formatCompactEuros(cap) })
    : ''

  const detail = mustHaves.length
    ? translate(language, 'build.whyIdealRequirementDetail', {
        manager: managerName,
        traits: joinWithAnd(mustHaves, language),
        roleContext,
        budgetLine,
      })
    : translate(language, 'build.whyIdealSelectionDetail', { roleContext, budgetLine })

  return `${intro} ${detail}`.trim()
}

function getOutputRequirement(
  manager: ManagerProfile | null,
  outputManager: ManagerProfile | null,
  requirement: PositionalRequirement | null
): PositionalRequirement | null {
  if (!manager || !outputManager || !requirement) return requirement

  const index = manager.positionalRequirements.findIndex((candidate) =>
    candidate.position === requirement.position &&
    candidate.positionCode === requirement.positionCode &&
    candidate.profileLabel === requirement.profileLabel
  )

  return index >= 0 ? outputManager.positionalRequirements[index] ?? requirement : requirement
}

function materializeCandidates(slot: ManagerXISlot, language: LanguageCode): IdealPlayer[] {
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
      whyIdeal: translate(language, 'build.shortlistedFallback', {
        archetype: slot.archetypeLabel.toLowerCase(),
        position: slot.position,
      }),
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
    transfermarktUrl: searchResult.profileUrl || buildTMPlayerProfileUrl(searchResult.id, searchResult.name),
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
  searchCache: Map<string, Promise<TMPlayerSearchResult | null>>,
  language: LanguageCode
): Promise<void> {
  for (const slot of slots) {
    const firstCandidate = materializeCandidates(slot, language)[0]
    if (!firstCandidate) continue

    try {
      await findSearchResult(firstCandidate, searchCache)
    } catch {
      // If the warmup miss fails, we still continue into the normal search path.
    }
    return
  }
}

function buildCandidateEvaluation(
  slot: ManagerXISlot,
  player: IdealPlayer,
  searchResult: TMPlayerSearchResult | null,
  manager: ManagerProfile | null,
  outputManager: ManagerProfile | null,
  managerName: string,
  cap: number | null,
  language: LanguageCode
): CandidateEvaluation {
  const enrichedPlayer = searchResult
    ? mergeSearchResult(player, searchResult)
    : {
        ...player,
        tmVerified: false,
      }

  const requirement = findBestRequirement(manager, slot)
  const outputRequirement = getOutputRequirement(manager, outputManager, requirement)
  const positionScore = scorePositionCompatibility(slot, searchResult?.position)
  const archetypeScore = scoreArchetypeAlignment(slot, searchResult?.position)
  const ageScore = scoreAgeFit(slot, enrichedPlayer.age, manager)
  const budgetScore = scoreBudgetFit(slot, playerCost(enrichedPlayer), cap)
  const verificationScore = searchResult
    ? (enrichedPlayer.tmVerified ? 6 : 2)
    : cap === null
      ? -2
      : -6
  const selectionScore = clampScore(
    (Math.max(0, Math.min(100, player.systemFitScore)) * 0.55) +
      positionScore +
      archetypeScore +
      ageScore +
      budgetScore +
      verificationScore
  )
  const scoredPlayer = {
    ...enrichedPlayer,
    whyIdeal: buildWhyIdeal(enrichedPlayer, slot, managerName, outputRequirement, searchResult, cap, language),
    systemFitScore: selectionScore,
  }

  return {
    player: scoredPlayer,
    searchResult,
    selectionCost: playerCost(scoredPlayer),
    selectionScore,
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
      candidate.selectionScore > existing.selectionScore ||
      (candidate.selectionScore === existing.selectionScore && currentCost < existingCost)
    ) {
      bestByKey.set(key, candidate)
    }
  }

  return Array.from(bestByKey.values()).sort((a, b) => {
    if (b.selectionScore !== a.selectionScore) {
      return b.selectionScore - a.selectionScore
    }
    return candidateCost(a) - candidateCost(b)
  })
}

async function enrichSlots(
  slots: ManagerXISlot[],
  manager: ManagerProfile | null,
  outputManager: ManagerProfile | null,
  managerName: string,
  cap: number | null,
  language: LanguageCode
): Promise<EnrichedSlot[]> {
  const searchCache = new Map<string, Promise<TMPlayerSearchResult | null>>()
  await warmTransfermarktSearch(slots, searchCache, language)
  const evaluatedSlots = await mapWithConcurrency(
    slots,
    TM_ENRICHMENT_CONCURRENCY,
    async (slot) => {
      const candidates = await mapWithConcurrency(
        materializeCandidates(slot, language),
        TM_ENRICHMENT_CONCURRENCY,
        async (player) =>
          buildCandidateEvaluation(
            slot,
            player,
            await findSearchResult(player, searchCache),
            manager,
            outputManager,
            managerName,
            cap,
            language
          )
      )

      return {
        slotId: slot.slotId,
        candidates: (() => {
          const deduped = dedupeCandidates(candidates)
          const verified = deduped.filter((candidate) => candidate.player.tmVerified)
          return verified.length ? verified : deduped
        })(),
      }
    }
  )

  return evaluatedSlots
}

function selectPlayersForSlots(slots: EnrichedSlot[], cap: number | null, budget: string): SelectionSummary {
  const spendFloor = getBudgetSpendFloor(budget, cap)
  const preferHigherSpend = spendFloor !== null
  let bestPreferredWithin: SelectionSummary | null = null
  let bestWithin: SelectionSummary | null = null
  let bestOver: SelectionSummary | null = null

  function isBetterWithin(candidate: SelectionSummary, current: SelectionSummary, requireHealthySpend: boolean) {
    const candidateRank = selectionRankScore(candidate.total, candidate.score, cap, budget)
    const currentRank = selectionRankScore(current.total, current.score, cap, budget)

    if (candidateRank !== currentRank) {
      return candidateRank > currentRank
    }

    if (requireHealthySpend && cap !== null) {
      const candidateGap = Math.abs(cap - candidate.total)
      const currentGap = Math.abs(cap - current.total)
      if (candidateGap !== currentGap) return candidateGap < currentGap
      return candidate.total > current.total
    }

    return candidate.total < current.total
  }

  function recordSelection(chosen: CandidateEvaluation[], total: number, score: number) {
    if (cap === null || total <= cap) {
      const candidateSummary = { chosen: [...chosen], total, score, withinBudget: true }

      if (!bestWithin || isBetterWithin(candidateSummary, bestWithin, preferHigherSpend)) {
        bestWithin = candidateSummary
      }

      if ((spendFloor === null || total >= spendFloor) && (
        !bestPreferredWithin ||
        isBetterWithin(candidateSummary, bestPreferredWithin, true)
      )) {
        bestPreferredWithin = candidateSummary
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
      dfs(index + 1, chosen, used, nextTotal, score + candidate.selectionScore)
      chosen.pop()
      used.delete(key)
    }
  }

  dfs(0, [], new Set<string>(), 0, 0)
  return bestPreferredWithin ?? bestWithin ?? bestOver ?? { chosen: [], total: 0, score: 0, withinBudget: false }
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

async function resolveCandidatePool(
  pool: ManagerXICandidatePool,
  budget: string,
  manager: ManagerProfile | null,
  outputManager: ManagerProfile | null,
  language: LanguageCode
): Promise<ManagerXIResult | null> {
  const cap = getBudgetCap(budget)
  const candidateSlots = await enrichSlots(pool.slots, manager, outputManager, pool.managerName, cap, language)
  const selection = selectPlayersForSlots(candidateSlots, cap, budget)

  if (selection.chosen.length !== pool.slots.length) {
    return null
  }

  const enrichedPlayers = selection.chosen.map((candidate) => candidate.player)
    .map((player, index) => ({
      ...player,
      displayOrder: index,
    }))
  if (enrichedPlayers.some((player) => !player.tmVerified)) {
    return null
  }

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
  managerId?: string,
  language: LanguageCode = 'en'
): Promise<ManagerXIResult> {
  const manager = managerId ? (getManagerById(managerId) || null) : null
  const outputManager = manager ? await localizeManagerProfile(manager, language).catch(() => manager) : null
  const liveManagerName = manager?.name || managerName || null
  const liveManagerSnapshot = liveManagerName
    ? await getLiveManagerSnapshot(liveManagerName, { maxMatches: 20 }).catch(() => null)
    : null
  if (!liveManagerSnapshot?.primaryFormation) {
    const resolvedName = manager?.name || managerName || 'This manager'
    throw new Error(`${LIVE_FORMATION_ERROR_PREFIX}${translate(language, 'build.liveFormationUnavailable', { manager: resolvedName })}`)
  }
  const cap = getBudgetCap(budget)
  const verificationInstructions = buildVerificationInstructions()
  const baseInstructions = cap !== null
    ? `${buildBudgetInstructions(budget, cap)} ${verificationInstructions}`
    : verificationInstructions
  const retryInstructions = cap !== null
    ? `${baseInstructions} Previous attempt either produced names that could not be verified on Transfermarkt or was still too expensive once priced against live Transfermarkt values. Return materially cheaper alternatives across multiple slots, avoid any player likely to cost above ${formatCompactEuros(Math.floor(cap * 0.18))}, and lean toward more recognizable first-team players with exact current clubs.`
    : `${baseInstructions} Previous attempt included at least one player who could not be verified on Transfermarkt. Return more mainstream active first-team players with exact current clubs and spellings that are easy to verify.`

  const instructionPasses = [baseInstructions, retryInstructions].filter((value): value is string => Boolean(value))

  if (instructionPasses.length === 0) {
    const pool = await generateManagerXICandidatePool(
      budget,
      manager,
      managerName,
      undefined,
      liveManagerSnapshot
        ? {
            preferredFormation: liveManagerSnapshot.primaryFormation,
            formationSampleSize: liveManagerSnapshot.sampleSize,
            formationSeason: liveManagerSnapshot.season,
            currentClub: liveManagerSnapshot.currentClub,
            currentStatus: liveManagerSnapshot.status,
            referenceClub: liveManagerSnapshot.referenceClub,
            recentFormations: liveManagerSnapshot.recentFormations,
          }
        : undefined,
      language
    )
    const resolved = await resolveCandidatePool(pool, budget, manager, outputManager, language)
    if (!resolved) throw new Error(translate(language, 'build.failed'))
    return resolved
  }

  let lastResolved: ManagerXIResult | null = null

  for (const instructions of instructionPasses) {
    const pool = await generateManagerXICandidatePool(
      budget,
      manager,
      managerName,
      instructions,
      liveManagerSnapshot
        ? {
            preferredFormation: liveManagerSnapshot.primaryFormation,
            formationSampleSize: liveManagerSnapshot.sampleSize,
            formationSeason: liveManagerSnapshot.season,
            currentClub: liveManagerSnapshot.currentClub,
            currentStatus: liveManagerSnapshot.status,
            referenceClub: liveManagerSnapshot.referenceClub,
            recentFormations: liveManagerSnapshot.recentFormations,
          }
        : undefined,
      language
    )
    const resolved = await resolveCandidatePool(pool, budget, manager, outputManager, language)
    if (!resolved) continue
    lastResolved = resolved
    if (resolved.budgetStatus !== 'over') return resolved
  }

  if (lastResolved) return lastResolved
  throw new Error(translate(language, 'build.failed'))
}

export async function POST(request: NextRequest) {
  let language: LanguageCode = 'en'
  try {
    const body = await request.json()
    const { budget, managerId, managerName } = body as {
      budget: string
      managerId?: string
      managerName?: string
      language?: string
    }
    language = normalizeLanguage(body.language)

    if (!budget || (!managerId && !managerName)) {
      return NextResponse.json({ error: translate(language, 'build.invalidInput') }, { status: 400 })
    }

    const result = await buildBudgetAwareManagerXI(budget, managerName, managerId, language)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Manager XI error:', error)
    if (error instanceof Error && error.message.startsWith(LIVE_FORMATION_ERROR_PREFIX)) {
      return NextResponse.json({ error: error.message.slice(LIVE_FORMATION_ERROR_PREFIX.length) }, { status: 503 })
    }
    const details = getAIErrorDetails(error, translate(language, 'build.failed'))
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

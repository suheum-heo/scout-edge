import { unstable_cache } from 'next/cache'
import { createHash } from 'node:crypto'

import type { ManagerProfile } from '@/lib/managers'
import type { LanguageCode } from '@/lib/i18n'
import type {
  LiveFormationContext,
  MinimalSquadPlayer,
  SquadAnalysisCoreResult,
  SquadAnalysisDetailsResult,
} from '@/lib/claude'
import { analyzeSquadGapsCore, analyzeSquadGapDetails } from '@/lib/claude'

export interface CachedSquadAnalysisInput {
  manager: ManagerProfile | null
  squadPlayers: (MinimalSquadPlayer | null)[]
  teamName: string
  managerName?: string
  unavailablePlayers?: { name: string; position: string }[]
  allowManagerInference: boolean
  liveFormationContext?: LiveFormationContext
  language?: LanguageCode
}

const ANALYSIS_CACHE_REVALIDATE_SECONDS = 15 * 60

function normalizeText(value?: string | null): string {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function normalizeNumber(value: unknown): number {
  return Number.isFinite(value) ? Number(value) : 0
}

function normalizeRating(value?: string | null): string {
  const numericValue = Number.parseFloat(String(value || '').trim())
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '0'
  return numericValue.toFixed(1)
}

function normalizeSquadPlayer(player: MinimalSquadPlayer | null): MinimalSquadPlayer | null {
  if (!player?.name?.trim()) return null

  return {
    name: normalizeText(player.name),
    position: normalizeText(player.position),
    age: normalizeNumber(player.age),
    nationality: normalizeText(player.nationality),
    appearances: normalizeNumber(player.appearances),
    goals: normalizeNumber(player.goals),
    assists: normalizeNumber(player.assists),
    minutes: normalizeNumber(player.minutes),
    rating: normalizeRating(player.rating),
    tackles: normalizeNumber(player.tackles),
    interceptions: normalizeNumber(player.interceptions),
  }
}

function compareSquadPlayers(left: MinimalSquadPlayer, right: MinimalSquadPlayer): number {
  return (
    left.position.localeCompare(right.position) ||
    left.name.localeCompare(right.name) ||
    left.age - right.age ||
    left.nationality.localeCompare(right.nationality)
  )
}

function normalizeLiveFormationContext(
  context?: LiveFormationContext
): LiveFormationContext | undefined {
  if (!context) return undefined

  const primaryFormation = normalizeText(context.primaryFormation)
  const recentFormations = Array.from(
    new Set((context.recentFormations || []).map((formation) => normalizeText(formation)).filter(Boolean))
  )
  const orderedRecentFormations = primaryFormation
    ? [
        primaryFormation,
        ...recentFormations.filter((formation) => formation !== primaryFormation).sort(),
      ]
    : recentFormations.sort()

  if (
    !primaryFormation &&
    !orderedRecentFormations.length &&
    !normalizeText(context.referenceClub) &&
    !normalizeNumber(context.formationSampleSize) &&
    !normalizeNumber(context.formationSeason)
  ) {
    return undefined
  }

  return {
    primaryFormation: primaryFormation || null,
    recentFormations: orderedRecentFormations,
    formationSampleSize: normalizeNumber(context.formationSampleSize),
    formationSeason: normalizeNumber(context.formationSeason) || null,
    referenceClub: normalizeText(context.referenceClub) || null,
  }
}

function normalizeUnavailablePlayers(
  players?: { name: string; position: string }[]
): { name: string; position: string }[] | undefined {
  if (!players?.length) return undefined

  return players
    .map((player) => ({
      name: normalizeText(player.name),
      position: normalizeText(player.position),
    }))
    .filter((player) => player.name)
    .sort((left, right) => left.position.localeCompare(right.position) || left.name.localeCompare(right.name))
}

export function normalizeCachedSquadAnalysisInput(
  input: CachedSquadAnalysisInput
): CachedSquadAnalysisInput {
  return {
    ...input,
    teamName: normalizeText(input.teamName),
    managerName: normalizeText(input.managerName) || undefined,
    squadPlayers: input.squadPlayers
      .map((player) => normalizeSquadPlayer(player))
      .filter((player): player is MinimalSquadPlayer => Boolean(player))
      .sort(compareSquadPlayers),
    unavailablePlayers: normalizeUnavailablePlayers(input.unavailablePlayers),
    liveFormationContext: normalizeLiveFormationContext(input.liveFormationContext),
  }
}

export function buildCachedSquadAnalysisFingerprint(input: CachedSquadAnalysisInput): string {
  const normalizedInput = normalizeCachedSquadAnalysisInput(input)
  return createHash('sha1').update(JSON.stringify(normalizedInput)).digest('hex')
}

const getCachedCoreAnalysis = unstable_cache(
  async (input: CachedSquadAnalysisInput): Promise<SquadAnalysisCoreResult> => {
    const normalizedInput = normalizeCachedSquadAnalysisInput(input)
    return analyzeSquadGapsCore(
      normalizedInput.manager,
      normalizedInput.squadPlayers,
      normalizedInput.teamName,
      normalizedInput.managerName,
      normalizedInput.unavailablePlayers,
      normalizedInput.allowManagerInference,
      normalizedInput.liveFormationContext,
      normalizedInput.language
    )
  },
  ['squad-analysis-core-v2'],
  { revalidate: ANALYSIS_CACHE_REVALIDATE_SECONDS }
)

const getCachedDetailsAnalysis = unstable_cache(
  async (
    input: CachedSquadAnalysisInput,
    coreAnalysis: SquadAnalysisCoreResult
  ): Promise<SquadAnalysisDetailsResult> => {
    const normalizedInput = normalizeCachedSquadAnalysisInput(input)
    return analyzeSquadGapDetails(
      coreAnalysis,
      normalizedInput.manager,
      normalizedInput.squadPlayers,
      normalizedInput.teamName,
      normalizedInput.managerName,
      normalizedInput.unavailablePlayers,
      normalizedInput.allowManagerInference,
      normalizedInput.liveFormationContext,
      normalizedInput.language
    )
  },
  ['squad-analysis-details-v2'],
  { revalidate: ANALYSIS_CACHE_REVALIDATE_SECONDS }
)

export async function getCachedSquadAnalysisCore(
  input: CachedSquadAnalysisInput
): Promise<SquadAnalysisCoreResult> {
  return getCachedCoreAnalysis(normalizeCachedSquadAnalysisInput(input))
}

export async function getCachedSquadAnalysisDetails(
  input: CachedSquadAnalysisInput,
  coreAnalysis: SquadAnalysisCoreResult
): Promise<SquadAnalysisDetailsResult> {
  return getCachedDetailsAnalysis(normalizeCachedSquadAnalysisInput(input), coreAnalysis)
}

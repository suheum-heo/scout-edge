import { unstable_cache } from 'next/cache'

import type { ManagerProfile } from '@/lib/managers'
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
}

const ANALYSIS_CACHE_REVALIDATE_SECONDS = 15 * 60

const getCachedCoreAnalysis = unstable_cache(
  async (input: CachedSquadAnalysisInput): Promise<SquadAnalysisCoreResult> => {
    return analyzeSquadGapsCore(
      input.manager,
      input.squadPlayers,
      input.teamName,
      input.managerName,
      input.unavailablePlayers,
      input.allowManagerInference,
      input.liveFormationContext
    )
  },
  ['squad-analysis-core-v1'],
  { revalidate: ANALYSIS_CACHE_REVALIDATE_SECONDS }
)

const getCachedDetailsAnalysis = unstable_cache(
  async (
    input: CachedSquadAnalysisInput,
    coreAnalysis: SquadAnalysisCoreResult
  ): Promise<SquadAnalysisDetailsResult> => {
    return analyzeSquadGapDetails(
      coreAnalysis,
      input.manager,
      input.squadPlayers,
      input.teamName,
      input.managerName,
      input.unavailablePlayers,
      input.allowManagerInference,
      input.liveFormationContext
    )
  },
  ['squad-analysis-details-v1'],
  { revalidate: ANALYSIS_CACHE_REVALIDATE_SECONDS }
)

export async function getCachedSquadAnalysisCore(
  input: CachedSquadAnalysisInput
): Promise<SquadAnalysisCoreResult> {
  return getCachedCoreAnalysis(input)
}

export async function getCachedSquadAnalysisDetails(
  input: CachedSquadAnalysisInput,
  coreAnalysis: SquadAnalysisCoreResult
): Promise<SquadAnalysisDetailsResult> {
  return getCachedDetailsAnalysis(input, coreAnalysis)
}

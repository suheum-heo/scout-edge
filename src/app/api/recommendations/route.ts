
import { NextRequest, NextResponse } from 'next/server'
import { normalizeLanguage } from '@/lib/i18n'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { recommendPlayersForGap, SquadGap, TransferTarget } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { searchPlayer, getPlayerData, formatMarketValue, TMPlayerSearchResult } from '@/lib/transfermarkt'
import { getOrInferProfiles, summarizeCoverage, SquadPlayer } from '@/lib/role-profiles'
import { normalizePositionDisplayName } from '@/lib/position-names'

function budgetRange(budget: string): { min: number; max: number } | null {
  if (budget === '< €20M')   return { min: 0,           max: 20_000_000 }
  if (budget === '€20–50M')  return { min: 20_000_000,  max: 50_000_000 }
  if (budget === '€50–100M') return { min: 50_000_000,  max: 100_000_000 }
  if (budget === '€100M+')   return { min: 100_000_000, max: Infinity }
  return null // Loan / Free agent — no price filter
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

function isWithinBudgetBracket(target: TransferTarget, budget: string): boolean {
  const range = budgetRange(budget)
  if (!range) return true

  const estimatedFee = parseEstimatedFee(target.estimatedFee)
  if (estimatedFee === null) return false
  if (estimatedFee < range.min) return false
  if (Number.isFinite(range.max) && estimatedFee > range.max) return false

  return true
}

const TM_SEARCH_TIMEOUT_MS = 10000
const TM_PROFILE_TIMEOUT_MS = 10000

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])
}

function normalizeTMPositionLabel(position?: string | null): string {
  if (!position?.trim()) return 'Unknown'
  return normalizePositionDisplayName(position)
}

function isUsableTMClubName(clubName?: string | null): clubName is string {
  if (!clubName) return false
  const clubLow = clubName.toLowerCase()
  return !clubLow.includes('retired') &&
    !clubLow.includes('without club') &&
    clubLow !== '-'
}

async function findSearchResult(target: TransferTarget): Promise<TMPlayerSearchResult | null> {
  const attempts = [
    { age: target.age, club: target.currentClub },
    { age: target.age },
    undefined,
  ] as const

  for (const hints of attempts) {
    const result = await withTimeout(searchPlayer(target.playerName, hints), TM_SEARCH_TIMEOUT_MS, null)
    if (result) return result
  }

  return null
}

function mergeSearchResult(target: TransferTarget, searchResult: TMPlayerSearchResult): TransferTarget {
  const searchClub = searchResult.club?.name
  return {
    ...target,
    playerName: searchResult.name || target.playerName,
    currentClub: isUsableTMClubName(searchClub) ? searchClub : target.currentClub,
    age: searchResult.age ?? target.age,
    nationality: searchResult.nationalities?.[0] || target.nationality,
    position: normalizeTMPositionLabel(searchResult.position) || target.position,
    estimatedFee: searchResult.marketValue ? formatMarketValue(searchResult.marketValue) : target.estimatedFee,
    tmVerified: isUsableTMClubName(searchClub),
  }
}

// Enrich a single target. TM search is enough to verify the club; profile fetch only improves detail.
async function enrichOne(target: TransferTarget): Promise<TransferTarget> {
  const searchResult = await findSearchResult(target)
  if (!searchResult) return target

  const verifiedFromSearch = mergeSearchResult(target, searchResult)

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
    position: normalizeTMPositionLabel(tmData.position) || verifiedFromSearch.position,
    contractUntil: tmData.contractYear,
    estimatedFee: tmData.marketValue ? formatMarketValue(tmData.marketValue) : verifiedFromSearch.estimatedFee,
    tmVerified: isUsableTMClubName(tmData.currentClub) || verifiedFromSearch.tmVerified === true,
  }
}

// Enrich Claude's transfer targets with live Transfermarkt data (parallel, per-player timeout)
async function enrichWithTM(targets: TransferTarget[]): Promise<TransferTarget[]> {
  return Promise.all(targets.map(enrichOne))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { gap, managerId, managerName, teamName, budget, squad, nationalTeamCountry } = body as {
      gap: SquadGap
      managerId?: string
      managerName?: string
      teamName: string
      budget: string
      squad?: SquadPlayer[]
      nationalTeamCountry?: string
      language?: string
    }

    if (!gap || !teamName || !budget) {
      return NextResponse.json({ error: 'gap, teamName, and budget are required' }, { status: 400 })
    }
    const language = normalizeLanguage(body.language)

    const manager = managerId ? getManagerById(managerId) : undefined
    const factualManagerName = manager?.name || managerName || null
    const liveManagerSnapshot = factualManagerName
      ? await getLiveManagerSnapshot(factualManagerName, { maxMatches: 20 }).catch(() => null)
      : null

    // Lazy role-profile inference: fetch/infer profiles for all squad players, then summarize coverage
    let roleCoverageContext: string | undefined
    if (squad?.length) {
      try {
        const profiles = await getOrInferProfiles(squad, teamName)
        roleCoverageContext = summarizeCoverage(profiles, gap.position)
        console.log(`[recommendations] Role coverage for "${gap.position}": ${roleCoverageContext}`)
      } catch (e) {
        console.error('[recommendations] Role profile inference failed (non-fatal):', e)
      }
    }

    // Claude generates names + tactical reasoning, with role coverage context injected
    const targets = await recommendPlayersForGap(
      gap,
      manager || null,
      teamName,
      budget,
      managerName,
      roleCoverageContext,
      nationalTeamCountry,
      liveManagerSnapshot
        ? {
            primaryFormation: liveManagerSnapshot.primaryFormation,
            recentFormations: liveManagerSnapshot.recentFormations,
            formationSampleSize: liveManagerSnapshot.sampleSize,
            formationSeason: liveManagerSnapshot.season,
            referenceClub: liveManagerSnapshot.referenceClub,
          }
        : undefined,
      language
    )

    // Enrich with live Transfermarkt data (current club, real market value, contract)
    const enriched = await enrichWithTM(targets)

    const teamNorm = teamName.toLowerCase()

    const filtered = enriched.filter((t) => {
      // Remove players already at this team
      const clubNorm = t.currentClub.toLowerCase()
      if (clubNorm.includes(teamNorm) || teamNorm.includes(clubNorm)) return false

      // Numeric budget brackets should be enforced by the server, not only hinted in the prompt.
      // If the live TM-enriched price lands outside the selected bracket, don't show the player.
      if (!isWithinBudgetBracket(t, budget)) return false

      return true
    })

    const sorted = [...filtered].sort((a, b) => {
      if (!!b.tmVerified !== !!a.tmVerified) return Number(!!b.tmVerified) - Number(!!a.tmVerified)
      return (b.tacticalFitScore ?? 0) - (a.tacticalFitScore ?? 0)
    })

    return NextResponse.json({ recommendations: sorted })
  } catch (error) {
    console.error('Recommendations error:', error)
    const details = getAIErrorDetails(error, 'Failed to generate recommendations')
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

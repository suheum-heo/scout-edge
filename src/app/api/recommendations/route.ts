
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { recommendPlayersForGap, SquadGap, TransferTarget } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { searchPlayer, getPlayerData, formatMarketValue, TMPlayerSearchResult } from '@/lib/transfermarkt'
import { getOrInferProfiles, summarizeCoverage, SquadPlayer } from '@/lib/role-profiles'

function budgetRange(budget: string): { min: number; max: number } | null {
  if (budget === '< €20M')   return { min: 0,           max: 20_000_000 }
  if (budget === '€20–50M')  return { min: 20_000_000,  max: 50_000_000 }
  if (budget === '€50–100M') return { min: 50_000_000,  max: 100_000_000 }
  if (budget === '€100M+')   return { min: 100_000_000, max: Infinity }
  return null // Loan / Free agent — no price filter
}

const TM_SEARCH_TIMEOUT_MS = 10000
const TM_PROFILE_TIMEOUT_MS = 10000

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])
}

function normalizeTMPositionLabel(position?: string | null): string {
  if (!position) return 'Unknown'

  const raw = position.trim()
  if (!raw) return 'Unknown'

  const p = raw.toLowerCase()
  if (p === 'gk' || p.includes('goalkeeper')) return 'Goalkeeper'
  if (p === 'cb' || p.includes('centre-back') || p.includes('center-back')) return 'Centre-Back'
  if (p === 'lb' || p.includes('left-back')) return 'Left-Back'
  if (p === 'rb' || p.includes('right-back')) return 'Right-Back'
  if (p === 'lwb' || p.includes('left wing-back')) return 'Left Wing-Back'
  if (p === 'rwb' || p.includes('right wing-back')) return 'Right Wing-Back'
  if (p === 'dm' || p.includes('defensive midfield')) return 'Defensive Midfield'
  if (p === 'cm' || p.includes('central midfield')) return 'Central Midfield'
  if (p === 'am' || p.includes('attacking midfield')) return 'Attacking Midfield'
  if (p === 'lw' || p.includes('left wing')) return 'Left Wing'
  if (p === 'rw' || p.includes('right wing')) return 'Right Wing'
  if (p === 'cf' || p === 'st' || p.includes('centre-forward') || p.includes('center-forward') || p.includes('striker')) return 'Striker'

  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
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
    }

    if (!gap || !teamName || !budget) {
      return NextResponse.json({ error: 'gap, teamName, and budget are required' }, { status: 400 })
    }

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
        : undefined
    )

    // Enrich with live Transfermarkt data (current club, real market value, contract)
    const enriched = await enrichWithTM(targets)

    const range = budgetRange(budget)
    const teamNorm = teamName.toLowerCase()

    const filtered = enriched.filter((t) => {
      // Remove players already at this team
      const clubNorm = t.currentClub.toLowerCase()
      if (clubNorm.includes(teamNorm) || teamNorm.includes(clubNorm)) return false

      // Only filter out players clearly below the minimum — Claude is already constrained by budget
      // in the prompt, so upper-bound filtering causes more false negatives than it prevents.
      // TM market values ≠ transfer fees and often overstate what a club would actually pay.
      if (range && range.min > 0) {
        const mv = parseFloat(t.estimatedFee.replace(/[^0-9.]/g, '')) * (t.estimatedFee.includes('M') ? 1_000_000 : t.estimatedFee.includes('K') ? 1_000 : 1)
        if (!isNaN(mv) && mv < range.min * 0.5) return false
      }

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

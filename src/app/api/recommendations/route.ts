
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { recommendPlayersForGap, SquadGap, TransferTarget } from '@/lib/claude'
import { searchPlayer, getPlayerData, formatMarketValue } from '@/lib/transfermarkt'
import { getOrInferProfiles, summarizeCoverage, SquadPlayer } from '@/lib/role-profiles'

function budgetRange(budget: string): { min: number; max: number } | null {
  if (budget === '< €20M')   return { min: 0,           max: 20_000_000 }
  if (budget === '€20–50M')  return { min: 20_000_000,  max: 50_000_000 }
  if (budget === '€50–100M') return { min: 50_000_000,  max: 100_000_000 }
  if (budget === '€100M+')   return { min: 100_000_000, max: Infinity }
  return null // Loan / Free agent — no price filter
}

const TM_TIMEOUT_PER_PLAYER_MS = 6000

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])
}

// Enrich a single target — has its own timeout so one slow lookup never blocks others
async function enrichOne(target: TransferTarget): Promise<TransferTarget> {
  return withTimeout(
    (async () => {
      const searchResult = await searchPlayer(target.playerName, {
        age: target.age,
        club: target.currentClub,
      })
      if (!searchResult) return target
      const tmData = await getPlayerData(searchResult.id)
      if (!tmData) return target
      // Don't overwrite with a club that indicates retirement or no-club status
      const clubLow = tmData.currentClub?.toLowerCase() ?? ''
      const isRetiredOrUnknown = !tmData.currentClub ||
        clubLow.includes('retired') || clubLow.includes('without club') || clubLow === '-'
      return {
        ...target,
        currentClub: isRetiredOrUnknown ? target.currentClub : tmData.currentClub,
        age: tmData.age ?? target.age,
        nationality: tmData.nationality || target.nationality,
        contractUntil: tmData.contractYear,
        estimatedFee: tmData.marketValue ? formatMarketValue(tmData.marketValue) : target.estimatedFee,
        tmVerified: !isRetiredOrUnknown,
      }
    })(),
    TM_TIMEOUT_PER_PLAYER_MS,
    target // fallback: keep Claude's data only for this specific player
  )
}

// Enrich Claude's transfer targets with live Transfermarkt data (parallel, per-player timeout)
async function enrichWithTM(targets: TransferTarget[]): Promise<TransferTarget[]> {
  return Promise.all(targets.map(enrichOne))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { gap, managerId, managerName, teamName, budget, squad } = body as {
      gap: SquadGap
      managerId?: string
      managerName?: string
      teamName: string
      budget: string
      squad?: SquadPlayer[]
    }

    if (!gap || !teamName || !budget) {
      return NextResponse.json({ error: 'gap, teamName, and budget are required' }, { status: 400 })
    }

    const manager = managerId ? getManagerById(managerId) : undefined

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
      roleCoverageContext
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

    return NextResponse.json({ recommendations: filtered })
  } catch (error) {
    console.error('Recommendations error:', error)
    return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 })
  }
}

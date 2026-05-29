
import { NextRequest, NextResponse } from 'next/server'
import { normalizeLanguage, translate } from '@/lib/i18n'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { recommendPlayersForGap, SquadGap, TransferTarget } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { localizeTransferTargets } from '@/lib/entity-localization'
import { enrichTMPlayerIdentity } from '@/lib/transfermarkt'
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

function normalizeTMPositionLabel(position?: string | null): string {
  if (!position?.trim()) return 'Unknown'
  return normalizePositionDisplayName(position)
}

// Enrich Claude's transfer targets with live Transfermarkt data (parallel, per-player timeout)
async function enrichWithTM(targets: TransferTarget[]): Promise<TransferTarget[]> {
  return Promise.all(targets.map(async (target) => {
    const enriched = await enrichTMPlayerIdentity({
      playerName: target.playerName,
      currentClub: target.currentClub,
      age: target.age,
      nationality: target.nationality,
      position: target.position,
      estimatedValue: target.estimatedFee,
      contractUntil: target.contractUntil,
      transfermarktUrl: target.transfermarktUrl,
    })

    return {
      ...target,
      playerName: enriched.playerName || target.playerName,
      currentClub: enriched.currentClub || target.currentClub,
      age: enriched.age ?? target.age,
      nationality: enriched.nationality || target.nationality,
      position: normalizeTMPositionLabel(enriched.position) || target.position,
      otherPositions: enriched.otherPositions?.length ? enriched.otherPositions : target.otherPositions,
      estimatedFee: enriched.estimatedValue || target.estimatedFee,
      contractUntil: enriched.contractUntil || target.contractUntil,
      tmVerified: enriched.tmVerified,
      transfermarktUrl: enriched.transfermarktUrl || target.transfermarktUrl,
    }
  }))
}

export async function POST(request: NextRequest) {
  let language = normalizeLanguage(undefined)
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

    language = normalizeLanguage(body.language)
    if (!gap || !teamName || !budget) {
      return NextResponse.json({ error: translate(language, 'error.analysisFailed') }, { status: 400 })
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

    const localized = await localizeTransferTargets(sorted, language)

    return NextResponse.json({ recommendations: localized })
  } catch (error) {
    console.error('Recommendations error:', error)
    const details = getAIErrorDetails(error, translate(language, 'error.analysisFailed'))
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

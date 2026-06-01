
import { NextRequest, NextResponse } from 'next/server'
import { normalizeLanguage, translate } from '@/lib/i18n'

export const maxDuration = 60

import { getManagerById } from '@/lib/managers'
import { recommendPlayersForGap, SquadGap, TransferTarget } from '@/lib/claude'
import { getAIErrorDetails } from '@/lib/ai-errors'
import { getLiveManagerSnapshot } from '@/lib/api-football'
import { localizeTransferTargets } from '@/lib/entity-localization'
import { enrichTMPlayerIdentity } from '@/lib/transfermarkt'
import { getOrInferProfiles, summarizeCoverage, SquadPlayer, type PlayerRoleProfile } from '@/lib/role-profiles'
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

  // Only enforce the hard bracket when TM confirmed the player's identity and
  // therefore their market value. Without TM verification we have only Claude's
  // training-data estimate — don't use that as a hard gate.
  if (!target.tmVerified) return true

  const estimatedFee = parseEstimatedFee(target.estimatedFee)
  if (estimatedFee === null) return true  // verified but no parseable price — don't hide
  if (estimatedFee < range.min) return false
  if (Number.isFinite(range.max) && estimatedFee > range.max) return false

  return true
}

function normalizeTMPositionLabel(position?: string | null): string {
  if (!position?.trim()) return 'Unknown'
  return normalizePositionDisplayName(position)
}

// Maps a TM-normalized position string to the broad positionCode categories used by SquadGap.
// Returns null when the position string is unrecognized.
function tmPositionToCode(position: string): 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Attacker' | null {
  const p = position.toLowerCase().trim()
  if (!p) return null
  if (p.includes('goalkeeper') || p === 'keeper') return 'Goalkeeper'
  if (p.includes('back') || p === 'defender') return 'Defender'
  if (p.includes('midfield') || p === 'midfielder') return 'Midfielder'
  if (p.includes('winger') || p.includes('forward') || p.includes('striker') || p === 'attacker') return 'Attacker'
  return null
}

// Hard positional eligibility check using TM-verified position data.
// Only filters when TM confirmed the player's identity (tmVerified = true).
// Claude is allowed to explain WHY a matched player fits, but this decides WHETHER they qualify.
function isPositionallyEligible(target: TransferTarget, gapPositionCode: string, gapPosition: string): boolean {
  if (!target.tmVerified) return true // no TM data to verify against — pass through

  const allPositions = [target.position, ...(target.otherPositions ?? [])]

  // Wing-backs sit on the Defender/Midfielder boundary; TM classifies them inconsistently
  // (e.g. Dumfries = "Right Midfielder", Castagne = "Right Back"). Accept both codes.
  const isWingBackGap = /wing.?back/i.test(gapPosition)

  const eligible = allPositions.some((p) => {
    const code = tmPositionToCode(p)
    if (code === gapPositionCode) return true
    if (isWingBackGap && code === 'Midfielder') return true
    return false
  })

  if (!eligible) {
    console.warn(
      `[recommendations] Positional mismatch filtered: ${target.playerName} ` +
      `(TM: ${allPositions.join(', ')}) vs gap "${gapPositionCode}" (${gapPosition})`
    )
  }

  return eligible
}

// Build a form note string from real TM season stats, if available.
// Returns null when TM has no current-season data for this player.
function buildTMFormNote(target: TransferTarget): string | null {
  const apps = target.currentSeasonApps
  if (!apps || apps < 1) return null

  const g = target.currentSeasonGoals ?? 0
  const a = target.currentSeasonAssists ?? 0

  const base = g === 0 && a === 0
    ? `${apps} apps this season`
    : `${g}G ${a}A in ${apps} apps this season`

  const prevApps = target.prevSeasonApps
  if (prevApps && prevApps >= 5 && apps >= 5) {
    const prevG = target.prevSeasonGoals ?? 0
    const prevA = target.prevSeasonAssists ?? 0
    const currRate = (g + a) / apps
    const prevRate = (prevG + prevA) / prevApps
    const diff = currRate - prevRate
    if (diff > 0.15) return `${base}; ↑ from ${prevG}G ${prevA}A in ${prevApps} last season`
    if (diff < -0.15) return `${base}; ↓ from ${prevG}G ${prevA}A in ${prevApps} last season`
  }

  return base
}

// Enrich all targets in parallel — Promise.all so slow players don't block fast ones
async function enrichWithTM(targets: TransferTarget[]): Promise<TransferTarget[]> {
  return Promise.all(targets.map(async (target) => {
    const tPlayer = Date.now()
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
    console.log(
      `[recommendations] TM ${target.playerName}: ${Date.now() - tPlayer}ms` +
      ` verified=${enriched.tmVerified} apps=${enriched.currentSeasonApps ?? '-'}`
    )

    return {
      ...target,
      playerName: enriched.tmIdentityConfirmed ? (enriched.playerName || target.playerName) : target.playerName,
      currentClub: enriched.tmVerified ? (enriched.currentClub || target.currentClub) : target.currentClub,
      age: enriched.tmIdentityConfirmed ? (enriched.age ?? target.age) : target.age,
      nationality: enriched.tmIdentityConfirmed ? (enriched.nationality || target.nationality) : target.nationality,
      position: enriched.tmIdentityConfirmed ? (normalizeTMPositionLabel(enriched.position) || target.position) : target.position,
      otherPositions: enriched.tmIdentityConfirmed && enriched.otherPositions?.length ? enriched.otherPositions : target.otherPositions,
      estimatedFee:
        enriched.tmIdentityConfirmed && enriched.estimatedValue && enriched.estimatedValue !== 'Unknown'
          ? enriched.estimatedValue
          : target.estimatedFee,
      contractUntil: enriched.tmVerified ? (enriched.contractUntil || target.contractUntil) : target.contractUntil,
      tmVerified: enriched.tmVerified,
      tmIdentityConfirmed: enriched.tmIdentityConfirmed,
      transfermarktUrl: enriched.transfermarktUrl || target.transfermarktUrl,
      currentSeasonApps: enriched.tmIdentityConfirmed ? enriched.currentSeasonApps : target.currentSeasonApps,
      currentSeasonGoals: enriched.tmIdentityConfirmed ? enriched.currentSeasonGoals : target.currentSeasonGoals,
      currentSeasonAssists: enriched.tmIdentityConfirmed ? enriched.currentSeasonAssists : target.currentSeasonAssists,
      prevSeasonApps: enriched.tmIdentityConfirmed ? enriched.prevSeasonApps : target.prevSeasonApps,
      prevSeasonGoals: enriched.tmIdentityConfirmed ? enriched.prevSeasonGoals : target.prevSeasonGoals,
      prevSeasonAssists: enriched.tmIdentityConfirmed ? enriched.prevSeasonAssists : target.prevSeasonAssists,
    }
  }))
}

export async function POST(request: NextRequest) {
  const t0 = Date.now()
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

    console.log(`[recommendations] START team="${teamName}" gap="${gap.position}" budget="${budget}"`)

    const manager = managerId ? getManagerById(managerId) : undefined
    const factualManagerName = manager?.name || managerName || null

    // Run snapshot and role-profile inference in parallel — neither depends on the other
    const tPre = Date.now()
    const [liveManagerSnapshot, profiles] = await Promise.all([
      factualManagerName
        ? Promise.race([
            // maxMatches:5 = 1 fixture list + 5 lineup calls vs 20 before (was the main bottleneck)
            getLiveManagerSnapshot(factualManagerName, { maxMatches: 5 }).catch(() => null),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
          ])
        : Promise.resolve(null),
      squad?.length
        ? Promise.race([
            getOrInferProfiles(squad, teamName).catch((): PlayerRoleProfile[] => []),
            new Promise<PlayerRoleProfile[]>((resolve) => setTimeout(() => resolve([]), 8000)),
          ])
        : Promise.resolve([] as PlayerRoleProfile[]),
    ])
    console.log(`[recommendations] pre-flight (snapshot+profiles parallel): ${Date.now() - tPre}ms`)

    let roleCoverageContext: string | undefined
    if (profiles.length) {
      try {
        roleCoverageContext = summarizeCoverage(profiles, gap.position)
        console.log(`[recommendations] coverage: ${roleCoverageContext}`)
      } catch (e) {
        console.error('[recommendations] Role profile summarize failed (non-fatal):', e)
      }
    }

    const teamNorm = teamName.toLowerCase()
    const liveFormationPayload = liveManagerSnapshot
      ? {
          primaryFormation: liveManagerSnapshot.primaryFormation,
          recentFormations: liveManagerSnapshot.recentFormations,
          formationSampleSize: liveManagerSnapshot.sampleSize,
          formationSeason: liveManagerSnapshot.season,
          referenceClub: liveManagerSnapshot.referenceClub,
        }
      : undefined

    const recommendationAttempts = [
      undefined,
      `Previous attempt produced no valid live Transfermarkt matches in the ${budget} bracket. Return 4 to 6 DIFFERENT players whose current live Transfermarkt values sit comfortably inside ${budget}, whose current clubs are easy to verify, and whose main or common role clearly fits ${gap.position}. Avoid borderline prices, ambiguous club situations, and obscure names that may fail identity verification.`,
    ] as const

    let filtered: TransferTarget[] = []
    let attemptNum = 0

    for (const extraPromptInstructions of recommendationAttempts) {
      attemptNum++
      // Claude generates names + tactical reasoning, with role coverage context injected
      const tClaude = Date.now()
      const targets = await recommendPlayersForGap(
        gap,
        manager || null,
        teamName,
        budget,
        managerName,
        roleCoverageContext,
        nationalTeamCountry,
        liveFormationPayload,
        language,
        extraPromptInstructions
      )
      console.log(`[recommendations] attempt ${attemptNum} Claude: ${Date.now() - tClaude}ms → ${targets.length} candidates`)

      // Enrich with live Transfermarkt data — all players run in parallel
      const tTM = Date.now()
      const enriched = await enrichWithTM(targets)
      console.log(`[recommendations] attempt ${attemptNum} TM enrichment (${targets.length} players parallel): ${Date.now() - tTM}ms`)

      // Replace Claude's training-data form note with real TM season stats where available.
      // Falls back to Claude's note when TM has no current-season appearances.
      const enrichedWithForm = enriched.map((t) => {
        const tmNote = buildTMFormNote(t)
        if (!tmNote) return t
        return { ...t, recentFormNote: tmNote, recentFormSource: 'tm' as const }
      })

      filtered = enrichedWithForm.filter((t) => {
        // If TM could not confidently confirm the player identity, do not show the target.
        // This avoids mixing a hallucinated candidate with another real player's age/value.
        if (t.tmIdentityConfirmed === false) return false

        // Remove players already at this team
        const clubNorm = t.currentClub.toLowerCase()
        if (clubNorm.includes(teamNorm) || teamNorm.includes(clubNorm)) return false

        // Hard positional pre-filter: TM-verified position must map to the gap's role code.
        // Prevents hallucinated positional transitions (e.g. a CB recommended for a CM gap).
        if (!isPositionallyEligible(t, gap.positionCode, gap.position)) return false

        // Numeric budget brackets should be enforced by the server, not only hinted in the prompt.
        // If the live TM-enriched price lands outside the selected bracket, don't show the player.
        if (!isWithinBudgetBracket(t, budget)) return false

        return true
      })

      if (filtered.length > 0) {
        break
      }
    }

    const sorted = [...filtered].sort((a, b) => {
      if (!!b.tmVerified !== !!a.tmVerified) return Number(!!b.tmVerified) - Number(!!a.tmVerified)
      return (b.tacticalFitScore ?? 0) - (a.tacticalFitScore ?? 0)
    })

    let localized = sorted
    try {
      const tL10n = Date.now()
      localized = await localizeTransferTargets(sorted, language)
      console.log(`[recommendations] localization: ${Date.now() - tL10n}ms`)
    } catch (error) {
      console.warn('[recommendations] localization failed, falling back to canonical targets:', error)
    }

    console.log(`[recommendations] DONE total=${Date.now() - t0}ms results=${localized.length}`)
    return NextResponse.json({ recommendations: localized })
  } catch (error) {
    console.error('Recommendations error:', error)
    const details = getAIErrorDetails(error, translate(language, 'error.analysisFailed'))
    return NextResponse.json({ error: details.error }, { status: details.status })
  }
}

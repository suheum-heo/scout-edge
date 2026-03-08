import { NextRequest, NextResponse } from 'next/server'
import { getManagerById } from '@/lib/managers'
import { recommendPlayersForGap, SquadGap, TransferTarget } from '@/lib/claude'
import { searchPlayer, getPlayerData, formatMarketValue } from '@/lib/transfermarkt'

function budgetRange(budget: string): { min: number; max: number } | null {
  if (budget === '< €20M')   return { min: 0,           max: 20_000_000 }
  if (budget === '€20–50M')  return { min: 20_000_000,  max: 50_000_000 }
  if (budget === '€50–100M') return { min: 50_000_000,  max: 100_000_000 }
  if (budget === '€100M+')   return { min: 100_000_000, max: Infinity }
  return null // Loan / Free agent — no price filter
}

const TM_TIMEOUT_MS = 4000

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))])
}

// Enrich Claude's transfer targets with live Transfermarkt data
async function enrichWithTM(targets: TransferTarget[]): Promise<TransferTarget[]> {
  return withTimeout(
    Promise.all(
      targets.map(async (target) => {
        try {
          const searchResult = await searchPlayer(target.playerName)
          if (!searchResult) return target
          const tmData = await getPlayerData(searchResult.id)
          if (!tmData) return target
          return {
            ...target,
            currentClub: tmData.currentClub,
            age: tmData.age ?? target.age,
            nationality: tmData.nationality || target.nationality,
            contractUntil: tmData.contractYear,
            estimatedFee: tmData.marketValue ? formatMarketValue(tmData.marketValue) : target.estimatedFee,
          }
        } catch {
          return target
        }
      })
    ),
    TM_TIMEOUT_MS,
    targets // fallback: return Claude's data as-is if TM is too slow
  )
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { gap, managerId, managerName, teamName, budget } = body as {
      gap: SquadGap
      managerId?: string
      managerName?: string
      teamName: string
      budget: string
    }

    if (!gap || !teamName || !budget) {
      return NextResponse.json({ error: 'gap, teamName, and budget are required' }, { status: 400 })
    }

    const manager = managerId ? getManagerById(managerId) : undefined

    // Claude generates names + tactical reasoning
    const targets = await recommendPlayersForGap(
      gap,
      manager || null,
      teamName,
      budget,
      managerName
    )

    // Enrich with live Transfermarkt data (current club, real market value, contract)
    const enriched = await enrichWithTM(targets)

    const range = budgetRange(budget)
    const teamNorm = teamName.toLowerCase()

    const filtered = enriched.filter((t) => {
      // Remove players already at this team
      const clubNorm = t.currentClub.toLowerCase()
      if (clubNorm.includes(teamNorm) || teamNorm.includes(clubNorm)) return false

      // Remove players whose real market value is outside the selected budget range
      if (range) {
        const mv = parseFloat(t.estimatedFee.replace(/[^0-9.]/g, '')) * (t.estimatedFee.includes('M') ? 1_000_000 : t.estimatedFee.includes('K') ? 1_000 : 1)
        if (!isNaN(mv) && (mv < range.min || mv > range.max)) return false
      }

      return true
    })

    return NextResponse.json({ recommendations: filtered })
  } catch (error) {
    console.error('Recommendations error:', error)
    return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 })
  }
}

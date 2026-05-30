import { getDb } from '@/lib/db'

const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000

export interface PlayerFormRow {
  fotmob_id: number
  player_name: string
  player_name_normalized: string
  fetched_at: string
  match_count: number
  matches: Array<{
    date: string
    opponent: string
    rating: number | null
    goals: number
    assists: number
    minutes: number
    position: string
  }>
  form_label: 'Improving' | 'Declining' | 'Consistent' | null
  form_summary: string | null
}

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Batch lookup: given an array of player names, returns a map of
 * name → PlayerFormRow for rows that exist and are fresh (< 24h).
 * Falls back gracefully — returns empty map on DB errors or if DATABASE_URL is unset.
 */
export async function lookupPlayerForm(
  playerNames: string[]
): Promise<Map<string, PlayerFormRow>> {
  if (!process.env.DATABASE_URL || playerNames.length === 0) {
    return new Map()
  }

  try {
    const sql = getDb()
    const freshCutoff = new Date(Date.now() - FRESH_WINDOW_MS).toISOString()

    const rows = await sql`
      SELECT *
      FROM player_form
      WHERE fetched_at >= ${freshCutoff}
    ` as PlayerFormRow[]

    const byNorm = new Map<string, PlayerFormRow>()
    for (const row of rows) {
      byNorm.set(row.player_name_normalized, row)
    }

    const result = new Map<string, PlayerFormRow>()
    for (const name of playerNames) {
      const norm = normalizeName(name)
      const row = byNorm.get(norm)
      if (row) result.set(name, row)
    }

    return result
  } catch (err) {
    console.warn('[player-form-db] Lookup error (non-fatal):', err)
    return new Map()
  }
}

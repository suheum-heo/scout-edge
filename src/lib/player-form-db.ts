/**
 * Read-only Supabase client for the player_form table.
 * Used by the recommendations route to check for real FotMob form data
 * before falling back to Claude's generated recentFormNote.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? ''

// Max age before a row is considered stale and we fall back to Claude
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

function isFresh(fetchedAt: string): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < FRESH_WINDOW_MS
}

/**
 * Batch lookup: given an array of player names, returns a map of
 * name → PlayerFormRow for rows that exist and are fresh (< 24h).
 * Falls back gracefully — returns empty map on Supabase errors.
 */
export async function lookupPlayerForm(
  playerNames: string[]
): Promise<Map<string, PlayerFormRow>> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || playerNames.length === 0) {
    return new Map()
  }

  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const freshCutoff = new Date(Date.now() - FRESH_WINDOW_MS).toISOString()

    const { data, error } = await client
      .from('player_form')
      .select('*')
      .gte('fetched_at', freshCutoff)

    if (error || !data) {
      console.warn('[player-form-db] Supabase query failed:', error?.message)
      return new Map()
    }

    // Build a lookup keyed by normalized name from the DB rows
    const byNorm = new Map<string, PlayerFormRow>()
    for (const row of data as PlayerFormRow[]) {
      if (isFresh(row.fetched_at)) {
        byNorm.set(row.player_name_normalized, row)
      }
    }

    // Match against requested names
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

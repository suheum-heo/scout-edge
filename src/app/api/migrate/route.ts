/**
 * One-time DB migration endpoint.
 * Hit GET /api/migrate once after setting DATABASE_URL to create the schema.
 * Protected by a secret token to prevent accidental re-runs in production.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (token !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sql = getDb()
  await sql`
    CREATE TABLE IF NOT EXISTS player_role_profiles (
      player_id           TEXT PRIMARY KEY,
      player_name         TEXT NOT NULL,
      team_name           TEXT NOT NULL,
      primary_position    TEXT NOT NULL,
      secondary_roles     JSONB NOT NULL DEFAULT '[]',
      coverage_confidence REAL NOT NULL DEFAULT 0.8,
      last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source              TEXT NOT NULL DEFAULT 'llm_inference'
    )
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_role_profiles_team
    ON player_role_profiles (team_name)
  `

  return NextResponse.json({ ok: true, message: 'player_role_profiles table ready' })
}

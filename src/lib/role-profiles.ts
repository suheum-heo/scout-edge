import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './db'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Types ────────────────────────────────────────────────────────────────────

export type CoverageType = 'natural' | 'regular_alternative' | 'emergency' | 'development'

export interface SecondaryRole {
  role: string          // e.g. "LB", "CM", "Left Winger"
  coverageType: CoverageType
}

export interface PlayerRoleProfile {
  playerId: string
  playerName: string
  teamName: string
  primaryPosition: string
  secondaryRoles: SecondaryRole[]
  coverageConfidence: number  // 0-1: how confident the inference is
  lastUpdated: Date
  source: 'llm_inference' | 'manual_review'
}

// Minimal squad player shape (what we pass around between routes)
export interface SquadPlayer {
  playerId: string
  name: string
  position: string
  age: number
  nationality: string
}

// ── DB operations ─────────────────────────────────────────────────────────────

export async function getProfiles(playerIds: string[]): Promise<PlayerRoleProfile[]> {
  if (!playerIds.length) return []
  const sql = getDb()
  const rows = await sql`
    SELECT player_id, player_name, team_name, primary_position,
           secondary_roles, coverage_confidence, last_updated, source
    FROM player_role_profiles
    WHERE player_id = ANY(${playerIds})
  `
  return rows.map(rowToProfile)
}

export async function saveProfiles(profiles: PlayerRoleProfile[]): Promise<void> {
  if (!profiles.length) return
  const sql = getDb()
  for (const p of profiles) {
    await sql`
      INSERT INTO player_role_profiles
        (player_id, player_name, team_name, primary_position, secondary_roles,
         coverage_confidence, last_updated, source)
      VALUES
        (${p.playerId}, ${p.playerName}, ${p.teamName}, ${p.primaryPosition},
         ${JSON.stringify(p.secondaryRoles)}, ${p.coverageConfidence},
         NOW(), ${p.source})
      ON CONFLICT (player_id) DO UPDATE SET
        player_name        = EXCLUDED.player_name,
        team_name          = EXCLUDED.team_name,
        primary_position   = EXCLUDED.primary_position,
        secondary_roles    = EXCLUDED.secondary_roles,
        coverage_confidence = EXCLUDED.coverage_confidence,
        last_updated       = NOW(),
        source             = EXCLUDED.source
    `
  }
}

function rowToProfile(row: Record<string, unknown>): PlayerRoleProfile {
  return {
    playerId: row.player_id as string,
    playerName: row.player_name as string,
    teamName: row.team_name as string,
    primaryPosition: row.primary_position as string,
    secondaryRoles: (typeof row.secondary_roles === 'string'
      ? JSON.parse(row.secondary_roles)
      : row.secondary_roles) as SecondaryRole[],
    coverageConfidence: row.coverage_confidence as number,
    lastUpdated: new Date(row.last_updated as string),
    source: row.source as PlayerRoleProfile['source'],
  }
}

// ── Claude batch inference ────────────────────────────────────────────────────

export async function inferProfiles(
  players: SquadPlayer[],
  teamName: string
): Promise<PlayerRoleProfile[]> {
  if (!players.length) return []

  const playerList = players
    .map((p) => `- ID:${p.playerId} | ${p.name} (registered: ${p.position}, Age ${p.age}, ${p.nationality})`)
    .join('\n')

  const prompt = `You are a football tactical analyst with deep knowledge of modern player roles and versatility.

For each player below at ${teamName}, identify their primary tactical position and any meaningful secondary roles they can credibly cover.

Players:
${playerList}

Coverage types:
- "natural": Their actual best position (may differ from registered position)
- "regular_alternative": Plays here regularly, not just in emergencies
- "emergency": Can cover if needed but not their strength
- "development": Young player being developed into this role

Rules:
- A CB who regularly plays LB/RB should have that as "regular_alternative"
- An inverted winger who's really an attacking midfielder: make that "natural"
- Don't add "emergency" roles for every position — only genuine tactical versatility
- For youth players (U21), use "development" where applicable
- If a player truly has no meaningful secondary role, leave secondaryRoles as []
- Confidence: 0.9 for well-known players, 0.7 for moderately known, 0.5 for lesser-known

Return a JSON array, one object per player, in the exact same order as the input:
[
  {
    "playerId": "ID from the input",
    "playerName": "Exact name from input",
    "primaryPosition": "Their real tactical position",
    "secondaryRoles": [
      { "role": "Position name", "coverageType": "natural|regular_alternative|emergency|development" }
    ],
    "confidence": 0.9
  }
]

No other text.`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text : ''
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start === -1 || end === -1) return []

    const raw = JSON.parse(text.slice(start, end + 1)) as {
      playerId: string
      playerName: string
      primaryPosition: string
      secondaryRoles: SecondaryRole[]
      confidence: number
    }[]

    return raw.map((r) => ({
      playerId: r.playerId,
      playerName: r.playerName,
      teamName,
      primaryPosition: r.primaryPosition,
      secondaryRoles: r.secondaryRoles || [],
      coverageConfidence: r.confidence ?? 0.7,
      lastUpdated: new Date(),
      source: 'llm_inference' as const,
    }))
  } catch (e) {
    console.error('[role-profiles] Inference failed:', e)
    return []
  }
}

// ── Orchestrator: check cache → infer missing → save → return all ─────────────

export async function getOrInferProfiles(
  players: SquadPlayer[],
  teamName: string
): Promise<PlayerRoleProfile[]> {
  const ids = players.map((p) => p.playerId)
  const cached = await getProfiles(ids)
  const cachedIds = new Set(cached.map((p) => p.playerId))

  const missing = players.filter((p) => !cachedIds.has(p.playerId))

  if (!missing.length) return cached

  console.log(`[role-profiles] Inferring ${missing.length} uncached profiles for ${teamName}`)
  const inferred = await inferProfiles(missing, teamName)
  await saveProfiles(inferred)

  return [...cached, ...inferred]
}

// ── Summarise coverage for a given position (used in recommendations context) ──

export function summarizeCoverage(
  profiles: PlayerRoleProfile[],
  targetPosition: string
): string {
  const target = targetPosition.toLowerCase()

  const natural = profiles.filter(
    (p) =>
      p.primaryPosition.toLowerCase().includes(target) ||
      p.secondaryRoles.some(
        (r) => r.coverageType === 'natural' && r.role.toLowerCase().includes(target)
      )
  )

  const regular = profiles.filter(
    (p) =>
      !natural.find((n) => n.playerId === p.playerId) &&
      p.secondaryRoles.some(
        (r) => r.coverageType === 'regular_alternative' && r.role.toLowerCase().includes(target)
      )
  )

  const emergency = profiles.filter(
    (p) =>
      !natural.find((n) => n.playerId === p.playerId) &&
      !regular.find((r) => r.playerId === p.playerId) &&
      p.secondaryRoles.some(
        (r) => r.coverageType === 'emergency' && r.role.toLowerCase().includes(target)
      )
  )

  const parts: string[] = []
  if (natural.length) parts.push(`Natural cover: ${natural.map((p) => p.playerName).join(', ')}`)
  if (regular.length) parts.push(`Regular alternative: ${regular.map((p) => p.playerName).join(', ')}`)
  if (emergency.length) parts.push(`Emergency only: ${emergency.map((p) => p.playerName).join(', ')}`)
  if (!parts.length) parts.push('No coverage identified in squad')

  return parts.join(' | ')
}

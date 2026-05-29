import { NextResponse } from 'next/server'
import axios from 'axios'

// Temporary debug route — map what FotMob endpoints are still alive and
// whether any return per-match player data. Remove after investigation.

const client = axios.create({
  baseURL: 'https://www.fotmob.com/api',
  timeout: 10_000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.fotmob.com/',
    'Origin': 'https://www.fotmob.com',
  },
})

async function probe(path: string, params?: Record<string, unknown>) {
  try {
    const res = await client.get(path, { params })
    return { status: res.status, ok: true, data: res.data }
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status: number }; message: string }
    return { status: axiosErr.response?.status ?? 0, ok: false, error: axiosErr.message }
  }
}

function deepArrayScan(obj: unknown, path = '', depth = 0): Record<string, { length: number; sampleKeys: string[] }> {
  const out: Record<string, { length: number; sampleKeys: string[] }> = {}
  if (depth > 4 || !obj || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k
    if (Array.isArray(v) && v.length > 0) {
      const sample = v[0]
      out[p] = { length: v.length, sampleKeys: sample && typeof sample === 'object' ? Object.keys(sample as object) : [] }
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, deepArrayScan(v, p, depth + 1))
    }
  }
  return out
}

// Arsenal fotmobId = 9825 (from teams-db.ts)
const ARSENAL_FM_ID = 9825

export async function GET() {
  const results: Record<string, unknown> = {}

  // Step 1: fetch a real squad to get live player IDs
  const squadRes = await probe('/teams', {
    id: ARSENAL_FM_ID,
    tab: 'squad',
    type: 'players',
    timeZone: 'UTC',
  })
  results.squadEndpoint = { status: squadRes.status, ok: squadRes.ok }

  let playerIds: number[] = []
  if (squadRes.ok) {
    // Extract player IDs from the squad response
    const raw = squadRes.data
    const members: unknown[] = []

    // Try multiple known squad shapes
    const roles = raw?.squad?.members || raw?.members || []
    if (Array.isArray(roles)) {
      members.push(...roles)
    } else if (raw?.squad) {
      for (const group of Object.values(raw.squad as Record<string, unknown>)) {
        if (Array.isArray(group)) {
          for (const item of group) {
            const arr = (item as Record<string, unknown>)?.members
            if (Array.isArray(arr)) members.push(...arr)
          }
        }
      }
    }

    playerIds = members
      .map((m) => Number((m as Record<string, unknown>)?.id))
      .filter((id) => id > 0)
      .slice(0, 3) // just take the first 3 real IDs

    results.extractedPlayerIds = playerIds
    results.squadTopLevelKeys = Object.keys(raw ?? {})
    results.squadDeepArrays = deepArrayScan(raw)
  }

  if (playerIds.length === 0) {
    // Fallback: try some known historical FotMob player IDs
    playerIds = [961995, 866141, 744382] // Saka, Ødegaard, Rice
  }

  const testId = playerIds[0]

  // Step 2: probe all plausible player data endpoint paths
  const [
    playerData,
    playerDetails,
    playerProfile,
    playerStats,
    playerV2,
    playerMatches,
  ] = await Promise.all([
    probe('/playerData', { id: testId }),
    probe('/playerDetails', { id: testId }),
    probe('/playerProfile', { id: testId }),
    probe('/playerStats', { id: testId }),
    probe('/v2/playerData', { id: testId }),
    probe('/playerMatches', { id: testId }),
  ])

  results.endpointProbes = {
    '/playerData':    { status: playerData.status,    ok: playerData.ok },
    '/playerDetails': { status: playerDetails.status, ok: playerDetails.ok },
    '/playerProfile': { status: playerProfile.status, ok: playerProfile.ok },
    '/playerStats':   { status: playerStats.status,   ok: playerStats.ok },
    '/v2/playerData': { status: playerV2.status,       ok: playerV2.ok },
    '/playerMatches': { status: playerMatches.status,  ok: playerMatches.ok },
  }

  // Step 3: for whichever endpoints returned 200, deep-scan for match-level arrays
  const working = [
    { path: '/playerData',    res: playerData },
    { path: '/playerDetails', res: playerDetails },
    { path: '/playerProfile', res: playerProfile },
    { path: '/playerStats',   res: playerStats },
    { path: '/v2/playerData', res: playerV2 },
    { path: '/playerMatches', res: playerMatches },
  ].filter((e) => e.res.ok)

  results.workingEndpoints = working.map(({ path, res }) => {
    const data = res.data
    const arrays = deepArrayScan(data)
    const matchKeywords = ['match', 'game', 'fixture', 'recent', 'history', 'form', 'event', 'performance']
    const matchCandidates = Object.fromEntries(
      Object.entries(arrays).filter(([k]) => matchKeywords.some((kw) => k.toLowerCase().includes(kw)))
    )
    return {
      path,
      topLevelKeys: Object.keys(data ?? {}),
      allArrays: arrays,
      matchLevelCandidates: matchCandidates,
      rawSlices: {
        recentMatches: data?.recentMatches ?? null,
        recentResults: data?.recentResults ?? null,
        matches: Array.isArray(data?.matches) ? data.matches.slice(0, 2) : null,
        career: Array.isArray(data?.career) ? data.career.slice(0, 1) : null,
        statHistory: data?.statHistory ?? data?.playerStatHistory ?? null,
      },
    }
  })

  // Step 4: also inspect the squad response itself — does it embed per-player recent matches?
  if (squadRes.ok) {
    const squadArrays = deepArrayScan(squadRes.data)
    const matchCandidatesInSquad = Object.fromEntries(
      Object.entries(squadArrays).filter(([k]) =>
        ['match', 'game', 'fixture', 'recent', 'form'].some((kw) => k.toLowerCase().includes(kw))
      )
    )
    results.squadMatchCandidates = matchCandidatesInSquad
  }

  return NextResponse.json(results)
}

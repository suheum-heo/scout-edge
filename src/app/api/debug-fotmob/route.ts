import { NextResponse } from 'next/server'
import axios from 'axios'

// Temporary debug route — inspect raw FotMob /playerData payload.
// Remove after confirming what match-level fields are available.

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

// Haaland = 839956, Pedri = 903035, Bellingham = 1229496
const DEFAULT_PLAYER_ID = 839956

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const playerId = Number(searchParams.get('id') ?? DEFAULT_PLAYER_ID)

  try {
    const res = await client.get('/playerData', { params: { id: playerId } })
    const data = res.data

    // Walk the top-level keys to understand the shape
    const topLevelKeys = Object.keys(data ?? {})

    // Identify any arrays — match history would be an array of objects
    const arrayFields: Record<string, { length: number; sampleKeys: string[] }> = {}
    for (const key of topLevelKeys) {
      if (Array.isArray(data[key])) {
        const sample = data[key][0]
        arrayFields[key] = {
          length: data[key].length,
          sampleKeys: sample && typeof sample === 'object' ? Object.keys(sample) : [],
        }
      }
    }

    // Look for anything that smells like match-level data
    const matchLevelCandidates: Record<string, unknown> = {}
    const matchKeywords = ['match', 'game', 'fixture', 'recent', 'history', 'form', 'last', 'previous']
    for (const key of topLevelKeys) {
      if (matchKeywords.some((kw) => key.toLowerCase().includes(kw))) {
        matchLevelCandidates[key] = data[key]
      }
    }

    // Deep-scan nested objects for arrays that might be match data
    function findDeepArrays(
      obj: unknown,
      path: string,
      depth: number,
      results: Record<string, { length: number; sampleKeys: string[] }>
    ) {
      if (depth > 3 || !obj || typeof obj !== 'object') return
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const fullPath = path ? `${path}.${k}` : k
        if (Array.isArray(v) && v.length > 0) {
          const sample = v[0]
          results[fullPath] = {
            length: v.length,
            sampleKeys: sample && typeof sample === 'object' ? Object.keys(sample as object) : [],
          }
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
          findDeepArrays(v, fullPath, depth + 1, results)
        }
      }
    }

    const allDeepArrays: Record<string, { length: number; sampleKeys: string[] }> = {}
    findDeepArrays(data, '', 0, allDeepArrays)

    return NextResponse.json({
      playerId,
      topLevelKeys,
      arrayFields,
      matchLevelCandidates,
      allDeepArrays,
      // Include raw slices of interesting fields for manual inspection
      rawSlices: {
        recentMatches: data?.recentMatches ?? null,
        career: Array.isArray(data?.career) ? data.career.slice(0, 2) : (data?.career ?? null),
        statData: data?.statData ?? null,
        playerStatHistory: data?.playerStatHistory ?? null,
        mainLeagueStatsItems: data?.mainLeague?.stats?.items?.slice(0, 5) ?? null,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: String(err), playerId },
      { status: 500 }
    )
  }
}

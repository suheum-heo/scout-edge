import { NextResponse } from 'next/server'

export const maxDuration = 10

export async function GET() {
  const url = process.env.TRANSFERMARKT_API_URL
  if (!url) return NextResponse.json({ ok: true })

  try {
    await fetch(`${url}/players/search/messi`, { signal: AbortSignal.timeout(8000) })
  } catch {
    // silently fail — this is best-effort
  }

  return NextResponse.json({ ok: true })
}

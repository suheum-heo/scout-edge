import { NextResponse } from 'next/server'

export const maxDuration = 10

export async function GET() {
  const url = process.env.TRANSFERMARKT_API_URL
  if (!url) return NextResponse.json({ ok: true })

  // Fire-and-forget: initiate the wake-up but respond immediately so the
  // frontend can call this without blocking the user.
  fetch(`${url}/players/search/messi`).catch(() => {})

  return NextResponse.json({ ok: true })
}

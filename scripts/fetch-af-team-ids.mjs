/**
 * One-time script to fetch correct API Football team IDs and logos
 * for all non-FD leagues (Turkish, MLS, K League, J1, Belgian).
 *
 * Usage: node scripts/fetch-af-team-ids.mjs
 *
 * Costs 5 API calls. Run once when the daily limit resets.
 * Prints the correct teams-db.ts entries to stdout — copy-paste into the file.
 */

import { readFileSync } from 'fs'
import https from 'https'

// Load API key from .env.local
const env = readFileSync('.env.local', 'utf8')
const apiKey = env.match(/API_FOOTBALL_KEY=(.+)/)?.[1]?.trim()
if (!apiKey) { console.error('API_FOOTBALL_KEY not found in .env.local'); process.exit(1) }

const LEAGUES = [
  { id: 203, season: 2024, label: 'Turkish Süper Lig',   country: 'Türkiye' },
  { id: 253, season: 2024, label: 'MLS',                  country: 'USA' },
  { id: 292, season: 2024, label: 'K League 1',           country: 'South Korea' },
  { id: 98,  season: 2024, label: 'J1 League',            country: 'Japan' },
  { id: 144, season: 2024, label: 'Belgian Pro League',   country: 'Belgium' },
]

function get(url, key) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'x-apisports-key': key } }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

for (const league of LEAGUES) {
  const url = `https://v3.football.api-sports.io/teams?league=${league.id}&season=${league.season}`
  console.error(`Fetching ${league.label} (league ${league.id}, season ${league.season})...`)
  const data = await get(url, apiKey)

  if (data.errors && Object.keys(data.errors).length > 0) {
    console.error(`  ERROR: ${JSON.stringify(data.errors)}`)
    continue
  }

  const teams = (data.response || []).sort((a, b) => a.team.name.localeCompare(b.team.name))
  console.log(`\n  // ── ${league.label} (API Football IDs, source: 'af') ${'─'.repeat(Math.max(0, 50 - league.label.length))}`)
  for (const { team } of teams) {
    const countryVal = team.country === 'USA' ? 'USA' :
                       team.country === 'Canada' ? 'Canada' :
                       league.country
    const namePad = team.name.length < 28 ? team.name + ' '.repeat(28 - team.name.length) : team.name
    console.log(`  { id: ${String(team.id).padEnd(6)} name: '${namePad}', country: '${countryVal}', source: 'af', logo: '${team.logo}', aliases: ['${team.name.toLowerCase()}'] },`)
  }
}

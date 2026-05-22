/**
 * Transfermarkt API client — wraps the local proxy at http://localhost:8000
 * Provides live player data: current club, contract expiry, market value, stats
 */

import { getClubLookupKeys, normalizeClubDisplayName } from '@/lib/club-names'
import { normalizeCountryDisplayName } from '@/lib/country-names'

const TM_BASE = process.env.TRANSFERMARKT_API_URL || 'http://localhost:8000'
const TM_SITE_BASE = 'https://www.transfermarkt.com'

// Simple in-memory cache (6-hour TTL)
const cache = new Map<string, { data: unknown; expires: number }>()
const TTL = 6 * 60 * 60 * 1000
const TM_SITE_TTL = 60 * 60 * 1000

async function tmFetch<T>(path: string): Promise<T> {
  const cached = cache.get(path)
  if (cached && cached.expires > Date.now()) return cached.data as T

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${TM_BASE}${path}`, { signal: controller.signal })
    if (!res.ok) throw new Error(`TM API ${res.status}: ${path}`)
    const data = await res.json() as T
    cache.set(path, { data, expires: Date.now() + TTL })
    return data
  } finally {
    clearTimeout(timer)
  }
}

async function tmSiteFetch<T>(path: string): Promise<T> {
  const cacheKey = `site:${path}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.data as T

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${TM_SITE_BASE}${path}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent': 'Mozilla/5.0',
      },
    })
    if (!res.ok) throw new Error(`TM site ${res.status}: ${path}`)
    const data = await res.json() as T
    cache.set(cacheKey, { data, expires: Date.now() + TM_SITE_TTL })
    return data
  } finally {
    clearTimeout(timer)
  }
}

async function tmSiteFetchText(path: string): Promise<string> {
  const cacheKey = `site:text:${path}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.data as string

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${TM_SITE_BASE}${path}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0',
      },
    })
    if (!res.ok) throw new Error(`TM site ${res.status}: ${path}`)
    const data = await res.text()
    cache.set(cacheKey, { data, expires: Date.now() + TM_SITE_TTL })
    return data
  } finally {
    clearTimeout(timer)
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface TMPlayerSearchResult {
  id: string
  name: string
  position: string
  club: { id: string; name: string }
  age: number | null
  nationalities: string[]
  marketValue: number | null
}

export interface TMPlayerData {
  id: string
  name: string
  fullName: string | null
  imageUrl: string | null
  age: number | null
  nationality: string
  position: string
  currentClub: string
  currentClubId: string | null
  contractExpires: string | null   // ISO date "2027-06-30"
  contractYear: string             // "2027" or "Unknown"
  marketValue: number | null       // in euros
  marketValueFormatted: string     // "€75M", "€7.5M", "€500K"
  // Current-season aggregate stats
  appearances: number
  goals: number
  assists: number
  minutesPlayed: number
  yellowCards: number
  statsAvailable: boolean
}

export interface TMClubPlayer {
  id: string
  name: string
  position: string
  age: number | null
  nationality: string
  contract: string | null          // ISO date
  contractYear: string
  marketValue: number | null
  marketValueFormatted: string
}

export interface TMClubStaffMember {
  id: string
  name: string
  position: string
  age: number | null
  appointed: string | null
  contractUntil: string | null
  countryIcon: string | null
  profileImage: string | null
  profileUrl: string | null
}

export interface TMManagerSearchResult {
  id: string
  name: string
  currentClub: string | null
  currentClubId: string | null
  age: number | null
  functionTitle: string | null
  contractUntil: string | null
}

export interface TMManagerProfileSnapshot {
  preferredFormation: string | null
  latestClub: string | null
  latestClubId: string | null
  latestRole: string | null
  latestAppointed: string | null
  latestInChargeUntil: string | null
}

export interface TMClubFinalFormation {
  formation: string | null
  rawTactic: string | null
  matchday: string | null
  matchReportUrl: string | null
  trainerName: string | null
  trainerId: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function formatMarketValue(value: number | null): string {
  if (!value) return 'Unknown'
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`
  return `€${value}`
}

function contractYear(isoDate: string | null): string {
  if (!isoDate) return 'Unknown'
  return isoDate.slice(0, 4)
}

function inferAgeFromDescription(description?: string | null): number | null {
  if (!description) return null

  const match = description.match(/\*\s*(\d{2})\/(\d{2})\/(\d{4})\b/)
  if (!match) return null

  const [, dayText, monthText, yearText] = match
  const day = Number(dayText)
  const month = Number(monthText)
  const year = Number(yearText)
  if (!day || !month || !year) return null

  const now = new Date()
  let age = now.getUTCFullYear() - year
  const hasHadBirthday =
    now.getUTCMonth() + 1 > month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() >= day)

  if (!hasHadBirthday) age -= 1
  return age >= 0 ? age : null
}

function getSeasonBucket(value: string | null | undefined): number | null {
  const season = value?.trim()
  if (!season) return null

  if (/^\d{4}$/.test(season)) {
    return Number(season)
  }

  const parts = season.split('/').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 2) {
    const [, second] = parts
    if (/^\d{4}$/.test(second)) return Number(second)
    if (/^\d{2}$/.test(second)) return 2000 + Number(second)
  }

  if (/^\d{2}$/.test(season)) {
    return 2000 + Number(season)
  }

  return null
}

function aggregateStats(stats: Array<{
  seasonId: string
  appearances?: number | null
  goals?: number | null
  assists?: number | null
  minutesPlayed?: number | null
  yellowCards?: number | null
}>) {
  if (!stats.length) return { appearances: 0, goals: 0, assists: 0, minutesPlayed: 0, yellowCards: 0 }

  const buckets = stats
    .map((row) => getSeasonBucket(row.seasonId))
    .filter((bucket): bucket is number => bucket !== null)

  const latestBucket = buckets.length > 0 ? Math.max(...buckets) : null
  const rows = latestBucket !== null
    ? stats.filter((row) => getSeasonBucket(row.seasonId) === latestBucket)
    : stats

  return rows.reduce(
    (acc, s) => ({
      appearances: acc.appearances + (s.appearances ?? 0),
      goals: acc.goals + (s.goals ?? 0),
      assists: acc.assists + (s.assists ?? 0),
      minutesPlayed: acc.minutesPlayed + (s.minutesPlayed ?? 0),
      yellowCards: acc.yellowCards + (s.yellowCards ?? 0),
    }),
    { appearances: 0, goals: 0, assists: 0, minutesPlayed: 0, yellowCards: 0 }
  )
}

interface TMSitePerformanceRow {
  detailedStatsLink?: string | null
  nameSeason: string
  gamesPlayed?: number | null
  goalsScored?: number | null
  assists?: number | null
  minutesPlayed?: number | null
  yellowCards?: number | null
}

function getSitePerformanceCampaignKey(row: TMSitePerformanceRow): number | null {
  const seasonFromLink = row.detailedStatsLink?.match(/\/saison\/(\d{4})/i)?.[1]
  if (seasonFromLink) return Number(seasonFromLink)
  return getSeasonBucket(row.nameSeason)
}

function aggregateSitePerformanceStats(rows: TMSitePerformanceRow[]) {
  if (!rows.length) return { appearances: 0, goals: 0, assists: 0, minutesPlayed: 0, yellowCards: 0 }

  const buckets = rows
    .map((row) => getSitePerformanceCampaignKey(row))
    .filter((bucket): bucket is number => bucket !== null)

  const latestBucket = buckets.length > 0 ? Math.max(...buckets) : null
  const latestRows = latestBucket !== null
    ? rows.filter((row) => getSitePerformanceCampaignKey(row) === latestBucket)
    : rows

  return latestRows
    .reduce(
      (acc, row) => ({
        appearances: acc.appearances + (row.gamesPlayed ?? 0),
        goals: acc.goals + (row.goalsScored ?? 0),
        assists: acc.assists + (row.assists ?? 0),
        minutesPlayed: acc.minutesPlayed + (row.minutesPlayed ?? 0),
        yellowCards: acc.yellowCards + (row.yellowCards ?? 0),
      }),
      { appearances: 0, goals: 0, assists: 0, minutesPlayed: 0, yellowCards: 0 }
    )
}

function getCurrentTMSeasonId(now = new Date()): number {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  return month >= 6 ? year : year - 1
}

function normalizeTMDate(value: string | null | undefined): string | null {
  if (!value || value === '-') return null
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  return `${match[3]}-${match[2]}-${match[1]}`
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function normalizeManagerClub(value: string | null | undefined): string | null {
  const clubName = decodeHtml(value || '')
  if (!clubName) return null

  const normalized = clubName.toLowerCase()
  if (
    normalized === 'without club' ||
    normalized === 'retired' ||
    normalized === '-' ||
    normalized === 'vereinslos'
  ) {
    return null
  }

  return normalizeClubDisplayName(clubName)
}

function normalizeTactic(value: string | null | undefined): string | null {
  const raw = decodeHtml(value || '').trim()
  if (!raw) return null

  const numbers = raw.match(/\d+/g)
  if (!numbers?.length) return null

  return numbers.join('-')
}

function scoreStaffRole(position: string): number {
  const normalized = position
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  if (normalized === 'manager') return 100
  if (normalized === 'head coach') return 95
  if (normalized === 'head trainer') return 90
  if (normalized === 'coach') return 70

  if (
    normalized.includes('assistant') ||
    normalized.includes('goalkeeping') ||
    normalized.includes('goal keeper') ||
    normalized.includes('fitness') ||
    normalized.includes('technical') ||
    normalized.includes('analyst') ||
    normalized.includes('medical') ||
    normalized.includes('physio') ||
    normalized.includes('nutrition') ||
    normalized.includes('director') ||
    normalized.includes('executive') ||
    normalized.includes('president') ||
    normalized.includes('scout') ||
    normalized.includes('academy') ||
    normalized.includes('translator') ||
    normalized.includes('coordinator')
  ) {
    return -25
  }

  return -10
}

// ── Public API ─────────────────────────────────────────────────────────────

// Strip diacritics: "Rajković" → "Rajkovic", "Müller" → "Muller"
function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function buildHyphenatedTokenVariants(token: string): string[] {
  const normalized = token.trim()
  if (!normalized || normalized.includes('-')) return []
  if (normalized.length < 5 || normalized.length > 10) return []

  const variants = new Set<string>()
  for (const tailLength of [2, 3, 4]) {
    if (normalized.length - tailLength < 2) continue
    variants.add(`${normalized.slice(0, -tailLength)}-${normalized.slice(-tailLength)}`)
  }

  return Array.from(variants)
}

function buildTMPlayerSearchQueries(query: string): string[] {
  const trimmed = query.trim()
  const stripped = stripDiacritics(trimmed)
  const spaced = trimmed.replace(/[’']/g, "'").replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  const strippedSpaced = stripDiacritics(spaced)
  const tokens = strippedSpaced.split(' ').filter(Boolean)

  const queries = new Set<string>([
    trimmed,
    stripped,
    spaced,
    strippedSpaced,
  ].filter(Boolean))

  if (tokens.length >= 2) {
    queries.add(tokens.join(' '))
    queries.add([...tokens].reverse().join(' '))
  }

  if (tokens.length === 2) {
    const [first, second] = tokens

    for (const firstVariant of [first, ...buildHyphenatedTokenVariants(first)]) {
      queries.add(`${firstVariant} ${second}`)
      queries.add(`${second} ${firstVariant}`)
    }

    for (const secondVariant of [second, ...buildHyphenatedTokenVariants(second)]) {
      queries.add(`${first} ${secondVariant}`)
      queries.add(`${secondVariant} ${first}`)
    }
  }

  const firstToken = tokens[0] || ''
  const lastToken = tokens.at(-1) || ''
  if (firstToken.length >= 4) queries.add(firstToken)
  if (lastToken.length >= 4) queries.add(lastToken)

  return Array.from(queries)
    .map((value) => value.trim())
    .filter(Boolean)
}

function buildTMClubSearchQueries(query: string): string[] {
  const stripped = stripDiacritics(query)
  const spaced = query.replace(/[/-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const strippedSpaced = stripDiacritics(spaced)
  const withoutSuffixes = spaced.replace(/\b(fc|cf|sc|afc|ac)\b/gi, ' ').replace(/\s+/g, ' ').trim()
  const strippedWithoutSuffixes = stripDiacritics(withoutSuffixes)
  const hyphenated = spaced.replace(/\s+/g, '-')
  const strippedHyphenated = strippedSpaced.replace(/\s+/g, '-')

  return Array.from(new Set([
    query.trim(),
    stripped.trim(),
    spaced,
    strippedSpaced,
    withoutSuffixes,
    strippedWithoutSuffixes,
    hyphenated,
    strippedHyphenated,
  ].filter(Boolean)))
}

function scoreClubSearchResultName(name: string, query: string): number {
  const resultKeys = getClubLookupKeys(name)
  const queryKeys = getClubLookupKeys(query)

  if (!resultKeys.exact || !queryKeys.exact) return 0
  if (resultKeys.exact === queryKeys.exact) return 100
  if (resultKeys.simplified && queryKeys.simplified && resultKeys.simplified === queryKeys.simplified) return 95
  if (resultKeys.exact.startsWith(queryKeys.exact) || queryKeys.exact.startsWith(resultKeys.exact)) return 85
  if (
    resultKeys.simplified &&
    queryKeys.simplified &&
    (resultKeys.simplified.startsWith(queryKeys.simplified) || queryKeys.simplified.startsWith(resultKeys.simplified))
  ) return 80
  if (resultKeys.exact.includes(queryKeys.exact) || queryKeys.exact.includes(resultKeys.exact)) return 70
  if (
    resultKeys.simplified &&
    queryKeys.simplified &&
    (resultKeys.simplified.includes(queryKeys.simplified) || queryKeys.simplified.includes(resultKeys.simplified))
  ) return 65

  return 0
}

function clubMatchScore(left?: string, right?: string): number {
  if (!left || !right) return 0

  const leftKeys = getClubLookupKeys(left)
  const rightKeys = getClubLookupKeys(right)

  if (!leftKeys.exact || !rightKeys.exact) return 0

  if (leftKeys.exact === rightKeys.exact || (leftKeys.simplified && leftKeys.simplified === rightKeys.simplified)) {
    return 6
  }

  if (
    leftKeys.exact.includes(rightKeys.exact) ||
    rightKeys.exact.includes(leftKeys.exact) ||
    (leftKeys.simplified && rightKeys.simplified && (
      leftKeys.simplified.includes(rightKeys.simplified) ||
      rightKeys.simplified.includes(leftKeys.simplified)
    ))
  ) {
    return 4
  }

  const leftLead = (leftKeys.simplified || leftKeys.exact).split(' ')[0]
  const rightLead = (rightKeys.simplified || rightKeys.exact).split(' ')[0]
  if (leftLead && rightLead && leftLead === rightLead) return 2

  return 0
}

function managerClubScore(resultClub?: string | null, queryClub?: string | null): number {
  if (!resultClub || !queryClub) return 0

  const resultKeys = getClubLookupKeys(resultClub)
  const queryKeys = getClubLookupKeys(queryClub)

  if (!resultKeys.exact || !queryKeys.exact) return 0
  if (resultKeys.exact === queryKeys.exact) return 100
  if (resultKeys.simplified && queryKeys.simplified && resultKeys.simplified === queryKeys.simplified) return 95
  if (
    resultKeys.exact.startsWith(queryKeys.exact) ||
    queryKeys.exact.startsWith(resultKeys.exact) ||
    (resultKeys.simplified && queryKeys.simplified && (
      resultKeys.simplified.startsWith(queryKeys.simplified) ||
      queryKeys.simplified.startsWith(resultKeys.simplified)
    ))
  ) return 80
  if (
    resultKeys.exact.includes(queryKeys.exact) ||
    queryKeys.exact.includes(resultKeys.exact) ||
    (resultKeys.simplified && queryKeys.simplified && (
      resultKeys.simplified.includes(queryKeys.simplified) ||
      queryKeys.simplified.includes(resultKeys.simplified)
    ))
  ) return 65

  return 0
}

function managerNameScore(resultName: string, query: string): number {
  const normalizedResult = stripDiacritics(resultName).toLowerCase().trim()
  const normalizedQuery = stripDiacritics(query).toLowerCase().trim()

  if (normalizedResult === normalizedQuery) return 100
  if (normalizedResult.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedResult)) return 85
  if (normalizedResult.includes(normalizedQuery) || normalizedQuery.includes(normalizedResult)) return 70

  const resultLast = normalizedResult.split(' ').filter(Boolean).at(-1) || ''
  const queryLast = normalizedQuery.split(' ').filter(Boolean).at(-1) || ''
  if (resultLast && queryLast && resultLast === queryLast) return 60

  return 0
}

/**
 * Search players by name, return top result.
 * Fallback chain: original name → diacritic-stripped → last name only (≥5 chars).
 * Optional hints (age, club) are used to disambiguate when multiple players share a name.
 */
export async function searchPlayer(
  name: string,
  hints?: { age?: number; club?: string }
): Promise<TMPlayerSearchResult | null> {
  const results = await searchPlayers(name)
  if (!results.length) return null

  const q = name.toLowerCase()
  const qStripped = stripDiacritics(q)

  // Score each result: name match + age proximity + club match
  const scored = results.map((p) => {
    const pLow = p.name.toLowerCase()
    const pStripped = stripDiacritics(pLow)

    let score = 0
    // Name similarity
    if (pLow === q || pStripped === qStripped) score += 10
    else if (pStripped.includes(qStripped) && qStripped.length >= 5) score += 5
    else if (pLow.includes(q) && q.length >= 5) score += 5

    // Age proximity (within 2 years = strong signal, within 5 = weak)
    if (hints?.age && p.age !== null) {
      const diff = Math.abs(p.age - hints.age)
      if (diff <= 2) score += 8
      else if (diff <= 5) score += 3
      else score -= 5  // penalise clearly wrong age (avoids picking retired namesakes)
    }

    // Club name match
    if (hints?.club && p.club?.name) {
      score += clubMatchScore(hints.club, p.club.name)
    }

    return { p, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0].p
}

/**
 * Search players by name, return up to 8 results for typeahead suggestions.
 */
export async function searchPlayers(name: string): Promise<TMPlayerSearchResult[]> {
  const queries = buildTMPlayerSearchQueries(name)

  for (const query of queries) {
    try {
      const encoded = encodeURIComponent(query)
      const data = await tmFetch<{ results: TMPlayerSearchResult[] }>(`/players/search/${encoded}`)
      const results = (data.results || []).slice(0, 8).map((player) => ({
        ...player,
        club: {
          ...player.club,
          name: normalizeClubDisplayName(player.club?.name),
        },
        nationalities: (player.nationalities || []).map((country) => normalizeCountryDisplayName(country)),
      }))

      if (results.length > 0) {
        return results
      }
    } catch {
      continue
    }
  }

  return []
}

/**
 * Fetch full player data: profile + aggregated current-season stats.
 */
export async function getPlayerData(
  tmId: string,
  options?: { fallbackAge?: number | null }
): Promise<TMPlayerData | null> {
  try {
    const [profile, statsData, sitePerformance] = await Promise.all([
      tmFetch<{
        id: string
        name: string
        fullName: string | null
        imageUrl: string | null
        age: number | null
        description?: string | null
        citizenship: string[]
        position: { main: string | null; other: string[] | null }
        club: { id: string | null; name: string; contractExpires: string | null }
        marketValue: number | null
      }>(`/players/${tmId}/profile`),
      tmFetch<{ stats: Array<{ seasonId: string; appearances?: number | null; goals?: number | null; assists?: number | null; minutesPlayed?: number | null; yellowCards?: number | null }> }>(`/players/${tmId}/stats`),
      tmSiteFetch<TMSitePerformanceRow[]>(`/ceapi/player/performance/${encodeURIComponent(tmId)}`).catch(() => null),
    ])

    const hasSitePerformance = Array.isArray(sitePerformance) && sitePerformance.length > 0
    const stats = hasSitePerformance
      ? aggregateSitePerformanceStats(sitePerformance)
      : aggregateStats(statsData.stats)
    const statsAvailable = hasSitePerformance
      ? sitePerformance.some((row) => (row.gamesPlayed ?? 0) > 0)
      : Array.isArray(statsData.stats) && statsData.stats.length > 0

    return {
      id: profile.id,
      name: profile.name,
      fullName: profile.fullName,
      imageUrl: profile.imageUrl,
      age: profile.age ?? options?.fallbackAge ?? inferAgeFromDescription(profile.description),
      nationality: normalizeCountryDisplayName(profile.citizenship[0]) || 'Unknown',
      position: profile.position.main || 'Unknown',
      currentClub: normalizeClubDisplayName(profile.club.name),
      currentClubId: profile.club.id,
      contractExpires: profile.club.contractExpires,
      contractYear: contractYear(profile.club.contractExpires),
      marketValue: profile.marketValue,
      marketValueFormatted: formatMarketValue(profile.marketValue),
      ...stats,
      statsAvailable,
    }
  } catch {
    return null
  }
}

/**
 * Get a club's full squad with live contract + market value data.
 */
export async function getClubSquad(tmClubId: string): Promise<TMClubPlayer[]> {
  try {
    const data = await tmFetch<{
      players: Array<{
        id: string
        name: string
        position: string
        age: number | null
        nationality: string[]
        contract: string | null
        marketValue: number | null
      }>
    }>(`/clubs/${tmClubId}/players`)

    return data.players.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      age: p.age,
      nationality: normalizeCountryDisplayName(p.nationality[0]) || 'Unknown',
      contract: p.contract,
      contractYear: contractYear(p.contract),
      marketValue: p.marketValue,
      marketValueFormatted: formatMarketValue(p.marketValue),
    }))
  } catch {
    return []
  }
}

/**
 * Fetch a club's current staff list directly from Transfermarkt's site endpoint.
 */
export async function getClubStaff(
  tmClubId: string,
  seasonId = getCurrentTMSeasonId()
): Promise<TMClubStaffMember[]> {
  try {
    const path = `/ceapi/staff/team/${encodeURIComponent(tmClubId)}/?saison_id=${seasonId}`
    const data = await tmSiteFetch<{
      staff: Array<{
        id: string
        age: number | null
        appointed: string | null
        contractUntil: string | null
        countryIcon: string | null
        name: string
        position: string
        profileImage: string | null
        profileUrl: string | null
      }>
    }>(path)

    return (data.staff || []).map((member) => ({
      id: member.id,
      age: member.age,
      appointed: normalizeTMDate(member.appointed),
      contractUntil: normalizeTMDate(member.contractUntil),
      countryIcon: member.countryIcon,
      name: member.name,
      position: member.position,
      profileImage: member.profileImage,
      profileUrl: member.profileUrl
        ? `${TM_SITE_BASE}${member.profileUrl}`
        : null,
    }))
  } catch {
    return []
  }
}

/**
 * Fetch the most likely current first-team manager for a club.
 */
export async function getClubManager(
  tmClubId: string,
  seasonId = getCurrentTMSeasonId()
): Promise<TMClubStaffMember | null> {
  const staff = await getClubStaff(tmClubId, seasonId)
  if (!staff.length) return null

  const ranked = staff
    .map((member) => ({ member, score: scoreStaffRole(member.position) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.member ?? null
}

export async function getClubFinalFormation(tmClubId: string): Promise<TMClubFinalFormation | null> {
  try {
    const data = await tmSiteFetch<{
      matchInfo?: { tactic?: string; matchday?: { day?: string | number } }
      matchReport?: { url?: string }
      trainer?: { id?: string; name?: string }
    }>(`/ceapi/FinalFormation/ClubId/${encodeURIComponent(tmClubId)}`)

    const rawTactic = data?.matchInfo?.tactic || null
    const formation = normalizeTactic(rawTactic)

    if (!formation) return null

    return {
      formation,
      rawTactic,
      matchday: data?.matchInfo?.matchday?.day ? String(data.matchInfo.matchday.day) : null,
      matchReportUrl: data?.matchReport?.url ? `${TM_SITE_BASE}${data.matchReport.url}` : null,
      trainerName: data?.trainer?.name || null,
      trainerId: data?.trainer?.id || null,
    }
  } catch {
    return null
  }
}

export async function getManagerProfileSnapshot(tmManagerId: string): Promise<TMManagerProfileSnapshot | null> {
  try {
    const html = await tmSiteFetchText(`/-/profil/trainer/${encodeURIComponent(tmManagerId)}`)

    const preferredFormation = normalizeTactic(
      decodeHtml(html.match(/<th>\s*Preferred formation:\s*<\/th>\s*<td>([^<]+)<\/td>/i)?.[1] || '')
    )

    const latestRoleRow = html.match(
      /<tr class="">[\s\S]*?<a title="([^"]+)" href="\/[^"]*\/verein\/(\d+)[^"]*">[\s\S]*?<td class="hauptlink no-border-links"><a[^>]*>[^<]+<\/a><br>([^<]+)<\/td><td class="zentriert">[^<]*(?:\((\d{2}\/\d{2}\/\d{4})\))?<\/td><td class="zentriert">[^<]*(?:\((\d{2}\/\d{2}\/\d{4})\))?<\/td>/i
    )

    const latestRole = decodeHtml(latestRoleRow?.[3] || '')
    const latestRoleScore = latestRole ? scoreStaffRole(latestRole) : 0

    const snapshot: TMManagerProfileSnapshot = {
      preferredFormation,
      latestClub: latestRoleRow?.[1] ? normalizeClubDisplayName(decodeHtml(latestRoleRow[1])) : null,
      latestClubId: latestRoleRow?.[2] || null,
      latestRole: latestRole || null,
      latestAppointed: normalizeTMDate(latestRoleRow?.[4] || null),
      latestInChargeUntil: normalizeTMDate(latestRoleRow?.[5] || null),
    }

    if (!snapshot.preferredFormation && !snapshot.latestClub) return null
    if (snapshot.latestRole && latestRoleScore <= 0) return null

    return snapshot
  } catch {
    return null
  }
}

export async function searchManagers(query: string): Promise<TMManagerSearchResult[]> {
  try {
    const encoded = encodeURIComponent(query.trim())
    const html = await tmSiteFetchText(`/schnellsuche/ergebnis/schnellsuche?query=${encoded}`)
    const coachGrid = html.match(/<div id="coach-grid"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || ''
    if (!coachGrid) return []

    const results = Array.from(
      coachGrid.matchAll(
        /<a title="([^"]+)" id="(\d+)" href="\/[^"]+\/profil\/trainer\/\d+">[^<]+<\/a><\/td><\/tr><tr><td>(?:<a title="([^"]+)" href="([^"]+)">[^<]*<\/a>|([^<]+))<\/td><\/tr><\/table><\/td><td class="zentriert">[\s\S]*?<\/td><td class="zentriert">([^<]*)<\/td><td class="zentriert">[\s\S]*?<\/td><td class="rechts">([^<]*)<\/td><td class="rechts">([^<]*)<\/td>/gi
      )
    )

    return results.map((match) => {
      const clubName = match[3] || match[5] || null
      const clubHref = match[4] || ''
      const clubId = clubHref.match(/\/verein\/(\d+)/)?.[1] || null
      const contractUntil = normalizeTMDate(match[8] || null)

      return {
        id: match[2],
        name: decodeHtml(match[1]),
        currentClub: normalizeManagerClub(clubName),
        currentClubId: clubId,
        age: Number.parseInt(match[6] || '', 10) || null,
        functionTitle: decodeHtml(match[7] || '') || null,
        contractUntil,
      }
    })
  } catch {
    return []
  }
}

export async function searchManager(name: string): Promise<TMManagerSearchResult | null> {
  try {
    const results = await searchManagers(name)
    if (!results.length) return null

    const ranked = [...results].sort((left, right) => {
      const roleScoreDiff = scoreStaffRole(right.functionTitle || '') - scoreStaffRole(left.functionTitle || '')
      if (roleScoreDiff !== 0) return roleScoreDiff

      const scoreDiff = managerNameScore(right.name, name) - managerNameScore(left.name, name)
      if (scoreDiff !== 0) return scoreDiff
      if (left.currentClub && !right.currentClub) return -1
      if (!left.currentClub && right.currentClub) return 1
      return left.name.length - right.name.length
    })

    const best = ranked[0] || null
    if (!best) return null

    if (scoreStaffRole(best.functionTitle || '') <= 0) {
      return null
    }

    return best
  } catch {
    return null
  }
}

export async function searchManagerByClub(clubName: string): Promise<TMManagerSearchResult | null> {
  try {
    const results = await searchManagers(clubName)
    if (!results.length) return null

    const ranked = results
      .map((result) => ({
        result,
        roleScore: scoreStaffRole(result.functionTitle || ''),
        clubScore: managerClubScore(result.currentClub, clubName),
      }))
      .filter((entry) => entry.roleScore > 0 && entry.clubScore > 0)
      .sort((left, right) => {
        if (right.clubScore !== left.clubScore) return right.clubScore - left.clubScore
        if (right.roleScore !== left.roleScore) return right.roleScore - left.roleScore
        return left.result.name.length - right.result.name.length
      })

    return ranked[0]?.result || null
  } catch {
    return null
  }
}

/**
 * Search a club by name and return its Transfermarkt ID.
 */
export async function searchClub(name: string): Promise<string | null> {
  try {
    const results = await searchClubs(name)
    if (!results.length) return null

    const ranked = [...results].sort((left, right) => {
      const scoreDiff = scoreClubSearchResultName(right.name, name) - scoreClubSearchResultName(left.name, name)
      if (scoreDiff !== 0) return scoreDiff
      return left.name.length - right.name.length
    })

    return ranked[0]?.id || null
  } catch {
    return null
  }
}

export interface TMClubSearchResult {
  id: string
  name: string
  country: string
}

/**
 * Search clubs by name and return full results array (global coverage).
 * TM's search API works better with hyphens than spaces, so we try both.
 */
export async function searchClubs(query: string): Promise<TMClubSearchResult[]> {
  const merged = new Map<string, TMClubSearchResult>()

  for (const candidate of buildTMClubSearchQueries(query)) {
    try {
      const encoded = encodeURIComponent(candidate)
      const data = await tmFetch<{ results: TMClubSearchResult[] }>(`/clubs/search/${encoded}`)
      for (const result of data.results || []) {
        if (!merged.has(result.id)) {
          merged.set(result.id, {
            ...result,
            country: normalizeCountryDisplayName(result.country),
          })
        }
      }
    } catch {
      continue
    }
  }

  return Array.from(merged.values())
}

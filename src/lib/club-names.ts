import { POPULAR_TEAMS } from '@/lib/teams-db'

const CLUB_WORDS_TO_IGNORE = new Set([
  '1',
  '04',
  '05',
  '1846',
  '1899',
  '1901',
  '1909',
  'ac',
  'afc',
  'as',
  'bc',
  'bk',
  'cf',
  'club',
  'de',
  'fc',
  'fk',
  'fsv',
  'jk',
  'kaa',
  'kv',
  'ogc',
  'rc',
  'rsc',
  'sc',
  'sl',
  'ss',
  'ssc',
  'sv',
  'tsg',
  'vfb',
  'vfl',
])

function normalizeClubLookupKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function simplifyClubLookupKey(value: string): string {
  const key = normalizeClubLookupKey(value)
  if (!key) return ''

  const simplified = key
    .split(' ')
    .filter((part) => part && !CLUB_WORDS_TO_IGNORE.has(part))
    .join(' ')

  return simplified || key
}

function collectVariants(): Map<string, Set<string>> {
  const variants = new Map<string, Set<string>>()

  const add = (variant: string, canonicalName: string) => {
    const keys = [normalizeClubLookupKey(variant), simplifyClubLookupKey(variant)].filter(Boolean)
    for (const key of keys) {
      const existing = variants.get(key) ?? new Set<string>()
      existing.add(canonicalName)
      variants.set(key, existing)
    }
  }

  for (const team of POPULAR_TEAMS) {
    add(team.name, team.name)
    for (const alias of team.aliases) {
      add(alias, team.name)
    }
  }

  return variants
}

const SAFE_CANONICAL_BY_KEY = (() => {
  const resolved = new Map<string, string>()
  for (const [key, canonicalNames] of collectVariants()) {
    if (canonicalNames.size === 1) {
      resolved.set(key, canonicalNames.values().next().value as string)
    }
  }
  return resolved
})()

export function getClubLookupKeys(value?: string | null): { exact: string; simplified: string } {
  if (!value) return { exact: '', simplified: '' }

  return {
    exact: normalizeClubLookupKey(value),
    simplified: simplifyClubLookupKey(value),
  }
}

export function normalizeClubDisplayName(value?: string | null): string {
  if (!value) return ''

  const trimmed = value.trim()
  if (!trimmed) return ''

  const { exact, simplified } = getClubLookupKeys(trimmed)
  const exactCanonical = SAFE_CANONICAL_BY_KEY.get(exact)
  if (exactCanonical) return exactCanonical

  const exactTokenCount = exact.split(' ').filter(Boolean).length
  if (exact === simplified || exactTokenCount <= 1) {
    const simplifiedCanonical = SAFE_CANONICAL_BY_KEY.get(simplified)
    if (simplifiedCanonical) return simplifiedCanonical
  }

  return trimmed
}

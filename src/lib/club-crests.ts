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

const crestOverrides = new Map<string, string>()

function registerClubCrest(variant: string, logoUrl: string) {
  for (const key of [normalizeClubLookupKey(variant), simplifyClubLookupKey(variant)]) {
    if (key) crestOverrides.set(key, logoUrl)
  }
}

// Toluca official structured-data crest from the club's own website.
const TOLUCA_OFFICIAL_CREST = 'https://statics-maker.llt-services.com/tol/images/2025/10/30/large/dccb6d8e-46d9-46b1-883f-d20e4ed42691-686.png'
for (const variant of ['Toluca', 'Deportivo Toluca', 'Deportivo Toluca FC', 'Toluca FC']) {
  registerClubCrest(variant, TOLUCA_OFFICIAL_CREST)
}

export function getCanonicalClubLogo(name?: string | null, fallback?: string | null): string {
  const trimmed = name?.trim() || ''
  if (!trimmed) return fallback?.trim() || ''

  return (
    crestOverrides.get(normalizeClubLookupKey(trimmed)) ||
    crestOverrides.get(simplifyClubLookupKey(trimmed)) ||
    fallback?.trim() ||
    ''
  )
}

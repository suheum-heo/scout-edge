function normalizeCountryLookup(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\./g, '')
    .replace(/['’]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
}

const COUNTRY_DISPLAY_NAMES: Record<string, string> = {
  'usa': 'USA',
  'united states': 'USA',
  'united states of america': 'USA',
  'turkey': 'Türkiye',
  'turkiye': 'Türkiye',
  'uae': 'United Arab Emirates',
  'united arab emirates': 'United Arab Emirates',
  'korea south': 'South Korea',
  'south korea': 'South Korea',
  'republic of korea': 'South Korea',
  'korea republic': 'South Korea',
  'korea north': 'North Korea',
  'north korea': 'North Korea',
  'korea dpr': 'North Korea',
  'democratic peoples republic of korea': 'North Korea',
  'czech republic': 'Czechia',
  'dr congo': 'Democratic Republic of Congo',
  'd r congo': 'Democratic Republic of Congo',
  'democratic republic of congo': 'Democratic Republic of Congo',
  'cote divoire': "Côte d'Ivoire",
  'ivory coast': "Côte d'Ivoire",
  'republic of ireland': 'Ireland',
  'bosnia herzegovina': 'Bosnia and Herzegovina',
  'bosnia and herzegovina': 'Bosnia and Herzegovina',
}

export function normalizeCountryDisplayName(value?: string | null): string {
  if (!value) return ''

  const trimmed = value.trim()
  if (!trimmed) return ''

  return COUNTRY_DISPLAY_NAMES[normalizeCountryLookup(trimmed)] ?? trimmed.replace(/-/g, ' ')
}

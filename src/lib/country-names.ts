function normalizeCountryLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\./g, '')
    .replace(/['’]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
}

const COUNTRY_DISPLAY_NAMES: Record<string, string> = {
  'korea south': 'South Korea',
  'south korea': 'South Korea',
  'republic of korea': 'South Korea',
  'korea republic': 'South Korea',
  'korea north': 'North Korea',
  'north korea': 'North Korea',
  'korea dpr': 'North Korea',
  'democratic peoples republic of korea': 'North Korea',
  'united states of america': 'United States',
}

export function normalizeCountryDisplayName(value?: string | null): string {
  if (!value) return ''

  const trimmed = value.trim()
  if (!trimmed) return ''

  return COUNTRY_DISPLAY_NAMES[normalizeCountryLookup(trimmed)] ?? trimmed.replace(/-/g, ' ')
}

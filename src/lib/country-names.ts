import type { LanguageCode } from '@/lib/i18n'

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

const COUNTRY_REGION_CODES: Record<string, string> = {
  'algeria': 'DZ',
  'argentina': 'AR',
  'austria': 'AT',
  'belgium': 'BE',
  'bosnia and herzegovina': 'BA',
  'brazil': 'BR',
  'cameroon': 'CM',
  'canada': 'CA',
  'chile': 'CL',
  'colombia': 'CO',
  'croatia': 'HR',
  'czechia': 'CZ',
  'denmark': 'DK',
  'egypt': 'EG',
  'france': 'FR',
  'georgia': 'GE',
  'germany': 'DE',
  'ghana': 'GH',
  'greece': 'GR',
  'hungary': 'HU',
  'ireland': 'IE',
  'italy': 'IT',
  'ivory coast': 'CI',
  "côte d'ivoire": 'CI',
  'japan': 'JP',
  'mali': 'ML',
  'mexico': 'MX',
  'morocco': 'MA',
  'netherlands': 'NL',
  'nigeria': 'NG',
  'north korea': 'KP',
  'norway': 'NO',
  'paraguay': 'PY',
  'peru': 'PE',
  'poland': 'PL',
  'portugal': 'PT',
  'romania': 'RO',
  'saudi arabia': 'SA',
  'senegal': 'SN',
  'serbia': 'RS',
  'slovakia': 'SK',
  'slovenia': 'SI',
  'south africa': 'ZA',
  'south korea': 'KR',
  'spain': 'ES',
  'sweden': 'SE',
  'switzerland': 'CH',
  'tunisia': 'TN',
  'turkiye': 'TR',
  'turkey': 'TR',
  'united arab emirates': 'AE',
  'usa': 'US',
  'uruguay': 'UY',
  'wales': 'GB',
}

const SPECIAL_COUNTRY_TRANSLATIONS: Partial<Record<LanguageCode, Record<string, string>>> = {
  ko: {
    'england': '잉글랜드',
    'scotland': '스코틀랜드',
    'wales': '웨일스',
    'northern ireland': '북아일랜드',
    'south korea': '대한민국',
    'north korea': '북한',
    'usa': '미국',
    'turkiye': '튀르키예',
    'saudi arabia': '사우디아라비아',
    'bosnia and herzegovina': '보스니아 헤르체고비나',
  },
  ja: {
    'england': 'イングランド',
    'scotland': 'スコットランド',
    'wales': 'ウェールズ',
    'northern ireland': '北アイルランド',
    'south korea': '韓国',
    'north korea': '北朝鮮',
    'usa': 'アメリカ',
    'turkiye': 'トルコ',
    'saudi arabia': 'サウジアラビア',
    'bosnia and herzegovina': 'ボスニア・ヘルツェゴビナ',
  },
  de: {
    'england': 'England',
    'scotland': 'Schottland',
    'wales': 'Wales',
    'northern ireland': 'Nordirland',
    'south korea': 'Südkorea',
    'north korea': 'Nordkorea',
    'usa': 'USA',
    'turkiye': 'Türkei',
  },
  fr: {
    'england': 'Angleterre',
    'scotland': 'Écosse',
    'wales': 'Pays de Galles',
    'northern ireland': 'Irlande du Nord',
    'south korea': 'Corée du Sud',
    'north korea': 'Corée du Nord',
    'usa': 'États-Unis',
    'turkiye': 'Turquie',
  },
  es: {
    'england': 'Inglaterra',
    'scotland': 'Escocia',
    'wales': 'Gales',
    'northern ireland': 'Irlanda del Norte',
    'south korea': 'Corea del Sur',
    'north korea': 'Corea del Norte',
    'usa': 'Estados Unidos',
    'turkiye': 'Turquía',
  },
  pt: {
    'england': 'Inglaterra',
    'scotland': 'Escócia',
    'wales': 'País de Gales',
    'northern ireland': 'Irlanda do Norte',
    'south korea': 'Coreia do Sul',
    'north korea': 'Coreia do Norte',
    'usa': 'Estados Unidos',
    'turkiye': 'Turquia',
  },
  it: {
    'england': 'Inghilterra',
    'scotland': 'Scozia',
    'wales': 'Galles',
    'northern ireland': "Irlanda del Nord",
    'south korea': 'Corea del Sud',
    'north korea': 'Corea del Nord',
    'usa': 'Stati Uniti',
    'turkiye': 'Turchia',
  },
  nl: {
    'england': 'Engeland',
    'scotland': 'Schotland',
    'wales': 'Wales',
    'northern ireland': 'Noord-Ierland',
    'south korea': 'Zuid-Korea',
    'north korea': 'Noord-Korea',
    'usa': 'Verenigde Staten',
    'turkiye': 'Turkije',
  },
}

function getIntlLocale(language: LanguageCode): string {
  switch (language) {
    case 'ko':
      return 'ko-KR'
    case 'ja':
      return 'ja-JP'
    case 'pt':
      return 'pt-PT'
    default:
      return language
  }
}

export function normalizeCountryDisplayName(value?: string | null): string {
  if (!value) return ''

  const trimmed = value.trim()
  if (!trimmed) return ''

  return COUNTRY_DISPLAY_NAMES[normalizeCountryLookup(trimmed)] ?? trimmed.replace(/-/g, ' ')
}

export function translateCountryDisplayName(
  value: string | undefined | null,
  language: LanguageCode
): string {
  const normalized = normalizeCountryDisplayName(value)
  if (!normalized || language === 'en') return normalized

  const lookupKey = normalizeCountryLookup(normalized)
  const specialTranslation = SPECIAL_COUNTRY_TRANSLATIONS[language]?.[lookupKey]
  if (specialTranslation) return specialTranslation

  const regionCode = COUNTRY_REGION_CODES[lookupKey]
  if (!regionCode) return normalized

  try {
    const displayNames = new Intl.DisplayNames([getIntlLocale(language)], { type: 'region' })
    return displayNames.of(regionCode) || normalized
  } catch {
    return normalized
  }
}

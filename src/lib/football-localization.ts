import type { LanguageCode } from '@/lib/i18n'

export type EntityType = 'player' | 'manager' | 'club'

type TermDictionary = Record<string, string>

interface LocalizeGeneratedContentOptions {
  glossary?: Record<string, string>
}

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  ko: 'Korean',
  es: 'Spanish',
  pt: 'Portuguese',
  nl: 'Dutch',
  it: 'Italian',
  de: 'German',
  fr: 'French',
  ja: 'Japanese',
}

export const MANUAL_NAME_GLOSSARY: Record<LanguageCode, Partial<Record<EntityType, Record<string, string>>>> = {
  en: {},
  ko: {
    manager: {
      'Roberto De Zerbi': '로베르토 데 제르비',
      'De Zerbi': '데 제르비',
      'Vincent Kompany': '뱅상 콩파니',
      'Arne Slot': '아르네 슬롯',
    },
    club: {
      'Tottenham Hotspur': '토트넘 홋스퍼',
      'FC Tottenham Hotspur': '토트넘 홋스퍼',
      'Bayern München': '바이에른 뮌헨',
      'Bayern Munich': '바이에른 뮌헨',
      'FC Bayern München': '바이에른 뮌헨',
      'FC Bayern Munich': '바이에른 뮌헨',
      'Real Madrid': '레알 마드리드',
      'Manchester City': '맨체스터 시티',
      'Manchester United': '맨체스터 유나이티드',
      'Brighton & Hove Albion': '브라이턴 앤드 호브 알비온',
    },
    player: {
      'Son Heung-min': '손흥민',
      'Heung-min Son': '손흥민',
      'Takefusa Kubo': '구보 다케후사',
      'Kaoru Mitoma': '미토마 가오루',
      'Kim Min-jae': '김민재',
      'Hwang Hee-chan': '황희찬',
    },
  },
  es: {},
  pt: {},
  nl: {},
  it: {},
  de: {},
  fr: {},
  ja: {
    manager: {
      'Roberto De Zerbi': 'ロベルト・デ・ゼルビ',
      'De Zerbi': 'デ・ゼルビ',
      'Vincent Kompany': 'ヴァンサン・コンパニ',
    },
    club: {
      'Tottenham Hotspur': 'トッテナム・ホットスパー',
      'Bayern München': 'バイエルン・ミュンヘン',
      'Bayern Munich': 'バイエルン・ミュンヘン',
      'FC Bayern München': 'バイエルン・ミュンヘン',
      'FC Bayern Munich': 'バイエルン・ミュンヘン',
      'Real Madrid': 'レアル・マドリード',
      'Manchester City': 'マンチェスター・シティ',
      'Manchester United': 'マンチェスター・ユナイテッド',
    },
    player: {
      'Son Heung-min': 'ソン・フンミン',
      'Heung-min Son': 'ソン・フンミン',
      'Takefusa Kubo': '久保建英',
      'Kaoru Mitoma': '三笘薫',
      'Kim Min-jae': 'キム・ミンジェ',
    },
  },
}

const TERM_TRANSLATIONS: Record<LanguageCode, TermDictionary> = {
  en: {},
  ko: {
    'goalkeeper': '골키퍼',
    'defender': '수비수',
    'midfielder': '미드필더',
    'forward': '공격수',
    'attacker': '공격수',
    'centre-back': '센터백',
    'center-back': '센터백',
    'centre back': '센터백',
    'center back': '센터백',
    'full-back': '풀백',
    'full back': '풀백',
    'wing-back': '윙백',
    'wing back': '윙백',
    'defensive midfielder': '수비형 미드필더',
    'defensive midfield': '수비형 미드필더',
    'central midfielder': '중앙 미드필더',
    'central midfield': '중앙 미드필더',
    'attacking midfielder': '공격형 미드필더',
    'attacking midfield': '공격형 미드필더',
    'winger': '윙어',
    'left winger': '왼쪽 윙어',
    'right winger': '오른쪽 윙어',
    'left wing': '왼쪽 윙',
    'right wing': '오른쪽 윙',
    'striker': '스트라이커',
    'pace': '스피드',
    'pass accuracy': '패스 정확도',
    'positional awareness': '위치 선정',
    'pressing intensity': '압박 강도',
    'dribbling': '드리블',
    'ball distribution': '볼 배급',
    'ball retention': '볼 소유 유지',
    'distribution accuracy': '배급 정확도',
    'sweeping range': '스위핑 범위',
    'press resistance': '압박 저항',
    'build-up': '빌드업',
    'build up': '빌드업',
    'recovery pace': '회복 속도',
    'aerial ability': '공중볼 장악력',
    'ball carrying': '볼 운반',
    'chance creation': '찬스 메이킹',
    'finishing': '마무리',
    'positional discipline': '포지셔닝 규율',
    'positional rotation': '포지셔널 로테이션',
    'ball-winning': '볼 탈취',
    'ball winning': '볼 탈취',
    'tactical fit': '전술 적합도',
    'squad fit': '스쿼드 적합도',
    'critical': '치명적',
    'high': '높음',
    'medium': '보통',
    'moderate': '보통',
    'low': '낮음',
    'sweeper-keeper': '스위퍼 키퍼',
    'sweeper keeper': '스위퍼 키퍼',
    'elite sweeper-keeper': '엘리트 스위퍼 키퍼',
    'elite sweeper keeper': '엘리트 스위퍼 키퍼',
    'technical sweeper-keeper': '기술형 스위퍼 키퍼',
    'technical sweeper keeper': '기술형 스위퍼 키퍼',
    'ball-playing centre-back': '빌드업형 센터백',
    'ball-playing center-back': '빌드업형 센터백',
    'ball-playing defender': '빌드업형 수비수',
    'attacking full-back': '공격형 풀백',
    'inverted full-back': '인버티드 풀백',
    'inverted winger': '인버티드 윙어',
    'technical left winger': '기술형 왼쪽 윙어',
    'technical right winger': '기술형 오른쪽 윙어',
    'balanced midfielder': '균형형 미드필더',
    'wide creator': '와이드 플레이메이커',
    'box-to-box midfielder': '박스 투 박스 미드필더',
    'deep-lying playmaker': '딥라잉 플레이메이커',
    'anchor midfielder': '앵커 미드필더',
    'press-resistant #6': '압박 저항형 6번',
    'press resistant #6': '압박 저항형 6번',
    'elite': '엘리트',
    'technical': '테크니컬',
    'role coverage': '역할 커버리지',
    'system fit': '시스템 적합도',
    'attacking threat': '공격 위협도',
    'defensive stability': '수비 안정성',
    'squad depth': '스쿼드 뎁스',
    'age profile': '연령 구조',
    'strong yes': '강한 찬성',
    'yes': '찬성',
    'conditional': '조건부 찬성',
    'no': '부정적',
    'strong no': '강한 반대',
    'key man': '핵심 자원',
    'good fit': '좋은 적합',
    'rotation': '로테이션',
    'poor fit': '낮은 적합',
    'sell candidate': '매각 후보',
    'likely available': '가능성 높음',
    'possible': '가능',
    'hard to get': '어려움',
    'free agent': '자유계약',
    'unknown': '미확인',
  },
  es: {
    'goalkeeper': 'Portero',
    'defender': 'Defensa',
    'midfielder': 'Centrocampista',
    'forward': 'Delantero',
    'tactical fit': 'encaje táctico',
    'squad fit': 'encaje de plantilla',
  },
  pt: {
    'goalkeeper': 'Goleiro',
    'defender': 'Defensor',
    'midfielder': 'Meio-campista',
    'forward': 'Atacante',
    'tactical fit': 'encaixe tático',
    'squad fit': 'encaixe no elenco',
  },
  nl: {
    'goalkeeper': 'Doelman',
    'defender': 'Verdediger',
    'midfielder': 'Middenvelder',
    'forward': 'Aanvaller',
    'tactical fit': 'tactische fit',
    'squad fit': 'selectiefit',
  },
  it: {
    'goalkeeper': 'Portiere',
    'defender': 'Difensore',
    'midfielder': 'Centrocampista',
    'forward': 'Attaccante',
    'tactical fit': 'compatibilità tattica',
    'squad fit': 'compatibilità con la rosa',
  },
  de: {
    'goalkeeper': 'Torwart',
    'defender': 'Verteidiger',
    'midfielder': 'Mittelfeldspieler',
    'forward': 'Stürmer',
    'tactical fit': 'taktische Passung',
    'squad fit': 'Passung im Kader',
  },
  fr: {
    'goalkeeper': 'Gardien',
    'defender': 'Défenseur',
    'midfielder': 'Milieu',
    'forward': 'Attaquant',
    'tactical fit': 'adéquation tactique',
    'squad fit': 'adéquation avec l’effectif',
  },
  ja: {
    'goalkeeper': 'ゴールキーパー',
    'defender': 'ディフェンダー',
    'midfielder': 'ミッドフィルダー',
    'forward': 'フォワード',
    'attacker': 'アタッカー',
    'centre-back': 'センターバック',
    'center-back': 'センターバック',
    'centre back': 'センターバック',
    'center back': 'センターバック',
    'full-back': 'フルバック',
    'full back': 'フルバック',
    'wing-back': 'ウイングバック',
    'wing back': 'ウイングバック',
    'defensive midfielder': '守備的ミッドフィルダー',
    'defensive midfield': '守備的ミッドフィルダー',
    'central midfielder': 'セントラルミッドフィルダー',
    'central midfield': 'セントラルミッドフィルダー',
    'attacking midfielder': '攻撃的ミッドフィルダー',
    'attacking midfield': '攻撃的ミッドフィルダー',
    'winger': 'ウインガー',
    'left winger': '左ウインガー',
    'right winger': '右ウインガー',
    'left wing': '左ウイング',
    'right wing': '右ウイング',
    'striker': 'ストライカー',
    'pace': 'スピード',
    'pass accuracy': 'パス精度',
    'positional awareness': 'ポジショニング認知',
    'pressing intensity': 'プレッシング強度',
    'dribbling': 'ドリブル',
    'ball distribution': 'ボール配給',
    'ball retention': 'ボール保持',
    'distribution accuracy': '配給精度',
    'sweeping range': 'スイープ範囲',
    'press resistance': 'プレッシャー耐性',
    'build-up': 'ビルドアップ',
    'build up': 'ビルドアップ',
    'recovery pace': 'リカバリースピード',
    'aerial ability': '空中戦能力',
    'ball carrying': 'ボールキャリー',
    'chance creation': 'チャンス創出',
    'finishing': '決定力',
    'positional discipline': 'ポジショニング規律',
    'positional rotation': 'ポジショナルローテーション',
    'ball-winning': 'ボール奪取',
    'ball winning': 'ボール奪取',
    'tactical fit': '戦術適合度',
    'squad fit': 'スカッド適合度',
    'critical': '致命的',
    'high': '高い',
    'medium': '中',
    'moderate': '中',
    'low': '低い',
    'sweeper-keeper': 'スイーパーキーパー',
    'sweeper keeper': 'スイーパーキーパー',
    'elite sweeper-keeper': 'エリート・スイーパーキーパー',
    'elite sweeper keeper': 'エリート・スイーパーキーパー',
    'technical sweeper-keeper': 'テクニカル・スイーパーキーパー',
    'technical sweeper keeper': 'テクニカル・スイーパーキーパー',
    'ball-playing centre-back': 'ビルドアップ型センターバック',
    'ball-playing center-back': 'ビルドアップ型センターバック',
    'ball-playing defender': 'ビルドアップ型ディフェンダー',
    'attacking full-back': '攻撃型フルバック',
    'inverted full-back': 'インバート型フルバック',
    'inverted winger': 'インバート型ウインガー',
    'technical left winger': 'テクニカルな左ウインガー',
    'technical right winger': 'テクニカルな右ウインガー',
    'balanced midfielder': 'バランス型ミッドフィルダー',
    'wide creator': 'ワイドクリエーター',
    'box-to-box midfielder': 'ボックス・トゥ・ボックスMF',
    'deep-lying playmaker': '低い位置のプレーメーカー',
    'anchor midfielder': 'アンカー型MF',
    'press-resistant #6': 'プレッシャー耐性の高い6番',
    'press resistant #6': 'プレッシャー耐性の高い6番',
    'elite': 'エリート',
    'technical': 'テクニカル',
    'role coverage': '役割カバー',
    'system fit': 'システム適合度',
    'attacking threat': '攻撃の脅威',
    'defensive stability': '守備の安定性',
    'squad depth': 'スカッドの厚み',
    'age profile': '年齢構成',
    'strong yes': '強く賛成',
    'yes': '賛成',
    'conditional': '条件付き賛成',
    'no': '否定的',
    'strong no': '強く反対',
    'key man': 'キーマン',
    'good fit': '好適合',
    'rotation': 'ローテーション',
    'poor fit': '低適合',
    'sell candidate': '売却候補',
    'likely available': '獲得しやすい',
    'possible': '可能',
    'hard to get': '難しい',
    'free agent': 'フリーエージェント',
    'unknown': '不明',
  },
}

const SCENARIO_DIMENSION_TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  en: {},
  ko: {
    roleCoverage: '역할 커버리지',
    systemFit: '시스템 적합도',
    attackingThreat: '공격 위협도',
    defensiveStability: '수비 안정성',
    squadDepth: '스쿼드 뎁스',
    ageProfile: '연령 구조',
  },
  es: {},
  pt: {},
  nl: {},
  it: {},
  de: {},
  fr: {},
  ja: {
    roleCoverage: '役割カバー',
    systemFit: 'システム適合度',
    attackingThreat: '攻撃の脅威',
    defensiveStability: '守備の安定性',
    squadDepth: 'スカッドの厚み',
    ageProfile: '年齢構成',
  },
}

const TRANSLITERATION_CORRECTIONS: Record<LanguageCode, Array<[string, string]>> = {
  en: [],
  ko: [
    ['데 체르비', '데 제르비'],
    ['드 제르비', '데 제르비'],
    ['콤파니', '콩파니'],
  ],
  es: [],
  pt: [],
  nl: [],
  it: [],
  de: [],
  fr: [],
  ja: [
    ['デ・チェルビ', 'デ・ゼルビ'],
  ],
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeTermKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function buildTermPattern(term: string): RegExp {
  const escaped = escapeRegExp(term)
    .replace(/\\ /g, '[\\\\s_-]+')
    .replace(/\\#/g, '#')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu')
}

function getMergedGlossary(
  language: LanguageCode,
  additionalGlossary?: Record<string, string>
): Record<string, string> {
  const manual = MANUAL_NAME_GLOSSARY[language]
  const merged = {
    ...(manual.player || {}),
    ...(manual.manager || {}),
    ...(manual.club || {}),
    ...(additionalGlossary || {}),
  }

  return Object.fromEntries(
    Object.entries(merged).sort((left, right) => right[0].length - left[0].length)
  )
}

export function getLanguageDisplayName(language: LanguageCode): string {
  return LANGUAGE_NAMES[language]
}

export function getManualGlossaryEntries(
  language: LanguageCode,
  entityType?: EntityType
): Record<string, string> {
  const glossary = MANUAL_NAME_GLOSSARY[language]
  if (!glossary) return {}
  if (entityType) return glossary[entityType] || {}
  return getMergedGlossary(language)
}

export function lookupManualLocalizedName(
  name: string,
  entityType: EntityType,
  language: LanguageCode
): string | null {
  const entityGlossary = MANUAL_NAME_GLOSSARY[language]?.[entityType] || {}
  return entityGlossary[name] || null
}

export function translateFootballTerm(language: LanguageCode, term: string): string {
  if (!term) return term
  const normalized = normalizeTermKey(term)
  return TERM_TRANSLATIONS[language]?.[normalized] || term
}

export function canonicalizeUrgency(urgency: string): 'critical' | 'high' | 'medium' | 'low' {
  const normalized = normalizeTermKey(urgency)

  if (normalized.includes('critical')) return 'critical'
  if (normalized.includes('high')) return 'high'
  if (normalized.includes('moderate') || normalized.includes('medium')) return 'medium'
  if (normalized.includes('low')) return 'low'

  return 'medium'
}

export function translateScenarioDimensionLabel(language: LanguageCode, key: string, fallback: string): string {
  return SCENARIO_DIMENSION_TRANSLATIONS[language]?.[key] || fallback
}

export function getPromptFootballTermGuidance(language: LanguageCode): string {
  if (language === 'en') {
    return 'Use natural English football language for prose and supporting labels.'
  }

  const dictionary = TERM_TRANSLATIONS[language]
  const sampleTerms = [
    'goalkeeper',
    'centre-back',
    'defensive midfielder',
    'pace',
    'pass accuracy',
    'positional awareness',
    'press resistance',
    'sweeper-keeper',
    'tactical fit',
    'squad fit',
  ]
    .map((term) => `${term} -> ${dictionary[term] || term}`)
    .join('; ')

  return [
    `Write all prose in ${getLanguageDisplayName(language)}.`,
    'Keep JSON keys, explicit enum values, tactical codes, slot ids, and any schema fields that must stay exact in canonical form.',
    'Whenever you mention football roles, position families, attributes, tactical labels, strengths, weaknesses, or recommendation reasons in free text, use the localized football vocabulary instead of raw English.',
    'For short user-facing labels such as role titles, profile names, tacticalRole, archetypeLabel, and keyStatsPriority items, output localized labels instead of English whenever a reliable localized form exists.',
    `Use localized football terms such as: ${sampleTerms}.`,
    'Keep unknown proper nouns in original spelling only when no reliable localized form is available.',
  ].join(' ')
}

export function getPromptGlossaryGuidance(language: LanguageCode): string {
  if (language === 'en') return 'No proper-name localization is required in English.'

  const entries = Object.entries(getMergedGlossary(language))
    .slice(0, 12)
    .map(([source, localized]) => `"${source}" -> "${localized}"`)

  if (entries.length === 0) {
    return 'If a proper noun has no reliable localized form, keep the original official spelling.'
  }

  return `Use the following proper-name glossary exactly when these names appear: ${entries.join('; ')}. If a proper noun has no reliable localized form, keep the original official spelling.`
}

export function buildLocalizedOutputGuidance(language: LanguageCode): string {
  return [
    getPromptFootballTermGuidance(language),
    getPromptGlossaryGuidance(language),
  ].join(' ')
}

function localizeString(
  value: string,
  language: LanguageCode,
  options?: LocalizeGeneratedContentOptions
): string {
  if (!value || language === 'en') return value

  let localized = value

  for (const [source, replacement] of Object.entries(getMergedGlossary(language, options?.glossary))) {
    localized = localized.replace(new RegExp(escapeRegExp(source), 'g'), replacement)
  }

  const dictionary = TERM_TRANSLATIONS[language] || {}
  for (const [canonical, replacement] of Object.entries(dictionary).sort((left, right) => right[0].length - left[0].length)) {
    localized = localized.replace(buildTermPattern(canonical), replacement)
  }

  for (const [source, replacement] of TRANSLITERATION_CORRECTIONS[language] || []) {
    localized = localized.replace(new RegExp(escapeRegExp(source), 'g'), replacement)
  }

  return localized
}

export function localizeGeneratedContent<T>(
  content: T,
  language: LanguageCode,
  options?: LocalizeGeneratedContentOptions
): T {
  if (content == null) return content

  if (typeof content === 'string') {
    return localizeString(content, language, options) as T
  }

  if (Array.isArray(content)) {
    return content.map((entry) => localizeGeneratedContent(entry, language, options)) as T
  }

  if (typeof content === 'object') {
    return Object.fromEntries(
      Object.entries(content).map(([key, value]) => [key, localizeGeneratedContent(value, language, options)])
    ) as T
  }

  return content
}

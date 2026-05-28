import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_LANGUAGE, type LanguageCode, translate } from './i18n'
import { ManagerProfile } from './managers'
import { formatPlayerStats } from './api-football'
import { normalizePersonName } from './person-names'
import type { TMPlayerData } from './transfermarkt'
import type { SquadPlayer } from './role-profiles'
import { buildLocalizedOutputGuidance } from './football-localization'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Replace Cyrillic Unicode lookalikes with their Latin equivalents.
// Claude occasionally outputs homoglyphs (е, о, а, etc.) that look identical but break names.
const CYRILLIC_MAP: Record<string, string> = {
  '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0443': 'y', '\u0445': 'x', '\u0410': 'A', '\u0412': 'B', '\u0415': 'E',
  '\u041A': 'K', '\u041C': 'M', '\u041D': 'H', '\u041E': 'O', '\u0420': 'P',
  '\u0421': 'C', '\u0422': 'T', '\u0425': 'X',
}
function sanitizeHomoglyphs(text: string): string {
  return text.replace(/[\u0400-\u04FF]/g, (ch) => CYRILLIC_MAP[ch] ?? ch)
}

// Robustly extract and parse JSON from Claude's response
function extractJSON(text: string, type: 'object' | 'array'): unknown {
  const open = type === 'object' ? '{' : '['
  const close = type === 'object' ? '}' : ']'

  const start = text.indexOf(open)
  if (start === -1) throw new Error(`No ${type} found in response`)

  // Walk forward tracking depth to find the matching close
  let depth = 0
  let end = -1
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++
    else if (text[i] === close) {
      depth--
      if (depth === 0) { end = i; break }
    }
  }

  // If response was truncated, try to close the JSON gracefully
  const raw = end !== -1 ? text.slice(start, end + 1) : text.slice(start)

  // Remove trailing commas before } or ] (common Claude mistake)
  const cleaned = raw
    .replace(/,\s*([}\]])/g, '$1')
    // If truncated, close open structures
    .replace(/,?\s*$/, '')

  // Attempt to close truncated structures
  const toClose = cleaned.split('').reduce((acc, ch) => {
    if (ch === '{') acc.push('}')
    else if (ch === '[') acc.push(']')
    else if (ch === '}' || ch === ']') acc.pop()
    return acc
  }, [] as string[])

  const repairedStr = cleaned + toClose.reverse().join('')

  return JSON.parse(repairedStr)
}

export interface SquadGap {
  position: string
  displayPosition?: string
  positionCode: string
  displayPositionCode?: string
  urgency: 'critical' | 'high' | 'medium' | 'low'
  needScore: number       // 0-100: composite transfer priority score
  profileLabel: string
  displayProfileLabel?: string
  reasoning: string
  keyStatsPriority: string[]
  displayKeyStatsPriority?: string[]
}

export interface PlayerRecommendation {
  playerId: number
  playerName: string
  age: number
  nationality: string
  currentTeam: string
  league: string
  photo: string
  tacticalFitScore: number // 1-10
  fitSummary: string
  strengths: string[]
  concerns: string[]
  whyThisPlayer: string
  stats: ReturnType<typeof formatPlayerStats>
}

export interface TransferTarget {
  playerName: string
  displayName?: string
  currentClub: string
  displayCurrentClub?: string
  nationality: string
  displayNationality?: string
  age: number
  position: string
  estimatedFee: string        // "€45-55M", "Free agent", "~€15M loan fee"
  contractUntil: string       // "2026", "2027", "Unknown"
  tacticalFitScore: number    // 1-10
  fitSummary: string          // one punchy sentence
  strengths: string[]
  concerns: string[]
  whyThisPlayer: string       // 2-3 sentences of scout reasoning
  availability: 'Likely available' | 'Possible' | 'Hard to get'
  tmVerified?: boolean        // true if Transfermarkt confirmed current club & contract
  transfermarktUrl?: string
}

export interface SquadAnalysisResult {
  managerName: string
  displayManagerName?: string
  teamName: string
  displayTeamName?: string
  overallAssessment: string
  tacticalFitScore: number // 1-10 — how well the current squad fits the manager
  gaps: SquadGap[]
  squadStrengths: string[]
  squadWeaknesses: string[]
  detailsStatus?: 'partial' | 'complete'
}

export type SquadAnalysisCoreResult = Omit<
  SquadAnalysisResult,
  'squadStrengths' | 'squadWeaknesses' | 'detailsStatus'
>

export interface SquadAnalysisDetailsResult {
  squadStrengths: string[]
  squadWeaknesses: string[]
}

export type FitLabel = 'Key Man' | 'Good Fit' | 'Rotation' | 'Poor Fit' | 'Sell Candidate'

export interface PlayerSystemFit {
  playerName: string
  displayName?: string
  position: string
  age: number
  fitScore: number   // 1-10
  fitLabel: FitLabel
  reason: string     // one scout sentence
  scoutScore: number      // 0-100 composite score
  valueLabel: 'Undervalued' | 'Fair Value' | 'Overpriced'
}

export interface LiveFormationContext {
  primaryFormation?: string | null
  recentFormations?: string[]
  formationSampleSize?: number
  formationSeason?: number | null
  referenceClub?: string | null
}

const FIT_LABELS = new Set<FitLabel>(['Key Man', 'Good Fit', 'Rotation', 'Poor Fit', 'Sell Candidate'])
const VALUE_LABELS = new Set<PlayerSystemFit['valueLabel']>(['Undervalued', 'Fair Value', 'Overpriced'])
const SQUAD_FIT_BATCH_SIZE = 20
const MIN_SQUAD_FIT_BATCH_SIZE = 6

export interface PlayerCompatibilityResult {
  playerName: string
  displayPlayerName?: string
  managerName: string
  displayManagerName?: string
  overallFitScore: number // 1-10
  verdict: string
  tacticalRole: string
  displayTacticalRole?: string
  strengths: string[]
  concerns: string[]
  conditions: string[] // conditions under which this works
  comparison: string // who they compare to in this system
  recommendation: 'Strong Yes' | 'Yes' | 'Conditional' | 'No' | 'Strong No'
  // Claude-derived player info (used when no API stats are available)
  currentClub?: string
  displayCurrentClub?: string
  age?: number
  nationality?: string
  displayNationality?: string
  position?: string
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function buildLiveFormationDisplay(context?: LiveFormationContext): string {
  if (!context?.primaryFormation) return 'Live recent shape unavailable'

  const clubNote = context.referenceClub ? ` with ${context.referenceClub}` : ''
  const seasonNote = context.formationSeason ? `, season ${context.formationSeason}` : ''
  const sampleNote = context.formationSampleSize
    ? ` (from ${context.formationSampleSize} recent lineup${context.formationSampleSize === 1 ? '' : 's'}${clubNote}${seasonNote})`
    : ''

  return `${context.primaryFormation}${sampleNote}`
}

function buildLiveFormationGuidance(context?: LiveFormationContext): string {
  if (!context?.primaryFormation) {
    return 'Live recent formation data is unavailable right now. Do not assume a hardcoded primary shape; stay shape-agnostic and lean on broader stylistic principles instead.'
  }

  const alternates = (context.recentFormations || [])
    .filter((shape) => shape && shape !== context.primaryFormation)
    .slice(0, 3)

  return alternates.length
    ? `Use ${context.primaryFormation} as the primary live shape reference. Secondary recent shapes: ${alternates.join(' / ')}.`
    : `Use ${context.primaryFormation} as the primary live shape reference.`
}

function buildCachedManagerSystemPrompt(managerSection: string) {
  return [
    {
      type: 'text' as const,
      text: managerSection,
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

function withOutputLanguage(prompt: string, language: LanguageCode): string {
  return `${prompt}\n\n## Output Language:\n${buildLocalizedOutputGuidance(language)}`
}

function requestUsesPromptCaching(params: Anthropic.MessageCreateParamsNonStreaming): boolean {
  return Array.isArray(params.system)
    && params.system.some((block) => typeof block === 'object' && block != null && 'cache_control' in block && Boolean(block.cache_control))
}

function stripPromptCachingFromSystem(system: Anthropic.MessageCreateParamsNonStreaming['system']) {
  if (!Array.isArray(system)) return system
  return system.map(({ cache_control: _cacheControl, ...block }) => block)
}

function shouldRetryWithoutPromptCaching(error: unknown): boolean {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status?: unknown }).status) : null
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
    ? error
    : ''
  const normalized = message.toLowerCase()

  return status === 400 && (
    normalized.includes('cache_control') ||
    normalized.includes('prompt caching') ||
    normalized.includes('prompt cache') ||
    normalized.includes('ephemeral') ||
    normalized.includes('not enabled') ||
    normalized.includes('unsupported')
  )
}

async function createMessageWithPromptCacheFallback(params: Anthropic.MessageCreateParamsNonStreaming) {
  try {
    return await anthropic.messages.create(params)
  } catch (error) {
    if (!requestUsesPromptCaching(params) || !shouldRetryWithoutPromptCaching(error)) {
      throw error
    }

    console.warn('Anthropic prompt caching unavailable, retrying without cache_control')
    return anthropic.messages.create({
      ...params,
      system: stripPromptCachingFromSystem(params.system),
    })
  }
}

async function createStructuredResponseWithEnglishFallback<T>({
  buildPrompt,
  system,
  language,
  expectedType,
  maxTokens,
  logLabel,
}: {
  buildPrompt: (language: LanguageCode) => string
  system: Anthropic.MessageCreateParamsNonStreaming['system']
  language: LanguageCode
  expectedType: 'object' | 'array'
  maxTokens: number
  logLabel: string
}): Promise<T> {
  const requestStructured = async (requestedLanguage: LanguageCode): Promise<T> => {
    const response = await createMessageWithPromptCacheFallback({
      model: 'claude-sonnet-4-6',
      system,
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: 'user', content: buildPrompt(requestedLanguage) }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    return extractJSON(sanitizeHomoglyphs(raw), expectedType) as T
  }

  try {
    return await requestStructured(language)
  } catch (error) {
    if (language === 'en') {
      throw error
    }

    console.warn(`${logLabel} parse failed for ${language}; retrying with English-safe structured prompt`, error)
    return requestStructured('en')
  }
}

function buildFallbackSystemFit(player: SquadPlayer, language: LanguageCode = DEFAULT_LANGUAGE): PlayerSystemFit {
  return {
    playerName: player.name,
    position: player.position,
    age: player.age,
    fitScore: 5,
    fitLabel: 'Rotation',
    reason: translate(language, 'fit.manualReviewReason', { player: player.name }),
    scoutScore: 50,
    valueLabel: 'Fair Value',
  }
}

function normalizeSystemFit(
  player: SquadPlayer,
  fit?: Partial<PlayerSystemFit>,
  language: LanguageCode = DEFAULT_LANGUAGE
): PlayerSystemFit {
  const fitScore = typeof fit?.fitScore === 'number' && fit.fitScore >= 1 && fit.fitScore <= 10
    ? fit.fitScore
    : 5
  const fitLabel = FIT_LABELS.has(fit?.fitLabel as FitLabel)
    ? fit!.fitLabel as FitLabel
    : fitScore >= 9
    ? 'Key Man'
    : fitScore >= 7
    ? 'Good Fit'
    : fitScore >= 5
    ? 'Rotation'
    : fitScore >= 3
    ? 'Poor Fit'
    : 'Sell Candidate'
  const scoutScore = typeof fit?.scoutScore === 'number'
    ? Math.max(0, Math.min(100, Math.round(fit.scoutScore)))
    : fitScore * 10
  const valueLabel = VALUE_LABELS.has(fit?.valueLabel as PlayerSystemFit['valueLabel'])
    ? fit!.valueLabel as PlayerSystemFit['valueLabel']
    : 'Fair Value'

  return {
    playerName: player.name,
    position: player.position,
    age: player.age,
    fitScore,
    fitLabel,
    reason: typeof fit?.reason === 'string' && fit.reason.trim()
      ? fit.reason.trim()
      : translate(language, 'fit.manualReviewReason', { player: player.name }),
    scoutScore,
    valueLabel,
  }
}

function systemFitPlayerKey(
  value: Pick<SquadPlayer, 'name' | 'position' | 'age'>
): string {
  return [
    normalizePersonName(value.name),
    normalizePersonName(value.position),
    String(value.age),
  ].join('|')
}

function mapSystemFitsByPlayer(
  parsed: Array<Partial<PlayerSystemFit>>
): Map<string, Partial<PlayerSystemFit>> {
  const mapped = new Map<string, Partial<PlayerSystemFit>>()

  for (const fit of parsed) {
    if (typeof fit?.playerName !== 'string' || typeof fit?.position !== 'string' || typeof fit?.age !== 'number') {
      continue
    }

    mapped.set(systemFitPlayerKey({
      name: fit.playerName,
      position: fit.position,
      age: fit.age,
    }), fit)
  }

  return mapped
}

function buildSquadFitPrompt(
  chunk: SquadPlayer[],
  chunkLabel: string,
  teamName: string,
  resolvedName: string,
  currentDate: string,
  language: LanguageCode
): string {
  const playerList = chunk
    .map((p, index) => `${index + 1}. ${p.name} (${p.position}, Age ${p.age}, ${p.nationality})`)
    .join('\n')

  return withOutputLanguage(`You are an elite football scout. Rate every player at ${teamName} for how well they fit ${resolvedName}'s specific tactical system. Today is ${currentDate}.

## Squad batch ${chunkLabel} at ${teamName}:
${playerList}

For EVERY player listed, assess:
- fitScore (1-10): how well they suit this specific system and playing style
- fitLabel: exactly one of the five labels below
- reason: ONE short sentence, maximum 18 words, citing a specific tactical reason

fitLabel rules:
- "Key Man" (9-10): indispensable to this system, would be a major loss
- "Good Fit" (7-8): suits the system well, regular starter profile
- "Rotation" (5-6): fits adequately but not the ideal profile, squad depth role
- "Poor Fit" (3-4): doesn't suit the system's demands, limited usefulness
- "Sell Candidate" (1-2): actively misaligned — wrong profile, wasted wages, or blocking development

Be honest — not every team has 11 Key Men. Reference the tactical system specifically.

scoutScore (0-100) is a composite score computed as:
  - System fit (40 pts max): fitScore × 4
  - Value efficiency (40 pts max): quality relative to likely market value
  - Versatility (20 pts max): how many roles can this player credibly fill in this system?

valueLabel rules:
- "Undervalued": market value is clearly below their output and tactical importance
- "Overpriced": market value is clearly above their contribution
- "Fair Value": everything else

Return JSON array, one object per player, in the same order as the input:
[
  {
    "playerName": "Exact name from input",
    "position": "Their position",
    "age": 24,
    "fitScore": 8,
    "fitLabel": "Good Fit",
    "reason": "One short tactical sentence",
    "scoutScore": 74,
    "valueLabel": "Fair Value"
  }
]

No other text. Cover every player.
Do not rename players. Copy playerName, position, and age exactly from the input list.`, language)
}

async function analyzeSquadSystemFitChunk(
  chunk: SquadPlayer[],
  managerSection: string,
  teamName: string,
  resolvedName: string,
  currentDate: string,
  chunkLabel: string,
  language: LanguageCode
): Promise<PlayerSystemFit[]> {
  const maxTokens = Math.min(2400, Math.max(1100, 320 + chunk.length * 95))
  const parsed = await createStructuredResponseWithEnglishFallback<Array<Partial<PlayerSystemFit>>>({
    buildPrompt: (requestedLanguage) =>
      buildSquadFitPrompt(chunk, chunkLabel, teamName, resolvedName, currentDate, requestedLanguage),
    system: buildCachedManagerSystemPrompt(managerSection),
    language,
    expectedType: 'array',
    maxTokens,
    logLabel: `Squad fit chunk ${chunkLabel} (${teamName})`,
  })
  const parsedByPlayer = mapSystemFitsByPlayer(parsed)
  const matchedCount = chunk.reduce((count, player) => (
    parsedByPlayer.has(systemFitPlayerKey(player)) ? count + 1 : count
  ), 0)
  const minimumCoverage = Math.max(chunk.length - 1, Math.ceil(chunk.length * 0.8))

  if (matchedCount < minimumCoverage) {
    throw new Error(`Squad fit response coverage too low for ${teamName}: matched ${matchedCount}/${chunk.length}`)
  }

  return chunk.map((player, index) => {
    const byIdentity = parsedByPlayer.get(systemFitPlayerKey(player))
    const byIndex = parsed[index]
    return normalizeSystemFit(player, byIdentity ?? byIndex, language)
  })
}

async function analyzeSquadSystemFitChunkWithRetry(
  chunk: SquadPlayer[],
  managerSection: string,
  teamName: string,
  resolvedName: string,
  currentDate: string,
  chunkLabel: string,
  language: LanguageCode
): Promise<PlayerSystemFit[]> {
  try {
    return await analyzeSquadSystemFitChunk(
      chunk,
      managerSection,
      teamName,
      resolvedName,
      currentDate,
      chunkLabel,
      language
    )
  } catch (error) {
    if (chunk.length <= MIN_SQUAD_FIT_BATCH_SIZE) {
      console.error(`Squad fit chunk ${chunkLabel} failed for ${teamName}:`, error)
      return chunk.map((player) => buildFallbackSystemFit(player, language))
    }

    const midpoint = Math.ceil(chunk.length / 2)
    const leftChunk = chunk.slice(0, midpoint)
    const rightChunk = chunk.slice(midpoint)

    console.warn(
      `Squad fit chunk ${chunkLabel} failed for ${teamName}; retrying in smaller batches (${leftChunk.length}/${rightChunk.length})`
    )

    const [leftFits, rightFits] = await Promise.all([
      analyzeSquadSystemFitChunkWithRetry(
        leftChunk,
        managerSection,
        teamName,
        resolvedName,
        currentDate,
        `${chunkLabel}a`,
        language
      ),
      analyzeSquadSystemFitChunkWithRetry(
        rightChunk,
        managerSection,
        teamName,
        resolvedName,
        currentDate,
        `${chunkLabel}b`,
        language
      ),
    ])

    return [...leftFits, ...rightFits]
  }
}

/** Quick Claude call to identify players whose real tactical role differs from their registered position */
async function enrichSquadTacticalRoles(
  players: ReturnType<typeof formatPlayerStats>[],
  teamName: string
): Promise<Map<string, string>> {
  const playerList = players
    .filter(Boolean)
    .slice(0, 30)
    .map((p) => `- ${p!.name} (registered: ${p!.position}, Age ${p!.age}, ${p!.nationality})`)
    .join('\n')

  const prompt = `You are a football tactical analyst. Some players are registered at one position but regularly play a different role in practice.

Squad at ${teamName}:
${playerList}

Return a JSON array of ONLY players whose real tactical role meaningfully differs from their registered position — e.g. a CB who regularly starts at left-back, a RB used as an inverted winger, a CM deployed as a #6 or #10. Skip players whose registered position accurately describes their role.

[
  {
    "name": "Exact name as listed",
    "tacticalNote": "Short factual note, e.g. 'Regularly plays left-back despite CB registration — did so at Bayer Leverkusen and for Ecuador'"
  }
]

Return [] if no players have a meaningfully different real role. No other text.`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text : ''
    const profiles = extractJSON(text, 'array') as { name: string; tacticalNote: string }[]
    return new Map(profiles.map((p) => [p.name, p.tacticalNote]))
  } catch {
    return new Map()
  }
}

// Analyze a squad against a manager's tactical profile
// manager can be null — Claude will infer the profile from managerName using its own knowledge
export interface MinimalSquadPlayer {
  name: string; position: string; age: number; nationality: string;
  appearances: number; goals: number; assists: number; minutes: number;
  rating: string; tackles?: number; interceptions?: number;
}

interface SquadAnalysisPromptContext {
  resolvedName: string
  managerSection: string
  squadSection: string
}

function buildSquadAnalysisPromptContext(
  manager: ManagerProfile | null,
  squadPlayers: (MinimalSquadPlayer | null)[],
  teamName: string,
  managerName?: string,
  unavailablePlayers?: { name: string; position: string }[],
  allowManagerInference = true,
  liveFormationContext?: LiveFormationContext,
): SquadAnalysisPromptContext {
  const resolvedName = manager?.name || managerName || 'Unknown Manager'
  const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const hasStats = squadPlayers.some(
    (p) => p && (p.appearances > 0 || p.goals > 0 || parseFloat(p.rating || '0') > 0)
  )
  const hasFullStats = squadPlayers.some((p) => p && p.appearances > 0)

  const sortedPlayers = [...squadPlayers.filter(Boolean)].sort((a, b) => {
    const minsDiff = (b?.minutes ?? 0) - (a?.minutes ?? 0)
    if (minsDiff !== 0) return minsDiff
    return parseFloat(b?.rating ?? '0') - parseFloat(a?.rating ?? '0')
  })

  const squadSummary = sortedPlayers
    .map((p) => {
      if (hasFullStats) {
        return `- ${p!.name} (${p!.position}, Age ${p!.age}, ${p!.nationality}) | G:${p!.goals} A:${p!.assists} Rtg:${p!.rating} Apps:${p!.appearances} Mins:${p!.minutes} Tkl:${p!.tackles} Int:${p!.interceptions}`
      }
      if (hasStats) {
        const rtg = parseFloat(p!.rating || '0')
        const rtgStr = rtg > 0 ? ` Rtg:${p!.rating}` : ''
        const goalsStr = p!.goals > 0 ? ` G:${p!.goals}` : ''
        const assistsStr = p!.assists > 0 ? ` A:${p!.assists}` : ''
        return `- ${p!.name} (${p!.position}, Age ${p!.age}, ${p!.nationality})${rtgStr}${goalsStr}${assistsStr}`
      }
      return `- ${p!.name} (${p!.position}, Age ${p!.age}, ${p!.nationality})`
    })
    .join('\n')

  const managerSection = manager
    ? `## Manager: ${manager.name}
**System**: ${buildLiveFormationDisplay(liveFormationContext)} | **Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} line, ${manager.style.buildUp} build-up
**Summary**: ${manager.tacticalSummary}
**Live Formation Guidance**: ${buildLiveFormationGuidance(liveFormationContext)}

**Key Principles**:
${manager.keyPrinciples.map((p) => `- ${p}`).join('\n')}

## Positional Requirements:
${manager.positionalRequirements
  .map(
    (req) =>
      `**${req.position} (${req.profileLabel})**: ${req.tacticalDescription}\nMust Have: ${req.mustHave.join(', ')}\nAvoid If: ${req.avoidIf.join(', ')}`
  )
  .join('\n\n')}`
    : `## Manager: ${
      resolvedName === 'Unknown Manager'
        ? allowManagerInference
          ? teamName + ' Head Coach'
          : 'Manager unavailable'
        : resolvedName
    }
${
  resolvedName === 'Unknown Manager'
    ? allowManagerInference
      ? `Identify who currently manages ${teamName} as of ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} and use your knowledge of their tactical system for this analysis.`
      : `Live coach data is unavailable from our providers for ${teamName}. Do NOT guess or identify a current manager. Instead, analyze the squad generically and focus on structural weaknesses, squad balance, age risk, and role coverage that would matter across most modern top-level systems.`
    : `Use your knowledge of ${resolvedName}'s tactical system as of today (${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}). ${buildLiveFormationGuidance(liveFormationContext)} Apply their known tactical profile to analyze the squad below.`
}`

  const squadSection = `## Current Squad at ${teamName} (as of ${currentDate}):
${squadSummary || `No squad data is available from our providers. Use your own knowledge of ${teamName}'s current roster (as of ${currentDate}) to perform this analysis. Apply the same JSON format — infer the squad composition, identify positional gaps, and assess tactical fit based on your training knowledge.`}
${squadSummary && (!hasStats ? '\n*Note: Per-match stats are not available. Use your knowledge of these players to assess their quality and tactical profile — but treat the squad list above as the authoritative current roster. Do NOT flag a positional gap if a player already listed in the squad can credibly fill that role.*' : !hasFullStats ? '\n*Note: Season appearance/minute data is not available, but FotMob ratings, goals, and assists are shown where non-zero. Use these plus your knowledge of each player to judge quality and recent form. The squad list and position data are authoritative.*' : '')}
${unavailablePlayers?.length ? `\n## UNAVAILABLE PLAYERS (Injured / Suspended):\nThe following players are confirmed UNAVAILABLE and have been intentionally excluded from the squad list above. Treat each of their positions as a genuine gap requiring cover — do NOT assume the team has working depth at these positions:\n${unavailablePlayers.map((p) => `- ${p.name} (${p.position})`).join('\n')}\nThis is not a data error. These are real absences. If all available cover at a position is now gone, flag it as a critical gap.` : ''}`

  return {
    resolvedName,
    managerSection,
    squadSection,
  }
}

export async function analyzeSquadGapsCore(
  manager: ManagerProfile | null,
  squadPlayers: (MinimalSquadPlayer | null)[],
  teamName: string,
  managerName?: string,
  unavailablePlayers?: { name: string; position: string }[],
  allowManagerInference = true,
  liveFormationContext?: LiveFormationContext,
  language: LanguageCode = DEFAULT_LANGUAGE,
): Promise<SquadAnalysisCoreResult> {
  const { resolvedName, managerSection, squadSection } = buildSquadAnalysisPromptContext(
    manager,
    squadPlayers,
    teamName,
    managerName,
    unavailablePlayers,
    allowManagerInference,
    liveFormationContext
  )

  const prompt = withOutputLanguage(`You are an elite football scout and tactical analyst. Produce the FAST first-pass squad verdict for this manager-team fit.

${squadSection}

## Your Task:
Return only the most important first-pass tactical verdict:
1. Overall tactical fit score (1-10)
2. A concise two-sentence assessment
3. The most urgent tactical gaps or profile mismatches

IMPORTANT: The squad list above is the authoritative source of truth. If your prior knowledge conflicts with the dataset, always trust the dataset.

For positional coverage, treat registered positions as starting points only. Use your knowledge of modern tactical roles and each player's career-wide versatility. Do not call a position a gap if a listed player can credibly cover it. Before flagging a sided role such as LB, RB, LWB, RWB, LW, or RW, explicitly check whether a listed player already matches that side and discuss them by name.

Respond in this exact JSON format:
{
  "managerName": "Full Name of the current manager, or 'Manager unavailable' if live coach data is unavailable",
  "overallAssessment": "Exactly 2 concise sentences",
  "tacticalFitScore": 7,
  "gaps": [
    {
      "position": "Center Back",
      "positionCode": "Defender",
      "urgency": "critical",
      "needScore": 82,
      "profileLabel": "Pace-First Ball-Playing CB",
      "reasoning": "One concise sentence explaining why this is a gap.",
      "keyStatsPriority": ["pace", "pass_accuracy", "interceptions"]
    }
  ]
}

needScore (0-100) is a composite transfer priority score:
  starter_weakness (0-30)
  + depth_weakness (0-20)
  + age_risk (0-20)
  + tactical_mismatch (0-20)
  - hybrid_coverage (0-30)

Rules:
- Return a maximum of 4 gaps, sorted by needScore descending
- Keep overallAssessment to exactly 2 sentences and 48 words max
- Keep each gap reasoning to 1 sentence and 55 words max
- Keep keyStatsPriority to at most 4 items
- Prefer the highest-signal issues first
- Keep "position" and "positionCode" in standard English football terms`, language)

  const response = await createMessageWithPromptCacheFallback({
    model: 'claude-sonnet-4-6',
    system: buildCachedManagerSystemPrompt(managerSection),
    max_tokens: 1600,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const analysis = extractJSON(text, 'object') as SquadAnalysisCoreResult

  const finalManagerName =
    resolvedName !== 'Unknown Manager'
      ? resolvedName
      : allowManagerInference
      ? (analysis as { managerName?: string }).managerName || 'Unknown Manager'
      : 'Manager unavailable'

  return {
    ...analysis,
    managerName: finalManagerName,
    teamName,
  }
}

export async function analyzeSquadGapDetails(
  coreAnalysis: SquadAnalysisCoreResult,
  manager: ManagerProfile | null,
  squadPlayers: (MinimalSquadPlayer | null)[],
  teamName: string,
  managerName?: string,
  unavailablePlayers?: { name: string; position: string }[],
  allowManagerInference = true,
  liveFormationContext?: LiveFormationContext,
  language: LanguageCode = DEFAULT_LANGUAGE,
): Promise<SquadAnalysisDetailsResult> {
  const { managerSection, squadSection } = buildSquadAnalysisPromptContext(
    manager,
    squadPlayers,
    teamName,
    managerName,
    unavailablePlayers,
    allowManagerInference,
    liveFormationContext
  )

  const prompt = withOutputLanguage(`You are extending an existing squad analysis with ONLY the supporting detail bullets.

${squadSection}

## Locked Core Analysis:
${JSON.stringify(coreAnalysis, null, 2)}

Use the locked core analysis above as authoritative. Do not change the manager name, fit score, or listed gaps. Only add supporting bullet-point strengths and weaknesses for the available squad.

Respond in this exact JSON format:
{
  "squadStrengths": ["strength 1", "strength 2", "strength 3"],
  "squadWeaknesses": ["weakness 1", "weakness 2", "weakness 3"]
}

Rules:
- Return exactly 3 strengths and 3 weaknesses
- Each bullet must be 22 words max
- Keep them specific to the system and current available squad
- Do not repeat the gap reasoning word-for-word
- No extra text`, language)

  const response = await createMessageWithPromptCacheFallback({
    model: 'claude-sonnet-4-6',
    system: buildCachedManagerSystemPrompt(managerSection),
    max_tokens: 900,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return extractJSON(text, 'object') as SquadAnalysisDetailsResult
}

export async function analyzeSquadGaps(
  manager: ManagerProfile | null,
  squadPlayers: (MinimalSquadPlayer | null)[],
  teamName: string,
  managerName?: string,
  unavailablePlayers?: { name: string; position: string }[],
  allowManagerInference = true,
  liveFormationContext?: LiveFormationContext,
  language: LanguageCode = DEFAULT_LANGUAGE,
): Promise<SquadAnalysisResult> {
  const core = await analyzeSquadGapsCore(
    manager,
    squadPlayers,
    teamName,
    managerName,
    unavailablePlayers,
    allowManagerInference,
    liveFormationContext,
    language
  )
  const details = await analyzeSquadGapDetails(
    core,
    manager,
    squadPlayers,
    teamName,
    managerName,
    unavailablePlayers,
    allowManagerInference,
    liveFormationContext,
    language
  )

  return {
    ...core,
    ...details,
    detailsStatus: 'complete',
  }
}

// Rank and explain player recommendations for a specific gap
// manager can be null — Claude will use its own knowledge of managerName
export async function rankPlayersForGap(
  gap: SquadGap,
  manager: ManagerProfile | null,
  candidatePlayers: ReturnType<typeof formatPlayerStats>[],
  teamName: string,
  managerName?: string,
  liveFormationContext?: LiveFormationContext
): Promise<PlayerRecommendation[]> {
  if (!candidatePlayers.length) return []

  const resolvedName = manager?.name || managerName || 'the manager'
  const managerReq = manager?.positionalRequirements.find(
    (r) => r.positionCode === gap.positionCode
  )

  const playersData = candidatePlayers
    .filter(Boolean)
    .slice(0, 12)
    .map(
      (p) =>
        `ID:${p!.playerId} | ${p!.name} (Age ${p!.age}, ${p!.nationality}) | Team: ${p!.currentTeam} | Goals: ${p!.goals}, Assists: ${p!.assists}, Rating: ${p!.rating}, Apps: ${p!.appearances}, Tackles: ${p!.tackles}, Interceptions: ${p!.interceptions}, Duel Win%: ${p!.duelWinRate}%, Dribble Success%: ${p!.dribbleSuccess}%, Pass Acc: ${p!.passAccuracy}%, Key Passes: ${p!.keyPasses}`
    )
    .join('\n')

  const managerSection = manager
    ? `## Manager: ${manager.name}
**System**: ${buildLiveFormationDisplay(liveFormationContext)} | **Pressing**: ${manager.style.pressing} | **Defensive Line**: ${manager.style.defensiveLine}
**Live Formation Guidance**: ${buildLiveFormationGuidance(liveFormationContext)}`
    : `## Manager: ${resolvedName}
Use your knowledge of ${resolvedName}'s tactical system and what this manager demands from players in this position. ${buildLiveFormationGuidance(liveFormationContext)}`

  const prompt = `You are an elite football scout. Rank these players for the specific tactical need.

${managerSection}

## Gap Identified at ${teamName}:
**Position**: ${gap.position}
**Profile Needed**: ${gap.profileLabel}
**Urgency**: ${gap.urgency}
**Reasoning**: ${gap.reasoning}

${managerReq ? `**Must Have**: ${managerReq.mustHave.join(', ')}\n**Avoid If**: ${managerReq.avoidIf.join(', ')}` : ''}

## Candidate Players:
${playersData}

## Task:
Pick the TOP 5 most tactically suitable players from this list for this specific role in this system.

Respond in this exact JSON format (array of up to 5 players):
[
  {
    "playerId": 123,
    "playerName": "Player Name",
    "tacticalFitScore": 8,
    "fitSummary": "One sentence explaining why this player fits",
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "concerns": ["concern 1"],
    "whyThisPlayer": "2-3 sentences of scout-level analysis of why this player specifically suits this manager and this gap"
  }
]

Be analytical. Reference specific stats. Think like a scout who watches every game.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const ranked = extractJSON(text, 'array') as Omit<PlayerRecommendation, 'age' | 'nationality' | 'currentTeam' | 'league' | 'photo' | 'stats'>[]

  return ranked.map((r) => {
    const fullPlayer = candidatePlayers.find((p) => p?.playerId === r.playerId)
    return {
      ...r,
      age: fullPlayer?.age || 0,
      nationality: fullPlayer?.nationality || '',
      currentTeam: fullPlayer?.currentTeam || '',
      league: fullPlayer?.league || '',
      photo: fullPlayer?.photo || '',
      stats: fullPlayer || null,
    }
  }).filter((r) => r.currentTeam) as PlayerRecommendation[]
}

// Analyze player compatibility with a manager
// manager can be null — Claude uses its own knowledge of managerName
// tmPlayer is live Transfermarkt data; when null, Claude uses its own knowledge of the player
export async function analyzePlayerCompatibility(
  playerName: string,
  tmPlayer: TMPlayerData | null,
  manager: ManagerProfile | null,
  targetTeam?: string,
  managerName?: string,
  liveFormationContext?: LiveFormationContext,
  language: LanguageCode = DEFAULT_LANGUAGE,
): Promise<PlayerCompatibilityResult> {
  const resolvedManagerName = manager?.name || managerName || 'Unknown Manager'

  const managerSection = manager
    ? `## Manager: ${manager.name}
**System**: ${buildLiveFormationDisplay(liveFormationContext)}
**Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} defensive line, ${manager.style.buildUp} build-up, ${manager.style.attackingMentality} attacking mentality
**Summary**: ${manager.tacticalSummary}
**Live Formation Guidance**: ${buildLiveFormationGuidance(liveFormationContext)}

**Key Principles**:
${manager.keyPrinciples.map((p) => `- ${p}`).join('\n')}

**Positional Requirements**:
${manager.positionalRequirements.map((req) => `**${req.position}** (${req.profileLabel}): Must Have: ${req.mustHave.join(', ')} | Avoid If: ${req.avoidIf.join(', ')}`).join('\n')}`
    : `## Manager: ${resolvedManagerName}
Use your extensive knowledge of ${resolvedManagerName}'s tactical system — their pressing intensity, defensive line, build-up style, and what they demand from players in each position. ${buildLiveFormationGuidance(liveFormationContext)}`

  const playerSection = tmPlayer
    ? `## Player: ${tmPlayer.name}
**Position**: ${tmPlayer.position}
**Current Club**: ${tmPlayer.currentClub}
**Age**: ${tmPlayer.age} | **Nationality**: ${tmPlayer.nationality}
**Market Value**: ${tmPlayer.marketValueFormatted} | **Contract until**: ${tmPlayer.contractYear}
**25/26 Season Stats**: Goals: ${tmPlayer.goals}, Assists: ${tmPlayer.assists}, Appearances: ${tmPlayer.appearances}, Minutes: ${tmPlayer.minutesPlayed}, Yellow Cards: ${tmPlayer.yellowCards}`
    : `## Player: ${playerName}
Use your knowledge of this player — their current club, position, age, nationality, playing style, strengths, and typical stats. Today's date is ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}, so use the most current information you have about their club and situation.`

  const prompt = withOutputLanguage(`You are an elite football scout and tactical analyst. Assess whether this player would be a good signing for a team managed by ${resolvedManagerName}.

${playerSection}

${targetTeam ? `**Target Club**: ${targetTeam}` : ''}

## Task:
Give a detailed scout report on whether ${playerName} would be a good tactical fit for ${resolvedManagerName}'s system.

Respond in this exact JSON format:
{
  "currentClub": "Player's current club",
  "age": 26,
  "nationality": "Country",
  "position": "Exact position",
  "overallFitScore": 7,
  "verdict": "One punchy sentence summarizing the fit",
  "tacticalRole": "What exact role would this player play in the manager's system",
  "strengths": ["Why this player fits - specific to this system, up to 4 points"],
  "concerns": ["Potential issues in this system, up to 3 points"],
  "conditions": ["Conditions under which this works"],
  "comparison": "Who does this player compare to in this manager's previous squads or ideal profile",
  "recommendation": "Strong Yes"
}

Recommendation options: "Strong Yes", "Yes", "Conditional", "No", "Strong No"
Be honest, specific, and analytical.`, language)

  const response = await createMessageWithPromptCacheFallback({
    model: 'claude-sonnet-4-6',
    system: buildCachedManagerSystemPrompt(managerSection),
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const result = extractJSON(text, 'object') as Omit<PlayerCompatibilityResult, 'playerName' | 'managerName'>

  return {
    playerName,
    managerName: resolvedManagerName,
    ...result,
  }
}

// Rate every squad player's fit with the manager's system
export async function analyzeSquadSystemFit(
  squad: SquadPlayer[],
  manager: ManagerProfile | null,
  teamName: string,
  managerName?: string,
  liveFormationContext?: LiveFormationContext,
  language: LanguageCode = DEFAULT_LANGUAGE,
): Promise<PlayerSystemFit[]> {
  if (!squad.length) return []

  const resolvedName = manager?.name || managerName || 'the manager'
  const compactRolePriorities = manager
    ? manager.positionalRequirements
        .slice(0, 6)
        .map((requirement) => `${requirement.position}: ${requirement.mustHave.slice(0, 2).join(', ')}`)
        .join('; ')
    : ''

  const managerSection = manager
    ? `**System**: ${buildLiveFormationDisplay(liveFormationContext)} | **Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} line, ${manager.style.buildUp} build-up
**Summary**: ${manager.tacticalSummary}
**Live Formation Guidance**: ${buildLiveFormationGuidance(liveFormationContext)}
**Key Principles**: ${manager.keyPrinciples.slice(0, 4).join('; ')}
**Core Role Priorities**: ${compactRolePriorities}`
    : `Use your knowledge of ${resolvedName}'s tactical system — pressing intensity, build-up style, and what he demands from players in each role. ${buildLiveFormationGuidance(liveFormationContext)}`

  const currentDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const squadChunks = chunkArray(squad, SQUAD_FIT_BATCH_SIZE)

  const results = await Promise.all(
    squadChunks.map((chunk, chunkIndex) =>
      analyzeSquadSystemFitChunkWithRetry(
        chunk,
        managerSection,
        teamName,
        resolvedName,
        currentDate,
        `${chunkIndex + 1}/${squadChunks.length}`,
        language
      )
    )
  )

  return results.flat()
}

// Recommend specific real transfer targets for a tactical gap within a budget
// Entirely Claude-knowledge-driven — no API needed, knows market values + contract situations
export async function recommendPlayersForGap(
  gap: SquadGap,
  manager: ManagerProfile | null,
  teamName: string,
  budget: string,
  managerName?: string,
  roleCoverageContext?: string,
  nationalTeamCountry?: string,
  liveFormationContext?: LiveFormationContext,
  language: LanguageCode = DEFAULT_LANGUAGE,
): Promise<TransferTarget[]> {
  const resolvedName = manager?.name || managerName || 'the manager'

  const managerSection = manager
    ? `**System**: ${buildLiveFormationDisplay(liveFormationContext)} | **Pressing**: ${manager.style.pressing} | **Build-up**: ${manager.style.buildUp}
**Live Formation Guidance**: ${buildLiveFormationGuidance(liveFormationContext)}
**Key principles**: ${manager.keyPrinciples.slice(0, 3).join('; ')}`
    : `Use your knowledge of ${resolvedName}'s tactical system and what he demands from players. ${buildLiveFormationGuidance(liveFormationContext)}`

  const currentDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const prompt = withOutputLanguage(`You are an elite football scout and transfer market expert. Today is ${currentDate}. Recommend up to 4 specific real players for ${teamName} to fill this tactical gap within the stated budget. Use the most current club affiliations, contract situations, and market values you know.

## Manager: ${resolvedName}

## Tactical Gap:
**Position**: ${gap.position}
**Profile needed**: ${gap.profileLabel}
**Urgency**: ${gap.urgency} | **Need Score**: ${gap.needScore}/100
**Why it's a gap**: ${gap.reasoning}
${roleCoverageContext ? `**Current squad coverage**: ${roleCoverageContext}` : ''}

## Budget: ${budget}

${nationalTeamCountry ? `## NATIONAL TEAM ELIGIBILITY — CRITICAL:
${teamName} is a national team. Every recommended player MUST hold ${nationalTeamCountry} nationality and be eligible to represent ${teamName}. Recommending a player who cannot legally play for this country is a disqualifying error. No exceptions.\n` : ''}## Your Task:
Name 2 to 4 real professional players who:
1. Fit the tactical profile for ${resolvedName}'s system
2. Are realistically gettable within this budget (consider transfer fee, wages, club situation)
3. Would be a credible signing for ${teamName}${nationalTeamCountry ? `\n4. Hold ${nationalTeamCountry} nationality and are eligible for ${teamName}` : ''}

Quality bar:
- It is better to return 2 or 3 genuinely strong, system-true options than 4 padded names.
- Do NOT include a player just because they are cheap or available if their primary tactical identity clashes with the role.
- Avoid “stretch” options who would need a position change or major tactical accommodation unless they are already proven in a closely related role.

Use your knowledge of player market values, contract situations, and playing styles. Treat the selected budget as a hard ceiling, not a vague tier. If your best estimate puts a player outside the stated bracket, skip them and choose someone else. Rank by tactical fit.

IMPORTANT — accuracy rules:
- Only recommend currently ACTIVE professional players. Never recommend retired players.
- Only name players whose current club you are highly confident about. If a player recently moved to a new league (MLS, Saudi Pro League, Chinese Super League, etc.) or you're uncertain about their club as of ${currentDate}, skip them and choose someone else.
- For players currently on loan: use their CURRENT LOAN DESTINATION as the club (e.g. "Union Saint-Gilloise" not "Brighton" for a player on loan there). Never list a parent club if the player is actually playing elsewhere on loan.
- Pay close attention to loan-to-permanent transfers: if a player was on loan at one club during 2024/25 but completed a permanent transfer to a different club for the 2025/26 season, list their CURRENT permanent club (e.g. a goalkeeper who was on loan at Valencia but permanently joined Liverpool for 2025/26 should be listed as Liverpool, not Valencia).
- Do NOT confuse players with similar names. If recommending a goalkeeper or defender, double-check their career history — do not list a club they never played for.
- Use only standard Latin characters in names. No special Unicode or lookalike characters.

Respond in this exact JSON format (be concise, no extra text):
[
  {
    "playerName": "Full Name",
    "currentClub": "Club Name",
    "nationality": "Country",
    "age": 24,
    "position": "Right Back",
    "estimatedFee": "€35-45M",
    "contractUntil": "2027",
    "tacticalFitScore": 8,
    "fitSummary": "2 sentences max: why this player fits this system and addresses this gap",
    "strengths": ["strength 1", "strength 2"],
    "concerns": ["concern 1"],
    "availability": "Likely available"
  }
]

Availability options: "Likely available" | "Possible" | "Hard to get"
Fee format: "Free agent" if out of contract, "Loan" for loan-only, "€XM" or "€X-YM" range for transfers.`, language)

  const response = await createMessageWithPromptCacheFallback({
    model: 'claude-sonnet-4-6',
    system: buildCachedManagerSystemPrompt(managerSection),
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  return extractJSON(sanitizeHomoglyphs(raw), 'array') as TransferTarget[]
}

// ── Undervalued XI ────────────────────────────────────────────────────────────

export interface UndervaluedPlayer {
  playerName: string
  displayName?: string
  position: string           // "GK", "CB", "LB", "RB", "CM", "CAM", "CDM", "LW", "RW", "ST", "CF"
  archetypeLabel: string     // e.g. "Ball-Playing GK", "Inverted Winger", "Press-Resistant #6"
  displayArchetypeLabel?: string
  age: number
  nationality: string
  displayNationality?: string
  currentClub: string
  displayCurrentClub?: string
  estimatedValue: string     // "€12M", "€8M", "Free agent"
  contractUntil: string      // "2025", "2026", "Unknown"
  whyUndervalued: string     // 2 sentences: why they're a bargain + what they bring tactically
  scoutScore: number         // 0-100
  tmVerified?: boolean
  transfermarktUrl?: string
}

export interface UndervaluedXIResult {
  formation: string          // e.g. "4-3-3"
  players: UndervaluedPlayer[]  // exactly 11
  concept: string            // 1-2 sentence overview of this XI's identity
  totalEstimatedCost: string // e.g. "≈€87M"
  budgetStatus?: 'within' | 'over'
  budgetOverrun?: string
}

export interface UndervaluedSlotCandidate {
  playerName: string
  age: number
  currentClub: string
  estimatedValue: string
  scoutScore: number
}

export interface UndervaluedXISlot {
  slotId: string
  position: string
  archetypeLabel: string
  candidates: UndervaluedSlotCandidate[]
}

export interface UndervaluedXICandidatePool {
  formation: string
  concept: string
  slots: UndervaluedXISlot[]
}

export async function generateUndervaluedXI(
  budget: string,
  manager: ManagerProfile | null,
  managerName?: string,
  teamName?: string,
  extraBudgetInstructions?: string,
  liveFormationContext?: LiveFormationContext,
  language: LanguageCode = DEFAULT_LANGUAGE,
): Promise<UndervaluedXIResult> {
  const resolvedName = manager?.name || managerName || 'a modern pressing manager'
  const currentDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const managerSection = manager
    ? `**System**: ${buildLiveFormationDisplay(liveFormationContext)} | **Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} line, ${manager.style.buildUp} build-up
**Live Formation Guidance**: ${buildLiveFormationGuidance(liveFormationContext)}
**Key principles**: ${manager.keyPrinciples.slice(0, 3).join('; ')}`
    : `Use your knowledge of ${resolvedName}'s preferred tactical system. ${buildLiveFormationGuidance(liveFormationContext)}`

  const buildPrompt = (requestedLanguage: LanguageCode) => withOutputLanguage(`You are an elite football scout specialising in undervalued talent. Today is ${currentDate}. Build the best possible XI of UNDERVALUED players that fits ${resolvedName}'s tactical system within the stated budget.

## Manager: ${resolvedName}
${managerSection}
${teamName ? `\n## Buying Club: ${teamName}` : ''}

## Total Budget: ${budget}

## Rules:
1. Pick exactly 11 players (a complete starting XI) in a formation that suits ${resolvedName}'s system
2. Every player must be ACTIVELY playing professional football right now
3. "Undervalued" means: their quality, output, and tactical fit significantly exceed their market value or contract situation. Think: players in smaller leagues punching above their weight, players with expiring contracts whose value has dropped, unfashionable clubs hiding elite talent, or young players who haven't yet attracted big-club attention.
4. Total estimated transfer cost (fees + free agents) must fit within ${budget}
5. Spread across leagues — don't pick 11 players from the same league
6. Use only standard Latin characters in names. Be confident about current clubs.
${extraBudgetInstructions ? `\n## HARD BUDGET GUARDRAIL:\n${extraBudgetInstructions}` : ''}

## ACCURACY RULES (critical):
- Only recommend currently ACTIVE professional players
- Only name players whose current club you are highly confident about as of ${currentDate}
- For players on loan: use their CURRENT loan destination as the club
- Do NOT confuse players with similar names
- If unsure about a player's club, skip them and pick someone else

Return ONLY this JSON (no other text):
{
  "formation": "4-3-3",
  "concept": "1-2 sentences describing this XI's identity and why it represents exceptional value",
  "totalEstimatedCost": "≈€X-YM",
  "players": [
    {
      "playerName": "Full Name",
      "position": "GK",
      "archetypeLabel": "Sweeper-Keeper",
      "age": 26,
      "nationality": "Country",
      "currentClub": "Club Name",
      "estimatedValue": "€8M",
      "contractUntil": "2026",
      "whyUndervalued": "2 sentences: why they're a bargain and what they bring to this system",
      "scoutScore": 78
    }
  ]
}

Position values must be exactly one of: GK, CB, LB, RB, CM, CAM, CDM, LW, RW, ST, CF, WB
Include exactly 11 players covering every position in your chosen formation.`, requestedLanguage)

  return createStructuredResponseWithEnglishFallback<UndervaluedXIResult>({
    buildPrompt,
    system: buildCachedManagerSystemPrompt(managerSection),
    language,
    expectedType: 'object',
    maxTokens: 3000,
    logLabel: `Undervalued XI (${teamName || resolvedName})`,
  })
}

export async function generateUndervaluedXICandidatePool(
  budget: string,
  manager: ManagerProfile | null,
  managerName?: string,
  teamName?: string,
  extraBudgetInstructions?: string,
  liveFormationContext?: LiveFormationContext,
  language: LanguageCode = DEFAULT_LANGUAGE,
): Promise<UndervaluedXICandidatePool> {
  const resolvedName = manager?.name || managerName || 'a modern pressing manager'
  const currentDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const managerSection = manager
    ? `**System**: ${buildLiveFormationDisplay(liveFormationContext)} | **Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} line, ${manager.style.buildUp} build-up
**Live Formation Guidance**: ${buildLiveFormationGuidance(liveFormationContext)}
**Key principles**: ${manager.keyPrinciples.slice(0, 3).join('; ')}`
    : `Use your knowledge of ${resolvedName}'s preferred tactical system. ${buildLiveFormationGuidance(liveFormationContext)}`

  const buildPrompt = (requestedLanguage: LanguageCode) => withOutputLanguage(`You are an elite football scout specialising in undervalued talent. Today is ${currentDate}. Build a SLOT-BY-SLOT candidate board for an undervalued XI that fits ${resolvedName}'s tactical system within the stated budget.

## Manager: ${resolvedName}
${managerSection}
${teamName ? `\n## Buying Club: ${teamName}` : ''}

## Total Budget: ${budget}

## Rules:
1. Choose one formation that suits ${resolvedName}'s system and return exactly 11 slots for that formation
2. For EACH slot, return exactly 2 candidates: one best-fit option and one cheaper budget-safety option
3. Every candidate must be ACTIVELY playing professional football right now
4. The combined pool must contain enough value options that a complete XI can realistically fit within ${budget}
5. "Undervalued" means their quality, output, and tactical fit significantly exceed their market value or contract situation
6. Do NOT reuse the same player in multiple slots
7. Spread across leagues — avoid building the entire pool from one league
8. Use only standard Latin characters in names. Be confident about current clubs.
${extraBudgetInstructions ? `\n## HARD BUDGET GUARDRAIL:\n${extraBudgetInstructions}` : ''}

## ACCURACY RULES (critical):
- Only recommend currently ACTIVE professional players
- Only name players whose current club you are highly confident about as of ${currentDate}
- For players on loan: use their CURRENT loan destination as the club
- If unsure about a player's club, skip them and pick someone else
- Keep estimated values conservative and realistic for a real transfer discussion
- Each candidate must naturally fit the slot with their main or common real-world position
- Do not place centre-backs in full-back or wing-back slots unless they are genuinely used there
- Do not place defensive midfielders in centre-back slots unless they are genuinely used there

Return ONLY this JSON:
{
  "formation": "4-2-3-1",
  "concept": "1-2 sentences describing this XI's identity and why it represents exceptional value",
  "slots": [
    {
      "slotId": "GK",
      "position": "GK",
      "archetypeLabel": "Sweeper-Keeper",
      "candidates": [
        {
          "playerName": "Full Name",
          "age": 26,
          "currentClub": "Club Name",
          "estimatedValue": "€8M",
          "scoutScore": 78
        }
      ]
    }
  ]
}

Position values must be exactly one of: GK, CB, LB, RB, CM, CAM, CDM, LW, RW, ST, CF, WB
Use unique slot ids for repeated positions, e.g. CB-1 and CB-2, CM-1 and CM-2.
There must be exactly 11 slots and exactly 2 candidates per slot.`, requestedLanguage)

  return createStructuredResponseWithEnglishFallback<UndervaluedXICandidatePool>({
    buildPrompt,
    system: buildCachedManagerSystemPrompt(managerSection),
    language,
    expectedType: 'object',
    maxTokens: 2200,
    logLabel: `Undervalued XI candidate pool (${teamName || resolvedName})`,
  })
}

// ── V3: Transfer Scenario Simulator ──────────────────────────────────────────

export interface ScenarioInPlayer {
  name: string
  displayName?: string
  position: string
  age: number
  fromRecommendations?: boolean
}

export interface ScenarioOutPlayer {
  playerId: string
  name: string
  displayName?: string
  position: string
  age: number
}

export type ScenarioDimensionKey =
  | 'roleCoverage'
  | 'systemFit'
  | 'attackingThreat'
  | 'defensiveStability'
  | 'squadDepth'
  | 'ageProfile'

export interface ScenarioDimension {
  key: ScenarioDimensionKey
  label: string
  baselineScore: number   // 1-10
  scenarioScore: number   // 1-10
  delta: number           // scenarioScore - baselineScore
  insight: string         // one sentence explaining the change
}

export type ScenarioVerdict = 'Do it' | 'Consider it' | 'Risky' | 'Avoid'

export interface ScenarioResult {
  id: string
  label: string                   // "Scenario A", "Scenario B", etc.
  createdAt: number
  playersOut: ScenarioOutPlayer[]
  playersIn: ScenarioInPlayer[]
  dimensions: ScenarioDimension[]
  overallBaselineScore: number
  overallScenarioScore: number
  overallDelta: number
  verdict: string
  risks: string[]
  recommendation: ScenarioVerdict
}

// Evaluate the impact of an IN/OUT scenario on a squad
export async function analyzeScenario(
  originalSquad: SquadPlayer[],
  playersOut: ScenarioOutPlayer[],
  playersIn: ScenarioInPlayer[],
  manager: ManagerProfile | null,
  teamName: string,
  managerName?: string,
  liveFormationContext?: LiveFormationContext,
  language: LanguageCode = DEFAULT_LANGUAGE,
): Promise<Omit<ScenarioResult, 'id' | 'label' | 'createdAt' | 'playersOut' | 'playersIn'>> {
  const resolvedName = manager?.name || managerName || 'the manager'

  const formatSquad = (players: SquadPlayer[]) =>
    players.map((p) => `- ${p.name} (${p.position}, Age ${p.age}, ${p.nationality})`).join('\n')

  // Compute modified squad in TypeScript — give Claude the exact result, no reasoning needed
  const outIds = new Set(playersOut.map((o) => o.playerId))
  const modifiedSquad: SquadPlayer[] = [
    ...originalSquad.filter((p) => !outIds.has(p.playerId)),
    ...playersIn.map((p) => ({
      playerId: 'incoming',
      name: p.name,
      position: p.position,
      age: p.age,
      nationality: '',
    })),
  ]

  const managerSection = manager
    ? `**System**: ${buildLiveFormationDisplay(liveFormationContext)} | **Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} line, ${manager.style.buildUp} build-up
**Summary**: ${manager.tacticalSummary}
**Live Formation Guidance**: ${buildLiveFormationGuidance(liveFormationContext)}
**Key Principles**: ${manager.keyPrinciples.slice(0, 4).join('; ')}`
    : `Use your knowledge of ${resolvedName}'s tactical system — pressing intensity, build-up style, and what he demands from players in each role. ${buildLiveFormationGuidance(liveFormationContext)}`

  const currentDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const prompt = withOutputLanguage(`You are an elite football scout and tactical analyst. Today is ${currentDate}. Evaluate the impact of this transfer scenario on ${teamName}'s squad.

## Manager: ${resolvedName}
${managerSection}

## CURRENT SQUAD (Baseline):
${formatSquad(originalSquad)}

## PROPOSED SCENARIO:
OUT: ${playersOut.map((p) => `${p.name} (${p.position}, Age ${p.age})`).join(', ') || 'None'}
IN: ${playersIn.map((p) => `${p.name} (${p.position}, Age ${p.age})`).join(', ') || 'None'}

## MODIFIED SQUAD (after scenario):
${formatSquad(modifiedSquad)}

## Your Task:
Score BOTH the current squad AND the modified squad across these 6 dimensions (each 1-10):
1. roleCoverage — Does the squad cover all positions the system requires?
2. systemFit — How well do players match the manager's tactical demands?
3. attackingThreat — Goals, creativity, and pressing threat up front
4. defensiveStability — Defensive line cohesion, pressing from deep
5. squadDepth — Quality of backup options across all lines
6. ageProfile — Sustainability: balance of peak-age players vs youth vs over-30s

For each dimension, provide:
- baselineScore: score for CURRENT squad (1-10)
- scenarioScore: score for MODIFIED squad (1-10)
- delta: scenarioScore minus baselineScore (can be negative)
- insight: one sentence explaining why the score changed (or didn't)

For the IN players: if you know these as real players, use your knowledge of their quality and profile. If they are unfamiliar, assess them based on the position and age provided.

Return ONLY this JSON:
{
  "dimensions": [
    {
      "key": "roleCoverage",
      "label": "Role Coverage",
      "baselineScore": 7,
      "scenarioScore": 8,
      "delta": 1,
      "insight": "One sentence explaining the change"
    },
    { "key": "systemFit", "label": "System Fit", "baselineScore": 7, "scenarioScore": 8, "delta": 1, "insight": "..." },
    { "key": "attackingThreat", "label": "Attacking Threat", "baselineScore": 7, "scenarioScore": 8, "delta": 1, "insight": "..." },
    { "key": "defensiveStability", "label": "Defensive Stability", "baselineScore": 7, "scenarioScore": 7, "delta": 0, "insight": "..." },
    { "key": "squadDepth", "label": "Squad Depth", "baselineScore": 6, "scenarioScore": 7, "delta": 1, "insight": "..." },
    { "key": "ageProfile", "label": "Age Profile", "baselineScore": 6, "scenarioScore": 8, "delta": 2, "insight": "..." }
  ],
  "overallBaselineScore": 6.8,
  "overallScenarioScore": 7.7,
  "overallDelta": 0.9,
  "verdict": "1-2 sentences: scout verdict on whether this deal makes sense for this team and system",
  "risks": ["Risk 1", "Risk 2"],
  "recommendation": "Consider it"
}

Recommendation must be exactly one of: "Do it" | "Consider it" | "Risky" | "Avoid"
No other text.`, language)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  return extractJSON(sanitizeHomoglyphs(raw), 'object') as Omit<
    ScenarioResult,
    'id' | 'label' | 'createdAt' | 'playersOut' | 'playersIn'
  >
}

// ── ScoutEdge Verdict ─────────────────────────────────────────────────────────

export type VerdictLabel = 'Do it' | 'Consider it' | 'Risky' | 'Avoid'

export interface TransferVerdictResult {
  playerName: string
  displayPlayerName?: string
  targetClub: string
  displayTargetClub?: string
  managerName: string
  displayManagerName?: string
  verdictLabel: VerdictLabel
  fitScore: number          // 1-10 tactical fit
  headline: string          // one punchy sentence e.g. "Osimhen is the wrong profile for Arteta's system"
  whyItWorks: string[]      // up to 3 bullet reasons in favour
  whyItDoesnt: string[]     // up to 3 bullet reasons against
  roleInSystem: string      // e.g. "False 9 in a 4-3-3, pressing trigger and link-up focus"
  needAssessment: string    // e.g. "Arsenal have a genuine striker vacancy after Nketiah's decline"
  valueAssessment: string   // e.g. "At €70M he represents fair value given his output"
  timing: string            // e.g. "26 years old, peak years, contract expires 2026"
  scoutVerdict: string      // 2-3 sentence full scout reasoning on the transfer picture
}

const VERDICT_UNSUPPORTED_HISTORY_PATTERN = /\b(loan|loanee|spells?|previously|formerly|prior spell|came through|developed at|during (?:his|her) time at)\b/i
const VERDICT_UNSUPPORTED_LEAGUE_PATTERN = /\b(eredivisie|la liga|serie a|bundesliga|ligue 1|k-league|j-league|mls|primeira liga|scottish premiership|championship|super lig|süper lig)\b/i
const VERDICT_UNSUPPORTED_MISSING_STATS_PATTERN = /\b(zero goals?|zero assists?|zero appearances?|zero minutes?|no recorded output|no appearances|no minutes|no statistical baseline|absence of recorded output|registered no minutes|registered no appearances)\b/i

function mentionsUnsupportedVerdictHistory(text: string, hasVerifiedPlayerFacts: boolean): boolean {
  if (VERDICT_UNSUPPORTED_HISTORY_PATTERN.test(text)) return true
  return !hasVerifiedPlayerFacts && VERDICT_UNSUPPORTED_LEAGUE_PATTERN.test(text)
}

function mentionsUnsupportedVerdictStats(text: string, tmPlayer: TMPlayerData | null): boolean {
  return Boolean(tmPlayer && !tmPlayer.statsAvailable && VERDICT_UNSUPPORTED_MISSING_STATS_PATTERN.test(text))
}

function sanitizeTransferVerdict(
  result: Omit<TransferVerdictResult, 'playerName' | 'targetClub' | 'managerName'>,
  playerName: string,
  targetClub: string,
  managerName: string,
  tmPlayer: TMPlayerData | null
): Omit<TransferVerdictResult, 'playerName' | 'targetClub' | 'managerName'> {
  const hasVerifiedPlayerFacts = Boolean(tmPlayer)

  const defaultWorks = [
    `${playerName}'s broad role profile may still offer upside if the coaching staff see a clear tactical development plan.`,
    hasVerifiedPlayerFacts
      ? `The live player record supports discussing ${playerName} as a real market option rather than a purely hypothetical fit.`
      : `If the deal is framed as a low-risk project rather than an instant solution, the downside is easier to control.`,
  ]

  const defaultConcerns = [
    hasVerifiedPlayerFacts
      ? `This move still has to be judged on system fit rather than generic name value alone.`
      : `The live player facts for this spelling could not be fully verified, so any career-specific narrative would be too risky to trust.`,
    `${managerName}'s tactical demands may require technical and positional qualities that cannot simply be assumed.`,
  ]

  const sanitizedWorks = (result.whyItWorks || [])
    .filter((entry) => !mentionsUnsupportedVerdictHistory(entry, hasVerifiedPlayerFacts))
    .filter((entry) => !mentionsUnsupportedVerdictStats(entry, tmPlayer))
  const sanitizedConcerns = (result.whyItDoesnt || [])
    .filter((entry) => !mentionsUnsupportedVerdictHistory(entry, hasVerifiedPlayerFacts))
    .filter((entry) => !mentionsUnsupportedVerdictStats(entry, tmPlayer))

  return {
    ...result,
    headline: (mentionsUnsupportedVerdictHistory(result.headline || '', hasVerifiedPlayerFacts) || mentionsUnsupportedVerdictStats(result.headline || '', tmPlayer))
      ? `${playerName} may be an interesting tactical idea for ${targetClub}, but the live player facts are not strong enough for a biography-heavy verdict.`
      : result.headline,
    whyItWorks: sanitizedWorks.length > 0 ? sanitizedWorks : defaultWorks,
    whyItDoesnt: sanitizedConcerns.length > 0 ? sanitizedConcerns : defaultConcerns,
    valueAssessment: hasVerifiedPlayerFacts
      ? result.valueAssessment
      : `Without a verified live player record, fee and contract analysis should be treated cautiously rather than confidently.`,
    timing: hasVerifiedPlayerFacts
      ? mentionsUnsupportedVerdictStats(result.timing || '', tmPlayer)
        ? `The current live profile does not provide enough verified season-detail context to make a confident timing argument beyond broad age and market logic.`
        : result.timing
      : `Without a verified live player record, timing and career-stage claims should stay cautious rather than biography-heavy.`,
    scoutVerdict: (mentionsUnsupportedVerdictHistory(result.scoutVerdict || '', hasVerifiedPlayerFacts) || mentionsUnsupportedVerdictStats(result.scoutVerdict || '', tmPlayer))
      ? hasVerifiedPlayerFacts
        ? `${playerName} can still be judged as a tactical fit question first, but unsupported claims about past clubs or loan spells should not drive the verdict. The safer read is to keep the focus on present role fit, price, and whether ${managerName}'s system truly suits the player.`
        : `${playerName} can still be discussed as a tactical fit question, but the live player record was not verified strongly enough for detailed career storytelling. The safest verdict is to judge the move on broad role fit and price discipline, not invented biography.`
      : result.scoutVerdict,
  }
}

export async function analyzeTransferVerdict(
  playerName: string,
  targetClub: string,
  tmPlayer: TMPlayerData | null,
  manager: ManagerProfile | null,
  managerName?: string,
  liveFormationContext?: LiveFormationContext,
  language: LanguageCode = DEFAULT_LANGUAGE,
): Promise<TransferVerdictResult> {
  const resolvedManagerName = manager?.name || managerName || 'the manager'
  const currentDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const managerSection = manager
    ? `**System**: ${buildLiveFormationDisplay(liveFormationContext)}
**Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} line, ${manager.style.buildUp} build-up
**Summary**: ${manager.tacticalSummary}
**Live Formation Guidance**: ${buildLiveFormationGuidance(liveFormationContext)}
**Key Principles**: ${manager.keyPrinciples.slice(0, 4).join('; ')}
**Positional Requirements**: ${manager.positionalRequirements.map((r) => `${r.position} (${r.profileLabel}): must have ${r.mustHave.join(', ')}`).join(' | ')}`
    : `Use your knowledge of ${resolvedManagerName}'s tactical system — pressing style, build-up, and what he demands from each position. ${buildLiveFormationGuidance(liveFormationContext)}`

  const playerSection = tmPlayer
    ? `**Player**: ${tmPlayer.name}
**Position**: ${tmPlayer.position} | **Age**: ${tmPlayer.age} | **Nationality**: ${tmPlayer.nationality}
**Current Club**: ${tmPlayer.currentClub} | **Contract until**: ${tmPlayer.contractYear}
**Market Value**: ${tmPlayer.marketValueFormatted}
${tmPlayer.statsAvailable
  ? `**Current live season totals (across all clubs)**: Goals ${tmPlayer.goals}, Assists ${tmPlayer.assists}, Apps ${tmPlayer.appearances}, Mins ${tmPlayer.minutesPlayed}
**Important**: These stats cover the player's latest live season window across all clubs and competitions returned by Transfermarkt — do NOT attribute them to any single club, especially if the player recently transferred.`
  : `**Current live season totals**: unavailable from live Transfermarkt data right now.
**Important**: Missing stats are not the same as zero stats. Do NOT describe the player as having zero goals, zero appearances, or poor form unless that is explicitly stated above.`}
**Fact Guardrail**: You may reference only the player's current club, contract year, market value, age, nationality, position, and any season totals explicitly listed here. Do NOT infer international status, previous clubs, previous leagues, loan spells, youth clubs, transfer history, or missing-season output.`
    : `**Player**: ${playerName}
**Verified Player Facts**: unavailable for this spelling right now.
**Fact Guardrail**: Because live player verification failed, do NOT mention specific previous clubs, previous leagues, loan spells, exact contract situations, exact goal records, or transfer history as facts. Keep the verdict role-based and uncertainty-aware instead of inventing biography.`

  const prompt = withOutputLanguage(`You are an elite football scout giving a verdict on a transfer rumour. Today is ${currentDate}.

## Rumour: ${targetClub} want to sign ${playerName}

## Target Club Manager: ${resolvedManagerName}

## Player Profile:
${playerSection}

## Your Task:
Give an honest, decisive scout verdict on whether ${targetClub} should sign ${playerName}.

Be opinionated — this is a verdict, not a balance sheet. If it's a good move, say so clearly. If it's wrong, explain why. Reference the manager's specific system demands and whether this player can meet them.

## Accuracy Rules:
- Treat the supplied player facts as the only reliable factual source.
- If previous clubs, loan spells, previous leagues, or transfer history are not explicitly listed in the player profile above, do not mention them.
- If verified player facts are unavailable, keep the verdict generic and tactical. Do not invent biography.
- Never cite a club, league, loan spell, or contract fact that is missing from the supplied profile.

Return ONLY this JSON:
{
  "verdictLabel": "Consider it",
  "fitScore": 7,
  "headline": "One punchy sentence — lead with the most important thing about this transfer",
  "whyItWorks": ["Reason 1", "Reason 2", "Reason 3"],
  "whyItDoesnt": ["Concern 1", "Concern 2"],
  "roleInSystem": "Exact role this player would play in this manager's system",
  "needAssessment": "Does this club genuinely need this type of player right now?",
  "valueAssessment": "Is the likely transfer fee/wages justified given the player's output?",
  "timing": "Age, contract situation, peak years assessment",
  "scoutVerdict": "2-3 sentences of full scout reasoning on the complete transfer picture — system fit, value, timing, risk"
}

verdictLabel must be exactly one of: "Do it" | "Consider it" | "Risky" | "Avoid"
No other text.`, language)

  const response = await createMessageWithPromptCacheFallback({
    model: 'claude-sonnet-4-6',
    system: buildCachedManagerSystemPrompt(managerSection),
    max_tokens: 1500,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const parsed = extractJSON(sanitizeHomoglyphs(raw), 'object') as Omit<TransferVerdictResult, 'playerName' | 'targetClub' | 'managerName'>
  const result = sanitizeTransferVerdict(parsed, playerName, targetClub, resolvedManagerName, tmPlayer)

  return {
    playerName,
    targetClub,
    managerName: resolvedManagerName,
    ...result,
  }
}

// ── V5: Manager Identity Mode ─────────────────────────────────────────────────

export interface IdealPlayer {
  playerName: string
  displayName?: string
  position: string        // "GK", "LCB", "CB", "RCB", "LB", "RB", "LWB", "RWB", "CM", "CAM", "CDM", "LW", "RW", "ST", "CF"
  archetypeLabel: string  // e.g. "Press-Resistant #6", "Inverted Winger", "Sweeper-Keeper"
  displayArchetypeLabel?: string
  displayOrder?: number   // preserves canonical formation slot order for UI rendering
  age: number
  nationality: string
  displayNationality?: string
  currentClub: string
  displayCurrentClub?: string
  estimatedFee: string    // "€80M", "€120M", "Free agent", "Loan"
  contractUntil: string   // "2025", "2026", "Unknown"
  whyIdeal: string        // 2 sentences: why THIS player is the textbook profile for this role in this system
  systemFitScore: number  // 0-100
  tmVerified?: boolean
  transfermarktUrl?: string
}

export interface ManagerXIResult {
  formation: string          // e.g. "4-3-3"
  managerName: string
  displayManagerName?: string
  players: IdealPlayer[]     // exactly 11
  identity: string           // 2-3 sentences: what makes this XI's identity — the tactical DNA
  totalEstimatedCost: string // e.g. "≈€620M"
  budgetStatus?: 'within' | 'over'
  budgetOverrun?: string
}

export interface ManagerXISlotCandidate {
  playerName: string
  age: number
  currentClub: string
  estimatedFee: string
  systemFitScore: number
}

export interface ManagerXISlot {
  slotId: string
  position: string
  archetypeLabel: string
  candidates: ManagerXISlotCandidate[]
}

export interface ManagerXICandidatePool {
  formation: string
  managerName: string
  identity: string
  slots: ManagerXISlot[]
}

interface ManagerXIStructureSlot {
  slotId: string
  position: string
  archetypeLabel: string
}

interface ManagerXIStructure {
  formation: string
  managerName: string
  identity: string
  slots: ManagerXIStructureSlot[]
}

interface ManagerXICandidateBatch {
  slots: Array<{
    slotId: string
    candidates: ManagerXISlotCandidate[]
  }>
}

function normalizeManagerXIText(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function includesAnyManagerXI(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase))
}

function normalizeManagerXIFormation(formation?: string | null): string | null {
  const raw = (formation || '').trim()
  if (!raw) return null

  const numbers = raw.match(/\d+/g)
  if (!numbers?.length) return null

  return numbers.join('-')
}

function defaultArchetypeForPosition(position: string): string {
  switch (position) {
    case 'GK':
      return 'Sweeper-Keeper'
    case 'RCB':
      return 'Aggressive Right Centre-Back'
    case 'LCB':
      return 'Progressive Left Centre-Back'
    case 'RB':
      return 'Attacking Right-Back'
    case 'LB':
      return 'Attacking Left-Back'
    case 'RWB':
      return 'Dynamic Right Wing-Back'
    case 'LWB':
      return 'Dynamic Left Wing-Back'
    case 'CB':
      return 'Covering Central Centre-Back'
    case 'CDM':
      return 'Press-Resistant #6'
    case 'CM':
      return 'Two-Way #8'
    case 'CAM':
      return 'Creative Attacking Midfielder'
    case 'RW':
      return 'Inverted Right Winger'
    case 'LW':
      return 'Inverted Left Winger'
    case 'CF':
      return 'Link Forward'
    case 'ST':
    default:
      return 'Mobile Striker'
  }
}

function buildFallbackManagerXIIdentity(
  formation: string,
  resolvedName: string,
  liveContext?: ManagerXILiveContext
): string {
  const liveClubContext = liveContext?.currentStatus === 'free_agent'
    ? `${resolvedName}'s recent live tactical reference`
    : liveContext?.currentClub
    ? `${resolvedName}'s current ${liveContext.currentClub} context`
    : `${resolvedName}'s live tactical context`

  if (formation === '4-2-3-1') {
    return `A live-shape-led 4-2-3-1 built around double-pivot control, a central creator between the lines, and wide forwards supporting a mobile striker. The structure stays anchored to ${liveClubContext}, prioritising compact rest defence, patient circulation, and quick vertical attacks when space opens.`
  }

  if (formation === '4-3-3') {
    return `A live-shape-led 4-3-3 built on a controlling midfield triangle, aggressive full-backs, and wide forwards attacking the half-spaces. The structure stays anchored to ${liveClubContext}, balancing positional control with direct pressure once the press is triggered.`
  }

  if (formation === '3-5-2') {
    return `A live-shape-led 3-5-2 built on central midfield overloads, wing-backs covering the full flank, and a front two that can combine quickly. The structure stays anchored to ${liveClubContext}, emphasising rest-defence stability and layered support around the ball.`
  }

  if (formation.startsWith('3-')) {
    return `A live-shape-led ${formation} built on three centre-backs, wing-back width, and compact access into the half-spaces behind the striker line. The structure stays anchored to ${liveClubContext}, prioritising stable rest defence and coordinated progression through central overloads.`
  }

  return `A live-shape-led ${formation} built to reflect ${liveClubContext}, with clear role separation between build-up security, midfield control, and direct attacking support. The structure prioritises current tactical context over historical labels or stale club narratives.`
}

function buildCanonicalFormationSlots(formation: string): ManagerXIStructureSlot[] | null {
  switch (formation) {
    case '4-3-3':
      return [
        { slotId: 'GK', position: 'GK', archetypeLabel: defaultArchetypeForPosition('GK') },
        { slotId: 'RB', position: 'RB', archetypeLabel: defaultArchetypeForPosition('RB') },
        { slotId: 'RCB', position: 'RCB', archetypeLabel: defaultArchetypeForPosition('RCB') },
        { slotId: 'LCB', position: 'LCB', archetypeLabel: defaultArchetypeForPosition('LCB') },
        { slotId: 'LB', position: 'LB', archetypeLabel: defaultArchetypeForPosition('LB') },
        { slotId: 'CM-1', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CM-2', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CM-3', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'RW', position: 'RW', archetypeLabel: defaultArchetypeForPosition('RW') },
        { slotId: 'LW', position: 'LW', archetypeLabel: defaultArchetypeForPosition('LW') },
        { slotId: 'ST', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
      ]
    case '4-2-3-1':
      return [
        { slotId: 'GK', position: 'GK', archetypeLabel: defaultArchetypeForPosition('GK') },
        { slotId: 'RB', position: 'RB', archetypeLabel: defaultArchetypeForPosition('RB') },
        { slotId: 'RCB', position: 'RCB', archetypeLabel: defaultArchetypeForPosition('RCB') },
        { slotId: 'LCB', position: 'LCB', archetypeLabel: defaultArchetypeForPosition('LCB') },
        { slotId: 'LB', position: 'LB', archetypeLabel: defaultArchetypeForPosition('LB') },
        { slotId: 'CDM-1', position: 'CDM', archetypeLabel: defaultArchetypeForPosition('CDM') },
        { slotId: 'CDM-2', position: 'CDM', archetypeLabel: defaultArchetypeForPosition('CDM') },
        { slotId: 'RW', position: 'RW', archetypeLabel: defaultArchetypeForPosition('RW') },
        { slotId: 'CAM', position: 'CAM', archetypeLabel: defaultArchetypeForPosition('CAM') },
        { slotId: 'LW', position: 'LW', archetypeLabel: defaultArchetypeForPosition('LW') },
        { slotId: 'ST', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
      ]
    case '4-3-1-2':
      return [
        { slotId: 'GK', position: 'GK', archetypeLabel: defaultArchetypeForPosition('GK') },
        { slotId: 'RB', position: 'RB', archetypeLabel: defaultArchetypeForPosition('RB') },
        { slotId: 'RCB', position: 'RCB', archetypeLabel: defaultArchetypeForPosition('RCB') },
        { slotId: 'LCB', position: 'LCB', archetypeLabel: defaultArchetypeForPosition('LCB') },
        { slotId: 'LB', position: 'LB', archetypeLabel: defaultArchetypeForPosition('LB') },
        { slotId: 'CM-1', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CM-2', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CM-3', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CAM', position: 'CAM', archetypeLabel: defaultArchetypeForPosition('CAM') },
        { slotId: 'ST-1', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
        { slotId: 'ST-2', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
      ]
    case '4-1-4-1':
      return [
        { slotId: 'GK', position: 'GK', archetypeLabel: defaultArchetypeForPosition('GK') },
        { slotId: 'RB', position: 'RB', archetypeLabel: defaultArchetypeForPosition('RB') },
        { slotId: 'RCB', position: 'RCB', archetypeLabel: defaultArchetypeForPosition('RCB') },
        { slotId: 'LCB', position: 'LCB', archetypeLabel: defaultArchetypeForPosition('LCB') },
        { slotId: 'LB', position: 'LB', archetypeLabel: defaultArchetypeForPosition('LB') },
        { slotId: 'CDM', position: 'CDM', archetypeLabel: defaultArchetypeForPosition('CDM') },
        { slotId: 'CM-1', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CM-2', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'RW', position: 'RW', archetypeLabel: defaultArchetypeForPosition('RW') },
        { slotId: 'LW', position: 'LW', archetypeLabel: defaultArchetypeForPosition('LW') },
        { slotId: 'ST', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
      ]
    case '4-4-2':
      return [
        { slotId: 'GK', position: 'GK', archetypeLabel: defaultArchetypeForPosition('GK') },
        { slotId: 'RB', position: 'RB', archetypeLabel: defaultArchetypeForPosition('RB') },
        { slotId: 'RCB', position: 'RCB', archetypeLabel: defaultArchetypeForPosition('RCB') },
        { slotId: 'LCB', position: 'LCB', archetypeLabel: defaultArchetypeForPosition('LCB') },
        { slotId: 'LB', position: 'LB', archetypeLabel: defaultArchetypeForPosition('LB') },
        { slotId: 'RW', position: 'RW', archetypeLabel: defaultArchetypeForPosition('RW') },
        { slotId: 'CM-1', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CM-2', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'LW', position: 'LW', archetypeLabel: defaultArchetypeForPosition('LW') },
        { slotId: 'ST-1', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
        { slotId: 'ST-2', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
      ]
    case '4-2-2-2':
      return [
        { slotId: 'GK', position: 'GK', archetypeLabel: defaultArchetypeForPosition('GK') },
        { slotId: 'RB', position: 'RB', archetypeLabel: defaultArchetypeForPosition('RB') },
        { slotId: 'RCB', position: 'RCB', archetypeLabel: defaultArchetypeForPosition('RCB') },
        { slotId: 'LCB', position: 'LCB', archetypeLabel: defaultArchetypeForPosition('LCB') },
        { slotId: 'LB', position: 'LB', archetypeLabel: defaultArchetypeForPosition('LB') },
        { slotId: 'CDM-1', position: 'CDM', archetypeLabel: defaultArchetypeForPosition('CDM') },
        { slotId: 'CDM-2', position: 'CDM', archetypeLabel: defaultArchetypeForPosition('CDM') },
        { slotId: 'CAM-1', position: 'CAM', archetypeLabel: defaultArchetypeForPosition('CAM') },
        { slotId: 'CAM-2', position: 'CAM', archetypeLabel: defaultArchetypeForPosition('CAM') },
        { slotId: 'ST-1', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
        { slotId: 'ST-2', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
      ]
    case '3-2-4-1':
      return [
        { slotId: 'GK', position: 'GK', archetypeLabel: defaultArchetypeForPosition('GK') },
        { slotId: 'RCB', position: 'RCB', archetypeLabel: defaultArchetypeForPosition('RCB') },
        { slotId: 'CB', position: 'CB', archetypeLabel: defaultArchetypeForPosition('CB') },
        { slotId: 'LCB', position: 'LCB', archetypeLabel: defaultArchetypeForPosition('LCB') },
        { slotId: 'CDM-1', position: 'CDM', archetypeLabel: defaultArchetypeForPosition('CDM') },
        { slotId: 'CDM-2', position: 'CDM', archetypeLabel: defaultArchetypeForPosition('CDM') },
        { slotId: 'RWB', position: 'RWB', archetypeLabel: defaultArchetypeForPosition('RWB') },
        { slotId: 'LWB', position: 'LWB', archetypeLabel: defaultArchetypeForPosition('LWB') },
        { slotId: 'CAM-1', position: 'CAM', archetypeLabel: defaultArchetypeForPosition('CAM') },
        { slotId: 'CAM-2', position: 'CAM', archetypeLabel: defaultArchetypeForPosition('CAM') },
        { slotId: 'ST', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
      ]
    case '3-4-1-2':
      return [
        { slotId: 'GK', position: 'GK', archetypeLabel: defaultArchetypeForPosition('GK') },
        { slotId: 'RCB', position: 'RCB', archetypeLabel: defaultArchetypeForPosition('RCB') },
        { slotId: 'CB', position: 'CB', archetypeLabel: defaultArchetypeForPosition('CB') },
        { slotId: 'LCB', position: 'LCB', archetypeLabel: defaultArchetypeForPosition('LCB') },
        { slotId: 'RWB', position: 'RWB', archetypeLabel: defaultArchetypeForPosition('RWB') },
        { slotId: 'LWB', position: 'LWB', archetypeLabel: defaultArchetypeForPosition('LWB') },
        { slotId: 'CM-1', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CM-2', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CAM', position: 'CAM', archetypeLabel: defaultArchetypeForPosition('CAM') },
        { slotId: 'ST-1', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
        { slotId: 'ST-2', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
      ]
    case '3-4-2-1':
      return [
        { slotId: 'GK', position: 'GK', archetypeLabel: defaultArchetypeForPosition('GK') },
        { slotId: 'RCB', position: 'RCB', archetypeLabel: defaultArchetypeForPosition('RCB') },
        { slotId: 'CB', position: 'CB', archetypeLabel: defaultArchetypeForPosition('CB') },
        { slotId: 'LCB', position: 'LCB', archetypeLabel: defaultArchetypeForPosition('LCB') },
        { slotId: 'RWB', position: 'RWB', archetypeLabel: defaultArchetypeForPosition('RWB') },
        { slotId: 'LWB', position: 'LWB', archetypeLabel: defaultArchetypeForPosition('LWB') },
        { slotId: 'CM-1', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CM-2', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CAM-1', position: 'CAM', archetypeLabel: defaultArchetypeForPosition('CAM') },
        { slotId: 'CAM-2', position: 'CAM', archetypeLabel: defaultArchetypeForPosition('CAM') },
        { slotId: 'ST', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
      ]
    case '3-4-3':
      return [
        { slotId: 'GK', position: 'GK', archetypeLabel: defaultArchetypeForPosition('GK') },
        { slotId: 'RCB', position: 'RCB', archetypeLabel: defaultArchetypeForPosition('RCB') },
        { slotId: 'CB', position: 'CB', archetypeLabel: defaultArchetypeForPosition('CB') },
        { slotId: 'LCB', position: 'LCB', archetypeLabel: defaultArchetypeForPosition('LCB') },
        { slotId: 'RWB', position: 'RWB', archetypeLabel: defaultArchetypeForPosition('RWB') },
        { slotId: 'LWB', position: 'LWB', archetypeLabel: defaultArchetypeForPosition('LWB') },
        { slotId: 'CM-1', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CM-2', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'RW', position: 'RW', archetypeLabel: defaultArchetypeForPosition('RW') },
        { slotId: 'LW', position: 'LW', archetypeLabel: defaultArchetypeForPosition('LW') },
        { slotId: 'ST', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
      ]
    case '3-5-2':
    case '5-3-2':
      return [
        { slotId: 'GK', position: 'GK', archetypeLabel: defaultArchetypeForPosition('GK') },
        { slotId: 'RCB', position: 'RCB', archetypeLabel: defaultArchetypeForPosition('RCB') },
        { slotId: 'CB', position: 'CB', archetypeLabel: defaultArchetypeForPosition('CB') },
        { slotId: 'LCB', position: 'LCB', archetypeLabel: defaultArchetypeForPosition('LCB') },
        { slotId: 'RWB', position: 'RWB', archetypeLabel: defaultArchetypeForPosition('RWB') },
        { slotId: 'LWB', position: 'LWB', archetypeLabel: defaultArchetypeForPosition('LWB') },
        { slotId: 'CM-1', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CM-2', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'CM-3', position: 'CM', archetypeLabel: defaultArchetypeForPosition('CM') },
        { slotId: 'ST-1', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
        { slotId: 'ST-2', position: 'ST', archetypeLabel: defaultArchetypeForPosition('ST') },
      ]
    default:
      return null
  }
}

function getManagerXISlotFamily(position: string): string {
  switch (position) {
    case 'GK':
      return 'goalkeeper'
    case 'LCB':
    case 'RCB':
    case 'CB':
      return 'center-back'
    case 'LB':
    case 'RB':
      return 'fullback'
    case 'LWB':
    case 'RWB':
    case 'WB':
      return 'wing-back'
    case 'CDM':
      return 'holding-midfielder'
    case 'CAM':
      return 'attacking-midfielder'
    case 'LW':
    case 'RW':
      return 'winger'
    case 'CF':
    case 'ST':
      return 'striker'
    case 'CM':
    default:
      return 'central-midfielder'
  }
}

function normalizeManagerXISlotPosition(position?: string | null, slotId?: string | null): string | null {
  const normalized = normalizeManagerXIText(`${slotId || ''} ${position || ''}`)
  if (!normalized) return null

  if (includesAnyManagerXI(normalized, ['left centre back', 'left center back', 'left central defender']) || normalized.includes('lcb')) return 'LCB'
  if (includesAnyManagerXI(normalized, ['right centre back', 'right center back', 'right central defender']) || normalized.includes('rcb')) return 'RCB'
  if (includesAnyManagerXI(normalized, ['left wing back', 'left wingback']) || normalized.includes('lwb')) return 'LWB'
  if (includesAnyManagerXI(normalized, ['right wing back', 'right wingback']) || normalized.includes('rwb')) return 'RWB'
  if (includesAnyManagerXI(normalized, ['left back'])) return 'LB'
  if (includesAnyManagerXI(normalized, ['right back'])) return 'RB'
  if (includesAnyManagerXI(normalized, ['centre back', 'center back', 'central defender']) || normalized === 'cb') return 'CB'
  if (includesAnyManagerXI(normalized, ['goalkeeper', 'keeper']) || normalized === 'gk') return 'GK'
  if (includesAnyManagerXI(normalized, ['defensive midfield', 'defensive midfielder']) || normalized.includes('cdm')) return 'CDM'
  if (includesAnyManagerXI(normalized, ['attacking midfield', 'attacking midfielder']) || normalized.includes('cam')) return 'CAM'
  if (includesAnyManagerXI(normalized, ['central midfield', 'central midfielder']) || normalized === 'cm') return 'CM'
  if (includesAnyManagerXI(normalized, ['left wing', 'left winger', 'left midfield', 'left mid']) || normalized === 'lw') return 'LW'
  if (includesAnyManagerXI(normalized, ['right wing', 'right winger', 'right midfield', 'right mid']) || normalized === 'rw') return 'RW'
  if (includesAnyManagerXI(normalized, ['second striker', 'false 9', 'centre forward', 'center forward']) || normalized === 'cf') return 'CF'
  if (includesAnyManagerXI(normalized, ['striker', 'forward']) || normalized === 'st') return 'ST'
  if (includesAnyManagerXI(normalized, ['wing back', 'wingback']) || normalized === 'wb') return 'WB'

  return position || null
}

function normalizeManagerXIStructure(structure: ManagerXIStructure): ManagerXIStructure {
  const normalizedFormation = normalizeManagerXIFormation(structure.formation) || structure.formation
  const canonicalSlots = buildCanonicalFormationSlots(normalizedFormation)

  if (!canonicalSlots) {
    return {
      ...structure,
      formation: normalizedFormation,
    }
  }

  const sourceSlots = structure.slots.map((slot, index) => ({
    ...slot,
    index,
    normalizedPosition: normalizeManagerXISlotPosition(slot.position, slot.slotId),
    family: getManagerXISlotFamily(normalizeManagerXISlotPosition(slot.position, slot.slotId) || slot.position),
    used: false,
  }))

  function takeBestMatch(target: ManagerXIStructureSlot) {
    const exactMatches = sourceSlots.filter((slot) => !slot.used && slot.normalizedPosition === target.position)
    if (exactMatches[0]) {
      exactMatches[0].used = true
      return exactMatches[0]
    }

    const familyMatches = sourceSlots.filter(
      (slot) => !slot.used && slot.family === getManagerXISlotFamily(target.position)
    )
    if (familyMatches[0]) {
      familyMatches[0].used = true
      return familyMatches[0]
    }

    return null
  }

  return {
    formation: normalizedFormation,
    managerName: structure.managerName,
    identity: structure.identity,
    slots: canonicalSlots.map((slot) => {
      const matched = takeBestMatch(slot)
      return {
        slotId: slot.slotId,
        position: slot.position,
        archetypeLabel: matched?.archetypeLabel || slot.archetypeLabel || defaultArchetypeForPosition(slot.position),
      }
    }),
  }
}

interface ManagerXILiveContext {
  preferredFormation?: string | null
  formationSampleSize?: number
  formationSeason?: number | null
  currentClub?: string | null
  currentStatus?: 'active' | 'free_agent' | 'unknown'
  referenceClub?: string | null
  recentFormations?: string[]
}

function normalizeManagerClubContext(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|ac|cfc)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function clubsShareCurrentContext(left?: string | null, right?: string | null): boolean {
  const normalizedLeft = normalizeManagerClubContext(left)
  const normalizedRight = normalizeManagerClubContext(right)

  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true
  return normalizedLeft.startsWith(normalizedRight) || normalizedRight.startsWith(normalizedLeft)
}

function buildManagerXIContext(
  manager: ManagerProfile | null,
  managerName?: string,
  liveContext?: ManagerXILiveContext
) {
  const resolvedName = manager?.name || managerName || 'the manager'
  const currentDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const livePrimaryFormation = liveContext?.preferredFormation || null
  const liveStatusNote = liveContext?.currentStatus === 'free_agent'
    ? '**Live Status**: Free agent\n'
    : ''
  const liveClubNote = liveContext?.currentClub
    ? `**Live Current Club**: ${liveContext.currentClub}\n`
    : ''
  const liveFormationClub = liveContext?.referenceClub || liveContext?.currentClub || null
  const liveFormationNote = livePrimaryFormation
    ? `**Live Recent Shape**: ${livePrimaryFormation}${liveContext?.formationSampleSize ? ` (from ${liveContext.formationSampleSize} recent lineup${liveContext.formationSampleSize === 1 ? '' : 's'}${liveFormationClub ? ` with ${liveFormationClub}` : ''}${liveContext.formationSeason ? `, season ${liveContext.formationSeason}` : ''})` : ''}\n`
    : liveContext
    ? '**Live Recent Shape**: unavailable right now\n'
    : ''
  const alternateRecentShapes = (liveContext?.recentFormations || [])
    .filter((shape) => shape && shape !== livePrimaryFormation)
    .slice(0, 3)
  const liveShapeMenu = alternateRecentShapes.length
    ? `**Other Recent Shapes**: ${alternateRecentShapes.join(' / ')}\n`
    : ''
  const liveContextHeader = `${liveStatusNote}${liveClubNote}${liveFormationNote}${liveShapeMenu}`
  const liveClubMismatch = Boolean(
    manager &&
    liveContext?.currentStatus === 'active' &&
    liveContext.currentClub &&
    manager.currentClub &&
    !clubsShareCurrentContext(manager.currentClub, liveContext.currentClub)
  )
  const liveContextRule = liveContext?.currentStatus === 'free_agent'
    ? `**Live Context Rule**: ${resolvedName} is currently a free agent. If you reference club context at all, treat ${liveContext.referenceClub || 'the most recent club'} only as a recent tactical reference point, never as the current employer.\n`
    : liveContext?.currentClub
    ? `**Live Context Rule**: ${resolvedName} is currently at ${liveContext.currentClub}. Treat that live club and the live recent shape above as the authoritative present-day context. Do not describe ${resolvedName} as still being at a former club, and do not use old-club labels like "${resolvedName}'s ${manager?.currentClub || 'former-club'} DNA".\n`
    : '**Live Context Rule**: If live current-club context is unavailable, do not invent or imply a current employer. Keep the identity tactical rather than biographical.\n'
  const profileSummary = manager && !liveClubMismatch
    ? `**Summary**: ${manager.tacticalSummary}\n`
    : ''
  const profileContextNote = manager && liveClubMismatch
    ? `**Profile Context Note**: Use the stored style, principles, and role requirements below only as generic coaching tendencies. The stored club context is outdated for current-employment framing.\n`
    : ''

  const managerSection = manager
    ? `${liveContextHeader}${liveContextRule}${profileContextNote}**Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} line, ${manager.style.buildUp} build-up, ${manager.style.attackingMentality} attacking mentality
${profileSummary}**Identity Writing Rule**: Describe the XI's current tactical behaviour, not the manager's old employment story. If live club/status and stored profile club disagree, the live club/status wins.
**Key Principles**: ${manager.keyPrinciples.join('; ')}
**Positional Requirements**:
${manager.positionalRequirements.map((r) => `  ${r.position} (${r.profileLabel}): must have ${r.mustHave.join(', ')} | avoid if ${r.avoidIf.join(', ')}`).join('\n')}`
    : `${liveContextHeader}${liveContextRule}Use the live manager context above as the primary source of truth. Infer the tactical roles from the recent shape and current context, and only lean on broader football knowledge for stylistic details that the live data does not provide. Never reference a former club, previous job, or stale tactical "DNA" label as if it were the manager's current situation.`

  return { resolvedName, currentDate, managerSection, livePrimaryFormation }
}

async function generateManagerXIStructure(
  resolvedName: string,
  currentDate: string,
  managerSection: string,
  budget: string,
  extraBudgetInstructions?: string,
  lockedFormation?: string | null,
  liveContext?: ManagerXILiveContext,
  language: LanguageCode = DEFAULT_LANGUAGE
): Promise<ManagerXIStructure> {
  const prompt = withOutputLanguage(`You are an elite football scout and tactical analyst. Today is ${currentDate}. Design the STRUCTURE of the ideal starting XI for ${resolvedName}'s system within the stated budget.

## Manager: ${resolvedName}
${managerSection}

## Budget: ${budget}
${extraBudgetInstructions ? `\n## HARD BUDGET GUARDRAIL:\n${extraBudgetInstructions}` : ''}
${lockedFormation ? `\n## FORMATION RULE:\nUse exactly ${lockedFormation} as the base formation. Do not switch to another formation family or invent a different primary shape.` : ''}

## Your Task:
1. ${lockedFormation ? `Use ${lockedFormation} as the formation` : `Choose one formation that perfectly suits ${resolvedName}'s system`}
2. Return exactly 11 slots for that formation
3. For each slot, give the exact position code and archetype label that best describes the role
4. Use side-specific position codes where appropriate, e.g. LCB / CB / RCB or LWB / RWB
5. Write the identity as a present-day tactical description only. Do not reference former clubs, former jobs, outdated employers, or legacy labels like "Middlesbrough DNA" unless the live current club above explicitly matches that club.

Return ONLY this JSON:
{
  "formation": "${lockedFormation || '4-3-3'}",
  "managerName": "${resolvedName}",
  "identity": "Max 2 short sentences on the tactical DNA of this XI",
  "slots": [
    {
      "slotId": "GK",
      "position": "GK",
      "archetypeLabel": "Sweeper-Keeper"
    }
  ]
}

Position values: GK, LCB, CB, RCB, LB, RB, LWB, RWB, CM, CAM, CDM, LW, RW, ST, CF, WB
There must be exactly 11 slots.`, language)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const structure = normalizeManagerXIStructure(
      extractJSON(sanitizeHomoglyphs(raw), 'object') as ManagerXIStructure
    )

    if (lockedFormation) {
      return {
        ...structure,
        formation: lockedFormation,
      }
    }

    return structure
  } catch (error) {
    if (lockedFormation) {
      const fallbackSlots = buildCanonicalFormationSlots(lockedFormation)
      if (fallbackSlots) {
        return {
          formation: lockedFormation,
          managerName: resolvedName,
          identity: buildFallbackManagerXIIdentity(lockedFormation, resolvedName, liveContext),
          slots: fallbackSlots,
        }
      }
    }

    throw error
  }
}

async function generateManagerXICandidateBatch(
  resolvedName: string,
  currentDate: string,
  managerSection: string,
  budget: string,
  slots: ManagerXIStructureSlot[],
  extraBudgetInstructions?: string
): Promise<ManagerXICandidateBatch> {
  const slotList = slots
    .map((slot) => `- ${slot.slotId}: ${slot.position} | ${slot.archetypeLabel}`)
    .join('\n')

  const prompt = `You are an elite football scout and tactical analyst. Today is ${currentDate}. Fill these specific XI slots for ${resolvedName}'s system.

## Manager: ${resolvedName}
${managerSection}

## Budget: ${budget}
${extraBudgetInstructions ? `\n## HARD BUDGET GUARDRAIL:\n${extraBudgetInstructions}` : ''}

## Slots To Fill:
${slotList}

## Rules:
1. For EACH slot, return exactly 2 candidates:
   - one best-fit option
   - one cheaper or more flexible fallback option
2. Every player must be ACTIVELY playing professional football right now
3. Be highly confident about current club
4. Keep fees realistic for the stated budget
5. Use only standard Latin characters in names
6. Think like a shortlist scout, not the final selector. Prioritize true role fit, live current-club accuracy, and budget variety across the two names because a server-side selector will verify prices and make the final XI.
7. Only include players you are confident can be found easily on Transfermarkt player search with the exact spelling you provide.

Return ONLY plain text lines in this exact format, with no bullets, no numbering, no markdown, and no extra commentary:
slotId|playerName|age|currentClub|estimatedFee|systemFitScore

Example:
GK|Bart Verbruggen|23|Brighton & Hove Albion|€40M|93`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 700,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = sanitizeHomoglyphs(raw)
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')

  const parsedSlots = new Map<string, ManagerXISlotCandidate[]>()
  for (const line of cleaned.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
    const parts = line.split('|').map((entry) => entry.trim())
    if (parts.length < 6) continue

    const [slotId, playerName, ageText, currentClub, estimatedFee, fitScoreText] = parts
    if (!slotId || !playerName) continue

    const age = Number.parseInt(ageText || '', 10)
    const systemFitScore = Number.parseInt(fitScoreText || '', 10)
    const existing = parsedSlots.get(slotId) || []

    existing.push({
      playerName,
      age: Number.isFinite(age) ? age : 24,
      currentClub,
      estimatedFee,
      systemFitScore: Number.isFinite(systemFitScore) ? systemFitScore : 75,
    })

    parsedSlots.set(slotId, existing)
  }

  return {
    slots: slots.map((slot) => ({
      slotId: slot.slotId,
      candidates: (parsedSlots.get(slot.slotId) || []).slice(0, 2),
    })),
  }
}

export async function generateManagerXICandidatePool(
  budget: string,
  manager: ManagerProfile | null,
  managerName?: string,
  extraBudgetInstructions?: string,
  liveContext?: ManagerXILiveContext,
  language: LanguageCode = DEFAULT_LANGUAGE
): Promise<ManagerXICandidatePool> {
  const { resolvedName, currentDate, managerSection, livePrimaryFormation } = buildManagerXIContext(manager, managerName, liveContext)
  const structure = await generateManagerXIStructure(
    resolvedName,
    currentDate,
    managerSection,
    budget,
    extraBudgetInstructions,
    livePrimaryFormation,
    liveContext,
    language
  )

  const batchResults = await Promise.all(
    [
      structure.slots.slice(0, 6),
      structure.slots.slice(6),
    ]
      .filter((batch) => batch.length > 0)
      .map((batch) =>
      generateManagerXICandidateBatch(
        resolvedName,
        currentDate,
        managerSection,
        budget,
        batch,
        extraBudgetInstructions
      )
    )
  )

  const candidatesBySlot = new Map<string, ManagerXISlotCandidate[]>()
  for (const batch of batchResults) {
    for (const slot of batch.slots || []) {
      candidatesBySlot.set(slot.slotId, slot.candidates || [])
    }
  }

  return {
    formation: structure.formation,
    managerName: structure.managerName,
    identity: structure.identity,
    slots: structure.slots.map((slot) => ({
      slotId: slot.slotId,
      position: slot.position,
      archetypeLabel: slot.archetypeLabel,
      candidates: candidatesBySlot.get(slot.slotId) || [],
    })),
  }
}

export async function buildManagerXI(
  manager: ManagerProfile | null,
  budget: string,
  managerName?: string,
  liveContext?: ManagerXILiveContext,
  language: LanguageCode = DEFAULT_LANGUAGE
): Promise<ManagerXIResult> {
  const { resolvedName, currentDate, managerSection, livePrimaryFormation } = buildManagerXIContext(
    manager,
    managerName,
    liveContext
  )

  const prompt = withOutputLanguage(`You are an elite football scout and tactical analyst. Today is ${currentDate}. Build the ideal starting XI for ${resolvedName}'s system within the stated budget — not bargain hunters, but the players who best embody what this manager demands from each position.

## Manager: ${resolvedName}
${managerSection}

## Budget: ${budget}
${livePrimaryFormation ? `\n## FORMATION RULE:\nUse exactly ${livePrimaryFormation} as the base formation for this XI. Do not switch to a different primary shape.` : ''}

## Rules:
1. Pick exactly 11 players in ${livePrimaryFormation || 'the live recent shape provided above'} for ${resolvedName}'s system
2. Every player must be ACTIVELY playing professional football right now
3. These are the IDEAL PROFILE players — the ones who most perfectly embody what ${resolvedName} wants at each position. Not necessarily the most famous, but the most tactically aligned.
4. Budget constrains the realistic pool: if budget is €100M, you can't fill 11 positions with €50M players each — be realistic about fees. If budget is "Unlimited", pick the absolute best profile players money can buy.
5. Include players from different leagues for variety.
6. The identity text must describe the XI's current tactical behaviour only. Do not frame the current build around a former club, previous job, or stale label if the live manager context above points somewhere else.

## ACCURACY RULES (critical):
- Only recommend currently ACTIVE professional players
- Be highly confident about current club — if unsure, skip and pick someone else
- For players on loan: use their CURRENT loan destination
- Use only standard Latin characters in names

Return ONLY this JSON:
{
  "formation": "${livePrimaryFormation || '4-3-3'}",
  "managerName": "${resolvedName}",
  "identity": "2-3 sentences: the tactical DNA of this XI — what makes it uniquely suited to this manager's system and philosophy",
  "totalEstimatedCost": "≈€XM",
  "players": [
    {
      "playerName": "Full Name",
      "position": "GK",
      "archetypeLabel": "Sweeper-Keeper",
      "age": 27,
      "nationality": "Country",
      "currentClub": "Club Name",
      "estimatedFee": "€45M",
      "contractUntil": "2027",
      "whyIdeal": "2 sentences: why this specific player is the textbook profile for this role in ${resolvedName}'s system",
      "systemFitScore": 92
    }
  ]
}

Position values: GK, LCB, CB, RCB, LB, RB, LWB, RWB, CM, CAM, CDM, LW, RW, ST, CF, WB
Cover every position in your chosen formation — exactly 11 players.`, language)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  return extractJSON(sanitizeHomoglyphs(raw), 'object') as ManagerXIResult
}

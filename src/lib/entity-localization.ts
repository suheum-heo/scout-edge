import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

import type {
  PlayerCompatibilityResult,
  PlayerSystemFit,
  ScenarioResult,
  SquadAnalysisResult,
  TransferTarget,
  TransferVerdictResult,
  UndervaluedPlayer,
  UndervaluedXIResult,
  ManagerXIResult,
} from '@/lib/claude'
import type { LanguageCode } from '@/lib/i18n'
import type { TMPlayerData } from '@/lib/transfermarkt'
import { getSharedCacheEntry, setSharedCacheEntry } from '@/lib/shared-cache'
import {
  type EntityType,
  buildLocalizedOutputGuidance,
  getLanguageDisplayName,
  getManualGlossaryEntries,
  localizeGeneratedContent,
  lookupManualLocalizedName,
  translateFootballTerm,
  translateScenarioDimensionLabel,
} from '@/lib/football-localization'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const NAME_LOCALIZATION_SCOPE = 'entity-localization-v1'
const NAME_LOCALIZATION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const NAME_BATCH_SIZE = 24
const inMemoryNameCache = new Map<string, string>()

interface LocalizableEntity {
  name: string
  entityType: EntityType
}

interface ResolveLocalizedEntityMapOptions {
  allowLlmFallback?: boolean
}

function shouldUseLLMNameLocalization(language: LanguageCode): boolean {
  return language === 'ko' || language === 'ja'
}

function normalizeCacheValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getNameCacheKey(language: LanguageCode, entityType: EntityType, name: string): string {
  return `${language}|${entityType}|${normalizeCacheValue(name)}`
}

function dedupeEntities(entries: LocalizableEntity[]): LocalizableEntity[] {
  const seen = new Set<string>()
  const unique: LocalizableEntity[] = []

  for (const entry of entries) {
    if (!entry.name?.trim()) continue
    const key = `${entry.entityType}|${normalizeCacheValue(entry.name)}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({ ...entry, name: entry.name.trim() })
  }

  return unique
}

async function readCachedLocalizedName(
  language: LanguageCode,
  entityType: EntityType,
  name: string
): Promise<string | null> {
  const cacheKey = getNameCacheKey(language, entityType, name)
  const memoryHit = inMemoryNameCache.get(cacheKey)
  if (memoryHit) return memoryHit

  const sharedHit = await getSharedCacheEntry<string>(NAME_LOCALIZATION_SCOPE, cacheKey)
  if (sharedHit) {
    inMemoryNameCache.set(cacheKey, sharedHit)
    return sharedHit
  }

  return null
}

async function writeCachedLocalizedName(
  language: LanguageCode,
  entityType: EntityType,
  name: string,
  localizedName: string
) {
  const cacheKey = getNameCacheKey(language, entityType, name)
  inMemoryNameCache.set(cacheKey, localizedName)
  await setSharedCacheEntry(NAME_LOCALIZATION_SCOPE, cacheKey, localizedName, NAME_LOCALIZATION_TTL_MS, {
    entityType,
    sourceName: name,
    language,
  })
}

async function localizeEntityBatchWithLLM(
  entries: LocalizableEntity[],
  language: LanguageCode
): Promise<Record<string, string>> {
  if (!entries.length || !process.env.ANTHROPIC_API_KEY) {
    return Object.fromEntries(entries.map((entry) => [entry.name, entry.name]))
  }

  const glossaryLines = Object.entries(getManualGlossaryEntries(language))
    .slice(0, 20)
    .map(([source, localized]) => `- "${source}" -> "${localized}"`)
    .join('\n')

  const list = entries
    .map((entry, index) => `${index + 1}. ${entry.entityType}|${entry.name}`)
    .join('\n')

  const prompt = [
    `You localize football proper nouns for ${getLanguageDisplayName(language)} product UI.`,
    buildLocalizedOutputGuidance(language),
    'Use the glossary exactly when applicable.',
    glossaryLines ? `Glossary:\n${glossaryLines}` : '',
    'Return ONLY valid JSON in this shape:',
    '[{"name":"Original Name","localizedName":"Localized Name"}]',
    'Rules:',
    '- Preserve the exact source "name" field in the JSON output.',
    '- If the name has a widely used localized form, use it.',
    '- If you are not confident, repeat the original name unchanged.',
    '- Do not add explanation, markdown, or extra keys.',
    '',
    'Names to localize:',
    list,
  ].filter(Boolean).join('\n')

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1400,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '[]'
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    const rawJson = start >= 0 && end >= 0 ? text.slice(start, end + 1) : '[]'
    const parsed = JSON.parse(rawJson) as Array<{ name?: string; localizedName?: string }>

    const map: Record<string, string> = {}
    for (const entry of parsed) {
      if (!entry?.name) continue
      map[entry.name] = entry.localizedName?.trim() || entry.name
    }

    return map
  } catch (error) {
    console.warn('Entity-name localization fallback failed:', error)
    return Object.fromEntries(entries.map((entry) => [entry.name, entry.name]))
  }
}

export async function resolveLocalizedEntityMap(
  entries: LocalizableEntity[],
  language: LanguageCode,
  options?: ResolveLocalizedEntityMapOptions
): Promise<Record<string, string>> {
  const uniqueEntries = dedupeEntities(entries)
  if (!uniqueEntries.length || language === 'en') {
    return Object.fromEntries(uniqueEntries.map((entry) => [entry.name, entry.name]))
  }

  const resolved = new Map<string, string>()
  const unresolved: LocalizableEntity[] = []

  for (const entry of uniqueEntries) {
    const manual = lookupManualLocalizedName(entry.name, entry.entityType, language)
    if (manual) {
      resolved.set(entry.name, manual)
      await writeCachedLocalizedName(language, entry.entityType, entry.name, manual)
      continue
    }

    const cached = await readCachedLocalizedName(language, entry.entityType, entry.name)
    if (cached) {
      resolved.set(entry.name, cached)
      continue
    }

    unresolved.push(entry)
  }

  if (unresolved.length > 0) {
    if (options?.allowLlmFallback === false || !shouldUseLLMNameLocalization(language)) {
      for (const entry of unresolved) {
        resolved.set(entry.name, entry.name)
      }
    } else {
      for (let index = 0; index < unresolved.length; index += NAME_BATCH_SIZE) {
        const chunk = unresolved.slice(index, index + NAME_BATCH_SIZE)
        const localizedChunk = await localizeEntityBatchWithLLM(chunk, language)

        await Promise.all(chunk.map(async (entry) => {
          const localized = localizedChunk[entry.name] || entry.name
          resolved.set(entry.name, localized)
          await writeCachedLocalizedName(language, entry.entityType, entry.name, localized)
        }))
      }
    }
  }

  return Object.fromEntries(uniqueEntries.map((entry) => [entry.name, resolved.get(entry.name) || entry.name]))
}

export async function localizeEntityName(
  name: string,
  entityType: EntityType,
  language: LanguageCode
): Promise<string> {
  const map = await resolveLocalizedEntityMap([{ name, entityType }], language)
  return map[name] || name
}

function localizeDisplayText<T>(content: T, language: LanguageCode, nameMap: Record<string, string>): T {
  return localizeGeneratedContent(content, language, { glossary: nameMap })
}

function localizeDisplayLabel(
  value: string | undefined,
  language: LanguageCode,
  nameMap: Record<string, string>
): string | undefined {
  if (!value) return value
  return localizeDisplayText(nameMap[value] || value, language, nameMap)
}

export async function localizeSquadAnalysisResult(
  analysis: SquadAnalysisResult,
  language: LanguageCode
): Promise<SquadAnalysisResult> {
  const nameMap = await resolveLocalizedEntityMap([
    { name: analysis.managerName, entityType: 'manager' },
    { name: analysis.teamName, entityType: 'club' },
  ], language)

  return {
    ...analysis,
    displayManagerName: nameMap[analysis.managerName] || analysis.managerName,
    displayTeamName: nameMap[analysis.teamName] || analysis.teamName,
    overallAssessment: localizeDisplayText(analysis.overallAssessment, language, nameMap),
    squadStrengths: localizeDisplayText(analysis.squadStrengths, language, nameMap),
    squadWeaknesses: localizeDisplayText(analysis.squadWeaknesses, language, nameMap),
    gaps: analysis.gaps.map((gap) => ({
      ...gap,
      reasoning: localizeDisplayText(gap.reasoning, language, nameMap),
      displayPositionCode: translateFootballTerm(language, gap.positionCode),
      displayProfileLabel: localizeDisplayText(gap.profileLabel, language, nameMap),
      displayKeyStatsPriority: gap.keyStatsPriority.map((stat) => translateFootballTerm(language, stat)),
    })),
  }
}

export async function localizeTransferTargets(
  targets: TransferTarget[],
  language: LanguageCode
): Promise<TransferTarget[]> {
  const entries: LocalizableEntity[] = targets.flatMap((target) => [
    { name: target.playerName, entityType: 'player' as const },
    { name: target.currentClub, entityType: 'club' as const },
  ])
  const nameMap = await resolveLocalizedEntityMap(entries, language)

  return targets.map((target) => ({
    ...target,
    displayName: nameMap[target.playerName] || target.playerName,
    displayCurrentClub: localizeDisplayLabel(target.currentClub, language, nameMap) || target.currentClub,
    fitSummary: localizeDisplayText(target.fitSummary, language, nameMap),
    strengths: localizeDisplayText(target.strengths, language, nameMap),
    concerns: localizeDisplayText(target.concerns, language, nameMap),
    whyThisPlayer: localizeDisplayText(target.whyThisPlayer, language, nameMap),
  }))
}

export async function localizeSquadFitResults(
  fits: PlayerSystemFit[],
  language: LanguageCode
): Promise<PlayerSystemFit[]> {
  const nameMap = await resolveLocalizedEntityMap(
    fits.map((fit) => ({ name: fit.playerName, entityType: 'player' as const })),
    language
  )

  return fits.map((fit) => ({
    ...fit,
    displayName: nameMap[fit.playerName] || fit.playerName,
    reason: localizeDisplayText(fit.reason, language, nameMap),
  }))
}

export async function localizePlayerCompatibilityResult(
  result: PlayerCompatibilityResult,
  language: LanguageCode
): Promise<PlayerCompatibilityResult> {
  const entries: LocalizableEntity[] = [
    { name: result.playerName, entityType: 'player' },
    { name: result.managerName, entityType: 'manager' },
    ...(result.currentClub ? [{ name: result.currentClub, entityType: 'club' as const }] : []),
  ]
  const nameMap = await resolveLocalizedEntityMap(entries, language)

  return {
    ...result,
    displayPlayerName: nameMap[result.playerName] || result.playerName,
    displayManagerName: nameMap[result.managerName] || result.managerName,
    displayCurrentClub: localizeDisplayLabel(result.currentClub, language, nameMap),
    verdict: localizeDisplayText(result.verdict, language, nameMap),
    tacticalRole: localizeDisplayText(result.tacticalRole, language, nameMap),
    strengths: localizeDisplayText(result.strengths, language, nameMap),
    concerns: localizeDisplayText(result.concerns, language, nameMap),
    conditions: localizeDisplayText(result.conditions, language, nameMap),
    comparison: localizeDisplayText(result.comparison, language, nameMap),
  }
}

export async function localizeTransferVerdictResult(
  result: TransferVerdictResult,
  language: LanguageCode
): Promise<TransferVerdictResult> {
  const nameMap = await resolveLocalizedEntityMap([
    { name: result.playerName, entityType: 'player' },
    { name: result.targetClub, entityType: 'club' },
    { name: result.managerName, entityType: 'manager' },
  ], language)

  return {
    ...result,
    displayPlayerName: nameMap[result.playerName] || result.playerName,
    displayTargetClub: nameMap[result.targetClub] || result.targetClub,
    displayManagerName: nameMap[result.managerName] || result.managerName,
    headline: localizeDisplayText(result.headline, language, nameMap),
    whyItWorks: localizeDisplayText(result.whyItWorks, language, nameMap),
    whyItDoesnt: localizeDisplayText(result.whyItDoesnt, language, nameMap),
    roleInSystem: localizeDisplayText(result.roleInSystem, language, nameMap),
    needAssessment: localizeDisplayText(result.needAssessment, language, nameMap),
    valueAssessment: localizeDisplayText(result.valueAssessment, language, nameMap),
    timing: localizeDisplayText(result.timing, language, nameMap),
    scoutVerdict: localizeDisplayText(result.scoutVerdict, language, nameMap),
  }
}

export async function localizeScenarioResult(
  result: ScenarioResult,
  language: LanguageCode
): Promise<ScenarioResult> {
  const playerEntries: LocalizableEntity[] = [
    ...result.playersOut.map((player) => ({ name: player.name, entityType: 'player' as const })),
    ...result.playersIn.map((player) => ({ name: player.name, entityType: 'player' as const })),
  ]
  const nameMap = await resolveLocalizedEntityMap(playerEntries, language)

  return {
    ...result,
    verdict: localizeDisplayText(result.verdict, language, nameMap),
    risks: localizeDisplayText(result.risks, language, nameMap),
    playersOut: result.playersOut.map((player) => ({
      ...player,
      displayName: nameMap[player.name] || player.name,
    })),
    playersIn: result.playersIn.map((player) => ({
      ...player,
      displayName: nameMap[player.name] || player.name,
    })),
    dimensions: result.dimensions.map((dimension) => ({
      ...dimension,
      label: translateScenarioDimensionLabel(language, dimension.key, dimension.label),
      insight: localizeDisplayText(dimension.insight, language, nameMap),
    })),
  }
}

async function localizeDisplayPlayers<T extends { playerName: string; currentClub: string; whyUndervalued?: string; whyIdeal?: string }>(
  players: T[],
  language: LanguageCode
): Promise<{ players: T[]; nameMap: Record<string, string> }> {
  const nameMap = await resolveLocalizedEntityMap(
    players.flatMap((player) => [
      { name: player.playerName, entityType: 'player' as const },
      { name: player.currentClub, entityType: 'club' as const },
    ]),
    language
  )

  return {
    nameMap,
    players: players.map((player) => ({
      ...player,
      displayName: nameMap[player.playerName] || player.playerName,
      displayCurrentClub: localizeDisplayLabel(player.currentClub, language, nameMap) || player.currentClub,
      ...(typeof player.whyUndervalued === 'string'
        ? { whyUndervalued: localizeDisplayText(player.whyUndervalued, language, nameMap) }
        : {}),
      ...(typeof player.whyIdeal === 'string'
        ? { whyIdeal: localizeDisplayText(player.whyIdeal, language, nameMap) }
        : {}),
    })),
  }
}

export async function localizeUndervaluedXIResult(
  result: UndervaluedXIResult,
  language: LanguageCode
): Promise<UndervaluedXIResult> {
  const { players, nameMap } = await localizeDisplayPlayers<UndervaluedPlayer>(result.players, language)
  return {
    ...result,
    concept: localizeDisplayText(result.concept, language, nameMap),
    players,
  }
}

export async function localizeManagerXIResult(
  result: ManagerXIResult,
  language: LanguageCode
): Promise<ManagerXIResult> {
  const entries: LocalizableEntity[] = [
    { name: result.managerName, entityType: 'manager' },
    ...result.players.flatMap((player) => [
      { name: player.playerName, entityType: 'player' as const },
      { name: player.currentClub, entityType: 'club' as const },
    ]),
  ]
  const nameMap = await resolveLocalizedEntityMap(entries, language)
  const players = result.players.map((player) => ({
    ...player,
    displayName: nameMap[player.playerName] || player.playerName,
    displayCurrentClub: localizeDisplayLabel(player.currentClub, language, nameMap) || player.currentClub,
    whyIdeal: localizeDisplayText(player.whyIdeal, language, nameMap),
  }))

  return {
    ...result,
    displayManagerName: nameMap[result.managerName] || result.managerName,
    identity: localizeDisplayText(result.identity, language, nameMap),
    players,
  }
}

export async function localizeTMPlayerData(
  player: TMPlayerData | null,
  language: LanguageCode
): Promise<(TMPlayerData & { displayName?: string; displayCurrentClub?: string }) | null> {
  if (!player) return null
  const nameMap = await resolveLocalizedEntityMap([
    { name: player.name, entityType: 'player' },
    { name: player.currentClub, entityType: 'club' },
  ], language)

  return {
    ...player,
    displayName: nameMap[player.name] || player.name,
    displayCurrentClub: localizeDisplayLabel(player.currentClub, language, nameMap) || player.currentClub,
  }
}

export async function localizeTeamSearchResults<T extends { team: { name: string } }>(
  teams: T[],
  language: LanguageCode
): Promise<Array<T & { team: T['team'] & { displayName?: string } }>> {
  const nameMap = await resolveLocalizedEntityMap(
    teams.map((entry) => ({ name: entry.team.name, entityType: 'club' as const })),
    language,
    { allowLlmFallback: false }
  )

  return teams.map((entry) => ({
    ...entry,
    team: {
      ...entry.team,
      displayName: nameMap[entry.team.name] || entry.team.name,
    },
  }))
}

export async function localizeManagerSearchResults<T extends { name: string; currentClub?: string }>(
  managers: T[],
  language: LanguageCode
): Promise<Array<T & { displayName?: string; displayCurrentClub?: string }>> {
  const nameMap = await resolveLocalizedEntityMap(
    managers.flatMap((manager) => [
      { name: manager.name, entityType: 'manager' as const },
      ...(manager.currentClub ? [{ name: manager.currentClub, entityType: 'club' as const }] : []),
    ]),
    language,
    { allowLlmFallback: false }
  )

  return managers.map((manager) => ({
    ...manager,
    displayName: nameMap[manager.name] || manager.name,
    displayCurrentClub: localizeDisplayLabel(manager.currentClub, language, nameMap),
  }))
}

export async function localizePlayerSearchResults<T extends { name: string; club?: string }>(
  players: T[],
  language: LanguageCode
): Promise<Array<T & { displayName?: string; displayClub?: string }>> {
  const nameMap = await resolveLocalizedEntityMap(
    players.flatMap((player) => [
      { name: player.name, entityType: 'player' as const },
      ...(player.club ? [{ name: player.club, entityType: 'club' as const }] : []),
    ]),
    language,
    { allowLlmFallback: false }
  )

  return players.map((player) => ({
    ...player,
    displayName: nameMap[player.name] || player.name,
    displayClub: localizeDisplayLabel(player.club, language, nameMap),
  }))
}

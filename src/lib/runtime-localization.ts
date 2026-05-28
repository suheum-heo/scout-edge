import Anthropic from '@anthropic-ai/sdk'
import type { ManagerProfile } from '@/lib/managers'
import {
  DEFAULT_LANGUAGE,
  type LanguageCode,
  getEnglishMessages,
  getStaticMessages,
  needsRuntimeMessages,
} from '@/lib/i18n'
import {
  buildLocalizedOutputGuidance,
  getManualGlossaryEntries,
  localizeGeneratedContent,
} from '@/lib/football-localization'
import { getSharedCacheEntry, setSharedCacheEntry } from '@/lib/shared-cache'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MESSAGE_SCOPE = 'runtime-i18n-catalog-v5'
const MANAGER_SCOPE = 'runtime-i18n-manager-v2'
const MESSAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MANAGER_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MESSAGE_CHUNK_SIZE = 24
const RETRY_MESSAGE_CHUNK_SIZE = 8

const messageMemoryCache = new Map<string, Record<string, string>>()
const managerMemoryCache = new Map<string, ManagerProfile>()

const languageNames: Record<LanguageCode, string> = {
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

function extractFirstText(response: Awaited<ReturnType<typeof anthropic.messages.create>>): string {
  if (!('content' in response)) return ''
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
  return textBlock?.text ?? ''
}

function extractJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in translation response')

  let depth = 0
  let end = -1
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1
    if (text[index] === '}') {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }

  const raw = end === -1 ? text.slice(start) : text.slice(start, end + 1)
  return JSON.parse(raw) as Record<string, unknown>
}

function mergeMessageCatalog(candidate: Record<string, unknown> | null | undefined): Record<string, string> {
  const base = getEnglishMessages()
  const resolved: Record<string, string> = {}

  for (const [key, value] of Object.entries(base)) {
    resolved[key] = typeof candidate?.[key] === 'string' ? candidate[key] as string : value
  }

  return resolved
}

function normalizeMessageCatalogChunk(
  sourceMessages: Record<string, string>,
  candidate: Record<string, unknown> | null | undefined,
  language: LanguageCode,
  chunkIndex: number,
  totalChunks: number
): Record<string, string> {
  const resolved: Record<string, string> = {}
  const missingKeys: string[] = []
  const invalidKeys: string[] = []
  const unexpectedKeys = candidate
    ? Object.keys(candidate).filter((key) => !(key in sourceMessages))
    : []

  for (const [key, value] of Object.entries(sourceMessages)) {
    if (!(key in (candidate || {}))) {
      missingKeys.push(key)
      resolved[key] = value
      continue
    }

    if (typeof candidate?.[key] !== 'string') {
      invalidKeys.push(key)
      resolved[key] = value
      continue
    }

    resolved[key] = candidate[key] as string
  }

  if (missingKeys.length || invalidKeys.length || unexpectedKeys.length) {
    console.warn(
      `[i18n] runtime catalog chunk ${chunkIndex}/${totalChunks} normalized for ${language}: missing=${missingKeys.length} invalid=${invalidKeys.length} unexpected=${unexpectedKeys.length}`,
      {
        missingKeys: missingKeys.slice(0, 5),
        invalidKeys: invalidKeys.slice(0, 5),
        unexpectedKeys: unexpectedKeys.slice(0, 5),
      }
    )
  }

  return resolved
}

function splitMessageCatalog(sourceMessages: Record<string, string>): Array<Record<string, string>> {
  const entries = Object.entries(sourceMessages)
  const chunks: Array<Record<string, string>> = []

  for (let index = 0; index < entries.length; index += MESSAGE_CHUNK_SIZE) {
    chunks.push(Object.fromEntries(entries.slice(index, index + MESSAGE_CHUNK_SIZE)))
  }

  return chunks
}

function getMeaningfulUntranslatedKeys(sourceMessages: Record<string, string>, candidate: Record<string, string>): string[] {
  return Object.entries(sourceMessages)
    .filter(([key, value]) => {
      if (candidate[key] !== value) return false
      const normalized = value.trim()
      if (normalized.length < 8) return false
      if (!/[a-z]/i.test(normalized)) return false
      return /[a-z]{3,}/i.test(normalized)
    })
    .map(([key]) => key)
}

function splitSubset(sourceMessages: Record<string, string>, keys: string[], chunkSize: number): Array<Record<string, string>> {
  const chunks: Array<Record<string, string>> = []

  for (let index = 0; index < keys.length; index += chunkSize) {
    const subsetKeys = keys.slice(index, index + chunkSize)
    chunks.push(
      Object.fromEntries(subsetKeys.map((key) => [key, sourceMessages[key]]))
    )
  }

  return chunks
}

async function translateMessageCatalogChunk(
  sourceMessages: Record<string, string>,
  language: LanguageCode,
  chunkIndex: number,
  totalChunks: number,
  strict = false
): Promise<Record<string, string>> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Translate every VALUE in this JSON object from English to ${languageNames[language]}.

Rules:
- Return a JSON object with exactly the same keys.
- Keep placeholders like {count}, {name}, {manager}, {budget}, {player}, {value}, and {suffix} intact if they are needed.
- You may drop {suffix} if the target language sounds more natural without it, but do not invent any new placeholders.
- Keep football tactical codes such as GK, CB, CAM, RB, LB, ST, CF, 4-4-2, 3-2-4-1, API names, ScoutEdge, Claude AI, and euro figures unchanged unless grammar requires a nearby word change.
- Keep player, club, and manager proper names in their official spelling.
- Return JSON only, with no markdown fences and no commentary.
- This is chunk ${chunkIndex} of ${totalChunks}; translate all keys in this chunk.
${strict ? '- Do not leave ordinary UI copy in English. If a value is a sentence, heading, label, placeholder, or helper text, translate it unless it is a brand name or football code.' : ''}

${JSON.stringify(sourceMessages)}`,
    }],
  })

  return normalizeMessageCatalogChunk(
    sourceMessages,
    extractJsonObject(extractFirstText(response)),
    language,
    chunkIndex,
    totalChunks
  )
}

async function retryUntranslatedMessageKeys(
  sourceMessages: Record<string, string>,
  normalizedChunk: Record<string, string>,
  language: LanguageCode,
  chunkIndex: number,
  totalChunks: number
): Promise<Record<string, string>> {
  const retryKeys = getMeaningfulUntranslatedKeys(sourceMessages, normalizedChunk)
  if (retryKeys.length === 0) return normalizedChunk

  console.warn(
    `[i18n] runtime catalog chunk ${chunkIndex}/${totalChunks} for ${language} kept ${retryKeys.length} meaningful values in English; retrying`,
    { retryKeys: retryKeys.slice(0, 8) }
  )

  const retryChunks = splitSubset(sourceMessages, retryKeys, RETRY_MESSAGE_CHUNK_SIZE)
  const retriedEntries = await Promise.all(
    retryChunks.map((chunk, retryIndex) =>
      translateMessageCatalogChunk(chunk, language, retryIndex + 1, retryChunks.length, true)
        .catch((error) => {
          console.error(
            `[i18n] retry chunk ${retryIndex + 1}/${retryChunks.length} failed for ${language} (parent chunk ${chunkIndex}/${totalChunks}):`,
            error
          )
          return chunk
        })
    )
  )

  const retryMerged = Object.assign({}, ...retriedEntries) as Record<string, string>
  const merged = {
    ...normalizedChunk,
    ...retryMerged,
  }

  const finalRetryKeys = getMeaningfulUntranslatedKeys(sourceMessages, merged)
  if (finalRetryKeys.length === 0) {
    return merged
  }

  console.warn(
    `[i18n] runtime catalog chunk ${chunkIndex}/${totalChunks} for ${language} still has ${finalRetryKeys.length} meaningful English values after grouped retry; retrying individually`,
    { finalRetryKeys: finalRetryKeys.slice(0, 8) }
  )

  const individualEntries = await Promise.all(
    finalRetryKeys.map((key) =>
      translateMessageCatalogChunk({ [key]: sourceMessages[key] }, language, 1, 1, true)
        .catch((error) => {
          console.error(
            `[i18n] individual retry failed for ${language} key=${key} (parent chunk ${chunkIndex}/${totalChunks}):`,
            error
          )
          return { [key]: sourceMessages[key] }
        })
    )
  )

  const individualMerged = Object.assign({}, ...individualEntries) as Record<string, string>
  const finalMerged = {
    ...merged,
    ...individualMerged,
  }
  const unresolvedKeys = getMeaningfulUntranslatedKeys(sourceMessages, finalMerged)

  if (unresolvedKeys.length > 0) {
    console.warn(
      `[i18n] runtime catalog chunk ${chunkIndex}/${totalChunks} for ${language} still has unresolved English values after individual retries`,
      { unresolvedKeys: unresolvedKeys.slice(0, 8) }
    )
  }

  return finalMerged
}

async function translateMessageCatalog(language: LanguageCode): Promise<Record<string, string>> {
  const sourceMessages = getEnglishMessages()
  const chunks = splitMessageCatalog(sourceMessages)
  const translatedChunks = await Promise.all(
    chunks.map((chunk, index) =>
      translateMessageCatalogChunk(chunk, language, index + 1, chunks.length)
        .then((normalizedChunk) =>
          retryUntranslatedMessageKeys(chunk, normalizedChunk, language, index + 1, chunks.length)
        )
        .catch((error) => {
          console.error(`[i18n] runtime catalog chunk ${index + 1}/${chunks.length} failed for ${language}:`, error)
          return chunk
        })
    )
  )

  return mergeMessageCatalog(Object.assign({}, ...translatedChunks))
}

interface LocalizedManagerPayload {
  tacticalSummary?: unknown
  keyPrinciples?: unknown
  positionalRequirements?: unknown
}

function localizedStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value as string[]
    : fallback
}

function normalizeLocalizedManagerProfile(profile: ManagerProfile, language: LanguageCode): ManagerProfile {
  if (language === 'en') return profile

  const glossary = getManualGlossaryEntries(language)

  return {
    ...profile,
    tacticalSummary: localizeGeneratedContent(profile.tacticalSummary, language, { glossary }),
    keyPrinciples: localizeGeneratedContent(profile.keyPrinciples, language, { glossary }),
    positionalRequirements: profile.positionalRequirements.map((requirement) => ({
      ...requirement,
      profileLabel: localizeGeneratedContent(requirement.profileLabel, language, { glossary }),
      tacticalDescription: localizeGeneratedContent(requirement.tacticalDescription, language, { glossary }),
      mustHave: localizeGeneratedContent(requirement.mustHave, language, { glossary }),
      niceToHave: localizeGeneratedContent(requirement.niceToHave, language, { glossary }),
      avoidIf: localizeGeneratedContent(requirement.avoidIf, language, { glossary }),
    })),
  }
}

async function translateManagerProfilePayload(manager: ManagerProfile, language: LanguageCode): Promise<LocalizedManagerPayload> {
  const sourcePayload = {
    tacticalSummary: manager.tacticalSummary,
    keyPrinciples: manager.keyPrinciples,
    positionalRequirements: manager.positionalRequirements.map((requirement) => ({
      profileLabel: requirement.profileLabel,
      tacticalDescription: requirement.tacticalDescription,
      mustHave: requirement.mustHave,
      niceToHave: requirement.niceToHave,
      avoidIf: requirement.avoidIf,
    })),
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: `Translate the free-text values in this JSON from English to ${languageNames[language]}.

Rules:
- Return JSON only.
- Keep the same structure and array lengths.
- Keep JSON keys, football tactical codes, formation strings, and schema structure exact.
- ${buildLocalizedOutputGuidance(language)}
- Use the known glossary exactly when it applies to players, clubs, or managers.
- Do not leave football positions, role titles, attribute labels, or tactical terms in raw English if a natural ${languageNames[language]} form exists.

${JSON.stringify(sourcePayload)}`,
    }],
  })

  return extractJsonObject(extractFirstText(response)) as LocalizedManagerPayload
}

export async function getRuntimeMessageCatalog(language: LanguageCode): Promise<Record<string, string> | null> {
  const staticCatalog = getStaticMessages(language)
  if (staticCatalog) return staticCatalog
  if (!needsRuntimeMessages(language)) return null

  const cacheKey = `catalog:${language}`
  const memoryHit = messageMemoryCache.get(cacheKey)
  if (memoryHit) return memoryHit

  const sharedHit = await getSharedCacheEntry<Record<string, string>>(MESSAGE_SCOPE, cacheKey)
  if (sharedHit) {
    messageMemoryCache.set(cacheKey, sharedHit)
    return sharedHit
  }

  try {
    const translated = await translateMessageCatalog(language)
    messageMemoryCache.set(cacheKey, translated)
    await setSharedCacheEntry(MESSAGE_SCOPE, cacheKey, translated, MESSAGE_TTL_MS, { language })
    return translated
  } catch (error) {
    console.error(`[i18n] runtime catalog translation failed for ${language}:`, error)
    return null
  }
}

export async function localizeManagerProfile(
  manager: ManagerProfile,
  language: LanguageCode = DEFAULT_LANGUAGE
): Promise<ManagerProfile> {
  if (language === 'en') return manager

  const cacheKey = `${manager.id}:${language}`
  const memoryHit = managerMemoryCache.get(cacheKey)
  if (memoryHit) return normalizeLocalizedManagerProfile(memoryHit, language)

  const sharedHit = await getSharedCacheEntry<ManagerProfile>(MANAGER_SCOPE, cacheKey)
  if (sharedHit) {
    const normalizedSharedHit = normalizeLocalizedManagerProfile(sharedHit, language)
    managerMemoryCache.set(cacheKey, normalizedSharedHit)
    return normalizedSharedHit
  }

  try {
    const localizedPayload = await translateManagerProfilePayload(manager, language)
    const localizedProfile: ManagerProfile = {
      ...manager,
      tacticalSummary:
        typeof localizedPayload.tacticalSummary === 'string'
          ? localizedPayload.tacticalSummary
          : manager.tacticalSummary,
      keyPrinciples: localizedStringArray(localizedPayload.keyPrinciples, manager.keyPrinciples),
      positionalRequirements: manager.positionalRequirements.map((requirement, index) => {
        const translatedRequirement = Array.isArray(localizedPayload.positionalRequirements)
          ? localizedPayload.positionalRequirements[index] as Record<string, unknown> | undefined
          : undefined

        return {
          ...requirement,
          profileLabel:
            typeof translatedRequirement?.profileLabel === 'string'
              ? translatedRequirement.profileLabel
              : requirement.profileLabel,
          tacticalDescription:
            typeof translatedRequirement?.tacticalDescription === 'string'
              ? translatedRequirement.tacticalDescription
              : requirement.tacticalDescription,
          mustHave: localizedStringArray(translatedRequirement?.mustHave, requirement.mustHave),
          niceToHave: localizedStringArray(translatedRequirement?.niceToHave, requirement.niceToHave),
          avoidIf: localizedStringArray(translatedRequirement?.avoidIf, requirement.avoidIf),
        }
      }),
    }
    const normalizedProfile = normalizeLocalizedManagerProfile(localizedProfile, language)

    managerMemoryCache.set(cacheKey, normalizedProfile)
    await setSharedCacheEntry(MANAGER_SCOPE, cacheKey, normalizedProfile, MANAGER_TTL_MS, {
      language,
      managerId: manager.id,
    })
    return normalizedProfile
  } catch (error) {
    console.error(`[i18n] manager localization failed for ${manager.id}:${language}:`, error)
    return manager
  }
}

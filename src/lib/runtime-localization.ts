import Anthropic from '@anthropic-ai/sdk'
import type { ManagerProfile } from '@/lib/managers'
import {
  DEFAULT_LANGUAGE,
  type LanguageCode,
  getEnglishMessages,
  getStaticMessages,
  needsRuntimeMessages,
} from '@/lib/i18n'
import { getSharedCacheEntry, setSharedCacheEntry } from '@/lib/shared-cache'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MESSAGE_SCOPE = 'runtime-i18n-catalog-v2'
const MANAGER_SCOPE = 'runtime-i18n-manager-v1'
const MESSAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MANAGER_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MESSAGE_CHUNK_SIZE = 36

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

function splitMessageCatalog(sourceMessages: Record<string, string>): Array<Record<string, string>> {
  const entries = Object.entries(sourceMessages)
  const chunks: Array<Record<string, string>> = []

  for (let index = 0; index < entries.length; index += MESSAGE_CHUNK_SIZE) {
    chunks.push(Object.fromEntries(entries.slice(index, index + MESSAGE_CHUNK_SIZE)))
  }

  return chunks
}

async function translateMessageCatalogChunk(
  sourceMessages: Record<string, string>,
  language: LanguageCode,
  chunkIndex: number,
  totalChunks: number
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

${JSON.stringify(sourceMessages)}`,
    }],
  })

  return mergeMessageCatalog(extractJsonObject(extractFirstText(response)))
}

async function translateMessageCatalog(language: LanguageCode): Promise<Record<string, string>> {
  const sourceMessages = getEnglishMessages()
  const chunks = splitMessageCatalog(sourceMessages)
  const translatedChunks = await Promise.all(
    chunks.map((chunk, index) =>
      translateMessageCatalogChunk(chunk, language, index + 1, chunks.length)
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
- Preserve football codes, stats keys, and proper names in their official spelling.
- Do not rename players, clubs, managers, or tactical codes.

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
  if (memoryHit) return memoryHit

  const sharedHit = await getSharedCacheEntry<ManagerProfile>(MANAGER_SCOPE, cacheKey)
  if (sharedHit) {
    managerMemoryCache.set(cacheKey, sharedHit)
    return sharedHit
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

    managerMemoryCache.set(cacheKey, localizedProfile)
    await setSharedCacheEntry(MANAGER_SCOPE, cacheKey, localizedProfile, MANAGER_TTL_MS, {
      language,
      managerId: manager.id,
    })
    return localizedProfile
  } catch (error) {
    console.error(`[i18n] manager localization failed for ${manager.id}:${language}:`, error)
    return manager
  }
}

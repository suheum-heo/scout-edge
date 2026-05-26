import { getDb } from '@/lib/db'

const SHARED_CACHE_TABLE = 'app_shared_cache'

let ensureSharedCacheTablePromise: Promise<void> | null = null
let sharedCacheTableReady = false
let sharedCacheUnavailableLogged = false

function hasSharedCacheConfig(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

function parseJsonColumn<T>(value: unknown): T | null {
  if (value == null) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
  return value as T
}

async function ensureSharedCacheTable(): Promise<void> {
  if (sharedCacheTableReady || !hasSharedCacheConfig()) return
  if (!ensureSharedCacheTablePromise) {
    ensureSharedCacheTablePromise = (async () => {
      const sql = getDb()

      await sql`
        CREATE TABLE IF NOT EXISTS app_shared_cache (
          cache_scope TEXT NOT NULL,
          cache_key TEXT NOT NULL,
          payload JSONB NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (cache_scope, cache_key)
        )
      `

      await sql`
        CREATE INDEX IF NOT EXISTS idx_app_shared_cache_expires_at
        ON app_shared_cache (expires_at)
      `

      sharedCacheTableReady = true
    })()
  }

  try {
    await ensureSharedCacheTablePromise
  } finally {
    ensureSharedCacheTablePromise = null
  }
}

function logSharedCacheUnavailable(error: unknown) {
  if (sharedCacheUnavailableLogged) return
  sharedCacheUnavailableLogged = true
  console.warn('Shared cache unavailable, falling back to process cache only:', error)
}

export async function getSharedCacheEntry<T>(
  cacheScope: string,
  cacheKey: string
): Promise<T | null> {
  if (!hasSharedCacheConfig()) return null

  try {
    await ensureSharedCacheTable()
    const sql = getDb()
    const rows = await sql`
      SELECT payload
      FROM app_shared_cache
      WHERE cache_scope = ${cacheScope}
        AND cache_key = ${cacheKey}
        AND expires_at > NOW()
      LIMIT 1
    `

    const row = rows[0] as { payload?: unknown } | undefined
    return parseJsonColumn<T>(row?.payload)
  } catch (error) {
    logSharedCacheUnavailable(error)
    return null
  }
}

export async function setSharedCacheEntry<T>(
  cacheScope: string,
  cacheKey: string,
  payload: T,
  ttlMs: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!hasSharedCacheConfig()) return

  try {
    await ensureSharedCacheTable()
    const sql = getDb()
    const expiresAt = new Date(Date.now() + ttlMs)

    await sql`
      INSERT INTO app_shared_cache (
        cache_scope,
        cache_key,
        payload,
        metadata,
        expires_at,
        updated_at
      )
      VALUES (
        ${cacheScope},
        ${cacheKey},
        ${JSON.stringify(payload)},
        ${JSON.stringify(metadata || {})},
        ${expiresAt.toISOString()},
        NOW()
      )
      ON CONFLICT (cache_scope, cache_key) DO UPDATE SET
        payload = EXCLUDED.payload,
        metadata = EXCLUDED.metadata,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `

    if (Math.random() < 0.02) {
      await sql`
        DELETE FROM app_shared_cache
        WHERE expires_at <= NOW()
      `
    }
  } catch (error) {
    logSharedCacheUnavailable(error)
  }
}

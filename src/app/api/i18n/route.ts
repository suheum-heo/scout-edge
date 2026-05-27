import { NextRequest, NextResponse } from 'next/server'
import { getEnglishMessages, normalizeLanguage } from '@/lib/i18n'
import { getRuntimeMessageCatalog } from '@/lib/runtime-localization'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const language = normalizeLanguage(request.nextUrl.searchParams.get('language'))
  const messages = await getRuntimeMessageCatalog(language)

  return NextResponse.json({
    language,
    messages: messages || getEnglishMessages(),
  })
}

export function getAIErrorDetails(
  error: unknown,
  fallbackMessage: string
): { status: number; error: string } {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : JSON.stringify(error ?? '')

  if (/credit balance is too low|plans & billing/i.test(message)) {
    return {
      status: 503,
      error:
        'AI analysis is temporarily unavailable because the configured Anthropic API key has no remaining credits. Top up or replace ANTHROPIC_API_KEY in Vercel and try again.',
    }
  }

  if (/invalid[_\s-]?request_error.*api key|authentication|invalid x-api-key|api key/i.test(message)) {
    return {
      status: 503,
      error:
        'AI analysis is temporarily unavailable because the configured Anthropic API key is invalid or unavailable. Update ANTHROPIC_API_KEY in Vercel and try again.',
    }
  }

  if (/connection error|fetch failed|getaddrinfo|enotfound|econnreset|timed out|timeout|temporarily unavailable|overloaded|rate limit|too many requests/i.test(message)) {
    return {
      status: 503,
      error:
        'AI analysis is temporarily unavailable because the live Claude request could not be completed right now. Please try again in a moment.',
    }
  }

  return { status: 500, error: fallbackMessage }
}

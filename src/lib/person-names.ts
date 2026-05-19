export function normalizePersonName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function personNameTokens(value: string): string[] {
  const normalized = normalizePersonName(value)
  return normalized ? normalized.split(' ') : []
}

export function buildFullName(
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null
): string {
  const first = firstName?.trim() || ''
  const last = lastName?.trim() || ''
  const fallbackName = fallback?.trim() || ''
  const fullName = `${first} ${last}`.trim()

  if (!fullName) return fallbackName
  if (!fallbackName) return fullName

  const fullNorm = normalizePersonName(fullName)
  const fallbackNorm = normalizePersonName(fallbackName)
  const firstNorm = normalizePersonName(first)
  const lastNorm = normalizePersonName(last)

  if (
    fullNorm === fallbackNorm ||
    firstNorm === fallbackNorm ||
    lastNorm === fallbackNorm ||
    (firstNorm && `${firstNorm} ${fallbackNorm}` === fullNorm) ||
    (lastNorm && `${fallbackNorm} ${lastNorm}` === fullNorm)
  ) {
    return fallbackName
  }

  return fullName
}

export function namesMatch(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return false

  const leftTokens = personNameTokens(left)
  const rightTokens = personNameTokens(right)
  if (leftTokens.length === 0 || rightTokens.length === 0) return false

  if (leftTokens.join(' ') === rightTokens.join(' ')) return true

  if (leftTokens.length === rightTokens.length && leftTokens.length >= 2) {
    const leftTail = leftTokens.slice(1).join(' ')
    const rightTail = rightTokens.slice(1).join(' ')
    if (leftTail === rightTail && leftTokens[0]?.[0] === rightTokens[0]?.[0]) {
      return true
    }
  }

  return false
}

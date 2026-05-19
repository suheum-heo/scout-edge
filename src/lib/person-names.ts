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
  const fullName = `${firstName?.trim() || ''} ${lastName?.trim() || ''}`.trim()
  return fullName || fallback?.trim() || ''
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

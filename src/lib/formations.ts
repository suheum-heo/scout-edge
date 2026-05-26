function parseFormationCandidate(candidate: string): string | null {
  const parts = candidate.match(/\d+/g)?.map(Number) || []
  if (parts.length < 3 || parts.length > 5) return null
  if (parts.some((value) => value <= 0 || value > 6)) return null
  if (parts.reduce((sum, value) => sum + value, 0) !== 10) return null
  return parts.join('-')
}

export function normalizeLiveFormation(value?: string | null): string | null {
  const raw = (value || '').trim()
  if (!raw) return null

  const cleaned = raw
    .replace(/[–—−/]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

  const hyphenCandidates = cleaned.match(/\b\d(?:-\d){2,4}\b/g) || []
  for (const candidate of hyphenCandidates) {
    const normalized = parseFormationCandidate(candidate)
    if (normalized) return normalized
  }

  const spacedCandidates = cleaned.match(/\b\d(?:\s+\d){2,4}\b/g) || []
  for (const candidate of spacedCandidates) {
    const normalized = parseFormationCandidate(candidate.replace(/\s+/g, '-'))
    if (normalized) return normalized
  }

  return null
}

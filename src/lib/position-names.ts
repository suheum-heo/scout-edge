function titleCasePosition(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase())
}

export function normalizePositionDisplayName(position?: string | null): string {
  if (!position) return 'Unknown'

  const raw = position.trim()
  if (!raw) return 'Unknown'

  const normalized = raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()

  const lower = normalized.toLowerCase()

  const exactMap: Array<[string[], string]> = [
    [['gk', 'goalkeeper', 'keeper'], 'Goalkeeper'],
    [['defence', 'defense', 'defender'], 'Defender'],
    [['cb', 'centre back', 'center back', 'central defender'], 'Centre Back'],
    [['lb', 'left back'], 'Left Back'],
    [['rb', 'right back'], 'Right Back'],
    [['lwb', 'left wing back'], 'Left Wing Back'],
    [['rwb', 'right wing back'], 'Right Wing Back'],
    [['wb', 'wing back', 'wingback'], 'Wing Back'],
    [['full back', 'fullback'], 'Full Back'],
    [['midfield', 'midfielder'], 'Midfielder'],
    [['dm', 'cdm', 'defensive midfield', 'defensive midfielder'], 'Defensive Midfield'],
    [['cm', 'central midfield', 'central midfielder'], 'Central Midfield'],
    [['am', 'cam', 'attacking midfield', 'attacking midfielder'], 'Attacking Midfield'],
    [['lm', 'left midfield', 'left midfielder'], 'Left Midfield'],
    [['rm', 'right midfield', 'right midfielder'], 'Right Midfield'],
    [['lw', 'left wing'], 'Left Wing'],
    [['rw', 'right wing'], 'Right Wing'],
    [['left winger'], 'Left Winger'],
    [['right winger'], 'Right Winger'],
    [['winger'], 'Winger'],
    [['wide forward'], 'Wide Forward'],
    [['wide midfielder'], 'Wide Midfielder'],
    [['interior midfielder'], 'Interior Midfielder'],
    [['attack', 'attacker', 'offence', 'offense'], 'Attacker'],
    [['cf', 'centre forward', 'center forward'], 'Centre Forward'],
    [['st', 'striker'], 'Striker'],
    [['forward'], 'Forward'],
    [['second striker'], 'Second Striker'],
    [['false 9', 'false nine'], 'False 9'],
  ]

  for (const [aliases, label] of exactMap) {
    if (aliases.includes(lower)) return label
  }

  const partialMap: Array<[RegExp, string]> = [
    [/\bleft\s+centre\s+back\b|\bleft\s+center\s+back\b/i, 'Left Centre Back'],
    [/\bright\s+centre\s+back\b|\bright\s+center\s+back\b/i, 'Right Centre Back'],
    [/\bcentre\s+back\b|\bcenter\s+back\b/i, 'Centre Back'],
    [/\bcentre\s+forward\b|\bcenter\s+forward\b/i, 'Centre Forward'],
    [/\bleft\s+wing\s+back\b/i, 'Left Wing Back'],
    [/\bright\s+wing\s+back\b/i, 'Right Wing Back'],
    [/\bwing\s+back\b/i, 'Wing Back'],
    [/\bfull\s+back\b/i, 'Full Back'],
    [/\bleft\s+back\b/i, 'Left Back'],
    [/\bright\s+back\b/i, 'Right Back'],
    [/\bdefensive\s+midfield(er)?\b/i, 'Defensive Midfield'],
    [/\bcentral\s+midfield(er)?\b/i, 'Central Midfield'],
    [/\battacking\s+midfield(er)?\b/i, 'Attacking Midfield'],
    [/\bleft\s+wing(er)?\b/i, 'Left Wing'],
    [/\bright\s+wing(er)?\b/i, 'Right Wing'],
    [/\bwide\s+forward\b/i, 'Wide Forward'],
    [/\bwide\s+midfield(er)?\b/i, 'Wide Midfielder'],
    [/\binterior\s+midfield(er)?\b/i, 'Interior Midfielder'],
    [/\bgoalkeeper\b|\bkeeper\b/i, 'Goalkeeper'],
    [/\bstriker\b/i, 'Striker'],
    [/\bforward\b/i, 'Forward'],
  ]

  for (const [pattern, label] of partialMap) {
    if (pattern.test(normalized)) {
      return titleCasePosition(normalized.replace(pattern, label))
    }
  }

  return titleCasePosition(normalized)
}

import Anthropic from '@anthropic-ai/sdk'
import { ManagerProfile } from './managers'
import { formatPlayerStats } from './api-football'
import type { TMPlayerData } from './transfermarkt'
import type { SquadPlayer } from './role-profiles'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Replace Cyrillic Unicode lookalikes with their Latin equivalents.
// Claude occasionally outputs homoglyphs (е, о, а, etc.) that look identical but break names.
const CYRILLIC_MAP: Record<string, string> = {
  '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0443': 'y', '\u0445': 'x', '\u0410': 'A', '\u0412': 'B', '\u0415': 'E',
  '\u041A': 'K', '\u041C': 'M', '\u041D': 'H', '\u041E': 'O', '\u0420': 'P',
  '\u0421': 'C', '\u0422': 'T', '\u0425': 'X',
}
function sanitizeHomoglyphs(text: string): string {
  return text.replace(/[\u0400-\u04FF]/g, (ch) => CYRILLIC_MAP[ch] ?? ch)
}

// Robustly extract and parse JSON from Claude's response
function extractJSON(text: string, type: 'object' | 'array'): unknown {
  const open = type === 'object' ? '{' : '['
  const close = type === 'object' ? '}' : ']'

  const start = text.indexOf(open)
  if (start === -1) throw new Error(`No ${type} found in response`)

  // Walk forward tracking depth to find the matching close
  let depth = 0
  let end = -1
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++
    else if (text[i] === close) {
      depth--
      if (depth === 0) { end = i; break }
    }
  }

  // If response was truncated, try to close the JSON gracefully
  const raw = end !== -1 ? text.slice(start, end + 1) : text.slice(start)

  // Remove trailing commas before } or ] (common Claude mistake)
  const cleaned = raw
    .replace(/,\s*([}\]])/g, '$1')
    // If truncated, close open structures
    .replace(/,?\s*$/, '')

  // Attempt to close truncated structures
  const toClose = cleaned.split('').reduce((acc, ch) => {
    if (ch === '{') acc.push('}')
    else if (ch === '[') acc.push(']')
    else if (ch === '}' || ch === ']') acc.pop()
    return acc
  }, [] as string[])

  const repairedStr = cleaned + toClose.reverse().join('')

  return JSON.parse(repairedStr)
}

export interface SquadGap {
  position: string
  positionCode: string
  urgency: 'critical' | 'high' | 'medium' | 'low'
  needScore: number       // 0-100: composite transfer priority score
  profileLabel: string
  reasoning: string
  keyStatsPriority: string[]
}

export interface PlayerRecommendation {
  playerId: number
  playerName: string
  age: number
  nationality: string
  currentTeam: string
  league: string
  photo: string
  tacticalFitScore: number // 1-10
  fitSummary: string
  strengths: string[]
  concerns: string[]
  whyThisPlayer: string
  stats: ReturnType<typeof formatPlayerStats>
}

export interface TransferTarget {
  playerName: string
  currentClub: string
  nationality: string
  age: number
  position: string
  estimatedFee: string        // "€45-55M", "Free agent", "~€15M loan fee"
  contractUntil: string       // "2026", "2027", "Unknown"
  tacticalFitScore: number    // 1-10
  fitSummary: string          // one punchy sentence
  strengths: string[]
  concerns: string[]
  whyThisPlayer: string       // 2-3 sentences of scout reasoning
  availability: 'Likely available' | 'Possible' | 'Hard to get'
  tmVerified?: boolean        // true if Transfermarkt confirmed current club & contract
}

export interface SquadAnalysisResult {
  managerName: string
  teamName: string
  overallAssessment: string
  tacticalFitScore: number // 1-10 — how well the current squad fits the manager
  gaps: SquadGap[]
  squadStrengths: string[]
  squadWeaknesses: string[]
}

export type FitLabel = 'Key Man' | 'Good Fit' | 'Rotation' | 'Poor Fit' | 'Sell Candidate'

export interface PlayerSystemFit {
  playerName: string
  position: string
  age: number
  fitScore: number   // 1-10
  fitLabel: FitLabel
  reason: string     // one scout sentence
}

export interface PlayerCompatibilityResult {
  playerName: string
  managerName: string
  overallFitScore: number // 1-10
  verdict: string
  tacticalRole: string
  strengths: string[]
  concerns: string[]
  conditions: string[] // conditions under which this works
  comparison: string // who they compare to in this system
  recommendation: 'Strong Yes' | 'Yes' | 'Conditional' | 'No' | 'Strong No'
  // Claude-derived player info (used when no API stats are available)
  currentClub?: string
  age?: number
  nationality?: string
  position?: string
}

/** Quick Claude call to identify players whose real tactical role differs from their registered position */
async function enrichSquadTacticalRoles(
  players: ReturnType<typeof formatPlayerStats>[],
  teamName: string
): Promise<Map<string, string>> {
  const playerList = players
    .filter(Boolean)
    .slice(0, 30)
    .map((p) => `- ${p!.name} (registered: ${p!.position}, Age ${p!.age}, ${p!.nationality})`)
    .join('\n')

  const prompt = `You are a football tactical analyst. Some players are registered at one position but regularly play a different role in practice.

Squad at ${teamName}:
${playerList}

Return a JSON array of ONLY players whose real tactical role meaningfully differs from their registered position — e.g. a CB who regularly starts at left-back, a RB used as an inverted winger, a CM deployed as a #6 or #10. Skip players whose registered position accurately describes their role.

[
  {
    "name": "Exact name as listed",
    "tacticalNote": "Short factual note, e.g. 'Regularly plays left-back despite CB registration — did so at Bayer Leverkusen and for Ecuador'"
  }
]

Return [] if no players have a meaningfully different real role. No other text.`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text : ''
    const profiles = extractJSON(text, 'array') as { name: string; tacticalNote: string }[]
    return new Map(profiles.map((p) => [p.name, p.tacticalNote]))
  } catch {
    return new Map()
  }
}

// Analyze a squad against a manager's tactical profile
// manager can be null — Claude will infer the profile from managerName using its own knowledge
export async function analyzeSquadGaps(
  manager: ManagerProfile | null,
  squadPlayers: ReturnType<typeof formatPlayerStats>[],
  teamName: string,
  managerName?: string
): Promise<SquadAnalysisResult> {
  const resolvedName = manager?.name || managerName || 'Unknown Manager'

  // hasStats: true if ANY player has appearances, goals, or a real rating
  const hasStats = squadPlayers.some(
    (p) => p && (p.appearances > 0 || p.goals > 0 || parseFloat(p.rating || '0') > 0)
  )
  // hasFullStats: true only when we have appearances/minutes (older FotMob API or AF data)
  const hasFullStats = squadPlayers.some((p) => p && p.appearances > 0)

  // Enrich squad with tactical versatility notes (runs in parallel with nothing — fast ~1s call)
  const tacticalNotes = await enrichSquadTacticalRoles(squadPlayers, teamName)

  // Sort by minutes desc, then by rating desc as secondary (FotMob has rating but no minutes)
  const sortedPlayers = [...squadPlayers.filter(Boolean)].sort((a, b) => {
    const minsDiff = (b?.minutes ?? 0) - (a?.minutes ?? 0)
    if (minsDiff !== 0) return minsDiff
    return parseFloat(b?.rating ?? '0') - parseFloat(a?.rating ?? '0')
  })
  console.log('[claude] Squad order (top 10):', sortedPlayers.slice(0, 10).map((p) => `${p?.name}(${p?.minutes}m,rtg:${p?.rating})`).join(', '))

  const squadSummary = sortedPlayers
    .slice(0, 35) // raised cap — sort ensures seniors appear first
    .map((p) => {
      const note = tacticalNotes.get(p!.name)
      const noteStr = note ? ` [Note: ${note}]` : ''
      if (hasFullStats) {
        return `- ${p!.name} (${p!.position}, Age ${p!.age}, ${p!.nationality})${noteStr} | G:${p!.goals} A:${p!.assists} Rtg:${p!.rating} Apps:${p!.appearances} Mins:${p!.minutes} Tkl:${p!.tackles} Int:${p!.interceptions}`
      }
      if (hasStats) {
        // FotMob squad data: has rating, goals, assists but no appearances/minutes
        const rtg = parseFloat(p!.rating || '0')
        const rtgStr = rtg > 0 ? ` Rtg:${p!.rating}` : ''
        const goalsStr = p!.goals > 0 ? ` G:${p!.goals}` : ''
        const assistsStr = p!.assists > 0 ? ` A:${p!.assists}` : ''
        return `- ${p!.name} (${p!.position}, Age ${p!.age}, ${p!.nationality})${noteStr}${rtgStr}${goalsStr}${assistsStr}`
      }
      return `- ${p!.name} (${p!.position}, Age ${p!.age}, ${p!.nationality})${noteStr}`
    })
    .join('\n')

  const managerSection = manager
    ? `## Manager: ${manager.name}
**System**: ${manager.formations.join(' / ')} | **Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} line, ${manager.style.buildUp} build-up
**Summary**: ${manager.tacticalSummary}

**Key Principles**:
${manager.keyPrinciples.map((p) => `- ${p}`).join('\n')}

## Positional Requirements:
${manager.positionalRequirements
  .map(
    (req) =>
      `**${req.position} (${req.profileLabel})**: ${req.tacticalDescription}\nMust Have: ${req.mustHave.join(', ')}\nAvoid If: ${req.avoidIf.join(', ')}`
  )
  .join('\n\n')}`
    : `## Manager: ${resolvedName}
Use your knowledge of ${resolvedName}'s tactical system as of today (${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}). If this manager has recently changed clubs or been sacked, account for that. Apply their known tactical profile to analyze the squad below.`

  const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const prompt = `You are an elite football scout and tactical analyst. Today's date is ${currentDate}. Analyze this squad's fit with the manager's tactical system.

${managerSection}

## Current Squad at ${teamName} (as of ${currentDate}):
${squadSummary || 'No squad data available'}
${!hasStats ? '\n*Note: Per-match stats are not available. Use your knowledge of these players to assess their quality and tactical profile — but treat the squad list above as the authoritative current roster. Do NOT flag a positional gap if a player already listed in the squad can credibly fill that role.*' : !hasFullStats ? '\n*Note: Season appearance/minute data is not available, but FotMob ratings, goals, and assists are shown where non-zero. Use these plus your knowledge of each player to judge quality and recent form. The squad list and position data are authoritative.*' : ''}

## Your Task:
Analyze the squad and identify:
1. Which positions have the RIGHT profile for this system
2. Which positions are GAPS or MISMATCHES — only flag a gap if NO player currently in the squad can reasonably cover that role
3. Overall tactical fit score (1-10) for this squad with this manager

IMPORTANT: The squad list above is the authoritative source of truth. If your prior knowledge conflicts with the dataset, always trust the dataset — it reflects the most recent transfer activity and may include signings made after your training cutoff. Do not contradict the squad list based on prior knowledge of which club a player belongs to.

For positional coverage, treat registered positions as starting points only. Use your knowledge of modern tactical roles and each player's career-wide versatility. Specific rule: a player registered as "Center-back" who has regularly played left-back (e.g. as a LCB/LB hybrid) counts as left-back cover — do not flag a LB gap if such a player is in the squad. Similarly, a right-back who inverts can cover attacking midfield, a CM deployed as a #6 covers the holding role, etc. Apply your understanding of modern roles (inverted full-backs, hybrid CBs, half-space runners, pressing triggers) when judging fit. Do not claim a team lacks depth at a position if a versatile senior player in the squad can credibly fill that role. Cross-reference every gap against the actual players listed and their [Note:] annotations before flagging it.

Respond in this exact JSON format:
{
  "overallAssessment": "2-3 sentence overview of how well this squad suits the manager",
  "tacticalFitScore": 7,
  "squadStrengths": ["strength 1", "strength 2", "strength 3"],
  "squadWeaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "gaps": [
    {
      "position": "Center Back",
      "positionCode": "Defender",
      "urgency": "critical",
      "needScore": 82,
      "profileLabel": "Pace-First Ball-Playing CB",
      "reasoning": "Why this is a gap — reference specific players and their stats",
      "keyStatsPriority": ["pace", "pass_accuracy", "interceptions"]
    }
  ]
}

needScore (0-100) is a composite transfer priority score. Compute it as:
  starter_weakness (0-30): how absent/weak the ideal starting profile is for this position
  + depth_weakness (0-20): lack of quality backup options
  + age_risk (0-20): primary holder is 30+ with no successor, or only unproven youth covers
  + tactical_mismatch (0-20): players present but wrong profile for this system
  - hybrid_coverage (0-30): deduct if a versatile player in the squad genuinely covers this role
Higher needScore = more urgent transfer priority. Sort gaps in your response by needScore descending.

Be specific and reference actual players from the squad. Urgency levels: critical (major weakness that will hurt results), high (clear need), medium (would help but manageable), low (minor upgrade). Return a maximum of 5 gaps.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const analysis = extractJSON(text, 'object') as Omit<SquadAnalysisResult, 'managerName' | 'teamName'>

  return {
    managerName: resolvedName,
    teamName,
    ...analysis,
  }
}

// Rank and explain player recommendations for a specific gap
// manager can be null — Claude will use its own knowledge of managerName
export async function rankPlayersForGap(
  gap: SquadGap,
  manager: ManagerProfile | null,
  candidatePlayers: ReturnType<typeof formatPlayerStats>[],
  teamName: string,
  managerName?: string
): Promise<PlayerRecommendation[]> {
  if (!candidatePlayers.length) return []

  const resolvedName = manager?.name || managerName || 'the manager'
  const managerReq = manager?.positionalRequirements.find(
    (r) => r.positionCode === gap.positionCode
  )

  const playersData = candidatePlayers
    .filter(Boolean)
    .slice(0, 20) // Limit to 20 candidates
    .map(
      (p) =>
        `ID:${p!.playerId} | ${p!.name} (Age ${p!.age}, ${p!.nationality}) | Team: ${p!.currentTeam} | Goals: ${p!.goals}, Assists: ${p!.assists}, Rating: ${p!.rating}, Apps: ${p!.appearances}, Tackles: ${p!.tackles}, Interceptions: ${p!.interceptions}, Duel Win%: ${p!.duelWinRate}%, Dribble Success%: ${p!.dribbleSuccess}%, Pass Acc: ${p!.passAccuracy}%, Key Passes: ${p!.keyPasses}`
    )
    .join('\n')

  const managerSection = manager
    ? `## Manager: ${manager.name}
**System**: ${manager.formations[0]} | **Pressing**: ${manager.style.pressing} | **Defensive Line**: ${manager.style.defensiveLine}`
    : `## Manager: ${resolvedName}
Use your knowledge of ${resolvedName}'s tactical system and what this manager demands from players in this position.`

  const prompt = `You are an elite football scout. Rank these players for the specific tactical need.

${managerSection}

## Gap Identified at ${teamName}:
**Position**: ${gap.position}
**Profile Needed**: ${gap.profileLabel}
**Urgency**: ${gap.urgency}
**Reasoning**: ${gap.reasoning}

${managerReq ? `**Must Have**: ${managerReq.mustHave.join(', ')}\n**Avoid If**: ${managerReq.avoidIf.join(', ')}` : ''}

## Candidate Players:
${playersData}

## Task:
Pick the TOP 5 most tactically suitable players from this list for this specific role in this system.

Respond in this exact JSON format (array of up to 5 players):
[
  {
    "playerId": 123,
    "playerName": "Player Name",
    "tacticalFitScore": 8,
    "fitSummary": "One sentence explaining why this player fits",
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "concerns": ["concern 1"],
    "whyThisPlayer": "2-3 sentences of scout-level analysis of why this player specifically suits this manager and this gap"
  }
]

Be analytical. Reference specific stats. Think like a scout who watches every game.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const ranked = extractJSON(text, 'array') as Omit<PlayerRecommendation, 'age' | 'nationality' | 'currentTeam' | 'league' | 'photo' | 'stats'>[]

  return ranked.map((r) => {
    const fullPlayer = candidatePlayers.find((p) => p?.playerId === r.playerId)
    return {
      ...r,
      age: fullPlayer?.age || 0,
      nationality: fullPlayer?.nationality || '',
      currentTeam: fullPlayer?.currentTeam || '',
      league: fullPlayer?.league || '',
      photo: fullPlayer?.photo || '',
      stats: fullPlayer || null,
    }
  }).filter((r) => r.currentTeam) as PlayerRecommendation[]
}

// Analyze player compatibility with a manager
// manager can be null — Claude uses its own knowledge of managerName
// tmPlayer is live Transfermarkt data; when null, Claude uses its own knowledge of the player
export async function analyzePlayerCompatibility(
  playerName: string,
  tmPlayer: TMPlayerData | null,
  manager: ManagerProfile | null,
  targetTeam?: string,
  managerName?: string
): Promise<PlayerCompatibilityResult> {
  const resolvedManagerName = manager?.name || managerName || 'Unknown Manager'

  const managerSection = manager
    ? `## Manager: ${manager.name}
**System**: ${manager.formations.join(' / ')}
**Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} defensive line, ${manager.style.buildUp} build-up, ${manager.style.attackingMentality} attacking mentality
**Summary**: ${manager.tacticalSummary}

**Key Principles**:
${manager.keyPrinciples.map((p) => `- ${p}`).join('\n')}

**Positional Requirements**:
${manager.positionalRequirements.map((req) => `**${req.position}** (${req.profileLabel}): Must Have: ${req.mustHave.join(', ')} | Avoid If: ${req.avoidIf.join(', ')}`).join('\n')}`
    : `## Manager: ${resolvedManagerName}
Use your extensive knowledge of ${resolvedManagerName}'s tactical system — their preferred formations, pressing intensity, defensive line, build-up style, and what they demand from players in each position.`

  const playerSection = tmPlayer
    ? `## Player: ${tmPlayer.name}
**Position**: ${tmPlayer.position}
**Current Club**: ${tmPlayer.currentClub}
**Age**: ${tmPlayer.age} | **Nationality**: ${tmPlayer.nationality}
**Market Value**: ${tmPlayer.marketValueFormatted} | **Contract until**: ${tmPlayer.contractYear}
**25/26 Season Stats**: Goals: ${tmPlayer.goals}, Assists: ${tmPlayer.assists}, Appearances: ${tmPlayer.appearances}, Minutes: ${tmPlayer.minutesPlayed}, Yellow Cards: ${tmPlayer.yellowCards}`
    : `## Player: ${playerName}
Use your knowledge of this player — their current club, position, age, nationality, playing style, strengths, and typical stats. Today's date is ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}, so use the most current information you have about their club and situation.`

  const prompt = `You are an elite football scout and tactical analyst. Assess whether this player would be a good signing for a team managed by ${resolvedManagerName}.

${playerSection}

${managerSection}

${targetTeam ? `**Target Club**: ${targetTeam}` : ''}

## Task:
Give a detailed scout report on whether ${playerName} would be a good tactical fit for ${resolvedManagerName}'s system.

Respond in this exact JSON format:
{
  "currentClub": "Player's current club",
  "age": 26,
  "nationality": "Country",
  "position": "Exact position",
  "overallFitScore": 7,
  "verdict": "One punchy sentence summarizing the fit",
  "tacticalRole": "What exact role would this player play in the manager's system",
  "strengths": ["Why this player fits - specific to this system, up to 4 points"],
  "concerns": ["Potential issues in this system, up to 3 points"],
  "conditions": ["Conditions under which this works"],
  "comparison": "Who does this player compare to in this manager's previous squads or ideal profile",
  "recommendation": "Strong Yes"
}

Recommendation options: "Strong Yes", "Yes", "Conditional", "No", "Strong No"
Be honest, specific, and analytical.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const result = extractJSON(text, 'object') as Omit<PlayerCompatibilityResult, 'playerName' | 'managerName'>

  return {
    playerName,
    managerName: resolvedManagerName,
    ...result,
  }
}

// Rate every squad player's fit with the manager's system
export async function analyzeSquadSystemFit(
  squad: SquadPlayer[],
  manager: ManagerProfile | null,
  teamName: string,
  managerName?: string
): Promise<PlayerSystemFit[]> {
  if (!squad.length) return []

  const resolvedName = manager?.name || managerName || 'the manager'

  const playerList = squad
    .slice(0, 30)
    .map((p) => `- ${p.name} (${p.position}, Age ${p.age}, ${p.nationality})`)
    .join('\n')

  const managerSection = manager
    ? `**System**: ${manager.formations.join(' / ')} | **Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} line, ${manager.style.buildUp} build-up
**Summary**: ${manager.tacticalSummary}
**Key Principles**: ${manager.keyPrinciples.slice(0, 4).join('; ')}
**Positional Requirements**:
${manager.positionalRequirements.map((r) => `  ${r.position} (${r.profileLabel}): must have ${r.mustHave.join(', ')}`).join('\n')}`
    : `Use your knowledge of ${resolvedName}'s tactical system — formations, pressing intensity, build-up style, and what he demands from players in each role.`

  const currentDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const prompt = `You are an elite football scout. Rate every player at ${teamName} for how well they fit ${resolvedName}'s specific tactical system. Today is ${currentDate}.

## Manager: ${resolvedName}
${managerSection}

## Squad at ${teamName}:
${playerList}

For EVERY player listed, assess:
- fitScore (1-10): how well they suit this specific system and playing style
- fitLabel: exactly one of the five labels below
- reason: ONE sentence — cite a specific tactical reason (not just "good player")

fitLabel rules:
- "Key Man" (9-10): indispensable to this system, would be a major loss
- "Good Fit" (7-8): suits the system well, regular starter profile
- "Rotation" (5-6): fits adequately but not the ideal profile, squad depth role
- "Poor Fit" (3-4): doesn't suit the system's demands, limited usefulness
- "Sell Candidate" (1-2): actively misaligned — wrong profile, wasted wages, or blocking development

Be honest — not every team has 11 Key Men. A team with a new manager will have several Poor Fit / Sell Candidate players. Reference the tactical system specifically (e.g. "can't play as a pressing winger", "lacks the ball-playing ability this system requires").

Return JSON array, one object per player, in the same order as the input:
[
  {
    "playerName": "Exact name from input",
    "position": "Their position",
    "age": 24,
    "fitScore": 8,
    "fitLabel": "Good Fit",
    "reason": "One sentence citing a specific tactical reason"
  }
]

No other text. Cover every player.`

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = res.content[0].type === 'text' ? res.content[0].text : ''
  return extractJSON(text, 'array') as PlayerSystemFit[]
}

// Recommend specific real transfer targets for a tactical gap within a budget
// Entirely Claude-knowledge-driven — no API needed, knows market values + contract situations
export async function recommendPlayersForGap(
  gap: SquadGap,
  manager: ManagerProfile | null,
  teamName: string,
  budget: string,
  managerName?: string,
  roleCoverageContext?: string
): Promise<TransferTarget[]> {
  const resolvedName = manager?.name || managerName || 'the manager'

  const managerSection = manager
    ? `**System**: ${manager.formations.join(' / ')} | **Pressing**: ${manager.style.pressing} | **Build-up**: ${manager.style.buildUp}
**Key principles**: ${manager.keyPrinciples.slice(0, 3).join('; ')}`
    : `Use your knowledge of ${resolvedName}'s tactical system and what he demands from players.`

  const currentDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const prompt = `You are an elite football scout and transfer market expert. Today is ${currentDate}. Recommend 4 specific real players for ${teamName} to fill this tactical gap within the stated budget. Use the most current club affiliations, contract situations, and market values you know.

## Manager: ${resolvedName}
${managerSection}

## Tactical Gap:
**Position**: ${gap.position}
**Profile needed**: ${gap.profileLabel}
**Urgency**: ${gap.urgency} | **Need Score**: ${gap.needScore}/100
**Why it's a gap**: ${gap.reasoning}
${roleCoverageContext ? `**Current squad coverage**: ${roleCoverageContext}` : ''}

## Budget: ${budget}

## Your Task:
Name 4 real professional players who:
1. Fit the tactical profile for ${resolvedName}'s system
2. Are realistically gettable within this budget (consider transfer fee, wages, club situation)
3. Would be a credible signing for ${teamName}

Use your knowledge of player market values, contract situations, and playing styles. Be realistic — don't suggest €100M players on a €20M budget. Rank by tactical fit.

IMPORTANT — accuracy rules:
- Only recommend currently ACTIVE professional players. Never recommend retired players.
- Only name players whose current club you are highly confident about. If a player recently moved to a new league (MLS, Saudi Pro League, Chinese Super League, etc.) or you're uncertain about their club as of ${currentDate}, skip them and choose someone else.
- For players currently on loan: use their CURRENT LOAN DESTINATION as the club (e.g. "Union Saint-Gilloise" not "Brighton" for a player on loan there). Never list a parent club if the player is actually playing elsewhere on loan.
- Pay close attention to loan-to-permanent transfers: if a player was on loan at one club during 2024/25 but completed a permanent transfer to a different club for the 2025/26 season, list their CURRENT permanent club (e.g. a goalkeeper who was on loan at Valencia but permanently joined Liverpool for 2025/26 should be listed as Liverpool, not Valencia).
- Do NOT confuse players with similar names. If recommending a goalkeeper or defender, double-check their career history — do not list a club they never played for.
- Use only standard Latin characters in names. No special Unicode or lookalike characters.

Respond in this exact JSON format (be concise, no extra text):
[
  {
    "playerName": "Full Name",
    "currentClub": "Club Name",
    "nationality": "Country",
    "age": 24,
    "position": "Right Back",
    "estimatedFee": "€35-45M",
    "contractUntil": "2027",
    "tacticalFitScore": 8,
    "fitSummary": "2 sentences max: why this player fits this system and addresses this gap",
    "strengths": ["strength 1", "strength 2"],
    "concerns": ["concern 1"],
    "availability": "Likely available"
  }
]

Availability options: "Likely available" | "Possible" | "Hard to get"
Fee format: "Free agent" if out of contract, "Loan" for loan-only, "€XM" or "€X-YM" range for transfers.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  return extractJSON(sanitizeHomoglyphs(raw), 'array') as TransferTarget[]
}

// ── V3: Transfer Scenario Simulator ──────────────────────────────────────────

export interface ScenarioInPlayer {
  name: string
  position: string
  age: number
  fromRecommendations?: boolean
}

export interface ScenarioOutPlayer {
  playerId: string
  name: string
  position: string
  age: number
}

export type ScenarioDimensionKey =
  | 'roleCoverage'
  | 'systemFit'
  | 'attackingThreat'
  | 'defensiveStability'
  | 'squadDepth'
  | 'ageProfile'

export interface ScenarioDimension {
  key: ScenarioDimensionKey
  label: string
  baselineScore: number   // 1-10
  scenarioScore: number   // 1-10
  delta: number           // scenarioScore - baselineScore
  insight: string         // one sentence explaining the change
}

export type ScenarioVerdict = 'Do it' | 'Consider it' | 'Risky' | 'Avoid'

export interface ScenarioResult {
  id: string
  label: string                   // "Scenario A", "Scenario B", etc.
  createdAt: number
  playersOut: ScenarioOutPlayer[]
  playersIn: ScenarioInPlayer[]
  dimensions: ScenarioDimension[]
  overallBaselineScore: number
  overallScenarioScore: number
  overallDelta: number
  verdict: string
  risks: string[]
  recommendation: ScenarioVerdict
}

// Evaluate the impact of an IN/OUT scenario on a squad
export async function analyzeScenario(
  originalSquad: SquadPlayer[],
  playersOut: ScenarioOutPlayer[],
  playersIn: ScenarioInPlayer[],
  manager: ManagerProfile | null,
  teamName: string,
  managerName?: string
): Promise<Omit<ScenarioResult, 'id' | 'label' | 'createdAt' | 'playersOut' | 'playersIn'>> {
  const resolvedName = manager?.name || managerName || 'the manager'

  const formatSquad = (players: SquadPlayer[]) =>
    players.map((p) => `- ${p.name} (${p.position}, Age ${p.age}, ${p.nationality})`).join('\n')

  // Compute modified squad in TypeScript — give Claude the exact result, no reasoning needed
  const outIds = new Set(playersOut.map((o) => o.playerId))
  const modifiedSquad: SquadPlayer[] = [
    ...originalSquad.filter((p) => !outIds.has(p.playerId)),
    ...playersIn.map((p) => ({
      playerId: 'incoming',
      name: p.name,
      position: p.position,
      age: p.age,
      nationality: '',
    })),
  ]

  const managerSection = manager
    ? `**System**: ${manager.formations.join(' / ')} | **Style**: ${manager.style.pressing} press, ${manager.style.defensiveLine} line, ${manager.style.buildUp} build-up
**Summary**: ${manager.tacticalSummary}
**Key Principles**: ${manager.keyPrinciples.slice(0, 4).join('; ')}`
    : `Use your knowledge of ${resolvedName}'s tactical system — formations, pressing intensity, build-up style, and what he demands from players in each role.`

  const currentDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const prompt = `You are an elite football scout and tactical analyst. Today is ${currentDate}. Evaluate the impact of this transfer scenario on ${teamName}'s squad.

## Manager: ${resolvedName}
${managerSection}

## CURRENT SQUAD (Baseline):
${formatSquad(originalSquad)}

## PROPOSED SCENARIO:
OUT: ${playersOut.map((p) => `${p.name} (${p.position}, Age ${p.age})`).join(', ') || 'None'}
IN: ${playersIn.map((p) => `${p.name} (${p.position}, Age ${p.age})`).join(', ') || 'None'}

## MODIFIED SQUAD (after scenario):
${formatSquad(modifiedSquad)}

## Your Task:
Score BOTH the current squad AND the modified squad across these 6 dimensions (each 1-10):
1. roleCoverage — Does the squad cover all positions the system requires?
2. systemFit — How well do players match the manager's tactical demands?
3. attackingThreat — Goals, creativity, and pressing threat up front
4. defensiveStability — Defensive line cohesion, pressing from deep
5. squadDepth — Quality of backup options across all lines
6. ageProfile — Sustainability: balance of peak-age players vs youth vs over-30s

For each dimension, provide:
- baselineScore: score for CURRENT squad (1-10)
- scenarioScore: score for MODIFIED squad (1-10)
- delta: scenarioScore minus baselineScore (can be negative)
- insight: one sentence explaining why the score changed (or didn't)

For the IN players: if you know these as real players, use your knowledge of their quality and profile. If they are unfamiliar, assess them based on the position and age provided.

Return ONLY this JSON:
{
  "dimensions": [
    {
      "key": "roleCoverage",
      "label": "Role Coverage",
      "baselineScore": 7,
      "scenarioScore": 8,
      "delta": 1,
      "insight": "One sentence explaining the change"
    },
    { "key": "systemFit", "label": "System Fit", "baselineScore": 7, "scenarioScore": 8, "delta": 1, "insight": "..." },
    { "key": "attackingThreat", "label": "Attacking Threat", "baselineScore": 7, "scenarioScore": 8, "delta": 1, "insight": "..." },
    { "key": "defensiveStability", "label": "Defensive Stability", "baselineScore": 7, "scenarioScore": 7, "delta": 0, "insight": "..." },
    { "key": "squadDepth", "label": "Squad Depth", "baselineScore": 6, "scenarioScore": 7, "delta": 1, "insight": "..." },
    { "key": "ageProfile", "label": "Age Profile", "baselineScore": 6, "scenarioScore": 8, "delta": 2, "insight": "..." }
  ],
  "overallBaselineScore": 6.8,
  "overallScenarioScore": 7.7,
  "overallDelta": 0.9,
  "verdict": "1-2 sentences: scout verdict on whether this deal makes sense for this team and system",
  "risks": ["Risk 1", "Risk 2"],
  "recommendation": "Consider it"
}

Recommendation must be exactly one of: "Do it" | "Consider it" | "Risky" | "Avoid"
No other text.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  return extractJSON(sanitizeHomoglyphs(raw), 'object') as Omit<
    ScenarioResult,
    'id' | 'label' | 'createdAt' | 'playersOut' | 'playersIn'
  >
}

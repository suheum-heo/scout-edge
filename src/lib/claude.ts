import Anthropic from '@anthropic-ai/sdk'
import { ManagerProfile } from './managers'
import { formatPlayerStats } from './api-football'
import type { TMPlayerData } from './transfermarkt'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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

// Analyze a squad against a manager's tactical profile
// manager can be null — Claude will infer the profile from managerName using its own knowledge
export async function analyzeSquadGaps(
  manager: ManagerProfile | null,
  squadPlayers: ReturnType<typeof formatPlayerStats>[],
  teamName: string,
  managerName?: string
): Promise<SquadAnalysisResult> {
  const resolvedName = manager?.name || managerName || 'Unknown Manager'

  const hasStats = squadPlayers.some((p) => p && (p.goals > 0 || p.appearances > 0))

  const squadSummary = squadPlayers
    .filter(Boolean)
    .slice(0, 30) // cap to prevent prompt overflow
    .map((p) => {
      if (hasStats) {
        return `- ${p!.name} (${p!.position}, Age ${p!.age}, ${p!.nationality}) | G:${p!.goals} A:${p!.assists} Rtg:${p!.rating} Apps:${p!.appearances} Tkl:${p!.tackles} Int:${p!.interceptions}`
      }
      return `- ${p!.name} (${p!.position}, Age ${p!.age}, ${p!.nationality})`
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
Use your extensive knowledge of ${resolvedName}'s tactical system, preferred formations, pressing intensity, defensive line, build-up style, and positional requirements. Apply that knowledge to analyze the squad below.`

  const prompt = `You are an elite football scout and tactical analyst. Analyze this squad's fit with the manager's tactical system.

${managerSection}

## Current Squad at ${teamName}:
${squadSummary || 'No squad data available'}
${!hasStats ? '\n*Note: Per-match stats are not available for this squad. Use your own knowledge of these players to assess their quality, typical output, and tactical profile.*' : ''}

## Your Task:
Analyze the squad and identify:
1. Which positions have the RIGHT profile for this system
2. Which positions are GAPS or MISMATCHES (this is the most important output)
3. Overall tactical fit score (1-10) for this squad with this manager

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
      "profileLabel": "Pace-First Ball-Playing CB",
      "reasoning": "Why this is a gap — reference specific players and their stats",
      "keyStatsPriority": ["pace", "pass_accuracy", "interceptions"]
    }
  ]
}

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

// Recommend specific real transfer targets for a tactical gap within a budget
// Entirely Claude-knowledge-driven — no API needed, knows market values + contract situations
export async function recommendPlayersForGap(
  gap: SquadGap,
  manager: ManagerProfile | null,
  teamName: string,
  budget: string,
  managerName?: string
): Promise<TransferTarget[]> {
  const resolvedName = manager?.name || managerName || 'the manager'

  const managerSection = manager
    ? `**System**: ${manager.formations.join(' / ')} | **Pressing**: ${manager.style.pressing} | **Build-up**: ${manager.style.buildUp}
**Key principles**: ${manager.keyPrinciples.slice(0, 3).join('; ')}`
    : `Use your knowledge of ${resolvedName}'s tactical system and what he demands from players.`

  const currentDate = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const prompt = `You are an elite football scout and transfer market expert. Today is ${currentDate}. Recommend 5 specific real players for ${teamName} to fill this tactical gap within the stated budget. Use the most current club affiliations, contract situations, and market values you know.

## Manager: ${resolvedName}
${managerSection}

## Tactical Gap:
**Position**: ${gap.position}
**Profile needed**: ${gap.profileLabel}
**Urgency**: ${gap.urgency}
**Why it's a gap**: ${gap.reasoning}

## Budget: ${budget}

## Your Task:
Name 5 real professional players who:
1. Fit the tactical profile for ${resolvedName}'s system
2. Are realistically gettable within this budget (consider transfer fee, wages, club situation)
3. Would be a credible signing for ${teamName}

Use your knowledge of player market values, contract situations, and playing styles. Be realistic — don't suggest €100M players on a €20M budget. Rank by tactical fit.

Respond in this exact JSON format:
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
    "fitSummary": "One punchy sentence on why this player fits this specific system",
    "strengths": ["strength relevant to this system", "strength 2", "strength 3"],
    "concerns": ["concern 1", "concern 2"],
    "whyThisPlayer": "2-3 sentences of scout-level reasoning explaining why this specific player suits ${resolvedName}'s system and addresses this gap",
    "availability": "Likely available"
  }
]

Availability options: "Likely available" | "Possible" | "Hard to get"
Fee format: "Free agent" if out of contract, "Loan" for loan-only, "€XM" or "€X-YM" range for transfers.
Be specific and analytical. Reference playing styles, not just reputations.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return extractJSON(text, 'array') as TransferTarget[]
}

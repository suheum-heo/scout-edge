# ScoutEdge — CLAUDE.md

## Project
**ScoutEdge** is a tactical transfer intelligence web app.
Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS, Anthropic SDK
Deploy: Vercel (`npx vercel --prod`)

## Commands
```
npm run dev      # local dev
npm run build    # production build (must pass before deploy)
npx vercel --prod
```
Always run `npm run build` locally before deploying. Push commits to `origin/main` after deploy to keep git and Vercel in sync.

---

## Current Status (as of March 2026)
- Local dev path: `~/Dev/scout-edge`
- V3, partial V4 (Undervalued XI + Verdict), and V5 are all implemented
- Last known working: `npm run dev` on localhost:3000

---

## Architecture

### Data source split
| Feature | Source | Notes |
|---------|---------|-------|
| Team search | `teams-db.ts` local DB | Instant fuzzy match, football-data.org IDs |
| Squad + coach | football-data.org | Free tier, live, no daily cap |
| Stats enrichment | FotMob (unofficial) | Per-player appearances, rating, minutes |
| Player recommendations | API Football | 100 calls/day — use sparingly |
| Club/contract verification | Transfermarkt scrape | `transfermarkt.ts` |

### Request flow
1. User types team → local `teams-db.ts` instant partial match
2. Team selected → `/api/analyze`: FD + FotMob run **in parallel**
3. Manager auto-detected from coach name or Claude infers from name
4. Claude `analyzeSquadGaps()` → JSON gaps
5. User clicks gap → `/api/recommendations`: API Football candidates → TM enrichment → Claude ranks
6. Squad Fit tab → `/api/squad-fit`: Claude rates every squad player 1–10

### Key rule: LLM = reasoning, API = facts
- Club names, ages, contract years → must come from TM or API Football
- If `tmVerified = false` → **never display the model-generated club name** in the UI
- Tactical reasoning, fit scores, role analysis → Claude

---

## Key files
- `src/lib/managers.ts` — tactical profiles (~20 managers)
- `src/lib/football-data.ts` — squad + coach from football-data.org
- `src/lib/fotmob.ts` — FotMob unofficial client; use `getSquadAndCoach()` (one call, not two)
- `src/lib/transfermarkt.ts` — TM scraper; `searchPlayer(name, {age, club})` with scoring
- `src/lib/claude.ts` — `analyzeSquadGaps`, `recommendPlayersForGap`, `analyzeSquadSystemFit`, `analyzeScenario`, `generateUndervaluedXI`, `buildManagerXI`, `analyzeTransferVerdict`
- `src/lib/teams-db.ts` — local club DB with football-data.org + FotMob IDs
- `src/app/api/analyze/route.ts` — main analysis endpoint
- `src/app/api/recommendations/route.ts` — transfer target recommendations + TM enrichment
- `src/app/api/squad-fit/route.ts` — squad fit map endpoint
- `src/app/api/scenario/route.ts` — Transfer Scenario Simulator endpoint
- `src/app/api/undervalued-xi/route.ts` — Undervalued XI endpoint
- `src/app/api/verdict/route.ts` — ScoutEdge Verdict endpoint
- `src/app/api/manager-xi/route.ts` — Manager Identity XI endpoint
- `src/app/verdict/page.tsx` — Verdict page
- `src/app/build/page.tsx` — Manager Identity (Build page)
- `src/components/TransferTargetCard.tsx` — tmVerified drives club display logic
- `src/components/SquadFitMap.tsx` — fit map UI
- `src/components/ScenarioBuilder.tsx` — scenario IN/OUT builder
- `src/components/ScenarioCompare.tsx` — scenario A vs B comparison
- `src/components/ScenarioDimensionChart.tsx` — dimension chart for scenario results
- `src/components/ScenarioResultCard.tsx` — scenario result display
- `src/components/AvailabilityEditor.tsx` — player availability editor
- `src/components/UndervaluedXI.tsx` — Undervalued XI UI

## Data model notes
- `TransferTarget.tmVerified: boolean` — true only when TM confirmed active club
- `SquadGap.positionCode` — "Goalkeeper" | "Defender" | "Midfielder" | "Attacker"
- `FitLabel` — "Key Man" | "Good Fit" | "Rotation" | "Poor Fit" | "Sell Candidate"
- Claude JSON responses parsed with `extractJSON()` + `sanitizeHomoglyphs()` (Cyrillic fix)

## FotMob notes
- Unofficial API — no key needed, server-side only
- axios timeout: **5s** (reduced from 15s for Vercel serverless)
- Always use `getSquadAndCoach(teamId)` — not separate `getSquad` + `getCoach` (avoids double HTTP call)
- In-memory cache resets per serverless invocation — don't rely on it in production

## Transfermarkt notes
- `searchPlayer(name, hints?)` — scoring: name match + age proximity + club match
- Fallback chain: original name → diacritics stripped → last name only (≥5 chars)
- `isRetiredOrUnknown` check: skip players with no club, "retired", "without club", or "-"
- Per-player timeout: 6000ms — never wrap `Promise.all` with a single shared timeout

---

## Version history

### ✅ V1 — Foundation
- Team search, squad fetch (football-data.org), squad gap analysis (Claude)
- Manager tactical profiles, gap cards, basic recommendations

### ✅ V2 — Intelligence Layer
- Role coverage layer, need score, ranked transfer targets
- Separate Player Check page (name + manager → compatibility report)
- FotMob integration for live squad stats
- Squad fit map (per-player system fit scores)

### ✅ V2.2 — Data Quality
- TM enrichment: per-player timeout, age+club hints for disambiguation
- Retired/no-club detection — skips stale recommendations
- Cyrillic homoglyph sanitization in Claude responses
- `tmVerified` flag — UI shows `⚠ verify club` for unconfirmed clubs
- Analyze: FD + FotMob parallelized; single `getSquadAndCoach` call

### ✅ V2.3 — Club attribution guardrail
- When `tmVerified = false`: hide model-generated club name, show "Unverified — check TM"
- LLM output should never be treated as a factual club claim in the UI

### ✅ V3 — Transfer Scenario Simulator
- Scenario Builder: define OUT/IN players, Claude recalculates squad dimensions
- A vs B comparison with dimension chart

### ✅ V4 (partial) — Squad Intelligence
- ScoutEdge Verdict page: transfer rumor checker with Do it / Consider it / Risky / Avoid
- Undervalued XI: Moneyball XI generator under budget

### ✅ V5 — Manager Identity Mode (`/build`)
- Pick any manager + budget → Claude builds ideal XI with archetype labels + TM enrichment

---

## Roadmap

### ✅ V3 — Transfer Scenario Simulator
> "What happens to the squad if we sign X instead of Y?"
- Scenario Builder: define OUT/IN players
- Claude recalculates: role coverage, system fit, squad balance, age curve, depth
- Output: Scenario A vs B comparison with % changes per dimension

### ✅ V3.5 — Player Archetype Matching (integrated into V5)
- Archetype labels used in Manager Identity XI builder
- Not a standalone archetype search — embedded in the build flow

### ✅ V4 (partial) — Squad Intelligence
- **ScoutEdge Verdict**: `verdict/page.tsx` — rumor checker, returns Do it / Consider it / Risky / Avoid
- **Undervalued XI**: `UndervaluedXI.tsx` — Moneyball XI under budget, TM-enriched
- 🔲 Squad Dependency Risk — not yet built
- 🔲 Market Timing Intelligence — not yet built
- 🔲 ScoutEdge Score — not yet built

### ✅ V5 — Manager Identity Mode (`/build`)
- User picks manager + budget → Claude builds ideal XI from scratch
- Archetype labels per position, TM-enriched player data
- No real squad needed — pure tactical imagination

---

## Conventions
- No daily-cap APIs in the hot path (football-data.org is free + unlimited; API Football is capped at 100/day)
- Always handle FotMob failure gracefully — fall back to FD squad data
- `maxDuration = 60` on all API routes (Vercel hobby plan supports up to 60s)
- TypeScript strict — cast `unknown` carefully, don't use `as any`

# ScoutEdge — Tactical Transfer Intelligence

**Live:** [scout-edge.vercel.app](https://scout-edge.vercel.app)

AI-powered football scouting tool that analyses any club's squad against their manager's tactical system and surfaces ranked transfer targets with scout-level reasoning.

---

## Features

- **Squad Gap Analysis** — Auto-detects the current manager, maps their tactical profile, and identifies which positions are gaps or mismatches
- **Transfer Targets** — Ranked real players per gap, filtered by budget (Loan / Free / €20M / €50M / €100M+), with verified club and contract data
- **Squad Fit Map** — Per-player system fit scores (1–10) with role analysis and sell candidate flags
- **Transfer Scenario Simulator** — Define OUT/IN moves, get AI-recalculated squad balance, role coverage, age curve, and system fit delta
- **Undervalued XI** — Moneyball-style best XI under a set budget, optimised for the manager's system
- **Player Check** — Compatibility report for any player against any manager's system
- **Verdict** — Rumour checker: "Arsenal want Osimhen → here's why it fits or doesn't"
- **Build XI** — Pick any manager and budget, get their ideal starting XI built from scratch
- **Dark / Light mode** — Persistent theme toggle with zero-flash SSR

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| AI | Anthropic Claude (claude-sonnet-4-6) |
| Deploy | Vercel |

## Data Sources

| Feature | Source |
|---|---|
| Squad + coach | football-data.org (free tier, no daily cap) |
| Stats enrichment | FotMob unofficial API |
| Player search / recommendations | API Football (100 calls/day) |
| Club / contract verification | Transfermarkt scrape |

---

## Architecture

```
User types team → local teams-db (instant fuzzy match)
→ /api/analyze: football-data.org + FotMob in parallel
→ Claude analyzeSquadGaps() → JSON gap list
→ User clicks gap → /api/recommendations: API Football candidates
→ Transfermarkt enrichment (per-player, with disambiguation)
→ Claude ranks by tactical fit
```

**Key design principle:** LLM = reasoning, APIs = facts.
Club names, ages, and contract data always come from verified sources. `tmVerified: false` means the model-generated club is never shown in the UI.

---

## Local Development

```bash
npm install
npm run dev
```

Required env vars in `.env.local`:

```
ANTHROPIC_API_KEY=
FOOTBALL_DATA_KEY=
API_FOOTBALL_KEY=
```

---

## Roadmap

- [ ] Squad Dependency Risk (Saka-level criticality scoring)
- [ ] Market Timing Intelligence (contract expiry + value trend)
- [ ] ScoutEdge Score — composite ranking per player

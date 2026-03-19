'use client'

import { PlayerSystemFit, FitLabel } from '@/lib/claude'

// ── Fit label config ───────────────────────────────────────────────────────────

const FIT_CONFIG: Record<FitLabel, { bar: string; badge: string; dot: string }> = {
  'Key Man':        { bar: 'bg-amber-400',   badge: 'bg-amber-500/15 border-amber-500/30 text-amber-400',   dot: 'bg-amber-400' },
  'Good Fit':       { bar: 'bg-emerald-400', badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400', dot: 'bg-emerald-400' },
  'Rotation':       { bar: 'bg-blue-400',    badge: 'bg-blue-500/15 border-blue-500/30 text-blue-400',      dot: 'bg-blue-400' },
  'Poor Fit':       { bar: 'bg-orange-400',  badge: 'bg-orange-500/15 border-orange-500/30 text-orange-400',dot: 'bg-orange-400' },
  'Sell Candidate': { bar: 'bg-red-400',     badge: 'bg-red-500/15 border-red-500/30 text-red-400',         dot: 'bg-red-400' },
}

function positionGroup(pos: string): 'GK' | 'DEF' | 'MID' | 'ATT' {
  const p = pos.toLowerCase()
  if (p.includes('goalkeeper') || p === 'gk') return 'GK'
  if (p.includes('back') || p.includes('defender') || p.includes('cb') || p.includes('lb') || p.includes('rb')) return 'DEF'
  if (p.includes('mid') || p.includes('winger') || p.includes('wing')) return 'MID'
  return 'ATT'
}

const GROUP_ORDER: Array<'GK' | 'DEF' | 'MID' | 'ATT'> = ['GK', 'DEF', 'MID', 'ATT']
const GROUP_LABELS: Record<string, string> = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', ATT: 'Attackers' }

// ── Legend ─────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 mb-5">
      {(Object.keys(FIT_CONFIG) as FitLabel[]).map((label) => {
        const cfg = FIT_CONFIG[label]
        return (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className="text-slate-500 text-xs">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Player row ─────────────────────────────────────────────────────────────────

function seScoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 65) return 'text-blue-400'
  if (score >= 50) return 'text-slate-300'
  return 'text-slate-500'
}

function PlayerRow({ player }: { player: PlayerSystemFit }) {
  const cfg = FIT_CONFIG[player.fitLabel] ?? FIT_CONFIG['Rotation']
  const barWidth = `${Math.round((player.fitScore / 10) * 100)}%`

  return (
    <div className={`flex items-start gap-3 py-2.5 px-3 rounded-lg ${
      player.fitLabel === 'Sell Candidate' ? 'bg-red-500/5 border border-red-500/10' : ''
    }`}>
      {/* Fit score bar */}
      <div className="flex-shrink-0 w-8 text-right">
        <span className="text-white text-sm font-bold leading-none">{player.fitScore}</span>
        <div className="w-8 h-1 bg-slate-700 rounded-full mt-1.5 overflow-hidden">
          <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: barWidth }} />
        </div>
      </div>

      {/* Name + reason */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white text-sm font-medium">{player.playerName}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${cfg.badge}`}>
            {player.fitLabel}
          </span>
          {player.valueLabel === 'Undervalued' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-emerald-500/15 border-emerald-500/30 text-emerald-400 uppercase tracking-wide">
              Undervalued
            </span>
          )}
          {player.valueLabel === 'Overpriced' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-red-500/15 border-red-500/30 text-red-400 uppercase tracking-wide">
              Overpriced
            </span>
          )}
          <span className="text-slate-600 text-xs">{player.position} · {player.age}</span>
        </div>
        <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{player.reason}</p>
      </div>

      {/* ScoutEdge Score */}
      {player.scoutScore != null && (
        <div className="flex-shrink-0 text-right">
          <span className={`text-base font-bold leading-none ${seScoreColor(player.scoutScore)}`}>
            {player.scoutScore}
          </span>
          <div className="text-slate-600 text-[9px] uppercase tracking-wider mt-0.5">SE</div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface SquadFitMapProps {
  fits: PlayerSystemFit[]
  managerName?: string
}

export default function SquadFitMap({ fits, managerName }: SquadFitMapProps) {
  // Group by position, sort each group by fitScore desc
  const grouped = GROUP_ORDER.reduce<Record<string, PlayerSystemFit[]>>((acc, group) => {
    acc[group] = fits
      .filter((p) => positionGroup(p.position) === group)
      .sort((a, b) => b.fitScore - a.fitScore)
    return acc
  }, {})

  // Summary counts
  const sellCount = fits.filter((p) => p.fitLabel === 'Sell Candidate').length
  const keyCount  = fits.filter((p) => p.fitLabel === 'Key Man').length

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-white font-bold text-lg">Squad Fit Map</h2>
        <p className="text-slate-500 text-sm">
          How each player fits {managerName ? `${managerName}'s` : 'the'} system
          {sellCount > 0 && (
            <span className="ml-2 text-red-400">{sellCount} sell candidate{sellCount > 1 ? 's' : ''}</span>
          )}
          {keyCount > 0 && (
            <span className="ml-2 text-amber-400">{keyCount} key man{keyCount > 1 ? 's' : ''}</span>
          )}
        </p>
      </div>

      <Legend />

      <div className="space-y-6">
        {GROUP_ORDER.map((group) => {
          const players = grouped[group]
          if (!players?.length) return null
          return (
            <div key={group}>
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 px-1">
                {GROUP_LABELS[group]}
              </h3>
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl divide-y divide-slate-700/30 overflow-hidden">
                {players.map((p) => (
                  <PlayerRow key={p.playerName} player={p} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { TransferTarget } from '@/lib/claude'
import { getScoreColor } from '@/lib/utils'
import { CheckCircle, AlertTriangle, Tag, Clock, ChevronDown, Star, TriangleAlert } from 'lucide-react'

interface TransferTargetCardProps {
  target: TransferTarget
  rank: number
}

// ── Market badge ─────────────────────────────────────────────────────────────

function getMarketBadge(target: TransferTarget): { label: string; className: string } | null {
  const fee = target.estimatedFee.toLowerCase()
  const contractYear = parseInt(target.contractUntil ?? '')
  // TM-confirmed contract of 2027+ overrides Claude's "free agent" claim
  const hasRealContract = !isNaN(contractYear) && contractYear >= 2027

  if (fee.includes('free') && !hasRealContract) {
    return { label: 'Free Agent', className: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' }
  }
  if (contractYear === 2025 || contractYear === 2026) {
    return { label: 'Contract Expiring', className: 'bg-amber-500/15 border-amber-500/30 text-amber-400' }
  }
  if (target.availability === 'Likely available') {
    return { label: 'Available', className: 'bg-blue-500/15 border-blue-500/30 text-blue-400' }
  }
  return null
}

// ── Rank badge style ──────────────────────────────────────────────────────────

function rankStyle(rank: number): { ring: string; text: string; label: string } {
  if (rank === 1) return { ring: 'border-amber-400/60 bg-amber-500/10',  text: 'text-amber-400',  label: '#1' }
  if (rank === 2) return { ring: 'border-slate-400/50 bg-slate-500/10',  text: 'text-slate-300',  label: '#2' }
  if (rank === 3) return { ring: 'border-orange-700/50 bg-orange-800/10', text: 'text-orange-400', label: '#3' }
  return             { ring: 'border-slate-700 bg-slate-800',            text: 'text-slate-500',  label: `#${rank}` }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TransferTargetCard({ target, rank }: TransferTargetCardProps) {
  const [expanded, setExpanded] = useState(rank === 1)
  const score = target.tacticalFitScore
  const badge = getMarketBadge(target)
  const rs = rankStyle(rank)

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      expanded ? 'bg-slate-800/60 border-slate-600' : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
    }`}>
      {/* Always-visible header row */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          {/* Rank badge */}
          <div className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 ${rs.ring}`}>
            <span className={`text-xs font-bold ${rs.text}`}>{rs.label}</span>
          </div>

          {/* Name + club (selectable) */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-semibold text-sm">{target.playerName}</span>
              {badge && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${badge.className}`}>
                  {badge.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {target.tmVerified
                ? <span className="text-slate-500 text-xs">{target.currentClub}</span>
                : <a
                    href={`https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(target.playerName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-0.5 text-amber-500/70 text-[10px] hover:text-amber-400 transition-colors"
                  >
                    <TriangleAlert className="w-2.5 h-2.5 flex-shrink-0" />
                    Club unverified — check TM
                  </a>
              }
              <span className="text-slate-700 text-xs">·</span>
              <span className="text-slate-500 text-xs">Age {target.age}</span>
              <span className="text-slate-700 text-xs">·</span>
              <span className="flex items-center gap-1 text-blue-400/80 text-xs">
                <Tag className="w-2.5 h-2.5" />
                {target.estimatedFee}
              </span>
            </div>
          </div>

          {/* Fit score + chevron — only this area is the click target */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 flex-shrink-0 hover:opacity-75 transition-opacity"
          >
            <div className="text-right">
              <div className={`text-lg font-bold leading-none ${getScoreColor(score)}`}>
                {score}<span className="text-xs text-slate-500">/10</span>
              </div>
              <div className="text-slate-600 text-[10px]">fit</div>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Collapsed summary */}
        {!expanded && (
          <p className="text-slate-500 text-xs mt-2 ml-12 line-clamp-1 italic">{target.fitSummary}</p>
        )}
      </div>

      {/* Expanded scout analysis */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/50 pt-3">
          {/* Contract badge row */}
          <div className="flex flex-wrap gap-2">
            {target.contractUntil && target.contractUntil !== 'Unknown' && (
              <span className="flex items-center gap-1 bg-slate-700/50 border border-slate-600 text-slate-400 text-xs px-2 py-1 rounded-full">
                <Clock className="w-3 h-3" />
                Contract to {target.contractUntil}
              </span>
            )}
            <span className={`flex items-center gap-1 border text-xs px-2 py-1 rounded-full ${
              target.availability === 'Likely available'
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : target.availability === 'Hard to get'
                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
            }`}>
              {target.availability}
            </span>
            <span className="text-slate-500 text-xs px-1 py-1">
              {target.position} · {target.nationality}
            </span>
          </div>

          {/* Scout quotes */}
          <p className="text-slate-300 text-sm leading-relaxed italic">&ldquo;{target.fitSummary}&rdquo;</p>
          <p className="text-slate-400 text-sm leading-relaxed">{target.whyThisPlayer}</p>

          {/* Strengths + concerns */}
          <div className="space-y-1.5">
            {target.strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-300 text-xs">{s}</span>
              </div>
            ))}
            {target.concerns.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-400 text-xs">{c}</span>
              </div>
            ))}
          </div>

          {/* Top pick callout for rank 1 */}
          {rank === 1 && (
            <div className="flex items-center gap-1.5 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2 mt-1">
              <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="text-amber-400/90 text-xs font-medium">Top recommendation for this gap</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

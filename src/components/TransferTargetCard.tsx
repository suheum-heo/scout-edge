'use client'

import { TransferTarget } from '@/lib/claude'
import { getScoreColor } from '@/lib/utils'
import { CheckCircle, AlertTriangle, Tag, Clock, TrendingUp } from 'lucide-react'

interface TransferTargetCardProps {
  target: TransferTarget
  rank: number
}

const availabilityConfig = {
  'Likely available': { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  'Possible':         { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  'Hard to get':      { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
}

export default function TransferTargetCard({ target, rank }: TransferTargetCardProps) {
  const score = target.tacticalFitScore
  const avail = availabilityConfig[target.availability] || availabilityConfig['Possible']

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-600 transition-colors">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-start gap-3">
          {/* Rank badge */}
          <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-slate-300 text-xs font-bold">{rank}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-white font-bold text-base">{target.playerName}</h3>
                <p className="text-slate-400 text-sm">{target.currentClub}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {target.position} · Age {target.age} · {target.nationality}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
                  {score}<span className="text-sm text-slate-500">/10</span>
                </div>
                <div className="text-slate-500 text-xs">Tactical fit</div>
              </div>
            </div>

            {/* Fee + contract + availability row */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs px-2 py-1 rounded-full font-medium">
                <Tag className="w-3 h-3" />
                {target.estimatedFee}
              </span>
              {target.contractUntil && target.contractUntil !== 'Unknown' && (
                <span className="flex items-center gap-1 bg-slate-700/50 border border-slate-600 text-slate-400 text-xs px-2 py-1 rounded-full">
                  <Clock className="w-3 h-3" />
                  Contract to {target.contractUntil}
                </span>
              )}
              <span className={`flex items-center gap-1 border text-xs px-2 py-1 rounded-full ${avail.bg} ${avail.color}`}>
                <TrendingUp className="w-3 h-3" />
                {target.availability}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scout analysis */}
      <div className="p-4 space-y-3">
        <p className="text-slate-300 text-sm leading-relaxed italic">&ldquo;{target.fitSummary}&rdquo;</p>
        <p className="text-slate-400 text-sm leading-relaxed">{target.whyThisPlayer}</p>

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
      </div>
    </div>
  )
}

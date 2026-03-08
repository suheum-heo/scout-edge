'use client'

import { SquadGap } from '@/lib/claude'
import { getUrgencyColor } from '@/lib/utils'
import { AlertCircle, TrendingUp, ChevronRight } from 'lucide-react'

interface GapCardProps {
  gap: SquadGap
  onClick: () => void
  isSelected: boolean
}

export default function GapCard({ gap, onClick, isSelected }: GapCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
        isSelected
          ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/30'
          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border uppercase tracking-wide ${getUrgencyColor(gap.urgency)}`}>
              {gap.urgency}
            </span>
            <span className="text-slate-400 text-xs">{gap.positionCode}</span>
          </div>
          <h3 className="text-white font-semibold text-sm">{gap.position}</h3>
          <p className="text-blue-400 text-xs font-medium mt-0.5">{gap.profileLabel}</p>
          <p className="text-slate-400 text-xs leading-relaxed mt-2 line-clamp-2">
            {gap.reasoning}
          </p>
        </div>
        <ChevronRight
          className={`w-4 h-4 flex-shrink-0 mt-1 transition-colors ${
            isSelected ? 'text-blue-400' : 'text-slate-600'
          }`}
        />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {gap.keyStatsPriority.slice(0, 3).map((stat) => (
          <span key={stat} className="bg-slate-700/50 text-slate-400 text-xs px-2 py-0.5 rounded">
            {stat.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
    </button>
  )
}

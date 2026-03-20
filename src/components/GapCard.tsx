'use client'

import { SquadGap } from '@/lib/claude'
import { getUrgencyColor } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

interface GapCardProps {
  gap: SquadGap
  onClick: () => void
  isSelected: boolean
}

function getNeedScoreColor(score: number): string {
  if (score >= 75) return 'text-red-400'
  if (score >= 50) return 'text-orange-400'
  if (score >= 25) return 'text-yellow-400'
  return 'text-slate-500'
}

function getNeedScoreBar(score: number): string {
  if (score >= 75) return 'bg-red-500'
  if (score >= 50) return 'bg-orange-500'
  if (score >= 25) return 'bg-yellow-500'
  return 'bg-slate-600'
}

export default function GapCard({ gap, onClick, isSelected }: GapCardProps) {
  const needScore = gap.needScore ?? 0

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
        isSelected
          ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/30'
          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-[#EEF2F7] dark:hover:bg-slate-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border uppercase tracking-wide ${getUrgencyColor(gap.urgency)}`}>
              {gap.urgency}
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-xs">{gap.positionCode}</span>
          </div>
          <h3 className="text-slate-900 dark:text-white font-semibold text-sm">{gap.position}</h3>
          <p className="text-blue-500 dark:text-blue-400 text-xs font-medium mt-0.5">{gap.profileLabel}</p>
          <p className={`text-slate-500 dark:text-slate-400 text-xs leading-relaxed mt-2 ${isSelected ? '' : 'line-clamp-2'}`}>
            {gap.reasoning}
          </p>
        </div>

        {/* Need Score */}
        <div className="flex-shrink-0 flex flex-col items-end gap-1 min-w-[48px]">
          <span className={`text-lg font-bold leading-none ${getNeedScoreColor(needScore)}`}>
            {needScore}
          </span>
          <span className="text-slate-400 dark:text-slate-600 text-[10px] uppercase tracking-wide">need</span>
          <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${getNeedScoreBar(needScore)}`}
              style={{ width: `${needScore}%` }}
            />
          </div>
        </div>

        <ChevronRight
          className={`w-4 h-4 flex-shrink-0 mt-1 transition-colors ${
            isSelected ? 'text-blue-400' : 'text-slate-400 dark:text-slate-600'
          }`}
        />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {gap.keyStatsPriority.slice(0, 3).map((stat) => (
          <span key={stat} className="bg-slate-200/50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs px-2 py-0.5 rounded">
            {stat.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
    </button>
  )
}

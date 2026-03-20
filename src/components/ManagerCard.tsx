'use client'

import { ManagerProfile } from '@/lib/managers'
import { getPressingLabel, getLineLabel, getBuildUpLabel } from '@/lib/utils'

interface ManagerCardProps {
  manager: ManagerProfile
  compact?: boolean
}

export default function ManagerCard({ manager, compact = false }: ManagerCardProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {manager.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
        </div>
        <div>
          <p className="text-slate-900 dark:text-white font-semibold text-sm">{manager.name}</p>
          <p className="text-slate-500 dark:text-slate-400 text-xs">{manager.formations[0]} · {manager.nationality}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
          {manager.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-slate-900 dark:text-white font-bold text-xl">{manager.name}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{manager.nationality}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {manager.formations.map((f) => (
              <span key={f} className="bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20 text-xs px-2.5 py-1 rounded-full font-medium">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="bg-[#EEF2F7] dark:bg-slate-900/60 rounded-lg p-3 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-xs uppercase tracking-wider mb-1">Press</p>
          <p className="text-slate-900 dark:text-white text-sm font-medium">{getPressingLabel(manager.style.pressing)}</p>
        </div>
        <div className="bg-[#EEF2F7] dark:bg-slate-900/60 rounded-lg p-3 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-xs uppercase tracking-wider mb-1">Line</p>
          <p className="text-slate-900 dark:text-white text-sm font-medium">{getLineLabel(manager.style.defensiveLine)}</p>
        </div>
        <div className="bg-[#EEF2F7] dark:bg-slate-900/60 rounded-lg p-3 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-xs uppercase tracking-wider mb-1">Build-Up</p>
          <p className="text-slate-900 dark:text-white text-sm font-medium">{getBuildUpLabel(manager.style.buildUp)}</p>
        </div>
      </div>

      <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mt-4 line-clamp-3">
        {manager.tacticalSummary}
      </p>
    </div>
  )
}

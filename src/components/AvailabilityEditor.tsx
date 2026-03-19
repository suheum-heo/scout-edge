'use client'

import { useState } from 'react'
import { ChevronDown, UserX } from 'lucide-react'
import type { SquadPlayer } from '@/lib/role-profiles'

interface Props {
  squad: SquadPlayer[]
  unavailableIds: Set<string>
  onToggle: (playerId: string) => void
}

type Group = 'GK' | 'DEF' | 'MID' | 'ATT'

function posGroup(pos: string): Group {
  const p = pos.toLowerCase()
  if (p.includes('goalkeeper') || p === 'gk') return 'GK'
  if (p.includes('back') || p.includes('defender') || p.includes('cb') || p.includes('lb') || p.includes('rb')) return 'DEF'
  if (p.includes('mid') || p.includes('winger') || p.includes('wing')) return 'MID'
  return 'ATT'
}

const GROUP_ORDER: Group[] = ['GK', 'DEF', 'MID', 'ATT']
const GROUP_LABELS: Record<Group, string> = { GK: 'GK', DEF: 'Defenders', MID: 'Midfielders', ATT: 'Attackers' }

export default function AvailabilityEditor({ squad, unavailableIds, onToggle }: Props) {
  const [open, setOpen] = useState(false)

  const grouped = GROUP_ORDER.reduce((acc, g) => {
    acc[g] = squad.filter(p => posGroup(p.position) === g)
    return acc
  }, {} as Record<Group, SquadPlayer[]>)

  const count = unavailableIds.size

  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden mb-5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-800 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <UserX className="w-4 h-4 text-slate-400" />
          <span className="text-slate-300 text-sm font-medium">Squad Availability</span>
          {count > 0 && (
            <span className="bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {count} unavailable
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="p-4 border-t border-slate-700/50">
          <p className="text-slate-500 text-xs mb-4">
            Tap players to mark as injured or suspended — they'll be excluded from the next analysis.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {GROUP_ORDER.map(g => grouped[g].length > 0 && (
              <div key={g}>
                <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-2">{GROUP_LABELS[g]}</div>
                <div className="space-y-1">
                  {grouped[g].map(p => {
                    const out = unavailableIds.has(p.playerId)
                    return (
                      <button
                        key={p.playerId}
                        onClick={() => onToggle(p.playerId)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors text-xs ${
                          out
                            ? 'bg-red-500/10 border border-red-500/20 text-red-400 line-through'
                            : 'bg-slate-700/30 border border-transparent hover:border-slate-600 text-slate-300'
                        }`}
                      >
                        <span className="truncate">{p.name}</span>
                        {out && <UserX className="w-3 h-3 flex-shrink-0 ml-1" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

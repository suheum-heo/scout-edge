'use client'

import { useLanguage } from '@/components/LanguageProvider'
import { useState, useEffect } from 'react'
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
  if (p.includes('back') || p.includes('defender') || p.includes('defence') || p.includes('defense') || p.includes('cb') || p.includes('lb') || p.includes('rb')) return 'DEF'
  if (p.includes('mid') || p.includes('winger') || p.includes('wing')) return 'MID'
  if (p.includes('att') || p.includes('striker') || p.includes('forward') || p.includes('offence') || p.includes('offense')) return 'ATT'
  return 'ATT'
}

const GROUP_ORDER: Group[] = ['GK', 'DEF', 'MID', 'ATT']
export default function AvailabilityEditor({ squad, unavailableIds, onToggle }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(() => unavailableIds.size > 0)

  useEffect(() => {
    if (unavailableIds.size === 0) return

    const openTimer = window.setTimeout(() => {
      setOpen(true)
    }, 0)

    return () => window.clearTimeout(openTimer)
  }, [unavailableIds.size])

  const grouped = GROUP_ORDER.reduce((acc, g) => {
    acc[g] = squad.filter(p => posGroup(p.position) === g)
    return acc
  }, {} as Record<Group, SquadPlayer[]>)

  const count = unavailableIds.size

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#EEF2F7] dark:bg-slate-800/60 hover:bg-[#EEF2F7] dark:hover:bg-slate-800 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <UserX className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div className="min-w-0">
            <span className="text-slate-700 dark:text-slate-300 text-sm font-medium">{t('availability.title')}</span>
            {!open && count === 0 && (
              <span className="text-slate-400 dark:text-slate-500 text-xs ml-2">{t('availability.closedHint')}</span>
            )}
          </div>
          {count > 0 && (
            <span className="bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
              {t('availability.count', { count })}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform flex-shrink-0 ml-2 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="p-4 border-t border-slate-200/50 dark:border-slate-700/50">
          <p className="text-slate-400 dark:text-slate-500 text-xs mb-4">
            {t('availability.description')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {GROUP_ORDER.map(g => grouped[g].length > 0 && (
              <div key={g}>
                <div className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-widest mb-2">{t(`fit.group.${g.toLowerCase()}`)}</div>
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
                            : 'bg-slate-200/30 dark:bg-slate-700/30 border border-transparent hover:border-slate-300 dark:hover:border-slate-600 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span className="truncate">{(p as SquadPlayer & { displayName?: string }).displayName || p.name}</span>
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

'use client'

import { useState } from 'react'
import { ScenarioResult, ScenarioVerdict } from '@/lib/claude'
import ScenarioDimensionChart from './ScenarioDimensionChart'
import { ChevronDown, ArrowUpRight, ArrowDownRight, AlertTriangle, GitCompare } from 'lucide-react'

interface Props {
  result: ScenarioResult
  compareSelected: boolean
  onToggleCompare: (id: string) => void
  compareDisabled: boolean  // true when 2 already selected and this one isn't one of them
}

function verdictStyle(v: ScenarioVerdict): string {
  if (v === 'Do it')      return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
  if (v === 'Consider it') return 'bg-blue-500/15 border-blue-500/30 text-blue-400'
  if (v === 'Risky')      return 'bg-amber-500/15 border-amber-500/30 text-amber-400'
  return                          'bg-red-500/15 border-red-500/30 text-red-400'
}

function overallDeltaDisplay(delta: number) {
  if (delta > 0) return { icon: <ArrowUpRight className="w-4 h-4" />, color: 'text-emerald-400', text: `+${delta.toFixed(1)} overall` }
  if (delta < 0) return { icon: <ArrowDownRight className="w-4 h-4" />, color: 'text-red-400', text: `${delta.toFixed(1)} overall` }
  return { icon: null, color: 'text-slate-400', text: 'No change' }
}

export default function ScenarioResultCard({ result, compareSelected, onToggleCompare, compareDisabled }: Props) {
  const [expanded, setExpanded] = useState(true)
  const overall = overallDeltaDisplay(result.overallDelta)

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${
      compareSelected ? 'border-blue-500/50 bg-slate-800/80' : 'border-slate-700 bg-slate-800/40'
    }`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-sm">{result.label}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${verdictStyle(result.recommendation)}`}>
                {result.recommendation}
              </span>
              <span className={`flex items-center gap-0.5 text-sm font-bold ${overall.color}`}>
                {overall.icon}{overall.text}
              </span>
            </div>

            {/* IN / OUT chips */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {result.playersOut.map((p) => (
                <span key={p.playerId + p.name} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400">
                  OUT: {p.name}
                </span>
              ))}
              {result.playersIn.map((p, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  IN: {p.name}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Compare toggle */}
            <button
              onClick={() => onToggleCompare(result.id)}
              disabled={compareDisabled}
              title="Compare this scenario"
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                compareSelected
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                  : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
              }`}
            >
              <GitCompare className="w-3 h-3" />
              Compare
            </button>

            {/* Expand/collapse */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700/50 pt-3 space-y-4">
          {/* Dimension chart */}
          <ScenarioDimensionChart dimensions={result.dimensions} />

          {/* Verdict */}
          <p className="text-slate-300 text-sm leading-relaxed italic">&ldquo;{result.verdict}&rdquo;</p>

          {/* Risks */}
          {result.risks.length > 0 && (
            <div className="space-y-1">
              {result.risks.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-400 text-xs">{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Scores summary */}
          <div className="flex gap-4 pt-1 border-t border-slate-700/30">
            <div>
              <div className="text-slate-500 text-[10px] uppercase tracking-wide">Current squad</div>
              <div className="text-slate-400 text-sm font-semibold">{result.overallBaselineScore.toFixed(1)}/10</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px] uppercase tracking-wide">After scenario</div>
              <div className="text-white text-sm font-semibold">{result.overallScenarioScore.toFixed(1)}/10</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

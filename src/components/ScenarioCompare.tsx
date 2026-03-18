import { ScenarioResult, ScenarioDimension, ScenarioVerdict } from '@/lib/claude'

interface Props {
  a: ScenarioResult
  b: ScenarioResult
}

function verdictStyle(v: ScenarioVerdict): string {
  if (v === 'Do it')      return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
  if (v === 'Consider it') return 'bg-blue-500/15 border-blue-500/30 text-blue-400'
  if (v === 'Risky')      return 'bg-amber-500/15 border-amber-500/30 text-amber-400'
  return                          'bg-red-500/15 border-red-500/30 text-red-400'
}

function winnerStyle(aVal: number, bVal: number, side: 'a' | 'b'): string {
  if (aVal === bVal) return 'text-slate-400'
  const winner = aVal > bVal ? 'a' : 'b'
  return winner === side ? 'text-emerald-400 font-bold' : 'text-slate-500'
}

function DimRow({ dimA, dimB }: { dimA: ScenarioDimension; dimB: ScenarioDimension }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-1.5 border-b border-slate-700/30 last:border-0">
      <div className="text-right">
        <span className={`text-sm ${winnerStyle(dimA.scenarioScore, dimB.scenarioScore, 'a')}`}>
          {dimA.scenarioScore}/10
        </span>
      </div>
      <div className="text-center text-slate-500 text-[10px] w-24">{dimA.label}</div>
      <div className="text-left">
        <span className={`text-sm ${winnerStyle(dimA.scenarioScore, dimB.scenarioScore, 'b')}`}>
          {dimB.scenarioScore}/10
        </span>
      </div>
    </div>
  )
}

export default function ScenarioCompare({ a, b }: Props) {
  // Align dimensions by key (both should have same 6, but be safe)
  const dimsA = new Map(a.dimensions.map((d) => [d.key, d]))
  const dimsB = new Map(b.dimensions.map((d) => [d.key, d]))
  const keys = a.dimensions.map((d) => d.key)

  const aWins = a.overallScenarioScore > b.overallScenarioScore
  const bWins = b.overallScenarioScore > a.overallScenarioScore

  return (
    <div className="border border-blue-500/20 bg-slate-800/60 rounded-xl p-4 mb-4">
      <div className="text-slate-400 text-xs uppercase tracking-widest mb-3 text-center">Scenario Comparison</div>

      {/* Header row */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-3">
        <div className="text-center">
          <div className={`text-sm font-bold ${aWins ? 'text-emerald-400' : 'text-white'}`}>{a.label}</div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${verdictStyle(a.recommendation)}`}>
            {a.recommendation}
          </span>
        </div>
        <div className="w-4" />
        <div className="text-center">
          <div className={`text-sm font-bold ${bWins ? 'text-emerald-400' : 'text-white'}`}>{b.label}</div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${verdictStyle(b.recommendation)}`}>
            {b.recommendation}
          </span>
        </div>
      </div>

      {/* Dimension rows */}
      <div className="mb-3">
        {keys.map((key) => {
          const dA = dimsA.get(key)
          const dB = dimsB.get(key)
          if (!dA || !dB) return null
          return <DimRow key={key} dimA={dA} dimB={dB} />
        })}
      </div>

      {/* Overall scores */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center pt-2 border-t border-slate-700/50">
        <div className={`text-center text-lg font-bold ${aWins ? 'text-emerald-400' : 'text-slate-400'}`}>
          {a.overallScenarioScore.toFixed(1)}
        </div>
        <div className="text-slate-500 text-[10px] text-center w-24">Overall score</div>
        <div className={`text-center text-lg font-bold ${bWins ? 'text-emerald-400' : 'text-slate-400'}`}>
          {b.overallScenarioScore.toFixed(1)}
        </div>
      </div>
    </div>
  )
}

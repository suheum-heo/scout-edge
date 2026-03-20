import { ScenarioDimension } from '@/lib/claude'

interface Props {
  dimensions: ScenarioDimension[]
}

function deltaColor(delta: number): string {
  if (delta > 0) return 'text-emerald-400'
  if (delta < 0) return 'text-red-400'
  return 'text-slate-500'
}

function deltaSign(delta: number): string {
  if (delta > 0) return `+${delta.toFixed(1)}`
  if (delta < 0) return delta.toFixed(1)
  return '±0'
}

function barColor(score: number): string {
  if (score >= 8) return 'bg-emerald-500'
  if (score >= 6) return 'bg-blue-500'
  if (score >= 4) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function ScenarioDimensionChart({ dimensions }: Props) {
  return (
    <div className="space-y-3">
      {dimensions.map((d) => (
        <div key={d.key}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400 text-xs font-medium">{d.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-600 text-xs">{d.baselineScore}/10</span>
              <span className="text-slate-600 text-xs">→</span>
              <span className="text-white text-xs font-semibold">{d.scenarioScore}/10</span>
              <span className={`text-xs font-bold w-10 text-right ${deltaColor(d.delta)}`}>
                {deltaSign(d.delta)}
              </span>
            </div>
          </div>

          {/* Baseline bar */}
          <div className="relative h-1.5 bg-slate-700 rounded-full mb-0.5">
            <div
              className="h-full rounded-full bg-slate-500 opacity-50"
              style={{ width: `${d.baselineScore * 10}%` }}
            />
          </div>

          {/* Scenario bar */}
          <div className="relative h-1.5 bg-slate-700 rounded-full mb-1">
            <div
              className={`h-full rounded-full transition-all ${barColor(d.scenarioScore)}`}
              style={{ width: `${d.scenarioScore * 10}%` }}
            />
          </div>

          <p className="text-slate-600 text-[11px] italic">{d.insight}</p>
        </div>
      ))}
    </div>
  )
}

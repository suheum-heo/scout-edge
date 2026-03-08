'use client'

import { PlayerCompatibilityResult } from '@/lib/claude'
import { getScoreColor, getRecommendationColor } from '@/lib/utils'
import { CheckCircle, AlertTriangle, Info, GitCompare } from 'lucide-react'

interface CompatibilityReportProps {
  result: PlayerCompatibilityResult
}

export default function CompatibilityReport({ result }: CompatibilityReportProps) {
  return (
    <div className="space-y-4">
      {/* Verdict header */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg">{result.playerName}</h3>
            <p className="text-slate-400 text-sm">vs {result.managerName}'s system</p>
            <p className="text-slate-300 mt-3 text-sm leading-relaxed">{result.verdict}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`text-4xl font-bold ${getScoreColor(result.overallFitScore)}`}>
              {result.overallFitScore}
              <span className="text-lg text-slate-500">/10</span>
            </div>
            <div className={`mt-1 text-xs font-semibold px-3 py-1 rounded-full border inline-block ${getRecommendationColor(result.recommendation)}`}>
              {result.recommendation}
            </div>
          </div>
        </div>
      </div>

      {/* Tactical role */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-blue-400" />
          <span className="text-blue-400 text-sm font-medium">Tactical Role</span>
        </div>
        <p className="text-slate-300 text-sm">{result.tacticalRole}</p>
      </div>

      {/* Strengths and Concerns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <h4 className="text-green-400 text-sm font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> Why It Works
          </h4>
          <ul className="space-y-2">
            {result.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green-400/60 text-xs mt-0.5">•</span>
                <span className="text-slate-300 text-sm">{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <h4 className="text-yellow-400 text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Concerns
          </h4>
          {result.concerns.length > 0 ? (
            <ul className="space-y-2">
              {result.concerns.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-yellow-400/60 text-xs mt-0.5">•</span>
                  <span className="text-slate-300 text-sm">{c}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500 text-sm">No major concerns identified</p>
          )}
        </div>
      </div>

      {/* Conditions */}
      {result.conditions?.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <h4 className="text-purple-400 text-sm font-semibold mb-3">Conditions</h4>
          <ul className="space-y-1.5">
            {result.conditions.map((c, i) => (
              <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                <span className="text-purple-400/60 text-xs mt-0.5">→</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Comparison */}
      {result.comparison && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <GitCompare className="w-4 h-4 text-slate-400" />
            <span className="text-slate-400 text-sm font-medium">Scout Comparison</span>
          </div>
          <p className="text-slate-300 text-sm">{result.comparison}</p>
        </div>
      )}
    </div>
  )
}

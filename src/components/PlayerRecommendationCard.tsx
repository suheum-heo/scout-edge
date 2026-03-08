'use client'

import { PlayerRecommendation } from '@/lib/claude'
import { getScoreColor } from '@/lib/utils'
import { CheckCircle, AlertTriangle, Star } from 'lucide-react'
import Image from 'next/image'

interface PlayerRecommendationCardProps {
  recommendation: PlayerRecommendation
  rank: number
}

export default function PlayerRecommendationCard({ recommendation, rank }: PlayerRecommendationCardProps) {
  const score = recommendation.tacticalFitScore
  const stats = recommendation.stats

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden hover:border-slate-600 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-4 p-4 border-b border-slate-700/50">
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-slate-700 overflow-hidden">
            {recommendation.photo ? (
              <Image
                src={recommendation.photo}
                alt={recommendation.playerName}
                width={48}
                height={48}
                className="object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : null}
            <div className="w-full h-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white font-bold text-sm">
              {recommendation.playerName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
          </div>
          <div className="absolute -top-1 -left-1 w-5 h-5 bg-slate-900 border border-slate-700 rounded-full flex items-center justify-center">
            <span className="text-slate-400 text-xs font-bold">{rank}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-white font-semibold">{recommendation.playerName}</h3>
              <p className="text-slate-400 text-sm">{recommendation.currentTeam}</p>
              <p className="text-slate-500 text-xs">{recommendation.league} · Age {recommendation.age} · {recommendation.nationality}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}<span className="text-sm text-slate-500">/10</span></div>
              <div className="text-slate-500 text-xs">Fit Score</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-4 divide-x divide-slate-700/50 border-b border-slate-700/50">
          {[
            { label: 'Goals', value: stats.goals },
            { label: 'Assists', value: stats.assists },
            { label: 'Rating', value: stats.rating },
            { label: 'Apps', value: stats.appearances },
          ].map(({ label, value }) => (
            <div key={label} className="p-3 text-center">
              <p className="text-white font-semibold text-sm">{value}</p>
              <p className="text-slate-500 text-xs">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Analysis */}
      <div className="p-4 space-y-3">
        <p className="text-slate-300 text-sm leading-relaxed">{recommendation.whyThisPlayer}</p>

        <div className="space-y-2">
          {recommendation.strengths.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
              <span className="text-slate-300 text-xs">{s}</span>
            </div>
          ))}
          {recommendation.concerns.map((c, i) => (
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

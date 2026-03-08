import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getUrgencyColor(urgency: string) {
  switch (urgency) {
    case 'critical': return 'text-red-400 bg-red-400/10 border-red-400/20'
    case 'high': return 'text-orange-400 bg-orange-400/10 border-orange-400/20'
    case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
    case 'low': return 'text-green-400 bg-green-400/10 border-green-400/20'
    default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20'
  }
}

export function getScoreColor(score: number) {
  if (score >= 8) return 'text-green-400'
  if (score >= 6) return 'text-yellow-400'
  if (score >= 4) return 'text-orange-400'
  return 'text-red-400'
}

export function getRecommendationColor(rec: string) {
  switch (rec) {
    case 'Strong Yes': return 'text-green-400 bg-green-400/10 border-green-400/30'
    case 'Yes': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
    case 'Conditional': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'
    case 'No': return 'text-orange-400 bg-orange-400/10 border-orange-400/30'
    case 'Strong No': return 'text-red-400 bg-red-400/10 border-red-400/30'
    default: return 'text-slate-400 bg-slate-400/10 border-slate-400/30'
  }
}

export function getPressingLabel(pressing: string) {
  switch (pressing) {
    case 'gegenpressing': return 'Gegenpressing'
    case 'high': return 'High Press'
    case 'medium': return 'Structured Press'
    case 'low': return 'Low Block'
    default: return pressing
  }
}

export function getLineLabel(line: string) {
  switch (line) {
    case 'very_high': return 'Very High Line'
    case 'high': return 'High Line'
    case 'medium': return 'Mid-Block'
    case 'deep': return 'Deep Block'
    default: return line
  }
}

export function getBuildUpLabel(buildUp: string) {
  switch (buildUp) {
    case 'short_passing': return 'Short Passing'
    case 'positional': return 'Positional Play'
    case 'direct': return 'Direct Play'
    case 'counter_attack': return 'Counter-Attack'
    case 'possession': return 'Possession'
    default: return buildUp
  }
}

'use client'

import { useEffect, useState } from 'react'

interface LoadingSpinnerProps {
  message?: string
  submessage?: string
  durationHint?: string
  showElapsed?: boolean
  compact?: boolean
}

function formatElapsedTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

export default function LoadingSpinner({
  message = 'Analyzing...',
  submessage,
  durationHint = 'This can take up to about a minute depending on provider load. Stay on this page and the results will appear automatically.',
  showElapsed = true,
  compact = false,
}: LoadingSpinnerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    setElapsedSeconds(0)
    if (!showElapsed) return

    const startedAt = Date.now()
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)

    return () => window.clearInterval(interval)
  }, [showElapsed])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-4 ${compact ? 'py-8' : 'py-16'}`}
    >
      <div className={`relative ${compact ? 'w-10 h-10' : 'w-12 h-12'}`}>
        <div className="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-700" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-slate-900 dark:text-white font-medium">{message}</p>
        {submessage && <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">{submessage}</p>}
        {showElapsed && (
          <div className="mt-3 inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
            Working for {formatElapsedTime(elapsedSeconds)}
          </div>
        )}
        {durationHint && (
          <p className="text-slate-400 dark:text-slate-500 text-xs mt-2 max-w-md">
            {durationHint}
          </p>
        )}
      </div>
    </div>
  )
}

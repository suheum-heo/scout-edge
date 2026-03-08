'use client'

interface LoadingSpinnerProps {
  message?: string
  submessage?: string
}

export default function LoadingSpinner({ message = 'Analyzing...', submessage }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-slate-700" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-white font-medium">{message}</p>
        {submessage && <p className="text-slate-500 text-sm mt-1">{submessage}</p>}
      </div>
    </div>
  )
}

import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { Search, Users } from 'lucide-react'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'ScoutEdge — Tactical Transfer Intelligence',
  description: 'AI-powered football scouting tool that recommends the exact players a team needs based on their manager\'s tactical system.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.variable} font-sans antialiased bg-slate-950 text-slate-100 min-h-screen`}>
        {/* Navigation */}
        <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
              <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center">
                <Search className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white tracking-tight">ScoutEdge</span>
              <span className="hidden sm:inline text-slate-500 text-xs border border-slate-700 px-1.5 py-0.5 rounded">BETA</span>
            </Link>

            <div className="flex items-center gap-1">
              <Link
                href="/"
                className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Squad Analysis
              </Link>
              <Link
                href="/player-check"
                className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Player Check
              </Link>
              <Link href="/verdict" className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
                Verdict
              </Link>
            </div>
          </div>
        </nav>

        <main>{children}</main>

        <footer className="border-t border-slate-800 mt-20 py-8">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
            <p className="text-slate-600 text-sm">ScoutEdge · Tactical Transfer Intelligence · Powered by Claude AI</p>
            <p className="text-slate-700 text-xs mt-1">Player data via API-Football. For scouting and analytical purposes.</p>
          </div>
        </footer>
      </body>
    </html>
  )
}

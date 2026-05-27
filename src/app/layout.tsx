import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/AppShell'
import { LanguageProvider } from '@/components/LanguageProvider'
import { ThemeProvider } from '@/components/ThemeProvider'

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
      <head>
        {/* Anti-flash: apply saved theme before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark');if(t!=='dark')document.documentElement.style.background='#F1F5F9'}catch(e){}`,
          }}
        />
      </head>
      <body className={`${geist.variable} font-sans antialiased bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen`}>
        <ThemeProvider>
          <LanguageProvider>
            <AppShell>{children}</AppShell>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

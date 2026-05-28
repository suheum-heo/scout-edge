'use client'

import { useId, useState } from 'react'
import { useLanguage } from '@/components/LanguageProvider'

interface ExpandableTextProps {
  text: string
  collapsedLines?: 2 | 3
  className?: string
  buttonClassName?: string
}

export default function ExpandableText({
  text,
  collapsedLines = 2,
  className = '',
  buttonClassName = '',
}: ExpandableTextProps) {
  const { t } = useLanguage()
  const [expandedText, setExpandedText] = useState<string | null>(null)
  const contentId = useId()
  const expanded = expandedText === text

  const clampClass = collapsedLines === 3 ? 'line-clamp-3' : 'line-clamp-2'

  return (
    <div>
      <p
        id={contentId}
        className={`${className} ${expanded ? '' : clampClass}`.trim()}
      >
        {text}
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpandedText((value) => (value === text ? null : text))}
        className={`${buttonClassName} mt-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors`.trim()}
      >
        {expanded ? t('common.showLess') : t('common.showMore')}
      </button>
    </div>
  )
}

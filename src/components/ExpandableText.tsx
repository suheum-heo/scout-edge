'use client'

import { useEffect, useId, useState } from 'react'

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
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()

  useEffect(() => {
    setExpanded(false)
  }, [text])

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
        onClick={() => setExpanded((value) => !value)}
        className={`${buttonClassName} mt-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors`.trim()}
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  )
}

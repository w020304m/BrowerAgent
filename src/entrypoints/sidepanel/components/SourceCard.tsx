import React from 'react'
import type { SourceReference } from '@/types/message'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'

interface SourceCardProps {
  source: SourceReference
}

export function SourceCard({ source }: SourceCardProps) {
  const icon = getSourceIcon(source.type)

  return (
    <a
      href={source.url || undefined}
      target={source.url ? '_blank' : undefined}
      rel={source.url ? 'noopener noreferrer' : undefined}
      className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-foreground hover:bg-accent transition-colors max-w-[200px]"
      title={source.url || source.content || source.title}
    >
      <span className="flex-shrink-0 w-3 h-3">{icon}</span>
      <span className="truncate">{source.title || source.url || 'Source'}</span>
    </a>
  )
}

function getSourceIcon(type: SourceReference['type']): React.ReactNode {
  switch (type) {
    case 'knowledge':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    case 'web':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
      )
    case 'document':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    case 'tab':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      )
  }
}

interface CitationsProps {
  sources: SourceReference[]
}

export function Citations({ sources }: CitationsProps) {
  const [expanded, setExpanded] = React.useState(false)

  if (sources.length === 0) return null

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className="mt-2">
      <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        {sources.length} {sources.length === 1 ? 'source' : 'sources'}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {sources.map((source, i) => (
            <SourceCard key={i} source={source} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

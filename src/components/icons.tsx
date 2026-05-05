/**
 * Shared icon components.
 * All icons are SVG-based with consistent sizing.
 * Use these instead of inline SVGs across the codebase.
 */

import React from 'react'

interface IconProps {
  className?: string
}

const defaults = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function GearIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

export function PlusIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M12 4v16m8-8H4" />
    </svg>
  )
}

export function HamburgerIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function ClockIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

export function ArrowDownIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  )
}

export function SendIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  )
}

export function StopIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

export function ImageIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

export function AgentIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93V12h3.75a2.5 2.5 0 0 1 2.5 2.5v1.75c1.85.35 3.25 1.98 3.25 3.93a4 4 0 1 1-7.25-2.33V14.5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0-.5.5v3.35A4 4 0 1 1 3 20.18c0-1.95 1.4-3.58 3.25-3.93V14.5A2.5 2.5 0 0 1 8.75 12h3.5V9.93A4.002 4.002 0 0 1 12 2z" />
    </svg>
  )
}

export function PencilIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

export function TrashIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  )
}

export function CopyIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )
}

export function CheckIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

export function RefreshIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
    </svg>
  )
}

export function ChevronLeftIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M15 19l-7-7 7-7" />
    </svg>
  )
}

export function XIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export function SpeakerIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  )
}

export function SearchIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

export function ChevronDownIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...defaults}>
      <path d="M19 9l-7 7-7-7" />
    </svg>
  )
}

export function SpeakerStopIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  )
}

/**
 * ChipInput - Textarea + Overlay for element reference highlighting
 *
 * Renders {{agentId}} patterns as colored chips via an overlay div,
 * while keeping the underlying textarea for native input behavior.
 * Supports atomic chip deletion (Backspace/Delete) and hover callbacks.
 */

import React, { useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react'

/** 5-color cycle matching the element tags bar */
const CHIP_COLORS = [
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
  { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
  { bg: '#fff1f2', border: '#fecdd3', text: '#be123c' },
  { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },
] as const

/** Matches {{agentId}} patterns */
const CHIP_REF_RE = /\{\{([\w-]+)\}\}/g

export interface ChipInputHandle {
  textarea: HTMLTextAreaElement | null
  focus: () => void
}

interface ChipInputProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onPaste: (e: React.ClipboardEvent) => void
  onChipHover?: (agentId: string | null) => void
  placeholder: string
  disabled: boolean
  validAgentIds: Set<string>
  className?: string
}

type Segment = { type: 'text'; value: string } | { type: 'chip'; agentId: string; full: string }

function splitToSegments(text: string): Segment[] {
  const segments: Segment[] = []
  let lastIndex = 0
  const regex = new RegExp(CHIP_REF_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'chip', agentId: match[1]!, full: match[0] })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}

function colorIndex(agentId: string): number {
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function renderHighlighted(
  value: string,
  validAgentIds: Set<string>,
  onChipHover?: (agentId: string | null) => void,
): React.ReactNode[] {
  const segments = splitToSegments(value)
  return segments.map((seg, i) => {
    if (seg.type === 'text') {
      return <span key={i}>{seg.value}</span>
    }
    const isValid = validAgentIds.has(seg.agentId)
    const c = CHIP_COLORS[colorIndex(seg.agentId) % CHIP_COLORS.length]!
    return (
      <span
        key={i}
        onMouseEnter={() => onChipHover?.(seg.agentId)}
        onMouseLeave={() => onChipHover?.(null)}
        style={{
          display: 'inline-block',
          padding: '1px 5px',
          borderRadius: '4px',
          background: isValid ? c.bg : '#f3f4f6',
          color: isValid ? c.text : '#9ca3af',
          border: `1px solid ${isValid ? c.border : '#e5e7eb'}`,
          fontSize: '0.75rem',
          lineHeight: '1.4',
          verticalAlign: 'baseline',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          margin: '0 1px',
          cursor: isValid ? 'pointer' : 'default',
        }}
      >
        {isValid ? seg.agentId : seg.full}
      </span>
    )
  })
}

export const ChipInput = forwardRef<ChipInputHandle, ChipInputProps>(
  function ChipInput(
    { value, onChange, onKeyDown, onPaste, onChipHover, placeholder, disabled, validAgentIds, className },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const backdropRef = useRef<HTMLDivElement>(null)

    useImperativeHandle(ref, () => ({
      get textarea() { return textareaRef.current },
      focus() { textareaRef.current?.focus() },
    }), [])

    useEffect(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.style.height = 'auto'
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
      }
    }, [value])

    const handleScroll = useCallback(() => {
      if (backdropRef.current && textareaRef.current) {
        backdropRef.current.scrollTop = textareaRef.current.scrollTop
        backdropRef.current.scrollLeft = textareaRef.current.scrollLeft
      }
    }, [])

    // Atomic chip deletion: Backspace/Delete removes entire {{agentId}} at once
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = textareaRef.current
      if (!ta) { onKeyDown(e); return }

      if (ta.selectionStart === ta.selectionEnd) {
        const pos = ta.selectionStart
        const val = ta.value

        if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey) {
          const match = val.slice(0, pos).match(/\{\{([\w-]+)\}\}$/)
          if (match) {
            e.preventDefault()
            const start = pos - match[0].length
            onChange(val.slice(0, start) + val.slice(pos))
            requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start })
            return
          }
        }

        if (e.key === 'Delete' && !e.metaKey && !e.ctrlKey) {
          const match = val.slice(pos).match(/^\{\{([\w-]+)\}\}/)
          if (match) {
            e.preventDefault()
            onChange(val.slice(0, pos) + val.slice(pos + match[0].length))
            return
          }
        }
      }

      onKeyDown(e)
    }, [onChange, onKeyDown])

    return (
      <div className="relative">
        <style>{`.chip-input-selection::selection{background:rgba(59,130,246,.15);color:transparent;-webkit-text-fill-color:transparent}.chip-input-selection::-moz-selection{background:rgba(59,130,246,.15);color:transparent}`}</style>
        <div
          ref={backdropRef}
          className="absolute inset-0 overflow-hidden pointer-events-none select-none"
          aria-hidden="true"
          style={{
            padding: '8px 12px',
            fontSize: '0.875rem',
            lineHeight: '1.25rem',
            fontFamily: 'inherit',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            paddingRight: '80px',
          }}
        >
          {renderHighlighted(value, validAgentIds, onChipHover)}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          onScroll={handleScroll}
          placeholder={placeholder}
          disabled={disabled}
          className={`${className ?? ''} chip-input-selection`}
          style={{ color: 'transparent', caretColor: 'currentColor', background: 'transparent' }}
        />
      </div>
    )
  },
)

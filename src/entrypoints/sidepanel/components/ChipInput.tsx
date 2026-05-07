/**
 * ChipInput - Simplified and optimized
 *
 * Features:
 * - Backdrop rendering for @#N chip highlighting
 * - Support for chip hover callbacks
 * - Simplified scroll synchronization
 * - Auto-resize textarea
 */

import React, { useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react'

/** 5-color cycle matching the element tags bar */
const CHIP_COLORS = [
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },   // blue
  { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },   // emerald
  { bg: '#fffbeb', border: '#fde68a', text: '#b45309' },   // amber
  { bg: '#fff1f2', border: '#fecdd3', text: '#be123c' },   // rose
  { bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },   // violet
] as const

export interface ChipInputHandle {
  /** The underlying textarea element */
  textarea: HTMLTextAreaElement | null
  /** Focus the textarea */
  focus: () => void
}

interface ChipInputProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onPaste: (e: React.ClipboardEvent) => void
  onChipHover?: (num: number | null) => void
  placeholder: string
  disabled: boolean
  elementCount: number
  className?: string
}

type Segment = { type: 'text'; value: string } | { type: 'chip'; num: number }

/**
 * Split text into segments: { type: 'text', value } | { type: 'chip', num }
 *
 * After greedy @#(\d+) matching, post-processes chips whose number exceeds
 * elementCount by trying progressively shorter valid prefixes.
 * e.g. with elementCount=3, "@#21312312" → chip #2 + text "1312312"
 */
function splitToSegments(text: string, elementCount: number): Segment[] {
  const raw: Segment[] = []
  let lastIndex = 0
  const regex = /@#(\d+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      raw.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    raw.push({ type: 'chip', num: parseInt(match[1]!, 10) })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    raw.push({ type: 'text', value: text.slice(lastIndex) })
  }

  // Post-process: fix chips whose number exceeds elementCount
  if (elementCount <= 0) return raw

  const result: Segment[] = []
  for (const seg of raw) {
    if (seg.type === 'chip' && seg.num > elementCount) {
      const numStr = String(seg.num)
      let resolved = false
      // Try shorter prefixes from longest possible down to 1 digit
      for (let digits = Math.min(String(elementCount).length, numStr.length); digits >= 1; digits--) {
        const candidateNum = parseInt(numStr.slice(0, digits), 10)
        if (candidateNum >= 1 && candidateNum <= elementCount) {
          result.push({ type: 'chip', num: candidateNum })
          const remainder = numStr.slice(digits)
          if (remainder) result.push({ type: 'text', value: remainder })
          resolved = true
          break
        }
      }
      if (!resolved) {
        result.push({ type: 'text', value: `@#${seg.num}` })
      }
    } else {
      result.push(seg)
    }
  }
  return result
}

/**
 * Render highlighted segments with hover support
 */
function renderHighlighted(
  value: string,
  elementCount: number,
  onChipHover?: (num: number | null) => void,
): React.ReactNode[] {
  const segments = splitToSegments(value, elementCount)
  return segments.map((seg, i) => {
    if (seg.type === 'text') {
      return <span key={i}>{seg.value}</span>
    }
    // chip — only render with color if index is valid
    const isValid = seg.num >= 1 && seg.num <= elementCount
    const c = CHIP_COLORS[(seg.num - 1) % CHIP_COLORS.length]
    return (
      <span
        key={i}
        onMouseEnter={() => onChipHover?.(seg.num)}
        onMouseLeave={() => onChipHover?.(null)}
        style={{
          display: 'inline-block',
          padding: '0px 4px',
          borderRadius: '3px',
          background: isValid ? c.bg : '#f3f4f6',
          color: isValid ? c.text : '#9ca3af',
          border: `1px solid ${isValid ? c.border : '#e5e7eb'}`,
          fontSize: '0.75rem',
          lineHeight: 'normal',
          verticalAlign: 'baseline',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          margin: '0 1px',
          cursor: isValid ? 'pointer' : 'default',
          transition: 'all 0.15s',
        }}
        className="chip-ref"
      >
        #{seg.num}
      </span>
    )
  })
}

export const ChipInput = forwardRef<ChipInputHandle, ChipInputProps>(
  function ChipInput(
    { value, onChange, onKeyDown, onPaste, onChipHover, placeholder, disabled, elementCount, className },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const backdropRef = useRef<HTMLDivElement>(null)

    useImperativeHandle(ref, () => ({
      get textarea() { return textareaRef.current },
      focus() { textareaRef.current?.focus() },
    }), [])

    // Auto-resize textarea
    useEffect(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.style.height = 'auto'
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
      }
    }, [value])

    // Simplified scroll synchronization
    const handleScroll = useCallback(() => {
      if (backdropRef.current && textareaRef.current) {
        backdropRef.current.scrollTop = textareaRef.current.scrollTop
        backdropRef.current.scrollLeft = textareaRef.current.scrollLeft
      }
    }, [])

    return (
      <div className="relative">
        <style>{`
          .chip-input-selection::selection {
            background: rgba(59,130,246,.3);
            color: inherit;
          }
        `}</style>

        {/* Backdrop - renders visible text + colored chips */}
        <div
          ref={backdropRef}
          className="absolute inset-0 overflow-hidden pointer-events-none select-none"
          aria-hidden="true"
          style={{
            // Match textarea styles exactly
            padding: '8px 12px',
            fontSize: '0.875rem',
            lineHeight: '1.25rem',
            fontFamily: 'inherit',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            // Reserve space for the buttons on the right
            paddingRight: '100px',
          }}
        >
          {renderHighlighted(value, elementCount, onChipHover)}
        </div>

        {/* Textarea: text transparent, caret visible */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onScroll={handleScroll}
          placeholder={placeholder}
          disabled={disabled}
          className={`${className ?? ''} chip-input-selection`}
          style={{
            color: 'transparent',
            caretColor: 'rgb(59, 130, 246)', // 明确的光标颜色
            background: 'transparent',
          }}
        />
      </div>
    )
  },
)

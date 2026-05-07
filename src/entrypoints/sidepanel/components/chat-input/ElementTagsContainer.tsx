/**
 * ElementTagsContainer - Element tags with click-to-insert and remove
 */

import { ELEMENT_TAG_COLORS } from '@/types/element-reference'

interface ElementTagsContainerProps {
  selectedElements: Array<{ id: string; agentId: string; tag: string; text?: string }>
  hoveredRef: string | null
  colors: readonly string[]
  onRemove: (id: string) => void
  onInsertRef: (agentId: string) => void
  onClearAll: () => void
}

export function ElementTagsContainer({
  selectedElements,
  hoveredRef,
  colors,
  onRemove,
  onInsertRef,
  onClearAll,
}: ElementTagsContainerProps) {
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {selectedElements.map((el, idx) => {
        const color = colors[idx % colors.length]
        const isHovered = hoveredRef === el.agentId
        return (
          <button
            key={el.id}
            type="button"
            onClick={() => onInsertRef(el.agentId)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs cursor-pointer hover:opacity-80 transition-all ${
              isHovered ? 'ring-2 ring-offset-1 ring-blue-500 scale-105' : ''
            } ${color}`}
          >
            <span className="font-semibold opacity-70">#{idx + 1}</span>
            <span className="font-mono text-[10px] opacity-80 max-w-[60px] truncate">{el.agentId}</span>
            {el.text && (
              <span className="max-w-[80px] truncate opacity-70">&quot;{el.text}&quot;</span>
            )}
            <span
              onClick={(e) => { e.stopPropagation(); onRemove(el.id) }}
              className="ml-0.5 opacity-40 hover:opacity-80 transition-opacity"
              role="button"
              title="Remove"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </span>
          </button>
        )
      })}
      <button
        type="button"
        onClick={onClearAll}
        className="inline-flex items-center px-1.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        Clear all
      </button>
    </div>
  )
}

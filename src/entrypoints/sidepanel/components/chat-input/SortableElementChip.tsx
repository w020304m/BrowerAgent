/**
 * SortableElementChip - Draggable element chip component
 *
 * Displays a selected element with:
 * - Drag handle for reordering
 * - Element number and agentId
 * - Remove button
 * - Tooltip with full element info
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SortableElementChipProps } from './types'

export function SortableElementChip({
  el,
  idx,
  colors,
  onRemove,
  onInsertRef,
  hoveredRef,
}: SortableElementChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: el.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const color = colors[idx % colors.length]
  const isHovered = hoveredRef === el.agentId

  return (
    <div ref={setNodeRef} style={style} className="inline-flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            {...attributes}
            {...listeners}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs cursor-pointer hover:opacity-80 transition-all ${
              isHovered ? 'ring-2 ring-offset-1 ring-blue-500 scale-105' : ''
            } ${color}`}
            onClick={(e) => {
              // Only insert reference if not clicking drag handle or remove button
              if (
                !(e.target as HTMLElement).closest('.drag-handle') &&
                !(e.target as HTMLElement).closest('.remove-btn')
              ) {
                onInsertRef()
              }
            }}
          >
            <span className="drag-handle cursor-grab active:cursor-grabbing mr-0.5 opacity-50 hover:opacity-100">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="8" cy="6" r="1.5" />
                <circle cx="8" cy="12" r="1.5" />
                <circle cx="8" cy="18" r="1.5" />
                <circle cx="16" cy="6" r="1.5" />
                <circle cx="16" cy="12" r="1.5" />
                <circle cx="16" cy="18" r="1.5" />
              </svg>
            </span>
            <span className="font-semibold opacity-70">#{idx + 1}</span>
            <span className="font-mono text-[10px] opacity-80 max-w-[40px] truncate">
              {el.agentId}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              className="remove-btn ml-0.5 opacity-40 hover:opacity-80 transition-opacity"
              role="button"
              title="Remove element"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <div className="text-xs space-y-1">
            <div className="font-mono">{el.agentId}</div>
            <div>&lt;{el.tag}&gt;</div>
            {el.text && <div className="max-w-[200px] truncate opacity-80">"{el.text}"</div>}
            <div className="text-[10px] opacity-50 mt-1">Drag to reorder • Click to insert reference</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

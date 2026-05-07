/**
 * ElementTagsContainer - Container for element tags with drag-and-drop
 *
 * Displays selected and pending element tags with:
 * - Drag-and-drop reordering
 * - Click to insert reference
 * - Remove individual elements
 * - Clear all button
 */

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ELEMENT_TAG_COLORS } from '@/types/element-reference'
import { SortableElementChip } from './SortableElementChip'
import type { ElementTagsContainerProps } from './types'

export function ElementTagsContainer({
  selectedElements,
  pendingElements,
  hoveredRef,
  colors,
  onRemove,
  onInsertRef,
  onClearAll,
  onDragEnd,
}: ElementTagsContainerProps) {
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      onDragEnd({ active: { id: String(active.id) }, over: over ? { id: String(over.id) } : null })
    }
  }
  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const hasElements = selectedElements.length > 0 || pendingElements.length > 0

  if (!hasElements) return null

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={selectedElements.map(el => el.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-wrap gap-1.5">
          {/* Selected elements */}
          {selectedElements.map((el, idx) => (
            <SortableElementChip
              key={el.id}
              el={el}
              idx={idx}
              colors={colors}
              onRemove={() => onRemove(el.id)}
              onInsertRef={() => onInsertRef(el.agentId)}
              hoveredRef={hoveredRef}
            />
          ))}

          {/* Pending elements (during continuous selection) */}
          {pendingElements.map((el, idx) => (
            <button
              key={`pending-${el.agentId}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-purple-300 dark:border-purple-700 text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20"
              type="button"
            >
              <span className="font-semibold opacity-70">P{idx + 1}</span>
              <span className="font-mono text-[10px] opacity-80 max-w-[40px] truncate">
                {el.agentId}
              </span>
            </button>
          ))}

          {/* Clear all button */}
          {(selectedElements.length > 0 || pendingElements.length > 0) && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center px-1.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Clear all elements"
            >
              Clear all
            </button>
          )}
        </div>
      </SortableContext>
    </DndContext>
  )
}

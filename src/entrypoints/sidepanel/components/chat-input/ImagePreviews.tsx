/**
 * ImagePreviews - Display selected image attachments
 *
 * Shows thumbnails of attached images with remove buttons
 */

import type { ImagePreviewsProps } from './types'

export function ImagePreviews({ images, onRemove }: ImagePreviewsProps) {
  if (images.length === 0) return null

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {images.map((img, idx) => (
        <div key={idx} className="relative group">
          <img
            src={img}
            alt={`attachment ${idx + 1}`}
            className="h-16 w-16 object-cover rounded border"
          />
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

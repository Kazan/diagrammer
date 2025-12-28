import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Centers bound text elements within their container shapes.
 * This should be called after text dimensions change (e.g., font family, font size, alignment)
 * to ensure text stays centered in its container.
 *
 * @param elements - The scene elements (typically after restoreElements has recalculated dimensions)
 * @param affectedTextIds - Set of text element IDs that were modified
 * @returns Updated elements with text positions recentered in their containers
 */
export function recenterBoundTextInContainers(
  elements: ExcalidrawElement[],
  affectedTextIds: Set<string>,
): ExcalidrawElement[] {
  const elementsMap = new Map(elements.map((el) => [el.id, el]));

  return elements.map((el) => {
    // Only process text elements that were affected
    if (el.type !== "text" || !affectedTextIds.has(el.id)) return el;

    // Check if this text element has a container
    if (!("containerId" in el) || !el.containerId) return el;

    const container = elementsMap.get(el.containerId);
    if (!container || !("width" in container && "height" in container)) return el;

    // Calculate centered position within the container
    const newX = container.x + (container.width - el.width) / 2;
    const newY = container.y + (container.height - el.height) / 2;

    return {
      ...el,
      x: newX,
      y: newY,
    } as ExcalidrawElement;
  });
}

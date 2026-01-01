import { restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** Generate a random ID for elements (compatible with Excalidraw format) */
function randomId(): string {
  // Use crypto.randomUUID for better uniqueness, fallback to Math.random
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  }
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

/**
 * Deep clones an element to ensure complete isolation from source.
 */
function deepCloneElement(el: ExcalidrawElement): ExcalidrawElement {
  return JSON.parse(JSON.stringify(el)) as ExcalidrawElement;
}

// Import CaptureUpdateAction from Excalidraw for undo/redo support
// Using the enum value directly since it may not be exported
const CaptureUpdateAction = {
  IMMEDIATELY: "IMMEDIATELY" as const,
};

/**
 * Groups elements together so they act as one unit when inserted.
 * If already a single element or already grouped, returns as-is.
 */
function groupElementsIfNeeded(elements: ExcalidrawElement[]): ExcalidrawElement[] {
  if (elements.length <= 1) return elements;

  // Check if all elements already share a common groupId
  const existingGroupIds = elements
    .flatMap((el) => el.groupIds || [])
    .filter((id, i, arr) => arr.indexOf(id) === i);

  // If there's already a common group that contains all elements, no need to add another
  const allShareGroup = existingGroupIds.some((gid) =>
    elements.every((el) => el.groupIds?.includes(gid))
  );

  if (allShareGroup) {
    return elements;
  }

  // Create a new group ID and add it to all elements
  const newGroupId = randomId();
  return elements.map((el) => ({
    ...el,
    groupIds: [...(el.groupIds || []), newGroupId],
  })) as ExcalidrawElement[];
}

/**
 * Regenerates IDs for elements and updates internal references.
 * Returns new elements with fresh IDs while preserving internal relationships.
 * Uses restoreElements to ensure all element properties are properly normalized.
 */
function cloneElementsWithNewIds(
  elements: readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  // Deep clone first to ensure complete isolation from cached source
  const deepCloned = elements.map(deepCloneElement);

  const idMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();

  // First pass: generate new IDs for elements
  for (const el of deepCloned) {
    idMap.set(el.id, randomId());
  }

  // Collect all existing group IDs and generate new ones
  for (const el of deepCloned) {
    if (el.groupIds) {
      for (const gid of el.groupIds) {
        if (!groupIdMap.has(gid)) {
          groupIdMap.set(gid, randomId());
        }
      }
    }
  }

  // Second pass: update IDs and references in place (already deep cloned)
  const rawCloned = deepCloned.map((el) => {
    const newId = idMap.get(el.id)!;

    // Update groupIds - preserve original grouping structure with new IDs
    const newGroupIds = el.groupIds?.map((gid: string) => groupIdMap.get(gid) ?? gid) ?? [];

    // Handle bound elements - convert old boundElementIds format to new boundElements format
    // and update IDs for both formats
    let newBoundElements: ExcalidrawElement["boundElements"] = null;

    // Handle new format (boundElements)
    if (el.boundElements && Array.isArray(el.boundElements)) {
      newBoundElements = el.boundElements.map((bound) => ({
        ...bound,
        id: idMap.get(bound.id) ?? bound.id,
      }));
    }
    // Handle old format (boundElementIds) - convert to new format
    else if ("boundElementIds" in el) {
      const boundElementIds = (el as Record<string, unknown>).boundElementIds;
      if (Array.isArray(boundElementIds) && boundElementIds.length > 0) {
        newBoundElements = boundElementIds
          .filter((id): id is string => typeof id === "string")
          .map((id) => ({
            id: idMap.get(id) ?? id,
            type: "text" as const, // boundElementIds was typically used for text bindings
          }));
      }
    }

    // Handle container/frame references - only set if they exist and are not null/undefined
    const containerId =
      "containerId" in el && el.containerId != null
        ? idMap.get(el.containerId as string) ?? el.containerId
        : null;
    const frameId =
      "frameId" in el && el.frameId != null
        ? idMap.get(el.frameId as string) ?? el.frameId
        : null;

    // Build the cloned element with new values
    return {
      ...el,
      id: newId,
      groupIds: newGroupIds,
      boundElements: newBoundElements,
      containerId,
      frameId,
      seed: Math.floor(Math.random() * 2147483647),
      version: 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
    } as ExcalidrawElement;
  });

  // Remove deprecated boundElementIds property if present
  for (const el of rawCloned) {
    if ("boundElementIds" in el) {
      delete (el as Record<string, unknown>).boundElementIds;
    }
  }

  // Use restoreElements to normalize all element properties and repair bindings
  // This ensures text elements have proper originalText, dimensions are correct, etc.
  return restoreElements(rawCloned, null, {
    refreshDimensions: true,
    repairBindings: true,
  });
}

/**
 * Calculates the bounding box of elements.
 */
function getBoundingBox(elements: readonly ExcalidrawElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculates the viewport center based on current scroll and zoom.
 */
function getViewportCenter(api: ExcalidrawImperativeAPI): { x: number; y: number } {
  const appState = api.getAppState();
  const { scrollX, scrollY, zoom, width, height } = appState;

  // Viewport center in scene coordinates
  const centerX = -scrollX + width / 2 / zoom.value;
  const centerY = -scrollY + height / 2 / zoom.value;

  return { x: centerX, y: centerY };
}

/**
 * Inserts library item elements into the Excalidraw scene.
 * Each insertion creates a completely new instance with fresh IDs.
 * - Deep clones elements to ensure complete isolation
 * - Regenerates all IDs (element IDs, group IDs, etc.)
 * - Groups elements together if not already grouped (so they move as a unit)
 * - Offsets to viewport center
 * - Captures update for undo/redo
 * - Selects inserted elements
 */
export function insertLibraryItem(
  api: ExcalidrawImperativeAPI,
  elements: readonly ExcalidrawElement[]
): void {
  if (!api || elements.length === 0) return;

  // Clone elements with regenerated IDs - each insertion is a new instance
  const clonedElements = cloneElementsWithNewIds(elements);

  // Group elements if they're not already grouped (so they act as a single unit)
  const groupedElements = groupElementsIfNeeded(clonedElements);

  // Calculate bounding box of cloned elements
  const bbox = getBoundingBox(groupedElements);

  // Get viewport center
  const viewportCenter = getViewportCenter(api);

  // Calculate offset to center elements in viewport
  const offsetX = viewportCenter.x - (bbox.minX + bbox.width / 2);
  const offsetY = viewportCenter.y - (bbox.minY + bbox.height / 2);

  // Apply offset to all elements (create new objects to avoid mutation)
  const positionedElements = groupedElements.map((el) => ({
    ...el,
    x: el.x + offsetX,
    y: el.y + offsetY,
  }));

  // Get current scene elements
  const currentElements = api.getSceneElements();

  // Build selection state - select all inserted elements
  const selectedElementIds: Record<string, true> = {};
  for (const el of positionedElements) {
    selectedElementIds[el.id] = true;
  }

  // Update scene with new elements appended
  api.updateScene({
    elements: [...currentElements, ...positionedElements],
    appState: {
      ...api.getAppState(),
      selectedElementIds,
      selectedGroupIds: {},
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  // Switch to selection tool so user can interact with inserted elements
  api.setActiveTool({ type: "selection" });
}

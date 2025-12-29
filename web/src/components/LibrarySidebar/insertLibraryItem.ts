import { restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** Generate a random ID for elements (compatible with Excalidraw format) */
function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// Import CaptureUpdateAction from Excalidraw for undo/redo support
// Using the enum value directly since it may not be exported
const CaptureUpdateAction = {
  IMMEDIATELY: "IMMEDIATELY" as const,
};

/**
 * Regenerates IDs for elements and updates group references.
 * Returns new elements with fresh IDs while preserving internal relationships.
 * Uses restoreElements to ensure all element properties are properly normalized.
 */
function cloneElementsWithNewIds(
  elements: readonly ExcalidrawElement[]
): { cloned: ExcalidrawElement[]; groupIdMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();

  // First pass: generate new IDs for elements
  for (const el of elements) {
    idMap.set(el.id, randomId());
  }

  // Collect all existing group IDs and generate new ones
  for (const el of elements) {
    if (el.groupIds) {
      for (const gid of el.groupIds) {
        if (!groupIdMap.has(gid)) {
          groupIdMap.set(gid, randomId());
        }
      }
    }
  }

  // Second pass: clone elements with new IDs and update references
  const rawCloned = elements.map((el) => {
    const newId = idMap.get(el.id)!;

    // Update groupIds if present
    const newGroupIds = el.groupIds?.map((gid: string) => groupIdMap.get(gid) ?? gid);

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

    // Build the cloned element, explicitly setting properties to avoid undefined values
    const clonedEl: Record<string, unknown> = {
      ...el,
      id: newId,
      groupIds: newGroupIds ?? [],
      boundElements: newBoundElements,
      seed: Math.floor(Math.random() * 2147483647),
      version: 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
    };

    // Only include containerId/frameId if they have actual values
    if (containerId != null) {
      clonedEl.containerId = containerId;
    } else if ("containerId" in clonedEl) {
      clonedEl.containerId = null;
    }

    if (frameId != null) {
      clonedEl.frameId = frameId;
    } else if ("frameId" in clonedEl) {
      clonedEl.frameId = null;
    }

    // Remove deprecated boundElementIds property if present
    if ("boundElementIds" in clonedEl) {
      delete clonedEl.boundElementIds;
    }

    return clonedEl as ExcalidrawElement;
  });

  // Use restoreElements to normalize all element properties and repair bindings
  // This ensures text elements have proper originalText, dimensions are correct, etc.
  const cloned = restoreElements(rawCloned, null, {
    refreshDimensions: true,
    repairBindings: true,
  });

  return { cloned, groupIdMap };
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
 * Checks if all elements already share a common group.
 */
function elementsShareGroup(elements: readonly ExcalidrawElement[]): boolean {
  if (elements.length <= 1) return true;
  const [first, ...rest] = elements;
  const firstGroups = first.groupIds ?? [];
  if (!firstGroups.length) return false;
  return firstGroups.some((gid) =>
    rest.every((el) => (el.groupIds ?? []).includes(gid))
  );
}

/**
 * Inserts library item elements into the Excalidraw scene.
 * - Clones elements with new IDs
 * - Groups elements if they don't already share a group
 * - Offsets to viewport center
 * - Captures update for undo/redo
 * - Selects inserted elements
 */
export function insertLibraryItem(
  api: ExcalidrawImperativeAPI,
  elements: readonly ExcalidrawElement[]
): void {
  if (!api || elements.length === 0) return;

  // Clone elements with regenerated IDs
  const { cloned: clonedElements } = cloneElementsWithNewIds(elements);

  // If multiple elements and they don't already share a group, group them
  let finalElements = clonedElements;
  let newGroupId: string | null = null;
  if (clonedElements.length > 1 && !elementsShareGroup(clonedElements)) {
    newGroupId = randomId();
    finalElements = clonedElements.map((el) => ({
      ...el,
      groupIds: [...el.groupIds, newGroupId!],
    }));
  }

  // Calculate bounding box of cloned elements
  const bbox = getBoundingBox(finalElements);

  // Get viewport center
  const viewportCenter = getViewportCenter(api);

  // Calculate offset to center elements in viewport
  const offsetX = viewportCenter.x - (bbox.minX + bbox.width / 2);
  const offsetY = viewportCenter.y - (bbox.minY + bbox.height / 2);

  // Apply offset to all elements
  const positionedElements = finalElements.map((el) => ({
    ...el,
    x: el.x + offsetX,
    y: el.y + offsetY,
  }));

  // Get current scene elements
  const currentElements = api.getSceneElements();

  // Build selection state
  const selectedElementIds: Record<string, true> = {};
  for (const el of positionedElements) {
    selectedElementIds[el.id] = true;
  }
  const selectedGroupIds: Record<string, true> = {};
  if (newGroupId) {
    selectedGroupIds[newGroupId] = true;
  }

  // Update scene with new elements appended
  api.updateScene({
    elements: [...currentElements, ...positionedElements],
    appState: {
      ...api.getAppState(),
      selectedElementIds,
      selectedGroupIds,
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  // Switch to selection tool so user can interact with inserted elements
  api.setActiveTool({ type: "selection" });
}

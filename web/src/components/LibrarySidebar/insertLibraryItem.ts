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
 */
function cloneElementsWithNewIds(
  elements: readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  const idMap = new Map<string, string>();

  // First pass: generate new IDs
  for (const el of elements) {
    idMap.set(el.id, randomId());
  }

  // Second pass: clone elements with new IDs and update references
  return elements.map((el) => {
    const newId = idMap.get(el.id)!;

    // Update groupIds if present
    const newGroupIds = el.groupIds?.map((gid: string) => idMap.get(gid) ?? gid);

    // Handle bound elements if present
    let newBoundElements = el.boundElements;
    if (el.boundElements) {
      newBoundElements = el.boundElements.map((bound) => ({
        ...bound,
        id: idMap.get(bound.id) ?? bound.id,
      }));
    }

    // Handle container/frame references
    const containerId =
      "containerId" in el && el.containerId
        ? idMap.get(el.containerId as string) ?? el.containerId
        : undefined;
    const frameId =
      "frameId" in el && el.frameId
        ? idMap.get(el.frameId as string) ?? el.frameId
        : undefined;

    return {
      ...el,
      id: newId,
      groupIds: newGroupIds ?? [],
      boundElements: newBoundElements,
      ...(containerId !== undefined && { containerId }),
      ...(frameId !== undefined && { frameId }),
      seed: Math.floor(Math.random() * 2147483647),
      version: 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
    } as ExcalidrawElement;
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
 * - Clones elements with new IDs
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
  const clonedElements = cloneElementsWithNewIds(elements);

  // Calculate bounding box of cloned elements
  const bbox = getBoundingBox(clonedElements);

  // Get viewport center
  const viewportCenter = getViewportCenter(api);

  // Calculate offset to center elements in viewport
  const offsetX = viewportCenter.x - (bbox.minX + bbox.width / 2);
  const offsetY = viewportCenter.y - (bbox.minY + bbox.height / 2);

  // Apply offset to all elements
  const positionedElements = clonedElements.map((el) => ({
    ...el,
    x: el.x + offsetX,
    y: el.y + offsetY,
  }));

  // Get current scene elements
  const currentElements = api.getSceneElements();

  // Collect IDs of inserted elements for selection
  const insertedIds = new Set(positionedElements.map((el) => el.id));

  // Update scene with new elements appended
  api.updateScene({
    elements: [...currentElements, ...positionedElements],
    appState: {
      selectedElementIds: Object.fromEntries(
        positionedElements.map((el) => [el.id, true])
      ),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

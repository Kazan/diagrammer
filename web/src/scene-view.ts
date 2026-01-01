/**
 * Utilities for calculating viewport zoom and scroll to fit scene content,
 * accounting for UI chrome (header, toolbar, etc.).
 */
import type { ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

/**
 * UI insets that reduce the available viewport area for scene content.
 * These values should match the actual UI chrome dimensions in CSS.
 */
interface ViewportInsets {
  /** Top inset (e.g., header height + padding) */
  top: number;
  /** Left inset (e.g., toolbar width + padding) */
  left: number;
  /** Right inset (e.g., sidebar width + padding when open) */
  right: number;
  /** Bottom inset (e.g., zoom controls height + padding) */
  bottom: number;
}

/**
 * Default insets based on the Diagrammer UI layout.
 * These values account for:
 * - Top: Header at top=16px with ~48px height
 * - Left: Toolbar at left=16px with width=124px
 * - Bottom: Zoom controls with ~52px height
 * - Right: Minimal padding (library sidebar is optional)
 */
const DEFAULT_VIEWPORT_INSETS: ViewportInsets = {
  top: 72,     // 16px offset + ~56px for header/status
  left: 156,   // 16px offset + 124px toolbar width + 16px gap
  right: 16,   // Minimal right padding
  bottom: 68,  // 16px offset + ~52px for zoom controls
};

/**
 * Options for fitting content to viewport.
 */
interface FitToViewportOptions {
  /** Custom viewport insets (defaults to DEFAULT_VIEWPORT_INSETS) */
  insets?: Partial<ViewportInsets>;
  /**
   * How much of the available viewport should be filled (0.1 to 1.0).
   * Default is 0.9 (90% of available space).
   */
  viewportFillFactor?: number;
  /** Minimum zoom level (default 0.1) */
  minZoom?: number;
  /** Maximum zoom level (default 1.0 for fit-to-content scenarios) */
  maxZoom?: number;
  /** Padding around the content in scene coordinates (default 20) */
  contentPadding?: number;
  /** Whether to animate the transition (default false) */
  animate?: boolean;
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
  const visibleElements = elements.filter((el) => !el.isDeleted);

  if (visibleElements.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of visibleElements) {
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
 * Calculates the zoom level and scroll position to fit elements within
 * the available viewport area (accounting for UI insets).
 */
function calculateFitToViewport(
  api: ExcalidrawImperativeAPI,
  elements?: readonly ExcalidrawElement[],
  options: FitToViewportOptions = {}
): { zoom: number; scrollX: number; scrollY: number } | null {
  const {
    insets = {},
    viewportFillFactor = 0.9,
    minZoom = 0.1,
    maxZoom = 1.0,
    contentPadding = 20,
  } = options;

  const effectiveInsets: ViewportInsets = {
    ...DEFAULT_VIEWPORT_INSETS,
    ...insets,
  };

  const targetElements = elements ?? api.getSceneElements();
  const bbox = getBoundingBox(targetElements);

  // No content to fit
  if (bbox.width === 0 && bbox.height === 0) {
    return null;
  }

  const appState = api.getAppState();
  const totalWidth = appState.width;
  const totalHeight = appState.height;

  // Calculate available viewport area after subtracting insets
  const availableWidth = Math.max(100, totalWidth - effectiveInsets.left - effectiveInsets.right);
  const availableHeight = Math.max(100, totalHeight - effectiveInsets.top - effectiveInsets.bottom);

  // Apply fill factor and content padding
  const targetWidth = availableWidth * viewportFillFactor;
  const targetHeight = availableHeight * viewportFillFactor;

  // Content dimensions with padding
  const contentWidth = bbox.width + contentPadding * 2;
  const contentHeight = bbox.height + contentPadding * 2;

  // Calculate zoom to fit both dimensions
  const zoomX = targetWidth / contentWidth;
  const zoomY = targetHeight / contentHeight;
  const zoom = Math.max(minZoom, Math.min(maxZoom, Math.min(zoomX, zoomY)));

  // Calculate the center of the content
  const contentCenterX = bbox.minX + bbox.width / 2;
  const contentCenterY = bbox.minY + bbox.height / 2;

  // Calculate the center of the available viewport in screen coordinates
  // The available viewport starts at (insets.left, insets.top) and extends to
  // (totalWidth - insets.right, totalHeight - insets.bottom)
  const viewportCenterScreenX = effectiveInsets.left + availableWidth / 2;
  const viewportCenterScreenY = effectiveInsets.top + availableHeight / 2;

  // Calculate scroll position to center content in the available viewport
  // scrollX and scrollY in Excalidraw represent the offset of the origin in screen coordinates
  // Scene point (x, y) appears at screen position (scrollX + x * zoom, scrollY + y * zoom)
  // We want contentCenter to appear at viewportCenterScreen:
  // viewportCenterScreenX = scrollX + contentCenterX * zoom
  // => scrollX = viewportCenterScreenX - contentCenterX * zoom
  const scrollX = viewportCenterScreenX - contentCenterX * zoom;
  const scrollY = viewportCenterScreenY - contentCenterY * zoom;

  return { zoom, scrollX, scrollY };
}

/**
 * Fits the scene content to the viewport, accounting for UI insets.
 * This is the main function to call when loading a new scene.
 */
export function fitSceneToViewport(
  api: ExcalidrawImperativeAPI,
  elements?: readonly ExcalidrawElement[],
  options: FitToViewportOptions = {}
): void {
  const result = calculateFitToViewport(api, elements, options);

  if (!result) {
    // No content - just ensure we're at a reasonable default position
    return;
  }

  const { zoom, scrollX, scrollY } = result;
  const { animate = false } = options;

  if (animate) {
    // Use Excalidraw's built-in animation for smoother transitions
    // We approximate this by updating scene state
    // Note: Excalidraw's scrollToContent doesn't support custom insets,
    // so we handle animation manually if needed
    api.updateScene({
      appState: {
        ...api.getAppState(),
        zoom: { value: zoom as NormalizedZoomValue },
        scrollX,
        scrollY,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  } else {
    api.updateScene({
      appState: {
        ...api.getAppState(),
        zoom: { value: zoom as NormalizedZoomValue },
        scrollX,
        scrollY,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }
}

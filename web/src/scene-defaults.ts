import { CaptureUpdateAction, THEME } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";

/**
 * Canvas background color variants available in the app.
 * Values are read from CSS custom properties defined in index.css.
 */
export type CanvasBackgroundVariant = "white" | "light" | "grid" | "default";

const CSS_VAR_MAP: Record<CanvasBackgroundVariant, string> = {
  white: "--canvas-bg-white",
  light: "--canvas-bg-light",
  grid: "--canvas-bg-grid",
  default: "--canvas-bg-default",
};

/**
 * Fallback values matching index.css definitions.
 * Used when CSS variables cannot be read (e.g., SSR or tests).
 */
const FALLBACK_VALUES: Record<CanvasBackgroundVariant, string> = {
  white: "#ffffff",
  light: "#f5f5f5",
  grid: "#ecececff",
  default: "#ffffff",
};

/**
 * Reads a canvas background color from CSS custom properties.
 * Falls back to hardcoded values if the DOM is unavailable.
 */
export function getCanvasBackgroundColor(variant: CanvasBackgroundVariant = "default"): string {
  if (typeof document === "undefined") {
    return FALLBACK_VALUES[variant];
  }

  const cssVar = CSS_VAR_MAP[variant];
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();

  return value || FALLBACK_VALUES[variant];
}

/**
 * Default settings applied to new scenes and when clearing the canvas.
 * These ensure consistent behavior across the app.
 */
export const DEFAULT_SCENE_SETTINGS = {
  objectsSnapModeEnabled: true,
  zoomValue: 1,
  theme: THEME.LIGHT,
} as const;

/**
 * Builds the default local app state overrides for Excalidraw.
 * Uses CSS tokens for background color and centralized defaults for other settings.
 */
export function buildSceneAppStateDefaults(opts?: {
  viewBackgroundColor?: string;
  objectsSnapModeEnabled?: boolean;
  zoomValue?: number;
}): Partial<AppState> {
  return {
    viewBackgroundColor: opts?.viewBackgroundColor ?? getCanvasBackgroundColor("default"),
    objectsSnapModeEnabled: opts?.objectsSnapModeEnabled ?? DEFAULT_SCENE_SETTINGS.objectsSnapModeEnabled,
    theme: DEFAULT_SCENE_SETTINGS.theme,
    zoom: {
      value: (opts?.zoomValue ?? DEFAULT_SCENE_SETTINGS.zoomValue) as NormalizedZoomValue,
    },
  };
}

/**
 * Resets the Excalidraw canvas to a blank state with default app settings.
 * This should be used instead of calling api.resetScene() directly to ensure
 * default settings like snap-to-objects are preserved.
 */
export function resetSceneToDefaults(api: ExcalidrawImperativeAPI): void {
  api.resetScene({ resetLoadingState: true });
  api.updateScene({
    appState: buildSceneAppStateDefaults() as AppState,
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

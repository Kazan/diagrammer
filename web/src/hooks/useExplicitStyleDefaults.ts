import { useCallback, useRef, useState } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/**
 * Style properties that can be explicitly set by the user.
 * Only values the user has actively chosen are stored here.
 */
export type ExplicitStyleDefaults = {
  // Shape styles
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: "hachure" | "cross-hatch" | "solid";
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roughness?: number;
  opacity?: number;
  roundness?: "sharp" | "round";

  // Arrow/line styles
  startArrowhead?: "arrow" | "bar" | "dot" | "triangle" | null;
  endArrowhead?: "arrow" | "bar" | "dot" | "triangle" | null;

  // Text styles
  fontFamily?: number;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
};

/**
 * Maps our explicit style defaults to Excalidraw's appState currentItem* properties.
 * Returns an object that can be spread into appState.
 */
function mapToAppStateProps(
  defaults: ExplicitStyleDefaults,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  if (defaults.strokeColor !== undefined) {
    props.currentItemStrokeColor = defaults.strokeColor;
  }
  if (defaults.backgroundColor !== undefined) {
    props.currentItemBackgroundColor = defaults.backgroundColor;
  }
  if (defaults.fillStyle !== undefined) {
    props.currentItemFillStyle = defaults.fillStyle;
  }
  if (defaults.strokeWidth !== undefined) {
    props.currentItemStrokeWidth = defaults.strokeWidth;
  }
  if (defaults.strokeStyle !== undefined) {
    props.currentItemStrokeStyle = defaults.strokeStyle;
  }
  if (defaults.roughness !== undefined) {
    props.currentItemRoughness = defaults.roughness;
  }
  if (defaults.opacity !== undefined) {
    props.currentItemOpacity = defaults.opacity;
  }
  if (defaults.roundness !== undefined) {
    props.currentItemRoundness = defaults.roundness;
  }
  // Arrow/line arrowhead defaults
  if (defaults.startArrowhead !== undefined) {
    props.currentItemStartArrowhead = defaults.startArrowhead;
  }
  if (defaults.endArrowhead !== undefined) {
    props.currentItemEndArrowhead = defaults.endArrowhead;
  }
  if (defaults.fontFamily !== undefined) {
    props.currentItemFontFamily = defaults.fontFamily;
  }
  if (defaults.fontSize !== undefined) {
    props.currentItemFontSize = defaults.fontSize;
  }
  if (defaults.textAlign !== undefined) {
    props.currentItemTextAlign = defaults.textAlign;
  }

  return props;
}

type UseExplicitStyleDefaultsParams = {
  api: ExcalidrawImperativeAPI | null;
};

/**
 * Hook to manage explicit style defaults.
 *
 * This hook tracks style properties that the user has explicitly set
 * (not just viewed). These values are then used as defaults when
 * creating new shapes.
 *
 * The key distinction is:
 * - Viewing a selected element's properties does NOT capture those as defaults
 * - Explicitly changing a property DOES capture it as a default for new shapes
 */
export function useExplicitStyleDefaults({ api }: UseExplicitStyleDefaultsParams) {
  const [defaults, setDefaults] = useState<ExplicitStyleDefaults>({});
  const defaultsRef = useRef<ExplicitStyleDefaults>({});

  /**
   * Record an explicit style change. Call this when the user
   * actively changes a style property (not when just viewing).
   */
  const captureStyleChange = useCallback(
    <K extends keyof ExplicitStyleDefaults>(
      key: K,
      value: ExplicitStyleDefaults[K],
    ) => {
      setDefaults((prev) => {
        const next = { ...prev, [key]: value };
        defaultsRef.current = next;
        return next;
      });

      // Also update Excalidraw's appState so it uses this default for new elements
      if (api) {
        const propsToUpdate = mapToAppStateProps({ [key]: value });
        if (Object.keys(propsToUpdate).length > 0) {
          const currentAppState = api.getAppState();
          api.updateScene({
            appState: { ...currentAppState, ...propsToUpdate },
            captureUpdate: CaptureUpdateAction.NEVER, // Don't add to undo stack
          });
        }
      }
    },
    [api],
  );

  /**
   * Batch capture multiple style changes at once.
   */
  const captureStyleChanges = useCallback(
    (changes: Partial<ExplicitStyleDefaults>) => {
      setDefaults((prev) => {
        const next = { ...prev, ...changes };
        defaultsRef.current = next;
        return next;
      });

      if (api) {
        const propsToUpdate = mapToAppStateProps(changes);
        if (Object.keys(propsToUpdate).length > 0) {
          const currentAppState = api.getAppState();
          api.updateScene({
            appState: { ...currentAppState, ...propsToUpdate },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
      }
    },
    [api],
  );

  /**
   * Get the current explicit defaults (useful for passing to components).
   */
  const getDefaults = useCallback(() => defaultsRef.current, []);

  /**
   * Clear all explicit defaults.
   */
  const clearDefaults = useCallback(() => {
    setDefaults({});
    defaultsRef.current = {};
  }, []);

  return {
    /** Current explicit style defaults */
    defaults,
    /** Capture a single explicit style change */
    captureStyleChange,
    /** Capture multiple explicit style changes at once */
    captureStyleChanges,
    /** Get current defaults (ref-stable) */
    getDefaults,
    /** Clear all explicit defaults */
    clearDefaults,
  };
}

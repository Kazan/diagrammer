import { useCallback, useEffect, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

/**
 * Hook to detect and finalize multi-point linear element drawing.
 *
 * On touch devices without keyboards (e.g., Boox e-ink tablets), users cannot
 * press ESC or Enter to finalize multi-point arrows/lines created by tap-tap.
 * This hook provides state and a callback to programmatically finalize.
 */
export function useMultiPointFinalize(api: ExcalidrawImperativeAPI | null) {
  const [isDrawingMultiPoint, setIsDrawingMultiPoint] = useState(false);

  // Subscribe to app state changes to detect multi-point drawing mode
  useEffect(() => {
    if (!api) {
      setIsDrawingMultiPoint(false);
      return undefined;
    }

    // Check initial state
    const initialAppState = api.getAppState();
    setIsDrawingMultiPoint(initialAppState.multiElement != null);

    // Subscribe to changes
    const unsubscribe = api.onChange((_elements, appState) => {
      const inMultiPointMode = appState.multiElement != null;
      setIsDrawingMultiPoint(inMultiPointMode);
    });

    return () => unsubscribe();
  }, [api]);

  /**
   * Finalize the current multi-point element (arrow/line).
   * This mimics pressing ESC or Enter when drawing.
   * Removes the last uncommitted point (which follows the cursor/touch).
   */
  const finalizeMultiPoint = useCallback(() => {
    if (!api) return;

    const appState = api.getAppState();
    const multiElement = appState.multiElement;

    if (!multiElement) {
      console.log("[finalizeMultiPoint] no multiElement to finalize");
      return;
    }

    console.log("[finalizeMultiPoint] finalizing element:", multiElement.id);

    const elements = api.getSceneElements();
    const points = multiElement.points;

    // Remove the last point - it's the uncommitted "preview" point that follows the cursor
    const finalPoints = points.slice(0, -1);

    // If the element has fewer than 2 committed points, delete it
    if (finalPoints.length < 2) {
      api.updateScene({
        elements: elements.map((el) =>
          el.id === multiElement.id ? { ...el, isDeleted: true } : el
        ),
        appState: {
          ...appState,
          multiElement: null,
          newElement: null,
          editingTextElement: null,
          selectionElement: null,
          selectedLinearElement: null,
          activeTool: { type: "selection", locked: false, customType: null, lastActiveTool: null },
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      console.log("[finalizeMultiPoint] deleted (not enough points)");
      return;
    }

    // Update the element with trimmed points (remove trailing cursor point)
    api.updateScene({
      elements: elements.map((el) =>
        el.id === multiElement.id ? { ...multiElement, points: finalPoints } : el
      ),
      appState: {
        ...appState,
        multiElement: null,
        newElement: null,
        editingTextElement: null,
        selectionElement: null,
        selectedElementIds: { [multiElement.id]: true },
        selectedLinearElement: null,
        activeTool: { type: "selection", locked: false, customType: null, lastActiveTool: null },
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    console.log("[finalizeMultiPoint] finalized with", finalPoints.length, "points");
  }, [api]);

  return {
    isDrawingMultiPoint,
    finalizeMultiPoint,
  };
}

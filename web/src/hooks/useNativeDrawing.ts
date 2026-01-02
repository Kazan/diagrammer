import { useCallback, useEffect, useState } from "react";
import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, FileId } from "@excalidraw/excalidraw/element/types";
import { nanoid } from "nanoid";

/**
 * Check if native Boox drawing is supported.
 * This uses the injected `__NATIVE_HAS_BOOX_DRAWING__` flag set by Android.
 */
export function hasBooxDrawingSupport(): boolean {
  return typeof window !== "undefined" && window.__NATIVE_HAS_BOOX_DRAWING__ === true;
}

type UseNativeDrawingOptions = {
  api: ExcalidrawImperativeAPI | null;
  onInserted?: () => void;
  setStatus?: (status: { text: string; tone: "ok" | "warn" | "err" }) => void;
};

/**
 * Hook to manage native Boox stylus drawing integration.
 *
 * Provides:
 * - hasNativeDrawing: boolean flag for UI conditional rendering
 * - openNativeDrawing: function to launch native drawing canvas
 *
 * The native drawing is inserted as an image element into Excalidraw.
 */
export function useNativeDrawing({ api, onInserted, setStatus }: UseNativeDrawingOptions) {
  const [hasNativeDrawing] = useState(() => hasBooxDrawingSupport());
  const [isDrawing, setIsDrawing] = useState(false);

  /**
   * Open the native drawing canvas.
   * This sends a request to the Android native layer.
   */
  const openNativeDrawing = useCallback(() => {
    console.log("[NativeDrawing] openNativeDrawing called");

    if (!hasNativeDrawing) {
      console.warn("[NativeDrawing] Native drawing not supported on this device");
      setStatus?.({ text: "Native drawing not supported", tone: "warn" });
      return;
    }

    const bridge = window.NativeBridge;
    if (!bridge?.openNativeDrawingCanvas) {
      console.error("[NativeDrawing] openNativeDrawingCanvas not available");
      setStatus?.({ text: "Native bridge unavailable", tone: "err" });
      return;
    }

    setIsDrawing(true);
    console.log("[NativeDrawing] Calling native openNativeDrawingCanvas...");
    bridge.openNativeDrawingCanvas();
  }, [hasNativeDrawing, setStatus]);

  /**
   * Handle insertion of native drawing as an Excalidraw image element.
   * Called by the Android native layer via window.insertNativeDrawing.
   */
  const insertDrawing = useCallback(
    (dataUrl: string, width: number, height: number) => {
      console.log(`[NativeDrawing] insertDrawing called: ${width}x${height}, dataUrl length=${dataUrl.length}`);

      setIsDrawing(false);

      if (!api) {
        console.error("[NativeDrawing] Excalidraw API not available");
        setStatus?.({ text: "Canvas not ready", tone: "err" });
        return;
      }

      if (!dataUrl || !dataUrl.startsWith("data:image/")) {
        console.error("[NativeDrawing] Invalid image data URL");
        setStatus?.({ text: "Invalid drawing data", tone: "err" });
        return;
      }

      try {
        // Generate unique IDs for the file and element
        const fileId = (`native-drawing-${nanoid()}`) as FileId;
        const now = Date.now();

        console.log(`[NativeDrawing] Creating image element: fileId=${fileId}`);

        // Add the file to Excalidraw
        api.addFiles([
          {
            id: fileId,
            dataURL: dataUrl as DataURL,
            mimeType: "image/png" as BinaryFileData["mimeType"],
            created: now,
            lastRetrieved: now,
          },
        ]);

        // Get current viewport to position the image at center
        const appState = api.getAppState();
        const zoom = appState.zoom?.value ?? 1;
        const offsetLeft = appState.offsetLeft ?? 0;
        const offsetTop = appState.offsetTop ?? 0;
        const scrollX = appState.scrollX ?? 0;
        const scrollY = appState.scrollY ?? 0;
        const centerX = (window.innerWidth / 2 - offsetLeft) / zoom - scrollX;
        const centerY = (window.innerHeight / 2 - offsetTop) / zoom - scrollY;

        // Create the image element using Excalidraw's converter
        const [imageElement] = convertToExcalidrawElements([
          {
            type: "image",
            fileId,
            x: centerX - width / 2,
            y: centerY - height / 2,
            width,
            height,
            angle: 0,
          },
        ]);

        console.log("[NativeDrawing] Adding image element to scene...");

        // Update scene with new element
        api.updateScene({
          elements: [...api.getSceneElements(), imageElement as ExcalidrawElement],
          appState: {
            selectedElementIds: { [imageElement.id]: true },
            selectedGroupIds: {},
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });

        console.log("[NativeDrawing] Drawing inserted successfully!");
        setStatus?.({ text: "Drawing inserted", tone: "ok" });
        onInserted?.();
      } catch (err) {
        console.error("[NativeDrawing] Failed to insert drawing:", err);
        setStatus?.({ text: `Insert failed: ${String(err)}`, tone: "err" });
      }
    },
    [api, onInserted, setStatus]
  );

  /**
   * Handle cancellation of native drawing.
   * Called by the Android native layer via window.cancelNativeDrawing.
   */
  const cancelDrawing = useCallback(() => {
    console.log("[NativeDrawing] cancelDrawing called");
    setIsDrawing(false);
    setStatus?.({ text: "Drawing cancelled", tone: "warn" });
  }, [setStatus]);

  // Register the global handlers for the native bridge
  useEffect(() => {
    if (!hasNativeDrawing) return;

    console.log("[NativeDrawing] Registering window.insertNativeDrawing handler");
    window.insertNativeDrawing = insertDrawing;
    window.cancelNativeDrawing = cancelDrawing;

    return () => {
      console.log("[NativeDrawing] Unregistering native drawing handlers");
      delete window.insertNativeDrawing;
      delete window.cancelNativeDrawing;
    };
  }, [hasNativeDrawing, insertDrawing, cancelDrawing]);

  return {
    hasNativeDrawing,
    isDrawing,
    openNativeDrawing,
  };
}

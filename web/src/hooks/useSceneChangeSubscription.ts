import { useEffect } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ToolType } from "../components/CustomToolbar";
import { EMPTY_SCENE_SIG, computeSceneSignature } from "../scene-utils";

const appStateSnapshot = {
  scrollX: 0,
  scrollY: 0,
  zoom: { value: 1 },
  offsetLeft: 0,
  offsetTop: 0,
};

export type SceneChangeOptions = {
  api: ExcalidrawImperativeAPI | null;
  setActiveTool: (tool: ToolType) => void;
  setCurrentFileName: (name: string) => void;
  setIsDirty: (dirty: boolean) => void;
  setStatus: (status: { text: string; tone: "ok" | "warn" | "err" }) => void;
  clearFileAssociation: () => void;
  suppressNextDirtyRef: React.MutableRefObject<boolean>;
  prevSceneSigRef: React.MutableRefObject<string | null>;
  prevNonEmptySceneRef: React.MutableRefObject<boolean>;
  hydratedSceneRef: React.MutableRefObject<boolean>;
  sceneLoadInProgressRef: React.MutableRefObject<boolean>;
  expectedSceneSigRef: React.MutableRefObject<string | null>;
  loadSkipRef: React.MutableRefObject<number>;
  lastDialogRef: React.MutableRefObject<string | null>;
  handleSaveToDocument: () => void;
  handleOpenWithNativePicker: () => boolean;
  onSelectionChange?: (payload: {
    elements: ExcalidrawElement[];
    appState: typeof appStateSnapshot;
    bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
    viewportBounds: { left: number; top: number; width: number; height: number } | null;
  }) => void;
};

function computeBounds(elements: ExcalidrawElement[]) {
  const nonDeleted = elements.filter((el) => !el.isDeleted);
  if (!nonDeleted.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of nonDeleted) {
    const x1 = el.x;
    const y1 = el.y;
    const x2 = el.x + el.width;
    const y2 = el.y + el.height;
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  }
  return { minX, minY, maxX, maxY };
}

function toViewportBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  appState: typeof appStateSnapshot,
) {
  const zoom = appState.zoom?.value ?? 1;
  const left = (bounds.minX + appState.scrollX) * zoom + (appState.offsetLeft ?? 0);
  const top = (bounds.minY + appState.scrollY) * zoom + (appState.offsetTop ?? 0);
  const width = (bounds.maxX - bounds.minX) * zoom;
  const height = (bounds.maxY - bounds.minY) * zoom;
  return { left, top, width, height };
}

export function useSceneChangeSubscription(opts: SceneChangeOptions) {
  const {
    api,
    setActiveTool,
    setCurrentFileName,
    setIsDirty,
    setStatus,
    clearFileAssociation,
    suppressNextDirtyRef,
    prevSceneSigRef,
    prevNonEmptySceneRef,
    hydratedSceneRef,
    sceneLoadInProgressRef,
    expectedSceneSigRef,
    loadSkipRef,
    lastDialogRef,
    handleSaveToDocument,
    handleOpenWithNativePicker,
    onSelectionChange,
  } = opts;

  useEffect(() => {
    if (!api) return undefined;
    let selectionRaf = 0;
    const unsubscribe = api.onChange((elements, appState) => {
      if (sceneLoadInProgressRef.current) {
        const sig = computeSceneSignature(elements, appState);
        prevSceneSigRef.current = sig;
        prevNonEmptySceneRef.current = elements.some((el) => !el.isDeleted);
        console.log("[NativeBridge] onChange during load", { sig, visible: elements.length });
        return;
      }

      if (loadSkipRef.current > 0) {
        loadSkipRef.current -= 1;
        const sig = computeSceneSignature(elements, appState);
        prevSceneSigRef.current = sig;
        prevNonEmptySceneRef.current = elements.some((el) => !el.isDeleted);
        suppressNextDirtyRef.current = false;
        expectedSceneSigRef.current = null;
        setIsDirty(false);
        return;
      }

      const tool = appState.activeTool?.type as ToolType | undefined;
      if (tool) {
        setActiveTool(tool);
      }

      const visibleCount = elements.filter((el) => !el.isDeleted).length;
      const hadNonEmptyScene = prevNonEmptySceneRef.current;
      const becameEmpty = hydratedSceneRef.current && hadNonEmptyScene && visibleCount === 0;

      if (hydratedSceneRef.current) {
        const sig = computeSceneSignature(elements, appState);

        if (expectedSceneSigRef.current && sig === expectedSceneSigRef.current) {
          console.log("[NativeBridge] expected signature matched", { sig });
          suppressNextDirtyRef.current = false;
          expectedSceneSigRef.current = null;
          prevSceneSigRef.current = sig;
          prevNonEmptySceneRef.current = visibleCount > 0;
          setIsDirty(false);
          return;
        }
        if (becameEmpty) {
          setCurrentFileName("Unsaved");
          setIsDirty(false);
          suppressNextDirtyRef.current = true;
          prevSceneSigRef.current = EMPTY_SCENE_SIG;
          prevNonEmptySceneRef.current = false;
          clearFileAssociation();
          setStatus({ text: "Canvas cleared", tone: "warn" });
        } else {
          if (suppressNextDirtyRef.current) {
            suppressNextDirtyRef.current = false;
            prevSceneSigRef.current = sig;
            prevNonEmptySceneRef.current = visibleCount > 0;
          } else {
            if (prevSceneSigRef.current && sig !== prevSceneSigRef.current) {
              setIsDirty(true);
            }
            prevSceneSigRef.current = sig;
            prevNonEmptySceneRef.current = visibleCount > 0;
          }
        }
      }

      // Excalidraw openDialog name is loosely typed; coerce to string for comparison.
      const dialogName = ((appState.openDialog as any)?.name as string | null) ?? null;
      const previousDialog = lastDialogRef.current;
      if (dialogName !== previousDialog) {
        lastDialogRef.current = dialogName;
        if (!dialogName) {
          // Reset when dialog closes so future opens are intercepted.
          return;
        }
        if (dialogName === "jsonExport") {
          handleSaveToDocument();
          api.updateScene({ appState: { ...appState, openDialog: null } });
        } else {
          const skipDialogs = new Set([
            "imageExport",
            "help",
            "ttd",
            "commandPalette",
            "elementLinkSelector",
          ]);

          const shouldHijackOpen =
            !skipDialogs.has(dialogName) &&
            (dialogName === "jsonImport" ||
              dialogName === "loadScene" ||
              dialogName === "load" ||
              dialogName === "loadSceneFromFile" ||
              true);

          if (shouldHijackOpen && handleOpenWithNativePicker()) {
            console.log("[NativeBridge] intercepted open dialog", dialogName);
            api.updateScene({ appState: { ...appState, openDialog: null } });
          } else {
            console.log("[NativeBridge] dialog opened", dialogName);
          }
        }
      }

        if (
          onSelectionChange &&
          hydratedSceneRef.current &&
          !sceneLoadInProgressRef.current
        ) {
          const selectedIds = new Set(Object.keys(appState.selectedElementIds || {}));
          const selected = elements.filter((el) => !el.isDeleted && selectedIds.has(el.id));
          if (selectionRaf) window.cancelAnimationFrame(selectionRaf);
          selectionRaf = window.requestAnimationFrame(() => {
            const bounds = computeBounds(selected);
            const viewportBounds = bounds ? toViewportBounds(bounds, appState as any) : null;
            onSelectionChange({ elements: selected, appState: appState as any, bounds, viewportBounds });
          });
        }
    });
    return () => unsubscribe();
  }, [
    api,
    clearFileAssociation,
    handleSaveToDocument,
    hydratedSceneRef,
    lastDialogRef,
    prevNonEmptySceneRef,
    prevSceneSigRef,
    sceneLoadInProgressRef,
    expectedSceneSigRef,
    loadSkipRef,
    setActiveTool,
    setCurrentFileName,
    setIsDirty,
    setStatus,
    suppressNextDirtyRef,
    handleOpenWithNativePicker,
    onSelectionChange,
  ]);
}

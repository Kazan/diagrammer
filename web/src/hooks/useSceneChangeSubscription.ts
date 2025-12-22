import { useEffect } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ToolType } from "../components/CustomToolbar";
import { EMPTY_SCENE_SIG, computeSceneSignature } from "../scene-utils";

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
};

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
  } = opts;

  useEffect(() => {
    if (!api) return undefined;
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

      const dialogName = appState.openDialog?.name ?? null;
      if (dialogName !== lastDialogRef.current) {
        lastDialogRef.current = dialogName;
        if (dialogName === "jsonExport") {
          handleSaveToDocument();
          api.updateScene({ appState: { ...appState, openDialog: null } });
        }
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
  ]);
}

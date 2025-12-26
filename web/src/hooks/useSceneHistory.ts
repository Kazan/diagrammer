import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { computeSceneSignature } from "../scene-utils";

const DEFAULT_MAX_ENTRIES = 50;

type SceneSnapshot = {
  elements: ReturnType<ExcalidrawImperativeAPI["getSceneElementsIncludingDeleted"]>;
  appState: ReturnType<ExcalidrawImperativeAPI["getAppState"]>;
  files: ReturnType<ExcalidrawImperativeAPI["getFiles"]>;
};

export type UseSceneHistoryOptions = {
  api: ExcalidrawImperativeAPI | null;
  sceneLoadInProgressRef: MutableRefObject<boolean>;
  loadSkipRef: MutableRefObject<number>;
  setStatus: (status: { text: string; tone: "ok" | "warn" | "err" }) => void;
  maxEntries?: number;
};

export function useSceneHistory(options: UseSceneHistoryOptions) {
  const { api, sceneLoadInProgressRef, loadSkipRef, setStatus, maxEntries = DEFAULT_MAX_ENTRIES } = options;

  const [canUndo, setCanUndo] = useState(false);
  const historyRef = useRef<SceneSnapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const historySigRef = useRef<string | null>(null);
  const historyApplyingRef = useRef(false);
  const pendingHistoryRef = useRef<SceneSnapshot | null>(null);
  const pendingHistorySigRef = useRef<string | null>(null);
  const pointerInteractionRef = useRef(false);

  const cloneSnapshot = useCallback((): SceneSnapshot | null => {
    if (!api) return null;
    return {
      elements: structuredClone(api.getSceneElementsIncludingDeleted()),
      appState: structuredClone(api.getAppState()),
      files: structuredClone(api.getFiles()),
    };
  }, [api]);

  const commitSnapshot = useCallback(
    (snapshot: SceneSnapshot, sig: string) => {
      const capped = historyRef.current.slice(0, historyIndexRef.current + 1);
      capped.push(snapshot);
      const overflow = capped.length - maxEntries;
      if (overflow > 0) {
        capped.splice(0, overflow);
      }
      historyRef.current = capped;
      historyIndexRef.current = capped.length - 1;
      historySigRef.current = sig;
      setCanUndo(historyIndexRef.current > 0);
    },
    [maxEntries],
  );

  const resetHistoryFromCurrentScene = useCallback(() => {
    const snapshot = cloneSnapshot();
    if (!snapshot) return;
    historyRef.current = [snapshot];
    historyIndexRef.current = 0;
    historySigRef.current = computeSceneSignature(snapshot.elements, snapshot.appState);
    pendingHistoryRef.current = null;
    pendingHistorySigRef.current = null;
    pointerInteractionRef.current = false;
    setCanUndo(false);
  }, [cloneSnapshot]);

  useEffect(() => {
    if (!api) return undefined;
    resetHistoryFromCurrentScene();
    const unsubscribe = api.onChange((elements, appState) => {
      if (historyApplyingRef.current) return;
      if (sceneLoadInProgressRef.current || loadSkipRef.current > 0) return;

      const isInteracting = Boolean(
        appState.selectedElementsAreBeingDragged ||
          appState.multiElement ||
          appState.editingLinearElement ||
          appState.editingTextElement,
      );
      const sig = computeSceneSignature(elements, appState);
      if (historySigRef.current === sig) {
        pendingHistoryRef.current = null;
        pendingHistorySigRef.current = null;
        return;
      }
      const snapshot = cloneSnapshot();
      if (!snapshot) return;
      if (isInteracting || pointerInteractionRef.current) {
        pendingHistoryRef.current = snapshot;
        pendingHistorySigRef.current = sig;
        return;
      }
      const nextSnapshot = pendingHistoryRef.current ?? snapshot;
      const nextSig = pendingHistorySigRef.current ?? sig;
      commitSnapshot(nextSnapshot, nextSig);
      pendingHistoryRef.current = null;
      pendingHistorySigRef.current = null;
    });
    return () => unsubscribe();
  }, [api, cloneSnapshot, commitSnapshot, loadSkipRef, resetHistoryFromCurrentScene, sceneLoadInProgressRef]);

  useEffect(() => {
    if (!api) return undefined;
    const unsubDown = api.onPointerDown?.(() => {
      pointerInteractionRef.current = true;
    });
    const unsubUp = api.onPointerUp?.(() => {
      pointerInteractionRef.current = false;
      if (historyApplyingRef.current) return;
      if (pendingHistoryRef.current && pendingHistorySigRef.current) {
        commitSnapshot(pendingHistoryRef.current, pendingHistorySigRef.current);
        pendingHistoryRef.current = null;
        pendingHistorySigRef.current = null;
      }
    });
    return () => {
      unsubDown?.();
      unsubUp?.();
    };
  }, [api, commitSnapshot]);

  const handleUndo = useCallback(() => {
    if (!api) return;
    const targetIndex = historyIndexRef.current - 1;
    const snapshot = historyRef.current[targetIndex];
    if (!snapshot) {
      setStatus({ text: "Nothing to undo", tone: "warn" });
      return;
    }
    historyApplyingRef.current = true;
    try {
      const files = structuredClone(snapshot.files);
      api.updateScene({
        elements: structuredClone(snapshot.elements),
        appState: structuredClone(snapshot.appState),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.addFiles(Object.values(files));
      historyIndexRef.current = targetIndex;
      historySigRef.current = computeSceneSignature(snapshot.elements, snapshot.appState);
      pendingHistoryRef.current = null;
      pendingHistorySigRef.current = null;
      pointerInteractionRef.current = false;
      setCanUndo(historyIndexRef.current > 0);
    } finally {
      window.requestAnimationFrame(() => {
        historyApplyingRef.current = false;
      });
    }
  }, [api, setStatus]);

  return { canUndo, handleUndo, resetHistoryFromCurrentScene } as const;
}

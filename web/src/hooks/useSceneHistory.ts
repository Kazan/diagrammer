import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { computeSceneSignature } from "../scene-utils";

const DEFAULT_MAX_ENTRIES = 50;

/**
 * Check if debug mode is enabled via localStorage.
 * Toggle with: localStorage.setItem('diagrammer.debug', '1') or '0'
 */
function isDebugEnabled(): boolean {
  try {
    return window.localStorage.getItem("diagrammer.debug") === "1";
  } catch {
    return false;
  }
}

/**
 * Safely clones a value, falling back to JSON serialization for values
 * that contain non-cloneable types (Symbols, React elements, functions).
 * This is necessary because Excalidraw's appState can contain contextMenu
 * with React element items that structuredClone cannot handle.
 */
function safeClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch (_err) {
    // Fallback: use JSON for values with non-cloneable types
    // This handles React elements, Symbols, functions, etc.
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_jsonErr) {
      // Last resort: return the value as-is (shallow reference)
      // This should rarely happen but prevents crashes
      console.warn("[safeClone] Could not clone value, returning reference");
      return value;
    }
  }
}

/**
 * Creates a safe clone of appState that excludes non-cloneable properties
 * like contextMenu which contains React elements.
 */
function cloneAppState(appState: ReturnType<ExcalidrawImperativeAPI["getAppState"]>) {
  // First, try structuredClone on the full object
  try {
    return structuredClone(appState);
  } catch (_err) {
    // If it fails (likely due to contextMenu), clone without problematic properties
    const { contextMenu, ...rest } = appState;
    try {
      return {
        ...structuredClone(rest),
        contextMenu: null, // Reset contextMenu as it can't be cloned
      };
    } catch (_innerErr) {
      // Fallback to JSON-based cloning
      return {
        ...JSON.parse(JSON.stringify(rest)),
        contextMenu: null,
      };
    }
  }
}

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
      elements: safeClone(api.getSceneElementsIncludingDeleted()),
      appState: cloneAppState(api.getAppState()),
      files: safeClone(api.getFiles()),
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
    const debug = isDebugEnabled();
    const historyLen = historyRef.current.length;
    const historyIdx = historyIndexRef.current;

    if (debug) {
      console.log(`[undo] called: api=${!!api}, historyLen=${historyLen}, historyIdx=${historyIdx}`);
      setStatus({ text: `[DBG] undo: api=${!!api} len=${historyLen} idx=${historyIdx}`, tone: "warn" });
    }

    if (!api) {
      if (debug) {
        console.warn("[undo] aborted: api is null");
        setStatus({ text: "[DBG] undo aborted: no api", tone: "err" });
      }
      return;
    }
    const targetIndex = historyIdx - 1;
    const snapshot = historyRef.current[targetIndex];
    if (!snapshot) {
      if (debug) {
        console.warn(`[undo] aborted: no snapshot at index ${targetIndex}`);
      }
      setStatus({ text: "Nothing to undo", tone: "warn" });
      return;
    }
    if (debug) {
      console.log(`[undo] applying snapshot at index ${targetIndex}`);
    }
    historyApplyingRef.current = true;
    try {
      const files = safeClone(snapshot.files);
      api.updateScene({
        elements: safeClone(snapshot.elements),
        appState: safeClone(snapshot.appState),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.addFiles(Object.values(files));
      historyIndexRef.current = targetIndex;
      historySigRef.current = computeSceneSignature(snapshot.elements, snapshot.appState);
      pendingHistoryRef.current = null;
      pendingHistorySigRef.current = null;
      pointerInteractionRef.current = false;
      setCanUndo(historyIndexRef.current > 0);
      if (debug) {
        console.log(`[undo] success: newIdx=${targetIndex}, canUndo=${targetIndex > 0}`);
        setStatus({ text: `[DBG] undo OK: idx=${targetIndex}`, tone: "ok" });
      }
    } catch (err) {
      console.error("[undo] error:", err);
      if (debug) {
        setStatus({ text: `[DBG] undo error: ${String(err)}`, tone: "err" });
      }
    } finally {
      window.requestAnimationFrame(() => {
        historyApplyingRef.current = false;
      });
    }
  }, [api, setStatus]);

  return { canUndo, handleUndo, resetHistoryFromCurrentScene } as const;
}

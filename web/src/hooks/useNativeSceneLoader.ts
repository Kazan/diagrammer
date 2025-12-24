import { useCallback, type MutableRefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { NativeBridge } from "../native-bridge";
import { computeSceneSignatureFromScene } from "../scene-utils";

export function useNativeSceneLoader(options: {
  api: ExcalidrawImperativeAPI | null;
  nativeBridge?: NativeBridge;
  setStatus: (status: { text: string; tone: "ok" | "warn" | "err" }) => void;
  setIsDirty: (dirty: boolean) => void;
  suppressNextDirtyRef: MutableRefObject<boolean>;
  prevSceneSigRef: MutableRefObject<string | null>;
  prevNonEmptySceneRef: MutableRefObject<boolean>;
}) {
  const {
    api,
    nativeBridge,
    setStatus,
    setIsDirty,
    suppressNextDirtyRef,
    prevSceneSigRef,
    prevNonEmptySceneRef,
  } = options;

  const handleLoadFromNative = useCallback(() => {
    if (!api) {
      setStatus({ text: "Canvas not ready", tone: "warn" });
      return;
    }
    if (!nativeBridge?.loadScene) {
      setStatus({ text: "Native loader unavailable", tone: "warn" });
      return;
    }
    const saved = nativeBridge.loadScene();
    if (!saved) {
      setStatus({ text: "No saved drawing found", tone: "warn" });
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      const nextSig = computeSceneSignatureFromScene(parsed);
      const hasElements = Array.isArray(parsed?.elements)
        ? parsed.elements.some((el: any) => !el.isDeleted)
        : false;
      suppressNextDirtyRef.current = true;
      prevSceneSigRef.current = nextSig;
      prevNonEmptySceneRef.current = hasElements;
      setIsDirty(false);
      api.resetScene(parsed as any, { resetLoadingState: true, replaceFiles: true });
      setStatus({ text: "Loaded saved drawing", tone: "ok" });
    } catch (err) {
      setStatus({ text: `Load failed: ${String(err)}`, tone: "err" });
    }
  }, [api, nativeBridge, prevNonEmptySceneRef, prevSceneSigRef, setIsDirty, setStatus, suppressNextDirtyRef]);

  return { handleLoadFromNative } as const;
}
